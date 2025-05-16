import type {
  NavigationGuard,
  NavigationGuardNextCallback,
  _RouteRecordProps,
} from '../typed-routes'
import {
  RouteRecordMultipleViews,
  _RouteRecordBase,
  RouteRecordRaw,
} from '../types'
import { ComponentPublicInstance } from 'vue'

// normalize component/components into components and make every property always present
/**
 * Normalized version of a {@link RouteRecord | route record}.
 */
export interface RouteRecordNormalized {
  /**
   * {@inheritDoc _RouteRecordBase.path}
   */
  // 规范化后的路径（从用户定义中解析）
  path: _RouteRecordBase['path']
  /**
   * {@inheritDoc _RouteRecordBase.redirect}
   */
  // 重定向配置
  redirect: _RouteRecordBase['redirect'] | undefined
  /**
   * {@inheritDoc _RouteRecordBase.name}
   */
  // 路由名称
  name: _RouteRecordBase['name']
  /**
   * {@inheritDoc RouteRecordMultipleViews.components}
   */
  // 命名视图组件对象（默认 key 为 default）
  components: RouteRecordMultipleViews['components'] | null | undefined

  /**
   * Contains the original modules for lazy loaded components.
   * @internal
   */
  // 对应的组件模块对象（通常用于存异步组件加载结果）
  mods: Record<string, unknown>

  /**
   * Nested route records.
   */
  // 嵌套路由定义
  children: RouteRecordRaw[]
  /**
   * {@inheritDoc _RouteRecordBase.meta}
   */
  // 路由元信息，来自用户定义的 meta
  meta: Exclude<_RouteRecordBase['meta'], void>
  /**
   * {@inheritDoc RouteRecordMultipleViews.props}
   */
  // 每个视图对应的 props 配置
  props: Record<string, _RouteRecordProps>
  /**
   * Registered beforeEnter guards
   */
  // 路由独立的 beforeEnter 守卫
  beforeEnter: _RouteRecordBase['beforeEnter']
  /**
   * Registered leave guards
   *
   * @internal
   */
  // 组件注册的 beforeRouteLeave 守卫（通过 onBeforeRouteLeave 或 options API）
  leaveGuards: Set<NavigationGuard>
  /**
   * Registered update guards
   *
   * @internal
   */
  // 组件注册的 beforeRouteUpdate 守卫
  updateGuards: Set<NavigationGuard>
  /**
   * Registered beforeRouteEnter callbacks passed to `next` or returned in guards
   *
   * @internal
   */
  // beforeRouteEnter 的 next(vm => ...) 回调收集点
  enterCallbacks: Record<string, NavigationGuardNextCallback[]>
  /**
   * Mounted route component instances
   * Having the instances on the record mean beforeRouteUpdate and
   * beforeRouteLeave guards can only be invoked with the latest mounted app
   * instance if there are multiple application instances rendering the same
   * view, basically duplicating the content on the page, which shouldn't happen
   * in practice. It will work if multiple apps are rendering different named
   * views.
   */
  instances: Record<string, ComponentPublicInstance | undefined | null>
  // can only be of the same type as this record
  /**
   * Defines if this record is the alias of another one. This property is
   * `undefined` if the record is the original one.
   */
  // 若当前是别名（alias）路由，则指向源路由记录
  aliasOf: RouteRecordNormalized | undefined
}

/**
 * {@inheritDoc RouteRecordNormalized}
 */
export type RouteRecord = RouteRecordNormalized
