import {
  h,
  inject,
  provide,
  defineComponent,
  PropType,
  ref,
  unref,
  ComponentPublicInstance,
  VNodeProps,
  getCurrentInstance,
  computed,
  AllowedComponentProps,
  ComponentCustomProps,
  watch,
  Slot,
  VNode,
  Component,
} from 'vue'
import type {
  RouteLocationNormalized,
  RouteLocationNormalizedLoaded,
} from './typed-routes'
import type { RouteLocationMatched } from './types'
import {
  matchedRouteKey,
  viewDepthKey,
  routerViewLocationKey,
} from './injectionSymbols'
import { assign, isArray, isBrowser } from './utils'
import { warn } from './warning'
import { isSameRouteRecord } from './location'

export interface RouterViewProps {
  // 用于指定命名视图（named view）
  // 对应 <router-view name="sidebar" /> 的 name 属性
  // 匹配 routes[*].components[name]
  name?: string
  // allow looser type for user facing api
  // 一般由内部逻辑传入
  // 如果你传入一个 route，可以让 <router-view> 呈现特定路由对应的组件，而不是当前激活路由
  // 实际开发中很少手动使用，主要用于自定义渲染逻辑或测试
  route?: RouteLocationNormalized
}

export interface RouterViewDevtoolsContext
  // 继承部分（来自 RouteLocationMatched）
  // path	当前 router-view 对应的路径片段（如 /users/:id）
  // name	命名路由的名称（如 'UserDetail'）
  // meta	对应路由记录的 meta 信息（用户自定义对象）
  extends Pick<RouteLocationMatched, 'path' | 'name' | 'meta'> {
  // 表示 <router-view> 的嵌套深度
  // 顶层 router-view 的 depth 是 0，下一层是 1，以此类推
  // Vue Router 内部会通过递归或上下文传递计算出这个值
  depth: number
}

