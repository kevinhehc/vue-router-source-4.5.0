import {
  defineComponent,
  h,
  PropType,
  inject,
  computed,
  reactive,
  unref,
  VNode,
  UnwrapRef,
  VNodeProps,
  AllowedComponentProps,
  ComponentCustomProps,
  getCurrentInstance,
  watchEffect,
  // this is a workaround for https://github.com/microsoft/rushstack/issues/1050
  // this file is meant to be prepended to the generated dist/src/RouterLink.d.ts
  // @ts-ignore
  ComputedRef,
  // @ts-ignore
  DefineComponent,
  // @ts-ignore
  RendererElement,
  // @ts-ignore
  RendererNode,
  // @ts-ignore
  ComponentOptionsMixin,
  MaybeRef,
} from 'vue'
import { isSameRouteLocationParams, isSameRouteRecord } from './location'
import { routerKey, routeLocationKey } from './injectionSymbols'
import { RouteRecord } from './matcher/types'
import { NavigationFailure } from './errors'
import { isArray, isBrowser, noop } from './utils'
import { warn } from './warning'
import { isRouteLocation } from './types'
import {
  RouteLocation,
  RouteLocationAsPath,
  RouteLocationAsRelativeTyped,
  RouteLocationAsString,
  RouteLocationRaw,
  RouteLocationResolved,
  RouteMap,
} from './typed-routes'

// 控制路由行为（导航目标、是否 replace）
export interface RouterLinkOptions {
  /**
   * Route Location the link should navigate to when clicked on.
   */
  // 必填，跳转目标。支持字符串、对象等形式，如 ：
  // to="/about"
  // to="{ name: 'User', params: { id: 1 } }"
  to: RouteLocationRaw
  /**
   * Calls `router.replace` instead of `router.push`.
   */
  // 如果为 true，使用 router.replace() 而不是 push()，即不会新增历史记录
  replace?: boolean
  // TODO: refactor using extra options allowed in router.push. Needs RFC
}

// 除路由行为外，控制 DOM、样式、可访问性等
export interface RouterLinkProps extends RouterLinkOptions {
  /**
   * Whether RouterLink should not wrap its content in an `a` tag. Useful when
   * using `v-slot` to create a custom RouterLink
   */
  // 是否禁用默认的 <a> 标签包装，常用于插槽自定义
  custom?: boolean
  /**
   * Class to apply when the link is active
   */
  // 链接激活时应用的 CSS 类（模糊匹配）
  activeClass?: string
  /**
   * Class to apply when the link is exact active
   */
  // 路由完全匹配时的 CSS 类
  exactActiveClass?: string
  /**
   * Value passed to the attribute `aria-current` when the link is exact active.
   *
   * @defaultValue `'page'`
   */
  // 控制 aria-current 属性的值（默认 'page'，用于辅助技术识别当前项）
  ariaCurrentValue?:
    | 'page'
    | 'step'
    | 'location'
    | 'date'
    | 'time'
    | 'true'
    | 'false'

  /**
   * Pass the returned promise of `router.push()` to `document.startViewTransition()` if supported.
   */
  // 实验性特性，是否调用 document.startViewTransition() 来优化页面切换动画
  viewTransition?: boolean
}

/**
 * Context passed from router-link components to devtools.
 * @internal
 */
// 这是 Vue Devtools 使用的调试上下文结构，用于展示：
// 当前 link 指向的解析后路由信息
// 是否处于激活状态
// 是否完全匹配当前路由
// 是否解析失败
// Vue Devtools 可能会展示你点击了哪个 <router-link>，它是否激活，是否跳转失败等。
export interface UseLinkDevtoolsContext {
  route: RouteLocationResolved
  isActive: boolean
  isExactActive: boolean
  error: string | null
}

/**
 * Options passed to {@link useLink}.
 */
// useLink() 是 Vue Router 公开的组合式函数，提供 <RouterLink> 所有导航能力，包括：
// 解析 to → route
// 计算 href
// 判断是否激活
// 提供 navigate() 方法用于程序式跳转
// 你可以用它手动实现一个类似 <router-link> 的组件，或扩展其行为
export interface UseLinkOptions<Name extends keyof RouteMap = keyof RouteMap> {
  // 字段解释：
  // 字段	          类型	           说明
  // to	            `string	       object
  // replace	      `boolean	     ref<boolean>`
  // viewTransition	`boolean	     是否传递 promise 给 document.startViewTransition()（渐变支持）
  to: MaybeRef<
    | RouteLocationAsString
    | RouteLocationAsRelativeTyped<RouteMap, Name>
    | RouteLocationAsPath
    | RouteLocationRaw
  >

  replace?: MaybeRef<boolean | undefined>

