import { RouterHistory } from './common'
import { createWebHistory } from './html5'
import { warn } from '../warning'

/**
 * Creates a hash history. Useful for web applications with no host (e.g. `file://`) or when configuring a server to
 * handle any URL is not possible.
 *
 * @param base - optional base to provide. Defaults to `location.pathname + location.search` If there is a `<base>` tag
 * in the `head`, its value will be ignored in favor of this parameter **but note it affects all the history.pushState()
 * calls**, meaning that if you use a `<base>` tag, it's `href` value **has to match this parameter** (ignoring anything
 * after the `#`).
 *
 * @example
 * ```js
 * // at https://example.com/folder
 * createWebHashHistory() // gives a url of `https://example.com/folder#`
 * createWebHashHistory('/folder/') // gives a url of `https://example.com/folder/#`
 * // if the `#` is provided in the base, it won't be added by `createWebHashHistory`
 * createWebHashHistory('/folder/#/app/') // gives a url of `https://example.com/folder/#/app/`
 * // you should avoid doing this because it changes the original url and breaks copying urls
 * createWebHashHistory('/other-folder/') // gives a url of `https://example.com/other-folder/#`
 *
 * // at file:///usr/etc/folder/index.html
 * // for locations with no `host`, the base is ignored
 * createWebHashHistory('/iAmIgnored') // gives a url of `file:///usr/etc/folder/index.html#`
 * ```
 */
// 负责创建哈希路由模式（Hash mode）的 history 实例，即通过 location.hash 来进行路由管理。
// 使其专门处理基于 # 的路径，如：
// http://example.com/#/about
// 这是前端路由中最早期的方式，兼容性极好（甚至支持 IE9+），无需服务端配置。
export function createWebHashHistory(base?: string): RouterHistory {
  // Make sure this implementation is fine in terms of encoding, specially for IE11
  // for `file://`, directly use the pathname and ignore the base
  // location.pathname contains an initial `/` even at the root: `https://example.com`
  // 如果当前是浏览器环境（location.host 存在）：
  // 优先使用用户传入的 base
  // 否则 fallback 为当前页面的 pathname + search
  // 在 file:// 协议下（如移动 App、Electron）使用空  base
  base = location.host ? base || location.pathname + location.search : ''
  // allow the user to provide a `#` in the middle: `/base/#/app`
  // 确保最终的 base 包含 #，因为这是 hash 路由的关键标记位。
  // 例如：
  // 输入：/my-app/ → 输出：/my-app/#
  // 输入：/app/#/home → 保留不变
  if (!base.includes('#')) base += '#'

  if (__DEV__ && !base.endsWith('#/') && !base.endsWith('#')) {
    // 开发环境下检查 base 是否合理：
    // 合法的 hash base 必须以 # 或 #/ 结尾
    // 如果不是，给出警告并提示应如何更正
    warn(
      `A hash base must end with a "#":\n"${base}" should be "${base.replace(
        /#.*$/,
        '#'
      )}".`
    )
  }
  return createWebHistory(base)
}