// 根据当前路由渲染出匹配的组件，同时支持嵌套、命名视图、slot 等能力。
export const RouterViewImpl = /*#__PURE__*/ defineComponent({
  name: 'RouterView',
  // #674 we manually inherit them
  inheritAttrs: false,
  props: {
    // name: 支持命名视图（对应路由配置 components: { name: Component }）
    // route: 可传入指定路由（不传则默认使用当前激活路由）
    name: {
      type: String as PropType<string>,
      default: 'default',
    },
    route: Object as PropType<RouteLocationNormalizedLoaded>,
  },

  // Better compat for @vue/compat users
  // https://github.com/vuejs/router/issues/1315
  compatConfig: { MODE: 3 },

  // 嵌套路由渲染、组件匹配与切换、导航守卫注入、depth 计算、上下文共享等功能。
  setup(props, { attrs, slots }) {
    __DEV__ && warnDeprecatedUsage()

    // 2. 注入全局上下文
    // routerViewLocationKey: 当前激活的路由 ref
    // viewDepthKey: 嵌套深度（顶层为 0）
    const injectedRoute = inject(routerViewLocationKey)!
    // 3. 当前展示的路由计算属性
    // 支持 <router-view :route="customRoute"> 手动控制渲染
    const routeToDisplay = computed<RouteLocationNormalizedLoaded>(
      () => props.route || injectedRoute.value
    )
    const injectedDepth = inject(viewDepthKey, 0)
    // The depth changes based on empty components option, which allows passthrough routes e.g. routes with children
    // that are used to reuse the `path` property
    // 4. 计算渲染的嵌套层级（depth）
    // 支持“空壳路由记录”（无 components）跳过层级
    // 常见于：
    // {
    //   path: '/users',
    //   children: [
    //     {
    //       path: ':id',
    //       component: UserDetail,
    //     },
    //   ]
    // }
    const depth = computed<number>(() => {
      let initialDepth = unref(injectedDepth)
      const { matched } = routeToDisplay.value
      let matchedRoute: RouteLocationMatched | undefined
      while (
        (matchedRoute = matched[initialDepth]) &&
        !matchedRoute.components
      ) {
        initialDepth++
      }
      return initialDepth
    })
    // 5. 当前路由记录
    const matchedRouteRef = computed<RouteLocationMatched | undefined>(
      () => routeToDisplay.value.matched[depth.value]
    )

    // 6. provide 向子级传递
    // 每一层 <router-view> 都将其 depth + 1 提供给下一层，实现嵌套路由的 递归渲染。
    provide(
      viewDepthKey,
      computed(() => depth.value + 1)
    )
    provide(matchedRouteKey, matchedRouteRef)
    provide(routerViewLocationKey, routeToDisplay)

    // 7. 引用当前渲染的组件实例
    // 此 ref 之后会作为 ref 绑定到动态组件 VNode 上。
    const viewRef = ref<ComponentPublicInstance>()

    // watch at the same time the component instance, the route record we are
    // rendering, and the name
    //  处理实例注入 + 守卫转移
    watch(
      // 主要任务：
      // 将当前实例注入到 route.matched 的 .instances[name] 中
      // 在路由跳转时转移 leaveGuards 和 updateGuards
      // 这是为了保持组件复用时，守卫依旧生效
      () => [viewRef.value, matchedRouteRef.value, props.name] as const,
      ([instance, to, name], [oldInstance, from, oldName]) => {
        // copy reused instances
        if (to) {
          // this will update the instance for new instances as well as reused
          // instances when navigating to a new route
          to.instances[name] = instance
          // the component instance is reused for a different route or name, so
          // we copy any saved update or leave guards. With async setup, the
          // mounting component will mount before the matchedRoute changes,
          // making instance === oldInstance, so we check if guards have been
          // added before. This works because we remove guards when
          // unmounting/deactivating components
          if (from && from !== to && instance && instance === oldInstance) {
            if (!to.leaveGuards.size) {
              to.leaveGuards = from.leaveGuards
            }
            if (!to.updateGuards.size) {
              to.updateGuards = from.updateGuards
            }
          }
        }

        // trigger beforeRouteEnter next callbacks
        if (
          instance &&
          to &&
          // if there is no instance but to and from are the same this might be
          // the first visit
          (!from || !isSameRouteRecord(to, from) || !oldInstance)
        ) {
          // 支持 beforeRouteEnter 的 next callback 执行
          // 这些 callback 来自：
          // beforeRouteEnter(to, from, next) {
          //   next(vm => { /* 执行时机就在这里 */ })
          // }
          ;(to.enterCallbacks[name] || []).forEach(callback =>
            callback(instance)
          )
        }
      },
      { flush: 'post' }
    )

    return () => {
      // 当前路由 & 匹配项
      //        ↓
      // 找到对应的组件（命名视图支持）
      //        ↓
      // 解析 props（route.params 或自定义函数）
      //        ↓
      // 创建组件 VNode（h(ViewComponent, { ... })）
      //        ↓
      // 添加卸载钩子、ref、attrs
      //        ↓
      // Devtools 调试信息挂载
      //        ↓
      // return：
      // → 插槽存在：调用插槽
      // → 否则：直接返回 component


      // 当前要显示的路由对象（可能是 route 或用于过渡时延迟的 route）
      const route = routeToDisplay.value
      // we need the value at the time we render because when we unmount, we
      // navigated to a different location so the value is different

      // 获取当前 <router-view name="xxx"> 应该渲染的组件
      // matchedRoute.components 是当前匹配路由配置中定义的组件映射（按 name）
      const currentName = props.name
      const matchedRoute = matchedRouteRef.value
      const ViewComponent =
        matchedRoute && matchedRoute.components![currentName]

      // 如果没有组件（未命中）
      if (!ViewComponent) {
        // 插槽仍被调用，但 Component 为 undefined
        // 支持如下 fallback 写法：
        // <router-view v-slot="{ Component }">
        //   <div v-if="!Component">Not Found</div>
        // </router-view>
        return normalizeSlot(slots.default, { Component: ViewComponent, route })
      }

      // props from route configuration
      // 提取路由配置中的 props
      // Vue Router 允许你在 routes 配置中传递 props 到组件：
      // {
      //   path: '/user/:id',
      //   component: User,
      //   props: true, // 将 route.params 传入组件
      // }
      const routePropsOption = matchedRoute.props[currentName]
      const routeProps = routePropsOption
        ? routePropsOption === true
          ? route.params
          : typeof routePropsOption === 'function'
          ? routePropsOption(route)
          : routePropsOption
        : null

      // 清理机制：onVnodeUnmounted
      // 当组件卸载时，将当前路由记录中的 instances[name] 清除，避免内存泄漏
      // matchedRoute.instances 是用于 <keep-alive> 支持的内部引用
      const onVnodeUnmounted: VNodeProps['onVnodeUnmounted'] = vnode => {
        // remove the instance reference to prevent leak
        if (vnode.component!.isUnmounted) {
          matchedRoute.instances[currentName] = null
        }
      }

      // 创建最终 VNode
      // 使用 h() 生成组件 VNode，传入：
      // 路由 props
      // 父组件传入的非 prop 属性（attrs）
      // 卸载钩子
      // ref（用于跟踪内部实例）
      const component = h(
        ViewComponent,
        assign({}, routeProps, attrs, {
          onVnodeUnmounted,
          ref: viewRef,
        })
      )

      if (
        (__DEV__ || __FEATURE_PROD_DEVTOOLS__) &&
        isBrowser &&
        component.ref
      ) {
        // TODO: can display if it's an alias, its props
        const info: RouterViewDevtoolsContext = {
          depth: depth.value,
          name: matchedRoute.name,
          path: matchedRoute.path,
          meta: matchedRoute.meta,
        }

        const internalInstances = isArray(component.ref)
          ? component.ref.map(r => r.i)
          : [component.ref.i]

        // Devtools 支持（调试信息）
        internalInstances.forEach(instance => {
          // @ts-expect-error
          instance.__vrv_devtools = info
        })
      }

      return (
        // pass the vnode to the slot as a prop.
        // h and <component :is="..."> both accept vnodes
        // 返回值（插槽优先）
        normalizeSlot(slots.default, { Component: component, route }) ||
        component
      )
    }
  },
})