  /**
   * Pass the returned promise of `router.push()` to `document.startViewTransition()` if supported.
   */
  viewTransition?: boolean
}

/**
 * Return type of {@link useLink}.
 * @internal
 */
export interface UseLinkReturn<Name extends keyof RouteMap = keyof RouteMap> {
  // 返回值说明：
  // 字段	          类型	                                  含义
  // route	        ComputedRef<RouteLocationResolved>	  解析后的目标路由
  // href	          ComputedRef<string>	                  转换后的链接地址，等价于 router.resolve(to).href
  // isActive	      ComputedRef<boolean>	                当前路由是否“模糊激活”（前缀匹配）
  // isExactActive	ComputedRef<boolean>	                当前路由是否“精确激活”
  // navigate(e?)	  方法	                                  触发跳转行为（支持点击事件传入）
  route: ComputedRef<RouteLocationResolved<Name>>
  href: ComputedRef<string>
  isActive: ComputedRef<boolean>
  isExactActive: ComputedRef<boolean>
  navigate(e?: MouseEvent): Promise<void | NavigationFailure>
}

// TODO: we could allow currentRoute as a prop to expose `isActive` and
// `isExactActive` behavior should go through an RFC
/**
 * Returns the internal behavior of a {@link RouterLink} without the rendering part.
 *
 * @param props - a `to` location and an optional `replace` flag
 */
export function useLink<Name extends keyof RouteMap = keyof RouteMap>(
  props: UseLinkOptions<Name>
): UseLinkReturn<Name> {
  // 1. 解析目标 route
  // router.resolve() 会将 to 转换成标准的 RouteLocationResolved
  // 支持 ref/reactive
  // 包含 .href, .matched, .params, .name 等信息
  const router = inject(routerKey)!
  const currentRoute = inject(routeLocationKey)!

  let hasPrevious = false
  let previousTo: unknown = null

  const route = computed(() => {
    const to = unref(props.to)

    if (__DEV__ && (!hasPrevious || to !== previousTo)) {
      // 还带开发环境检查：
      if (!isRouteLocation(to)) {
        if (hasPrevious) {
          warn(
            `Invalid value for prop "to" in useLink()\n- to:`,
            to,
            `\n- previous to:`,
            previousTo,
            `\n- props:`,
            props
          )
        } else {
          warn(
            `Invalid value for prop "to" in useLink()\n- to:`,
            to,
            `\n- props:`,
            props
          )
        }
      }

      previousTo = to
      hasPrevious = true
    }

    return router.resolve(to)
  })

  // 2. 激活状态判断
  const activeRecordIndex = computed<number>(() => {
    const { matched } = route.value
    const { length } = matched
    const routeMatched: RouteRecord | undefined = matched[length - 1]
    const currentMatched = currentRoute.matched
    if (!routeMatched || !currentMatched.length) return -1
    // 当前激活路由中是否包含 route.value 的路由记录（matched[] 中的项）
    // 若未命中，则考虑“嵌套路由的空子路径”等情况，再次回退匹配上层 route。
    const index = currentMatched.findIndex(
      isSameRouteRecord.bind(null, routeMatched)
    )
    if (index > -1) return index
    // possible parent record
    const parentRecordPath = getOriginalPath(
      matched[length - 2] as RouteRecord | undefined
    )
    return (
      // we are dealing with nested routes
      length > 1 &&
        // if the parent and matched route have the same path, this link is
        // referring to the empty child. Or we currently are on a different
        // child of the same parent
        getOriginalPath(routeMatched) === parentRecordPath &&
        // avoid comparing the child with its parent
        currentMatched[currentMatched.length - 1].path !== parentRecordPath
        ? currentMatched.findIndex(
            isSameRouteRecord.bind(null, matched[length - 2])
          )
        : index
    )
  })

  // 匹配成功（记录存在）
  // 并且 params 包含（不要求完全相等）
  const isActive = computed<boolean>(
    () =>
      activeRecordIndex.value > -1 &&
      includesParams(currentRoute.params, route.value.params)
  )

  // 完全匹配路由记录 & params 完全一致 → 精确激活
  const isExactActive = computed<boolean>(
    () =>
      activeRecordIndex.value > -1 &&
      activeRecordIndex.value === currentRoute.matched.length - 1 &&
      isSameRouteLocationParams(currentRoute.params, route.value.params)
  )

  // 3. 路由跳转函数 navigate
  // 拦截点击事件（guardEvent()）
  // 执行 router.push() 或 router.replace()
  // 可选启用视图过渡动画（viewTransition）
  function navigate(
    e: MouseEvent = {} as MouseEvent
  ): Promise<void | NavigationFailure> {
    if (guardEvent(e)) {
      const p = router[unref(props.replace) ? 'replace' : 'push'](
        unref(props.to)
        // avoid uncaught errors are they are logged anyway
      ).catch(noop)
      if (
        props.viewTransition &&
        typeof document !== 'undefined' &&
        'startViewTransition' in document
      ) {
        document.startViewTransition(() => p)
      }
      return p
    }
    return Promise.resolve()
  }

  // devtools only
  // 4. devtools 支持（开发调试）
  if ((__DEV__ || __FEATURE_PROD_DEVTOOLS__) && isBrowser) {
    const instance = getCurrentInstance()
    if (instance) {
      // 提供：
      // 当前解析的目标 route
      // 是否激活 / 精确激活
      // to 是否非法（如不是字符串/对象）
      const linkContextDevtools: UseLinkDevtoolsContext = {
        route: route.value,
        isActive: isActive.value,
        isExactActive: isExactActive.value,
        error: null,
      }

      // @ts-expect-error: this is internal
      instance.__vrl_devtools = instance.__vrl_devtools || []
      // @ts-expect-error: this is internal
      instance.__vrl_devtools.push(linkContextDevtools)
      watchEffect(
        () => {
          linkContextDevtools.route = route.value
          linkContextDevtools.isActive = isActive.value
          linkContextDevtools.isExactActive = isExactActive.value
          linkContextDevtools.error = isRouteLocation(unref(props.to))
            ? null
            : 'Invalid "to" value'
        },
        { flush: 'post' }
      )
    }
  }

  /**
   * NOTE: update {@link _RouterLinkI}'s `$slots` type when updating this
   */
  return {
    route,
    href: computed(() => route.value.href),
    isActive,
    isExactActive,
    navigate,
  }

  // 实际使用场景

  // 使用场景 1：自定义导航组件（button、div）
  // const { href, isActive, navigate } = useLink({ to: '/profile' })
  // 在模板中：
  // <button :class="{ active: isActive }" @click="navigate">Go</button>

  // 使用场景 2：构建扩展型 <RouterLink>
  // 这是 <RouterLink> 内部的关键依赖。它只需负责渲染逻辑，而 useLink() 提供所有行为。
}

