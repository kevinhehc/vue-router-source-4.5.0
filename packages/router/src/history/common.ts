import { isBrowser } from '../utils'
import { removeTrailingSlash } from '../location'

// 表示当前的 URL（如字符串 '/about'）
export type HistoryLocation = string
/**
 * Allowed variables in HTML5 history state. Note that pushState clones the state
 * passed and does not accept everything: e.g.: it doesn't accept symbols, nor
 * functions as values. It also ignores Symbols as keys.
 *
 * @internal
 */
export type HistoryStateValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | HistoryState
  | HistoryStateArray

/**
 * Allowed HTML history.state
 */
// 表示 window.history.state 允许存储的数据结构
// 这是用于 history.pushState(..., state) 的数据，Vue Router 会将一些内部信息（如 scroll position）保存在这里。
export interface HistoryState {
  [x: number]: HistoryStateValue
  [x: string]: HistoryStateValue
}

/**
 * Allowed arrays for history.state.
 *
 * @internal
 */
export interface HistoryStateArray extends Array<HistoryStateValue> {}

// 枚举，用于监听导航方式
// 在导航时，Vue Router 会根据 popstate 或程序性跳转来判断：
// 是用户点击返回？（pop + back）
// 还是调用 router.push()？（push + forward）
export enum NavigationType {
  pop = 'pop',
  push = 'push',
}

// 枚举，用于监听导航方向
export enum NavigationDirection {
  back = 'back',
  forward = 'forward',
  unknown = '',
}

// 提供完整的导航上下文信息
export interface NavigationInformation {
  type: NavigationType
  direction: NavigationDirection
  delta: number
}

export interface NavigationCallback {
  (
    to: HistoryLocation,
    from: HistoryLocation,
    information: NavigationInformation
  ): void
}

/**
 * Starting location for Histories
 */
// 表示初始路由（如 '/'）的常量
export const START: HistoryLocation = ''

export type ValueContainer<T> = { value: T }

/**
 * Interface implemented by History implementations that can be passed to the
 * router as {@link Router.history}
 *
 * @alpha
 */
// 定义所有路由历史实现应遵循的标准
// 每种路由模式（如：
// createWebHistory
// createWebHashHistory
// createMemoryHistory
// ）都实现了这个接口。
export interface RouterHistory {
  /**
   * Base path that is prepended to every url. This allows hosting an SPA at a
   * sub-folder of a domain like `example.com/sub-folder` by having a `base` of
   * `/sub-folder`
   */
  readonly base: string
  /**
   * Current History location
   */
  readonly location: HistoryLocation
  /**
   * Current History state
   */
  readonly state: HistoryState
  // readonly location: ValueContainer<HistoryLocationNormalized>

  /**
   * Navigates to a location. In the case of an HTML5 History implementation,
   * this will call `history.pushState` to effectively change the URL.
   *
   * @param to - location to push
   * @param data - optional {@link HistoryState} to be associated with the
   * navigation entry
   */
  push(to: HistoryLocation, data?: HistoryState): void
  /**
   * Same as {@link RouterHistory.push} but performs a `history.replaceState`
   * instead of `history.pushState`
   *
   * @param to - location to set
   * @param data - optional {@link HistoryState} to be associated with the
   * navigation entry
   */
  replace(to: HistoryLocation, data?: HistoryState): void

  /**
   * Traverses history in a given direction.
   *
   * @example
   * ```js
   * myHistory.go(-1) // equivalent to window.history.back()
   * myHistory.go(1) // equivalent to window.history.forward()
   * ```
   *
   * @param delta - distance to travel. If delta is \< 0, it will go back,
   * if it's \> 0, it will go forward by that amount of entries.
   * @param triggerListeners - whether this should trigger listeners attached to
   * the history
   */
  go(delta: number, triggerListeners?: boolean): void

  /**
   * Attach a listener to the History implementation that is triggered when the
   * navigation is triggered from outside (like the Browser back and forward
   * buttons) or when passing `true` to {@link RouterHistory.back} and
   * {@link RouterHistory.forward}
   *
   * @param callback - listener to attach
   * @returns a callback to remove the listener
   */
  listen(callback: NavigationCallback): () => void

  /**
   * Generates the corresponding href to be used in an anchor tag.
   *
   * @param location - history location that should create an href
   */
  createHref(location: HistoryLocation): string

  /**
   * Clears any event listener attached by the history implementation.
   */
  destroy(): void
}

// Generic utils

/**
 * Normalizes a base by removing any trailing slash and reading the base tag if
 * present.
 *
 * @param base - base to normalize
 */
// 用于处理 router 初始化时的 base 配置：
// 自动读取 <base href> 标签
// 去除 origin（如 https://example.com）
// 统一加上 / 开头
// 去掉末尾 /
// -------------------------------------举例：
// <base href="/app/">
// 调用：
// normalizeBase() // -> '/app'
export function normalizeBase(base?: string): string {
  if (!base) {
    if (isBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^\w+:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }

  // ensure leading slash when it was removed by the regex above avoid leading
  // slash with hash because the file could be read from the disk like file://
  // and the leading slash would cause problems
  if (base[0] !== '/' && base[0] !== '#') base = '/' + base

  // remove the trailing slash so all other method can just do `base + fullPath`
  // to build an href
  return removeTrailingSlash(base)
}

// remove any character before the hash
const BEFORE_HASH_RE = /^[^#]+#/
// 用于拼接最终 URL，比如生成 <a :href="...">。
// createHref('/app', '/about') // => '/app/about'
// 对于 hash 模式，传入的 base 会是类似 file://...#，所以需要去掉 file://...：
export function createHref(base: string, location: HistoryLocation): string {
  return base.replace(BEFORE_HASH_RE, '#') + location
}
