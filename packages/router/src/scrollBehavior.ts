import type {
  RouteLocationNormalized,
  RouteLocationNormalizedLoaded,
} from './typed-routes'
import { warn } from './warning'

// we use types instead of interfaces to make it work with HistoryStateValue type
// 在路由切换时，控制页面的滚动行为。支持以下几种情况：
// 手动设置滚动位置 (top, left)
// 滚动到某个元素（通过 el 选择器或 DOM 元素）
// 配合浏览器 history.state 恢复滚动位置
// 支持平滑滚动（behavior: 'smooth'）
/**
 * Scroll position similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions | `ScrollToOptions`}.
 * Note that not all browsers support `behavior`.
 */
// 类似 ScrollToOptions，指定 top / left 及可选的 behavior
export type ScrollPositionCoordinates = {
  behavior?: ScrollOptions['behavior']
  left?: number
  top?: number
}

/**
 * Internal normalized version of {@link ScrollPositionCoordinates} that always
 * has `left` and `top` coordinates. Must be a type to be assignable to HistoryStateValue.
 *
 * @internal
 */
// 内部使用，强制包含 top 和 left，用于 history.state 存储
export type _ScrollPositionNormalized = {
  behavior?: ScrollOptions['behavior']
  left: number
  top: number
}

// 包含 el（选择器或元素）及可选 behavior 等滚动选项
export interface ScrollPositionElement extends ScrollToOptions {
  /**
   * A valid CSS selector. Note some characters must be escaped in id selectors (https://mathiasbynens.be/notes/css-escapes).
   * @example
   * Here are a few examples:
   *
   * - `.title`
   * - `.content:first-child`
   * - `#marker`
   * - `#marker\~with\~symbols`
   * - `#marker.with.dot`: selects `class="with dot" id="marker"`, not `id="marker.with.dot"`
   *
   */
  el: string | Element
}

// 可以是坐标或元素形式的混合类型
export type ScrollPosition = ScrollPositionCoordinates | ScrollPositionElement

type Awaitable<T> = T | PromiseLike<T>

// 自定义滚动行为处理函数的类型定义
export interface ScrollBehaviorHandler<T> {
  (
    to: RouteLocationNormalized,
    from: RouteLocationNormalizedLoaded,
    savedPosition: T | void
  ): Awaitable<ScrollPosition | false | void>
}

// 返回一个元素相对于页面左上角的坐标，考虑了偏移（offset）。
function getElementPosition(
  el: Element,
  offset: ScrollPositionCoordinates
): _ScrollPositionNormalized {
  const docRect = document.documentElement.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()

  return {
    behavior: offset.behavior,
    left: elRect.left - docRect.left - (offset.left || 0),
    top: elRect.top - docRect.top - (offset.top || 0),
  }
}

// 简单返回当前滚动位置
export const computeScrollPosition = (): _ScrollPositionNormalized => ({
  left: window.scrollX,
  top: window.scrollY,
})

// 滚动到指定位置或元素。
// 如果传入了 el（例如 #main），会：
// 检查合法性、是否需要转为 document.querySelector
// 自动计算滚动位置并调用 window.scrollTo
// 如果传入 top / left，则直接调用浏览器的 scrollTo
export function scrollToPosition(position: ScrollPosition): void {
  let scrollToOptions: ScrollPositionCoordinates

  if ('el' in position) {
    const positionEl = position.el
    const isIdSelector =
      typeof positionEl === 'string' && positionEl.startsWith('#')
    /**
     * `id`s can accept pretty much any characters, including CSS combinators
     * like `>` or `~`. It's still possible to retrieve elements using
     * `document.getElementById('~')` but it needs to be escaped when using
     * `document.querySelector('#\\~')` for it to be valid. The only
     * requirements for `id`s are them to be unique on the page and to not be
     * empty (`id=""`). Because of that, when passing an id selector, it should
     * be properly escaped for it to work with `querySelector`. We could check
     * for the id selector to be simple (no CSS combinators `+ >~`) but that
     * would make things inconsistent since they are valid characters for an
     * `id` but would need to be escaped when using `querySelector`, breaking
     * their usage and ending up in no selector returned. Selectors need to be
     * escaped:
     *
     * - `#1-thing` becomes `#\31 -thing`
     * - `#with~symbols` becomes `#with\\~symbols`
     *
     * - More information about  the topic can be found at
     *   https://mathiasbynens.be/notes/html5-id-class.
     * - Practical example: https://mathiasbynens.be/demo/html5-id
     */
    if (__DEV__ && typeof position.el === 'string') {
      if (!isIdSelector || !document.getElementById(position.el.slice(1))) {
        try {
          const foundEl = document.querySelector(position.el)
          if (isIdSelector && foundEl) {
            warn(
              `The selector "${position.el}" should be passed as "el: document.querySelector('${position.el}')" because it starts with "#".`
            )
            // return to avoid other warnings
            return
          }
        } catch (err) {
          warn(
            `The selector "${position.el}" is invalid. If you are using an id selector, make sure to escape it. You can find more information about escaping characters in selectors at https://mathiasbynens.be/notes/css-escapes or use CSS.escape (https://developer.mozilla.org/en-US/docs/Web/API/CSS/escape).`
          )
          // return to avoid other warnings
          return
        }
      }
    }

    const el =
      typeof positionEl === 'string'
        ? isIdSelector
          ? document.getElementById(positionEl.slice(1))
          : document.querySelector(positionEl)
        : positionEl

    if (!el) {
      __DEV__ &&
        warn(
          `Couldn't find element using selector "${position.el}" returned by scrollBehavior.`
        )
      return
    }
    scrollToOptions = getElementPosition(el, position)
  } else {
    scrollToOptions = position
  }

  // 浏览器兼容处理
  // 检查浏览器是否支持 scrollBehavior（现代浏览器支持平滑滚动）
  // 否则 fallback 到 scrollTo(x, y)
  if ('scrollBehavior' in document.documentElement.style)
    window.scrollTo(scrollToOptions)
  else {
    window.scrollTo(
      scrollToOptions.left != null ? scrollToOptions.left : window.scrollX,
      scrollToOptions.top != null ? scrollToOptions.top : window.scrollY
    )
  }
}

// 生成用于 Map 的唯一 key：
// 其中 position = history.state.position - delta
export function getScrollKey(path: string, delta: number): string {
  const position: number = history.state ? history.state.position - delta : -1
  return position + path
}

export const scrollPositions = new Map<string, _ScrollPositionNormalized>()

// 用于保存滚动位置（用于前进/后退时恢复滚动状态）。
export function saveScrollPosition(
  key: string,
  scrollPosition: _ScrollPositionNormalized
) {
  scrollPositions.set(key, scrollPosition)
}

// 用于恢复滚动位置（用于前进/后退时恢复滚动状态）。
export function getSavedScrollPosition(key: string) {
  const scroll = scrollPositions.get(key)
  // consume it so it's not used again
  scrollPositions.delete(key)
  return scroll
}

// TODO: RFC about how to save scroll position
/**
 * ScrollBehavior instance used by the router to compute and restore the scroll
 * position when navigating.
 */
// export interface ScrollHandler<ScrollPositionEntry extends HistoryStateValue, ScrollPosition extends ScrollPositionEntry> {
//   // returns a scroll position that can be saved in history
//   compute(): ScrollPositionEntry
//   // can take an extended ScrollPositionEntry
//   scroll(position: ScrollPosition): void
// }

// export const scrollHandler: ScrollHandler<ScrollPosition> = {
//   compute: computeScroll,
//   scroll: scrollToPosition,
// }