function preferSingleVNode(vnodes: VNode[]) {
  return vnodes.length === 1 ? vnodes[0] : vnodes
}

// 利用 useLink() 实现了导航行为、href 计算、激活状态判断，并通过 custom 支持插槽自定义渲染。
export const RouterLinkImpl = /*#__PURE__*/ defineComponent({
  name: 'RouterLink',
  compatConfig: { MODE: 3 },
  // 1. 定义 props
  // 这些 props 全都在前面 RouterLinkProps 类型中定义过，功能包括：
  // 属性	用途
  // to	跳转地址（字符串或对象）
  // replace	是否使用 router.replace()
  // activeClass	当前路由模糊匹配时应用的 class
  // exactActiveClass	当前路由完全匹配时的 class
  // custom	是否使用插槽自定义渲染
  // ariaCurrentValue	为可访问性设置 aria-current 值（默认 'page'）
  props: {
    to: {
      type: [String, Object] as PropType<RouteLocationRaw>,
      required: true,
    },
    replace: Boolean,
    activeClass: String,
    // inactiveClass: String,
    exactActiveClass: String,
    custom: Boolean,
    ariaCurrentValue: {
      type: String as PropType<RouterLinkProps['ariaCurrentValue']>,
      default: 'page',
    },
  },

  useLink,

  setup(props, { slots }) {
    // 2. 使用 useLink() 实现核心逻辑
    // 这会提供以下响应式属性（详见你之前贴的 useLink）：
    // link.href
    // link.route
    // link.navigate
    // link.isActive
    // link.isExactActive
    const link = reactive(useLink(props))
    const { options } = inject(routerKey)!

    // 3. 计算 class（激活状态）
    // 通过 router.options.linkActiveClass 传入全局默认值，也支持组件级别 activeClass、exactActiveClass。
    const elClass = computed(() => ({
      [getLinkClass(
        props.activeClass,
        options.linkActiveClass,
        'router-link-active'
      )]: link.isActive,
      // [getLinkClass(
      //   props.inactiveClass,
      //   options.linkInactiveClass,
      //   'router-link-inactive'
      // )]: !link.isExactActive,
      [getLinkClass(
        props.exactActiveClass,
        options.linkExactActiveClass,
        'router-link-exact-active'
      )]: link.isExactActive,
    }))

    // 4. 渲染函数
    // 普通渲染模式（custom: false）：
    // 渲染为 <a> 标签，附带 class、href、click handler
    // 自定义渲染模式（custom: true）：
    // 只调用插槽并返回内容，交由用户自定义渲染结构（通常结合 v-slot 使用）
    return () => {
      const children = slots.default && preferSingleVNode(slots.default(link))
      return props.custom
        ? children
        : h(
            'a',
            {
              'aria-current': link.isExactActive
                ? props.ariaCurrentValue
                : null,
              href: link.href,
              // this would override user added attrs but Vue will still add
              // the listener, so we end up triggering both
              onClick: link.navigate,
              class: elClass.value,
            },
            children
          )
    }
  },
  // 插槽使用示例（custom 模式）
  // <router-link to="/user" custom v-slot="{ href, navigate, isActive }">
  //   <button :class="{ active: isActive }" @click="navigate">{{ href }}</button>
  // </router-link>
  // useLink() 让这些 slot 参数变得非常清晰可控。
})