// 调用 slot 函数，并处理其返回值格式，使后续使用更简便统一。
// slot: 通常是从 slots.xxx 中获取的插槽函数，如 slots.default
// data: 传给 slot 的作用域数据（scope slot 的参数）
function normalizeSlot(slot: Slot | undefined, data: any) {
  // 功能流程
  // 如果 slot 是 undefined → 返回 null（没有插槽）
  // 调用 slot(data)，得到插槽内容（VNode 数组）
  // 如果只返回了一个元素 → 提取这个元素
  // 如果返回多个 → 原样返回数组
  if (!slot) return null
  const slotContent = slot(data)
  return slotContent.length === 1 ? slotContent[0] : slotContent
}

// export the public type for h/tsx inference
// also to avoid inline import() in generated d.ts files
/**
 * Component to display the current route the user is at.
 */
// 背景说明
// Vue Router 的内部实现是：
// const RouterViewImpl = defineComponent({ ... })
// 但为了让 TypeScript 用户在使用 <RouterView> 时获得：
// 正确的 props 提示（如 name, route）
// 正确的 slots 类型（如 v-slot="{ Component, route }"）
// 不生成 import() 类型（避免在 .d.ts 中出现 import(...)）
// 所以 Vue Router 对外 重新声明类型 并强制类型断言为类组件形式：
export const RouterView = RouterViewImpl as unknown as {
  new (): {
    // 这几项合并后定义了 <RouterView> 可以接受的属性：
    // 类型	说明
    // AllowedComponentProps	允许如 v-on, class, style 等绑定
    // ComponentCustomProps	用户自定义的 props 类型
    // VNodeProps	vnode 级别的标准 props（如 key, ref）
    // RouterViewProps	Vue Router 自定义的 props：name, route
    $props: AllowedComponentProps &
      ComponentCustomProps &
      VNodeProps &
      RouterViewProps

    // 这定义了 <router-view v-slot="{ Component, route }"> 插槽的类型：
    // Component: 当前匹配的组件对应的 VNode 实例
    // route: 当前匹配的路由对象（含解析后的 params, meta 等）
    $slots: {
      default?: ({
        Component,
        route,
      }: {
        Component: VNode
        route: RouteLocationNormalizedLoaded
      }) => VNode[]
    }
  }

  // 使用效果示例（带类型推断）
  // <router-view v-slot="{ Component, route }">
  //   <transition name="fade">
  //     <component :is="Component" />
  //   </transition>
  // </router-view>
  // 在 IDE 中你将获得：
  // Component 类型：VNode
  // route 类型：RouteLocationNormalizedLoaded（具有 .path, .params, .meta, 等）
}

// warn against deprecated usage with <transition> & <keep-alive>
// due to functional component being no longer eager in Vue 3
function warnDeprecatedUsage() {
  // 获取当前组件实例，必须在 setup 或 render 阶段。
  const instance = getCurrentInstance()!
  // 获取当前组件的父组件名称（如 KeepAlive 或 Transition）
  const parentName = instance.parent && instance.parent.type.name
  // 获取父组件渲染的子节点类型，检查是否是 RouterView
  const parentSubTreeType =
    instance.parent && instance.parent.subTree && instance.parent.subTree.type
  // 如果父组件是 <keep-alive> 或 <transition>，并且其子组件是 <router-view>，就说明用了 已废弃的用法。
  if (
    parentName &&
    (parentName === 'KeepAlive' || parentName.includes('Transition')) &&
    typeof parentSubTreeType === 'object' &&
    (parentSubTreeType as Component).name === 'RouterView'
  ) {
    const comp = parentName === 'KeepAlive' ? 'keep-alive' : 'transition'
    // 警告信息
    warn(
      `<router-view> can no longer be used directly inside <transition> or <keep-alive>.\n` +
        `Use slot props instead:\n\n` +
        `<router-view v-slot="{ Component }">\n` +
        `  <${comp}>\n` +
        `    <component :is="Component" />\n` +
        `  </${comp}>\n` +
        `</router-view>`
    )
  }

  // 问题背景
  // 在 Vue 2 中，你可以这样写：
  // <keep-alive>
  //   <router-view />
  // </keep-alive>
  // 或：
  // <transition>
  //   <router-view />
  // </transition>

  // 但在 Vue 3 中，这种写法已经 不再被推荐，甚至会导致 不可靠的行为，原因是：
  // <router-view> 是一个渲染函数组件，它内部管理动态组件
  // 直接包在 <keep-alive> 或 <transition> 外层无法“感知”嵌套逻辑
  // Vue Router 4 推荐通过 插槽方式获取渲染组件


  // 正确写法
  // 使用插槽配合动态组件：
  // <router-view v-slot="{ Component }">
  //   <keep-alive>
  //     <component :is="Component" />
  //   </keep-alive>
  // </router-view>
  // 或者：
  // <router-view v-slot="{ Component }">
  //   <transition name="fade">
  //     <component :is="Component" />
  //   </transition>
  // </router-view>
  // 这样可以确保 <keep-alive> 和 <transition> 正确作用于实际的路由组件，而不是包裹 <router-view> 本身。
}