// export the public type for h/tsx inference
// also to avoid inline import() in generated d.ts files
/**
 * Component to render a link that triggers a navigation on click.
 */
// 这里将 RouterLinkImpl 强制转换成 _RouterLinkI，是为了支持更强类型推断（特别是 JSX、TSX 中）：
// 为 RouterLink 提供 IDE 和类型系统友好的接口提示
// 暴露 RouterLink.useLink() 作为静态方法（内部用）
export const RouterLink: _RouterLinkI = RouterLinkImpl as any

/**
 * Typed version of the `RouterLink` component. Its generic defaults to the typed router, so it can be inferred
 * automatically for JSX.
 *
 * @internal
 */
export interface _RouterLinkI {
  new (): {
    $props: AllowedComponentProps &
      ComponentCustomProps &
      VNodeProps &
      RouterLinkProps

    $slots: {
      default?: ({
        route,
        href,
        isActive,
        isExactActive,
        navigate,
      }: // TODO: How do we add the name generic
      UnwrapRef<UseLinkReturn>) => VNode[]
    }
  }

  /**
   * Access to `useLink()` without depending on using vue-router
   *
   * @internal
   */
  useLink: typeof useLink
}


// 拦截不该跳转的点击事件
// 这是 <a @click> 中最重要的行为保护器：
// 不跳转的场景	原因
// 按下 Ctrl/Meta/Alt/Shift	用户想打开新标签
// e.preventDefault() 已被调用	外部阻止跳转
// 鼠标右键	用户想打开菜单
// target="_blank"	用户显式要求新开标签页
// 最后会调用 e.preventDefault() 防止默认 <a> 跳转。
function guardEvent(e: MouseEvent) {
  // don't redirect with control keys
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  // don't redirect when preventDefault called
  if (e.defaultPrevented) return
  // don't redirect on right click
  if (e.button !== undefined && e.button !== 0) return
  // don't redirect if `target="_blank"`
  // @ts-expect-error getAttribute does exist
  if (e.currentTarget && e.currentTarget.getAttribute) {
    // @ts-expect-error getAttribute exists
    const target = e.currentTarget.getAttribute('target')
    if (/\b_blank\b/i.test(target)) return
  }
  // this may be a Weex event which doesn't have this method
  if (e.preventDefault) e.preventDefault()

  return true
}

// 是否包含目标参数
function includesParams(
  outer: RouteLocation['params'],
  inner: RouteLocation['params']
): boolean {
  // 这是判断 isActive 时用于比对 params 的工具函数：
  // 字符串直接比对
  // 数组必须元素一致（顺序也要相同）
  // 用于模糊匹配（只要目标参数被包含即可）。
  for (const key in inner) {
    const innerValue = inner[key]
    const outerValue = outer[key]
    if (typeof innerValue === 'string') {
      if (innerValue !== outerValue) return false
    } else {
      if (
        !isArray(outerValue) ||
        outerValue.length !== innerValue.length ||
        innerValue.some((value, i) => value !== outerValue[i])
      )
        return false
    }
  }

  return true
}

/**
 * Get the original path value of a record by following its aliasOf
 * @param record
 */
// 获取真实路径
// 当存在 alias（别名路由）时，返回真实路径：
function getOriginalPath(record: RouteRecord | undefined): string {
  return record ? (record.aliasOf ? record.aliasOf.path : record.path) : ''
}

/**
 * Utility class to get the active class based on defaults.
 * @param propClass
 * @param globalClass
 * @param defaultClass
 */
// 激活类名的决策逻辑
// 顺序如下：
// 使用组件 prop 显式传入的 class
// 使用 router 的全局默认 class
// 使用硬编码的 fallback（如 'router-link-active'）
const getLinkClass = (
  propClass: string | undefined,
  globalClass: string | undefined,
  defaultClass: string
): string =>
  propClass != null
    ? propClass
    : globalClass != null
    ? globalClass
    : defaultClass
