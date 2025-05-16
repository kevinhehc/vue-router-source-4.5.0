import {
  RouteRecordRaw,
  Lazy,
  isRouteLocation,
  isRouteName,
  RouteLocationOptions,
  MatcherLocationRaw,
} from './types'
import type {
  RouteLocation,
  RouteLocationRaw,
  RouteParams,
  RouteLocationNormalized,
  RouteLocationNormalizedLoaded,
  NavigationGuardWithThis,
  NavigationHookAfter,
  RouteLocationResolved,
  RouteLocationAsRelative,
  RouteLocationAsPath,
  RouteLocationAsString,
  RouteRecordNameGeneric,
} from './typed-routes'
import { RouterHistory, HistoryState, NavigationType } from './history/common'
import {
  ScrollPosition,
  getSavedScrollPosition,
  getScrollKey,
  saveScrollPosition,
  computeScrollPosition,
  scrollToPosition,
  _ScrollPositionNormalized,
} from './scrollBehavior'
import { createRouterMatcher, PathParserOptions } from './matcher'
import {
  createRouterError,
  ErrorTypes,
  NavigationFailure,
  NavigationRedirectError,
  isNavigationFailure,
} from './errors'
import { applyToParams, isBrowser, assign, noop, isArray } from './utils'
import { useCallbacks } from './utils/callbacks'
import { encodeParam, decode, encodeHash } from './encoding'
import {
  normalizeQuery,
  parseQuery as originalParseQuery,
  stringifyQuery as originalStringifyQuery,
  LocationQuery,
} from './query'
import { shallowRef, Ref, nextTick, App, unref, shallowReactive } from 'vue'
import { RouteRecord, RouteRecordNormalized } from './matcher/types'
import {
  parseURL,
  stringifyURL,
  isSameRouteLocation,
  isSameRouteRecord,
  START_LOCATION_NORMALIZED,
} from './location'
import { extractComponentsGuards, guardToPromiseFn } from './navigationGuards'
import { warn } from './warning'
import { RouterLink } from './RouterLink'
import { RouterView } from './RouterView'
import {
  routeLocationKey,
  routerKey,
  routerViewLocationKey,
} from './injectionSymbols'
import { addDevtools } from './devtools'
import { _LiteralUnion } from './types/utils'
import { RouteLocationAsRelativeTyped } from './typed-routes/route-location'
import { RouteMap } from './typed-routes/route-map'

// Router 是 Vue Router 的核心实例，管理：
// 当前路由状态（currentRoute）
// 页面跳转（push, replace, back, go）
// 路由记录（addRoute, removeRoute, getRoutes）
// 路由解析（resolve）
// 导航守卫（beforeEach, beforeResolve, afterEach, onError）
// 初始导航与 SSR 支持（isReady, install）
/**
 * Internal type to define an ErrorHandler
 *
 * @param error - error thrown
 * @param to - location we were navigating to when the error happened
 * @param from - location we were navigating from when the error happened
 * @internal
 */
export interface _ErrorListener {
  (
    error: any,
    to: RouteLocationNormalized,
    from: RouteLocationNormalizedLoaded
  ): any
}
// resolve, reject arguments of Promise constructor
type OnReadyCallback = [() => void, (reason?: any) => void]

type Awaitable<T> = T | Promise<T>

/**
 * Type of the `scrollBehavior` option that can be passed to `createRouter`.
 */
export interface RouterScrollBehavior {
  /**
   * @param to - Route location where we are navigating to
   * @param from - Route location where we are navigating from
   * @param savedPosition - saved position if it exists, `null` otherwise
   */
  (
    to: RouteLocationNormalized,
    from: RouteLocationNormalizedLoaded,
    savedPosition: _ScrollPositionNormalized | null
  ): Awaitable<ScrollPosition | false | void>
}

/**
 * Options to initialize a {@link Router} instance.
 */
export interface RouterOptions extends PathParserOptions {
  /**
   * History implementation used by the router. Most web applications should use
   * `createWebHistory` but it requires the server to be properly configured.
   * You can also use a _hash_ based history with `createWebHashHistory` that
   * does not require any configuration on the server but isn't handled at all
   * by search engines and does poorly on SEO.
   *
   * @example
   * ```js
   * createRouter({
   *   history: createWebHistory(),
   *   // other options...
   * })
   * ```
   */
  history: RouterHistory
  /**
   * Initial list of routes that should be added to the router.
   */
  routes: Readonly<RouteRecordRaw[]>
  /**
   * Function to control scrolling when navigating between pages. Can return a
   * Promise to delay scrolling. Check {@link ScrollBehavior}.
   *
   * @example
   * ```js
   * function scrollBehavior(to, from, savedPosition) {
   *   // `to` and `from` are both route locations
   *   // `savedPosition` can be null if there isn't one
   * }
   * ```
   */
  scrollBehavior?: RouterScrollBehavior
  /**
   * Custom implementation to parse a query. See its counterpart,
   * {@link RouterOptions.stringifyQuery}.
   *
   * @example
   * Let's say you want to use the [qs package](https://github.com/ljharb/qs)
   * to parse queries, you can provide both `parseQuery` and `stringifyQuery`:
   * ```js
   * import qs from 'qs'
   *
   * createRouter({
   *   // other options...
   *   parseQuery: qs.parse,
   *   stringifyQuery: qs.stringify,
   * })
   * ```
   */
  parseQuery?: typeof originalParseQuery
  /**
   * Custom implementation to stringify a query object. Should not prepend a leading `?`.
   * {@link RouterOptions.parseQuery | parseQuery} counterpart to handle query parsing.
   */
  stringifyQuery?: typeof originalStringifyQuery
  /**
   * Default class applied to active {@link RouterLink}. If none is provided,
   * `router-link-active` will be applied.
   */
  linkActiveClass?: string
  /**
   * Default class applied to exact active {@link RouterLink}. If none is provided,
   * `router-link-exact-active` will be applied.
   */
  linkExactActiveClass?: string
  /**
   * Default class applied to non-active {@link RouterLink}. If none is provided,
   * `router-link-inactive` will be applied.
   */
  // linkInactiveClass?: string
}

/**
 * Router instance.
 */
export interface Router {
  /**
   * @internal
   */
  // readonly history: RouterHistory
  /**
   * Current {@link RouteLocationNormalized}
   */
  // 1. 当前路由状态
  // 响应式 Ref
  // 等价于 useRoute() 的返回值
  // 包含 path, name, params, query, matched 等
  readonly currentRoute: Ref<RouteLocationNormalizedLoaded>
  /**
   * Original options object passed to create the Router
   */
  readonly options: RouterOptions

  /**
   * Allows turning off the listening of history events. This is a low level api for micro-frontend.
   */
  listening: boolean

  /**
   * Add a new {@link RouteRecordRaw | route record} as the child of an existing route.
   *
   * @param parentName - Parent Route Record where `route` should be appended at
   * @param route - Route Record to add
   */
  // 向已有路由下添加子路由
  addRoute(
    // NOTE: it could be `keyof RouteMap` but the point of dynamic routes is not knowing the routes at build
    parentName: NonNullable<RouteRecordNameGeneric>,
    route: RouteRecordRaw
  ): () => void
  /**
   * Add a new {@link RouteRecordRaw | route record} to the router.
   *
   * @param route - Route Record to add
   */
  // 动态添加一个路由
  addRoute(route: RouteRecordRaw): () => void
  /**
   * Remove an existing route by its name.
   *
   * @param name - Name of the route to remove
   */
  // 根据路由名移除
  removeRoute(name: NonNullable<RouteRecordNameGeneric>): void
  /**
   * Checks if a route with a given name exists
   *
   * @param name - Name of the route to check
   */
  // 是否存在某个命名路由
  hasRoute(name: NonNullable<RouteRecordNameGeneric>): boolean
  /**
   * Get a full list of all the {@link RouteRecord | route records}.
   */
  // 获取全部路由记录
  getRoutes(): RouteRecord[]

  /**
   * Delete all routes from the router matcher.
   */
  // 清空所有路由记录（内部用）
  clearRoutes(): void

  /**
   * Returns the {@link RouteLocation | normalized version} of a
   * {@link RouteLocationRaw | route location}. Also includes an `href` property
   * that includes any existing `base`. By default, the `currentLocation` used is
   * `router.currentRoute` and should only be overridden in advanced use cases.
   *
   * @param to - Raw route location to resolve
   * @param currentLocation - Optional current location to resolve against
   */
  // 返回一个 标准化路由对象，包含：
  // .href：最终跳转链接
  // .matched：匹配的路由记录
  // .params, .query 等
  // 常用于 <router-link> 或自定义跳转逻辑
  resolve<Name extends keyof RouteMap = keyof RouteMap>(
    to: RouteLocationAsRelativeTyped<RouteMap, Name>,
    // NOTE: This version doesn't work probably because it infers the type too early
    // | RouteLocationAsRelative<Name>
    currentLocation?: RouteLocationNormalizedLoaded
  ): RouteLocationResolved<Name>
  resolve(
    // not having the overload produces errors in RouterLink calls to router.resolve()
    to: RouteLocationAsString | RouteLocationAsRelative | RouteLocationAsPath,
    currentLocation?: RouteLocationNormalizedLoaded
  ): RouteLocationResolved

  /**
   * Programmatically navigate to a new URL by pushing an entry in the history
   * stack.
   *
   * @param to - Route location to navigate to
   */
  // 像 <router-link> 一样跳转，添加历史记录
  push(to: RouteLocationRaw): Promise<NavigationFailure | void | undefined>

  /**
   * Programmatically navigate to a new URL by replacing the current entry in
   * the history stack.
   *
   * @param to - Route location to navigate to
   */
  // 跳转但替换当前记录，不添加历史记录
  replace(to: RouteLocationRaw): Promise<NavigationFailure | void | undefined>

  /**
   * Go back in history if possible by calling `history.back()`. Equivalent to
   * `router.go(-1)`.
   */
  // 回退一页（go(-1))
  back(): ReturnType<Router['go']>
  /**
   * Go forward in history if possible by calling `history.forward()`.
   * Equivalent to `router.go(1)`.
   */
  // 前进一页（go(1))
  forward(): ReturnType<Router['go']>
  /**
   * Allows you to move forward or backward through the history. Calls
   * `history.go()`.
   *
   * @param delta - The position in the history to which you want to move,
   * relative to the current page
   */
  // 类似浏览器的 history.go(n)
  go(delta: number): void

  /**
   * Add a navigation guard that executes before any navigation. Returns a
   * function that removes the registered guard.
   *
   * @param guard - navigation guard to add
   */
  // 所有导航前
  beforeEach(guard: NavigationGuardWithThis<undefined>): () => void
  /**
   * Add a navigation guard that executes before navigation is about to be
   * resolved. At this state all component have been fetched and other
   * navigation guards have been successful. Returns a function that removes the
   * registered guard.
   *
   * @param guard - navigation guard to add
   * @returns a function that removes the registered guard
   *
   * @example
   * ```js
   * router.beforeResolve(to => {
   *   if (to.meta.requiresAuth && !isAuthenticated) return false
   * })
   * ```
   *
   */
  // 所有导航确认前（所有组件解析完）
  beforeResolve(guard: NavigationGuardWithThis<undefined>): () => void

  /**
   * Add a navigation hook that is executed after every navigation. Returns a
   * function that removes the registered hook.
   *
   * @param guard - navigation hook to add
   * @returns a function that removes the registered hook
   *
   * @example
   * ```js
   * router.afterEach((to, from, failure) => {
   *   if (isNavigationFailure(failure)) {
   *     console.log('failed navigation', failure)
   *   }
   * })
   * ```
   */
  // 所有导航后（无论成功失败）
  afterEach(guard: NavigationHookAfter): () => void

  /**
   * Adds an error handler that is called every time a non caught error happens
   * during navigation. This includes errors thrown synchronously and
   * asynchronously, errors returned or passed to `next` in any navigation
   * guard, and errors occurred when trying to resolve an async component that
   * is required to render a route.
   *
   * @param handler - error handler to register
   */
  // 捕捉导航中出现的任何错误（同步/异步）
  onError(handler: _ErrorListener): () => void
  /**
   * Returns a Promise that resolves when the router has completed the initial
   * navigation, which means it has resolved all async enter hooks and async
   * components that are associated with the initial route. If the initial
   * navigation already happened, the promise resolves immediately.
   *
   * This is useful in server-side rendering to ensure consistent output on both
   * the server and the client. Note that on server side, you need to manually
   * push the initial location while on client side, the router automatically
   * picks it up from the URL.
   */
  // 6. 初始导航与 SSR 支持
  // 返回 Promise<void>
  // 在初次导航完成后 resolve（组件加载、守卫触发都完成）
  // 常用于 SSR 或手动挂载前等待路由准备好
  isReady(): Promise<void>

  /**
   * Called automatically by `app.use(router)`. Should not be called manually by
   * the user. This will trigger the initial navigation when on client side.
   *
   * @internal
   * @param app - Application that uses the router
   */
  // 7. 安装到应用（由 app.use(router) 触发）
  // 通常不手动调用
  // 内部执行路由初始化 & 注册全局组件
  install(app: App): void
}

/**
 * Creates a Router instance that can be used by a Vue app.
 *
 * @param options - {@link RouterOptions}
 */
// 是构建整个路由系统的入口，返回一个完整的 router 实例，用于：
// 管理导航行为（push、replace、back 等）
// 响应当前路径变化
// 控制 <router-view> 渲染
// 提供路由守卫、动态添加路由等功能
export function createRouter(options: RouterOptions): Router {
  // ### 1. 路由匹配器初始化
  // 生成内部的“路由树匹配器”，用于通过 location 查找匹配的 RouteRecord
  // 它构建了“路由记录表” + “路径正则映射”
  // 这个 matcher 提供 addRoute、getRecordMatcher 等功能
  const matcher = createRouterMatcher(options.routes, options)
  // ### 2. 查询字符串解析器
  // 支持自定义解析 query 的方案（如用 qs）
  // 默认用 Vue 内置的 originalParseQuery（基于 URLSearchParams）
  const parseQuery = options.parseQuery || originalParseQuery
  const stringifyQuery = options.stringifyQuery || originalStringifyQuery
  // ### 3. 历史模式
  // 必须提供（例如 createWebHistory()）
  // 决定 URL 的表现形式，如：
  // history 模式：/about
  // hash 模式：/#/about
  const routerHistory = options.history
  if (__DEV__ && !routerHistory)
    throw new Error(
      'Provide the "history" option when calling "createRouter()":' +
        ' https://router.vuejs.org/api/interfaces/RouterOptions.html#history'
    )

  // ### 4. 导航守卫容器
  // 提供注册导航守卫的方法：
  // router.beforeEach()
  // router.beforeResolve()
  // router.afterEach()
  // 这些通过 useCallbacks() 内部维护一组回调列表（Set）
  const beforeGuards = useCallbacks<NavigationGuardWithThis<undefined>>()
  const beforeResolveGuards = useCallbacks<NavigationGuardWithThis<undefined>>()
  const afterGuards = useCallbacks<NavigationHookAfter>()
  // ### 5. 当前路由状态
  // 全局唯一的当前路由状态（响应式）
  // 被注入为 routeLocationKey
  // 用于 useRoute()、组件 <router-view> 绑定等
  const currentRoute = shallowRef<RouteLocationNormalizedLoaded>(
    START_LOCATION_NORMALIZED
  )
  // ### 6. 待跳转的目标位置
  // 标记当前正在执行跳转的目标地址
  // 在导航确认过程（包括守卫）中更新，用于避免 race condition
  let pendingLocation: RouteLocation = START_LOCATION_NORMALIZED

  // leave the scrollRestoration if no scrollBehavior is provided
  // ### 7. 滚动行为控制（可选）
  // 如果使用了 scrollBehavior（控制页面滚动位置）
  // 将浏览器默认滚动恢复改为 manual，以避免冲突
  if (isBrowser && options.scrollBehavior && 'scrollRestoration' in history) {
    // "auto"（默认值） 浏览器自动恢复滚动位置，比如按返回键回到上一个页面时，会自动滚动到用户离开页面时的位置。
    // "manual" 禁用浏览器的自动滚动恢复，你可以手动控制页面滚动位置（比如在路由切换后滚动到顶部、锚点等）。
    history.scrollRestoration = 'manual'
  }

  // ### 8. 参数的编码/解码工具
  // 用于统一处理路由参数的：
  // 工具	功能
  // normalizeParams	全部转为字符串（确保稳定性）
  // encodeParams	传入前进行 URI 编码
  // decodeParams	接收后进行 URI 解码
  // 这些在构建 Location 或匹配 params 时被频繁调用。
  const normalizeParams = applyToParams.bind(
    null,
    paramValue => '' + paramValue
  )
  const encodeParams = applyToParams.bind(null, encodeParam)
  const decodeParams: (params: RouteParams | undefined) => RouteParams =
    // @ts-expect-error: intentionally avoid the type check
    applyToParams.bind(null, decode)

  // ### 9. 动态添加路由的实现
  // 支持两种方式：
  // router.addRoute(route) → 顶级路由
  // router.addRoute('parentName', route) → 添加为子路由
  // 内部通过 matcher.addRoute(...) 添加新的 RouteRecordMatcher
  function addRoute(
    parentOrRoute: NonNullable<RouteRecordNameGeneric> | RouteRecordRaw,
    route?: RouteRecordRaw
  ) {
    let parent: Parameters<(typeof matcher)['addRoute']>[1] | undefined
    let record: RouteRecordRaw
    if (isRouteName(parentOrRoute)) {
      parent = matcher.getRecordMatcher(parentOrRoute)
      if (__DEV__ && !parent) {
        warn(
          `Parent route "${String(
            parentOrRoute
          )}" not found when adding child route`,
          route
        )
      }
      record = route!
    } else {
      record = parentOrRoute
    }

    return matcher.addRoute(record, parent)
  }

  // 1、功能：
  // 根据路由名称移除某个路由记录
  // 支持移除由 addRoute() 动态添加的路由（静态 routes 无法移除）
  // 2、内部逻辑：
  // 调用 matcher.getRecordMatcher(name) 拿到内部记录
  // 如果存在就移除；否则开发模式下给出警告
  function removeRoute(name: NonNullable<RouteRecordNameGeneric>) {
    const recordMatcher = matcher.getRecordMatcher(name)
    if (recordMatcher) {
      matcher.removeRoute(recordMatcher)
    } else if (__DEV__) {
      warn(`Cannot remove non-existent route "${String(name)}"`)
    }
  }

  // 1、功能：
  // 返回所有当前注册的路由记录（包含静态和动态）
  // 格式为标准 RouteRecordRaw
  //
  // 2、用途：
  // 调试、动态路由生成
  // 面包屑导航构建
  // 权限系统过滤等
  function getRoutes() {
    return matcher.getRoutes().map(routeMatcher => routeMatcher.record)
  }

  // 功能：
  // 判断某个名称的路由是否存在
  // 用途：
  // 在添加前避免重复
  // 运行时条件判断
  function hasRoute(name: NonNullable<RouteRecordNameGeneric>): boolean {
    return !!matcher.getRecordMatcher(name)
  }

  // 将一个用户传入的“原始路由位置”（RouteLocationRaw）解析为一个标准的、结构化的路由对象（RouteLocationResolved）：
  // 这个结构包含了 path、params、query、hash、matched[]、href 等所有字段。
  function resolve(
    rawLocation: RouteLocationRaw,
    currentLocation?: RouteLocationNormalizedLoaded
  ): RouteLocationResolved {
    // const resolve: Router['resolve'] = (rawLocation: RouteLocationRaw, currentLocation) => {
    // const objectLocation = routerLocationAsObject(rawLocation)
    // we create a copy to modify it later
    // 规范化 currentLocation（默认使用当前路由）
    // 这个 currentLocation 是解析时的“参考点”，用于相对路径处理、参数合并等。
    currentLocation = assign({}, currentLocation || currentRoute.value)

    // 处理字符串类型的 rawLocation（如 '/about?foo=1'）
    // parseURL()：解析字符串为对象形式（path、query、hash）
    // matcher.resolve(...)：进行路由匹配（返回 matched[], params, path）
    // 组合信息，返回 RouteLocationResolved
    if (typeof rawLocation === 'string') {
      const locationNormalized = parseURL(
        parseQuery,
        rawLocation,
        currentLocation.path
      )
      const matchedRoute = matcher.resolve(
        { path: locationNormalized.path },
        currentLocation
      )

      const href = routerHistory.createHref(locationNormalized.fullPath)
      if (__DEV__) {
        if (href.startsWith('//'))
          warn(
            `Location "${rawLocation}" resolved to "${href}". A resolved location cannot start with multiple slashes.`
          )
        else if (!matchedRoute.matched.length) {
          warn(`No match found for location with path "${rawLocation}"`)
        }
      }

      // locationNormalized is always a new object
      return assign(locationNormalized, matchedRoute, {
        params: decodeParams(matchedRoute.params),
        hash: decode(locationNormalized.hash),
        redirectedFrom: undefined,
        href,
      })
    }

    if (__DEV__ && !isRouteLocation(rawLocation)) {
      warn(
        `router.resolve() was passed an invalid location. This will fail in production.\n- Location:`,
        rawLocation
      )
      return resolve({})
    }

    let matcherLocation: MatcherLocationRaw

    // path could be relative in object as well
    if (rawLocation.path != null) {
      if (
        __DEV__ &&
        'params' in rawLocation &&
        !('name' in rawLocation) &&
        // @ts-expect-error: the type is never
        Object.keys(rawLocation.params).length
      ) {
        warn(
          `Path "${rawLocation.path}" was passed with params but they will be ignored. Use a named route alongside params instead.`
        )
      }
      // 处理对象类型的 rawLocation（如 { name: 'user', params: { id: 1 } }）
      // 有 path 的情况：
      // 如果提供了 params 但没配合 name，会报警告，因为这时 params 会被忽略。
      matcherLocation = assign({}, rawLocation, {
        path: parseURL(parseQuery, rawLocation.path, currentLocation.path).path,
      })
    } else {
      // remove any nullish param
      const targetParams = assign({}, rawLocation.params)
      for (const key in targetParams) {
        if (targetParams[key] == null) {
          delete targetParams[key]
        }
      }
      // pass encoded values to the matcher, so it can produce encoded path and fullPath
      // 有 name + params 的情况：
      // params 会被 encode（如空格等）
      matcherLocation = assign({}, rawLocation, {
        params: encodeParams(targetParams),
      })
      // current location params are decoded, we need to encode them in case the
      // matcher merges the params
      currentLocation.params = encodeParams(currentLocation.params)
    }

    // 路由匹配
    // 返回结构如 { matched: [...], path, params }
    // 内部使用的正是基于 path-to-regexp 的匹配规则
    const matchedRoute = matcher.resolve(matcherLocation, currentLocation)
    const hash = rawLocation.hash || ''

    if (__DEV__ && hash && !hash.startsWith('#')) {
      warn(
        `A \`hash\` should always start with the character "#". Replace "${hash}" with "#${hash}".`
      )
    }

    // the matcher might have merged current location params, so
    // we need to run the decoding again
    matchedRoute.params = normalizeParams(decodeParams(matchedRoute.params))

    // 最终拼接结果
    // ullPath = path + ?query + #hash
    // href = 加上 base 的最终 URL（如 /base/path?foo=1）
    const fullPath = stringifyURL(
      stringifyQuery,
      assign({}, rawLocation, {
        hash: encodeHash(hash),
        path: matchedRoute.path,
      })
    )

    const href = routerHistory.createHref(fullPath)
    if (__DEV__) {
      if (href.startsWith('//')) {
        warn(
          `Location "${rawLocation}" resolved to "${href}". A resolved location cannot start with multiple slashes.`
        )
      } else if (!matchedRoute.matched.length) {
        warn(
          `No match found for location with path "${
            rawLocation.path != null ? rawLocation.path : rawLocation
          }"`
        )
      }
    }

    // 最终返回值结构（RouteLocationResolved）
    // {
    //   fullPath: '/user/1?foo=bar#section2',
    //   hash: '#section2',
    //   path: '/user/1',
    //   query: { foo: 'bar' },
    //   params: { id: '1' },
    //   matched: [...RouteRecords],
    //   href: '/app/user/1?foo=bar#section2',
    //   redirectedFrom: undefined
    // }

    // 意图
    // 构造出最终的 RouteLocationResolved 对象，包含：
    // 完整路径 fullPath
    // hash（保持编码）
    // query
    // matched 匹配项（来自 matcher.resolve()）
    // href：用于生成 <a :href> 的值
    // redirectedFrom：是否由某个地址重定向而来
    return assign(
      {
        fullPath,
        // keep the hash encoded so fullPath is effectively path + encodedQuery +
        // hash
        hash,
        query:
          // if the user is using a custom query lib like qs, we might have
          // nested objects, so we keep the query as is, meaning it can contain
          // numbers at `$route.query`, but at the point, the user will have to
          // use their own type anyway.
          // https://github.com/vuejs/router/issues/328#issuecomment-649481567
          stringifyQuery === originalStringifyQuery
            ? normalizeQuery(rawLocation.query)
            : ((rawLocation.query || {}) as LocationQuery),
      },
      matchedRoute,
      {
        redirectedFrom: undefined,
        href,
      }
    )
  }

  // 把路由字符串（如 /foo?a=1）转换为对象形式的 RouteLocation，便于后续处理。
  function locationAsObject(
    to: RouteLocationRaw | RouteLocationNormalized
  ): Exclude<RouteLocationRaw, string> | RouteLocationNormalized {
    return typeof to === 'string'
      ? parseURL(parseQuery, to, currentRoute.value.path)
      : assign({}, to)
  }

  // 用于判断“当前导航是否已被取消”。
  // 多次导航同时触发时，pendingLocation 保存最新的目标。
  // 如果在导航守卫执行期间，目标 to 被更新了（用户跳到了别的路由），旧的 to 不再是当前目标，此时导航被视为 取消。
  function checkCanceledNavigation(
    to: RouteLocationNormalized,
    from: RouteLocationNormalized
  ): NavigationFailure | void {
    if (pendingLocation !== to) {
      return createRouterError<NavigationFailure>(
        ErrorTypes.NAVIGATION_CANCELLED,
        {
          from,
          to,
        }
      )
    }
  }

  function push(to: RouteLocationRaw) {
    return pushWithRedirect(to)
  }

  // 相当于 push(..., { replace: true })，即使用 history.replaceState() 替代 push。
  function replace(to: RouteLocationRaw) {
    return push(assign(locationAsObject(to), { replace: true }))
  }

  // 功能
  // 处理路由配置中 redirect 选项，比如：
  // {
  //   path: '/old',
  //   redirect: '/new'
  // }
  // 支持三种写法：
  // 类型	示例
  // string	redirect: '/home'
  // object	redirect: { name: 'home' }
  // function	redirect: to => ({ name: 'home', query: { from: to.fullPath } })
  // 特别说明
  // 如果是字符串类型，且带有 ? 或 #，会走 parseURL。
  // 自动带上旧页面的 query、hash 和（如果目标不带 path）旧的 params。
  function handleRedirectRecord(to: RouteLocation): RouteLocationRaw | void {
    const lastMatched = to.matched[to.matched.length - 1]
    if (lastMatched && lastMatched.redirect) {
      const { redirect } = lastMatched
      let newTargetLocation =
        typeof redirect === 'function' ? redirect(to) : redirect

      if (typeof newTargetLocation === 'string') {
        newTargetLocation =
          newTargetLocation.includes('?') || newTargetLocation.includes('#')
            ? (newTargetLocation = locationAsObject(newTargetLocation))
            : // force empty params
              { path: newTargetLocation }
        // @ts-expect-error: force empty params when a string is passed to let
        // the router parse them again
        newTargetLocation.params = {}
      }

      if (
        __DEV__ &&
        newTargetLocation.path == null &&
        !('name' in newTargetLocation)
      ) {
        warn(
          `Invalid redirect found:\n${JSON.stringify(
            newTargetLocation,
            null,
            2
          )}\n when navigating to "${
            to.fullPath
          }". A redirect must contain a name or path. This will break in production.`
        )
        throw new Error('Invalid redirect')
      }

      return assign(
        {
          query: to.query,
          hash: to.hash,
          // avoid transferring params if the redirect has a path
          params: newTargetLocation.path != null ? {} : to.params,
        },
        newTargetLocation
      )
    }
  }

  //  Vue Router 中用于处理导航跳转和重定向逻辑的核心方法之一。
  //  它不仅能执行路由跳转，还能处理重定向链、避免死循环、识别重复跳转、
  //  并在合适的时机调用导航完成逻辑（如 finalizeNavigation、triggerAfterEach）和错误处理。
  function pushWithRedirect(
    // 参数	含义
    // to	要跳转的目标路由（原始地址或解析后的对象）
    // redirectedFrom	如果是重定向，这里记录最初的目标地址
    to: RouteLocationRaw | RouteLocation,
    redirectedFrom?: RouteLocation
  ): Promise<NavigationFailure | void | undefined> {
    // 1. 解析目标地址
    // 把 to 解析成完整的目标地址对象。
    const targetLocation: RouteLocation = (pendingLocation = resolve(to))
    const from = currentRoute.value
    const data: HistoryState | undefined = (to as RouteLocationOptions).state
    const force: boolean | undefined = (to as RouteLocationOptions).force
    // to could be a string where `replace` is a function
    const replace = (to as RouteLocationOptions).replace === true

    // 2. 判断是否需要重定向
    // 如果路由记录中定义了 redirect，则递归处理新的跳转地址。
    const shouldRedirect = handleRedirectRecord(targetLocation)

    if (shouldRedirect)
      return pushWithRedirect(
        assign(locationAsObject(shouldRedirect), {
          state:
            typeof shouldRedirect === 'object'
              ? assign({}, data, shouldRedirect.state)
              : data,
          force,
          replace,
        }),
        // keep original redirectedFrom if it exists
        redirectedFrom || targetLocation
      )

    // if it was a redirect we already called `pushWithRedirect` above
    const toLocation = targetLocation as RouteLocationNormalized

    toLocation.redirectedFrom = redirectedFrom
    let failure: NavigationFailure | void | undefined

    // 3. 检查是否为重复导航
    // 避免多次导航到同一路由（除非 force: true），并执行一次 scrollBehavior。
    if (!force && isSameRouteLocation(stringifyQuery, from, targetLocation)) {
      failure = createRouterError<NavigationFailure>(
        ErrorTypes.NAVIGATION_DUPLICATED,
        { to: toLocation, from }
      )
      // trigger scroll to allow scrolling to the same anchor
      handleScroll(
        from,
        from,
        // this is a push, the only way for it to be triggered from a
        // history.listen is with a redirect, which makes it become a push
        true,
        // This cannot be the first navigation because the initial location
        // cannot be manually navigated to
        false
      )
    }

    // 4. 执行导航流程（除非为重复）
    // 走正常导航流程：提取钩子、运行守卫、检查取消/重定向等。
    return (failure ? Promise.resolve(failure) : navigate(toLocation, from))
      // 5. 捕获错误
      // 重定向错误交由后续处理
      // 其他错误交由全局 error handler
      .catch((error: NavigationFailure | NavigationRedirectError) =>
        isNavigationFailure(error)
          ? // navigation redirects still mark the router as ready
            isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT)
            ? error
            : markAsReady(error) // also returns the error
          : // reject any unknown error
            triggerError(error, toLocation, from)
      )
      .then((failure: NavigationFailure | NavigationRedirectError | void) => {
        // 6. 处理导航结果
        // 若导航成功（无 failure）：
        // 执行 finalizeNavigation 更新历史和 currentRoute
        // 调用 triggerAfterEach
        // 若为重定向：
        // 检查是否为死循环（30 次限制）
        // 递归调用 pushWithRedirect
        if (failure) {
          if (
            isNavigationFailure(failure, ErrorTypes.NAVIGATION_GUARD_REDIRECT)
          ) {
            if (
              __DEV__ &&
              // we are redirecting to the same location we were already at
              isSameRouteLocation(
                stringifyQuery,
                resolve(failure.to),
                toLocation
              ) &&
              // and we have done it a couple of times
              // 死循环保护：
              redirectedFrom &&
              // @ts-expect-error: added only in dev
              (redirectedFrom._count = redirectedFrom._count
                ? // @ts-expect-error
                  redirectedFrom._count + 1
                : 1) > 30
            ) {
              warn(
                `Detected a possibly infinite redirection in a navigation guard when going from "${from.fullPath}" to "${toLocation.fullPath}". Aborting to avoid a Stack Overflow.\n Are you always returning a new location within a navigation guard? That would lead to this error. Only return when redirecting or aborting, that should fix this. This might break in production if not fixed.`
              )
              return Promise.reject(
                new Error('Infinite redirect in navigation guard')
              )
            }

            return pushWithRedirect(
              // keep options
              assign(
                {
                  // preserve an existing replacement but allow the redirect to override it
                  replace,
                },
                locationAsObject(failure.to),
                {
                  state:
                    typeof failure.to === 'object'
                      ? assign({}, data, failure.to.state)
                      : data,
                  force,
                }
              ),
              // preserve the original redirectedFrom if any
              redirectedFrom || toLocation
            )
          }
        } else {
          // if we fail we don't finalize the navigation
          failure = finalizeNavigation(
            toLocation as RouteLocationNormalizedLoaded,
            from,
            true,
            replace,
            data
          )
        }
        triggerAfterEach(
          toLocation as RouteLocationNormalizedLoaded,
          from,
          failure
        )
        return failure
      })
  }

  /**
   * Helper to reject and skip all navigation guards if a new navigation happened
   * @param to
   * @param from
   */
  // 这是一个防止竞态导航（race condition navigation）的问题辅助函数。
  // 背景场景
  // 在导航过程中，如果用户快速点击多次不同的链接，新的导航可能会取消旧的导航。在这种情况下：
  // Vue Router 会创建一个新的导航任务。
  // 旧任务如果还在执行（如组件异步加载、导航守卫尚未完成），它必须被中断。
  // checkCanceledNavigation 就是用来检查这种 “当前的导航是否已经过时” 的。
  // 用法
  // 它会在每一阶段的 guardQueue 后插入：
  // guards.push(checkCanceledNavigationAndReject.bind(null, to, from))
  // 确保在执行完一批导航守卫后，如果导航已经被取消，就中断整个导航流程。
  function checkCanceledNavigationAndReject(
    to: RouteLocationNormalized,
    from: RouteLocationNormalized
  ): Promise<void> {
    const error = checkCanceledNavigation(to, from)
    return error ? Promise.reject(error) : Promise.resolve()
  }

  // 用于在 Vue 3.3+ 的 runWithContext() API 上下文中运行一个函数。//
  // runWithContext 是什么？
  // app.runWithContext(fn) 是 Vue 3.3 新增的 API，用于在组件外部模拟响应式组件上下文，让诸如 inject() 等 API 正常工作。
  // 为什么要这么做？
  // Vue Router 中的导航守卫可能在组件外部运行，比如：
  // router.beforeEach((to, from) => {
  //   const user = inject('user') // ⚠组件外部本来无法 inject
  // })
  // 使用 runWithContext(fn) 可以让这种代码在守卫中也工作。
  // 对于 Vue 3.2 及以下版本，没有 runWithContext，就直接执行 fn()。
  function runWithContext<T>(fn: () => T): T {
    const app: App | undefined = installedApps.values().next().value
    // support Vue < 3.3
    return app && typeof app.runWithContext === 'function'
      ? app.runWithContext(fn)
      : fn()
  }

  // TODO: refactor the whole before guards by internally using router.beforeEach
  // 内部实现中处理导航守卫（导航钩子）的核心流程。
  // 它精确控制了路由切换时各种守卫（beforeRouteLeave、beforeRouteUpdate、beforeEnter、全局 beforeEach 等）的执行顺序和时机。
  function navigate(
    // to: 目标路由对象
    // from: 当前（即将离开）路由对象
    to: RouteLocationNormalized,
    from: RouteLocationNormalizedLoaded
  ): Promise<any> {
    // 核心流程概览（6 步执行顺序）
    // 每一步都会：
    // 提取守卫
    // 包装为 Promise
    // 添加取消检测
    // 执行 runGuardQueue

    let guards: Lazy<any>[]

    const [leavingRecords, updatingRecords, enteringRecords] =
      extractChangingRecords(to, from)

    // all components here have been resolved once because we are leaving
    // 1. beforeRouteLeave（组件内离开守卫）
    // 来自 leavingRecords 的组件：
    guards = extractComponentsGuards(
      leavingRecords.reverse(),
      'beforeRouteLeave',
      to,
      from
    )

    // leavingRecords is already reversed
    // 2. 全局 beforeEach
    // 从 beforeGuards 列表中提取：
    for (const record of leavingRecords) {
      record.leaveGuards.forEach(guard => {
        guards.push(guardToPromiseFn(guard, to, from))
      })
    }

    const canceledNavigationCheck = checkCanceledNavigationAndReject.bind(
      null,
      to,
      from
    )

    guards.push(canceledNavigationCheck)

    // run the queue of per route beforeRouteLeave guards
    return (
      runGuardQueue(guards)
        .then(() => {
          // check global guards beforeEach
          guards = []
          for (const guard of beforeGuards.list()) {
            guards.push(guardToPromiseFn(guard, to, from))
          }
          guards.push(canceledNavigationCheck)

          return runGuardQueue(guards)
        })
        .then(() => {
          // check in components beforeRouteUpdate
          // 3. beforeRouteUpdate（更新复用组件）
          // 只作用于未卸载但需更新的复用组件：
          guards = extractComponentsGuards(
            updatingRecords,
            'beforeRouteUpdate',
            to,
            from
          )

          for (const record of updatingRecords) {
            record.updateGuards.forEach(guard => {
              guards.push(guardToPromiseFn(guard, to, from))
            })
          }
          guards.push(canceledNavigationCheck)

          // run the queue of per route beforeEnter guards
          return runGuardQueue(guards)
        })
        .then(() => {
          // check the route beforeEnter
          guards = []
          // 4. beforeEnter（路由记录内定义）
          // 来自 enteringRecords（新进入的组件）：
          for (const record of enteringRecords) {
            // do not trigger beforeEnter on reused views
            if (record.beforeEnter) {
              if (isArray(record.beforeEnter)) {
                for (const beforeEnter of record.beforeEnter)
                  guards.push(guardToPromiseFn(beforeEnter, to, from))
              } else {
                guards.push(guardToPromiseFn(record.beforeEnter, to, from))
              }
            }
          }
          guards.push(canceledNavigationCheck)

          // run the queue of per route beforeEnter guards
          return runGuardQueue(guards)
        })
        .then(() => {
          // NOTE: at this point to.matched is normalized and does not contain any () => Promise<Component>

          // clear existing enterCallbacks, these are added by extractComponentsGuards
          to.matched.forEach(record => (record.enterCallbacks = {}))

          // check in-component beforeRouteEnter
          // 5. beforeRouteEnter（组件内进入守卫）
          // 注意这是异步组件特有逻辑（如 setup() 尚未执行）：
          guards = extractComponentsGuards(
            enteringRecords,
            'beforeRouteEnter',
            to,
            from,
            runWithContext
          )
          guards.push(canceledNavigationCheck)

          // run the queue of per route beforeEnter guards
          return runGuardQueue(guards)
        })
        .then(() => {
          // check global guards beforeResolve
          guards = []
          // 6. 全局 beforeResolve
          // 在所有组件加载完成后执行：
          for (const guard of beforeResolveGuards.list()) {
            guards.push(guardToPromiseFn(guard, to, from))
          }
          // 每步后都插入取消检测
          guards.push(canceledNavigationCheck)

          return runGuardQueue(guards)
        })
        // catch any navigation canceled
        .catch(err =>
          // 错误处理
          // 只有 NAVIGATION_CANCELLED 类型会被静默捕获，其他错误会抛出：
          isNavigationFailure(err, ErrorTypes.NAVIGATION_CANCELLED)
            ? err
            : Promise.reject(err)
        )
    )
    // navigate() 完成后：
    // 会触发 finalizeNavigation(...) 写入历史记录、更新 currentRoute 等；
    // 会触发 triggerAfterEach(...) 执行 afterEach 钩子。
  }

  function triggerAfterEach(
    to: RouteLocationNormalizedLoaded,
    from: RouteLocationNormalizedLoaded,
    failure?: NavigationFailure | void
  ): void {
    // navigation is confirmed, call afterGuards
    // TODO: wrap with error handlers
    afterGuards
      .list()
      .forEach(guard => runWithContext(() => guard(to, from, failure)))
  }

  /**
   * - Cleans up any navigation guards
   * - Changes the url if necessary
   * - Calls the scrollBehavior
   */
  // 确认导航已完成，更新当前路由状态、修改 URL、触发滚动行为。
  function finalizeNavigation(
    toLocation: RouteLocationNormalizedLoaded,
    from: RouteLocationNormalizedLoaded,
    isPush: boolean,
    replace?: boolean,
    data?: HistoryState
  ): NavigationFailure | void {
    // a more recent navigation took place
    // 检查是否有更早的导航取消了这次导航
    // 如果某次导航被中途取消（如 beforeEach 中返回 false），则停止处理。
    const error = checkCanceledNavigation(toLocation, from)
    if (error) return error

    // only consider as push if it's not the first navigation
    // 判断是否是第一次导航
    // 用于决定是否需要改 URL、是否启用历史记录的滚动恢复。
    const isFirstNavigation = from === START_LOCATION_NORMALIZED
    const state: Partial<HistoryState> | null = !isBrowser ? {} : history.state

    // change URL only if the user did a push/replace and if it's not the initial navigation because
    // it's just reflecting the url
    // 更新浏览器地址栏（改变 URL）
    // push: 添加历史记录
    // replace: 替换当前记录
    // isFirstNavigation: 服务端或初次客户端加载，不需 push，只同步状态
    if (isPush) {
      // on the initial navigation, we want to reuse the scroll position from
      // history state if it exists
      if (replace || isFirstNavigation)
        routerHistory.replace(
          toLocation.fullPath,
          assign(
            {
              scroll: isFirstNavigation && state && state.scroll,
            },
            data
          )
        )
      else routerHistory.push(toLocation.fullPath, data)
    }

    // accept current navigation
    // 设置当前路由
    // 更新 router.currentRoute，Vue 会响应式更新视图。
    currentRoute.value = toLocation
    // 执行滚动行为
    handleScroll(toLocation, from, isPush, isFirstNavigation)

    // 通知 router 已就绪
    // 第一次导航时调用：用于处理 router.isReady() 的异步等待。
    markAsReady()
  }

  let removeHistoryListener: undefined | null | (() => void)
  // attach listener to history to trigger navigations
  // Vue Router 响应浏览器前进/后退 的关键方法。
  function setupListeners() {
    // avoid setting up listeners twice due to an invalid first navigation
    // 避免重复监听
    // 只会注册一次监听器。通过 removeHistoryListener 进行防重复。
    if (removeHistoryListener) return
    // 这个回调会在以下场景触发：
    // 用户点击浏览器的 ← / →
    // router.back() / router.forward() / router.go(...)
    // window.history.pushState(...)
    removeHistoryListener = routerHistory.listen((to, _from, info) => {
      if (!router.listening) return
      // cannot be a redirect route because it was in history
      // 生成目标路由：const toLocation = resolve(to)
      const toLocation = resolve(to) as RouteLocationNormalized

      // due to dynamic routing, and to hash history with manual navigation
      // (manually changing the url or calling history.hash = '#/somewhere'),
      // there could be a redirect record in history
      // 检查是否是重定向路由
      // 处理 SSR/手动修改 hash 导致的重定向历史记录。
      const shouldRedirect = handleRedirectRecord(toLocation)
      if (shouldRedirect) {
        pushWithRedirect(
          assign(shouldRedirect, { replace: true, force: true }),
          toLocation
        ).catch(noop)
        return
      }

      pendingLocation = toLocation
      const from = currentRoute.value

      // TODO: should be moved to web history?
      if (isBrowser) {
        // 保存滚动位置：
        saveScrollPosition(
          getScrollKey(from.fullPath, info.delta),
          computeScrollPosition()
        )
      }

      // 执行导航核心逻辑：
      navigate(toLocation, from)
        .catch((error: NavigationFailure | NavigationRedirectError) => {
          // 支持的失败类型
          // ABORTED、CANCELLED：直接返回，不处理
          // REDIRECT：重新 push 新导航（不再使用 history.go() 回退）
          // 其他错误：调用 triggerError 全局通知
          if (
            isNavigationFailure(
              error,
              ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_CANCELLED
            )
          ) {
            return error
          }
          if (
            isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT)
          ) {
            // Here we could call if (info.delta) routerHistory.go(-info.delta,
            // false) but this is bug prone as we have no way to wait the
            // navigation to be finished before calling pushWithRedirect. Using
            // a setTimeout of 16ms seems to work but there is no guarantee for
            // it to work on every browser. So instead we do not restore the
            // history entry and trigger a new navigation as requested by the
            // navigation guard.

            // the error is already handled by router.push we just want to avoid
            // logging the error
            pushWithRedirect(
              assign(locationAsObject((error as NavigationRedirectError).to), {
                force: true,
              }),
              toLocation
              // avoid an uncaught rejection, let push call triggerError
            )
              .then(failure => {
                // manual change in hash history #916 ending up in the URL not
                // changing, but it was changed by the manual url change, so we
                // need to manually change it ourselves
                if (
                  isNavigationFailure(
                    failure,
                    ErrorTypes.NAVIGATION_ABORTED |
                      ErrorTypes.NAVIGATION_DUPLICATED
                  ) &&
                  !info.delta &&
                  info.type === NavigationType.pop
                ) {
                  routerHistory.go(-1, false)
                }
              })
              .catch(noop)
            // avoid the then branch
            return Promise.reject()
          }
          // do not restore history on unknown direction
          if (info.delta) {
            routerHistory.go(-info.delta, false)
          }
          // unrecognized error, transfer to the global handler
          return triggerError(error, toLocation, from)
        })
        .then((failure: NavigationFailure | void) => {
          failure =
            failure ||
            finalizeNavigation(
              // after navigation, all matched components are resolved
              toLocation as RouteLocationNormalizedLoaded,
              from,
              false
            )

          // revert the navigation
          if (failure) {
            if (
              info.delta &&
              // a new navigation has been triggered, so we do not want to revert, that will change the current history
              // entry while a different route is displayed
              !isNavigationFailure(failure, ErrorTypes.NAVIGATION_CANCELLED)
            ) {
              routerHistory.go(-info.delta, false)
            } else if (
              info.type === NavigationType.pop &&
              isNavigationFailure(
                failure,
                ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_DUPLICATED
              )
            ) {
              // manual change in hash history #916
              // it's like a push but lacks the information of the direction
              routerHistory.go(-1, false)
            }
          }
          // 如果导航没失败，就 finalizeNavigation() 做后续处理，然后执行 afterEach 钩子。
          triggerAfterEach(
            toLocation as RouteLocationNormalizedLoaded,
            from,
            failure
          )
        })
        // avoid warnings in the console about uncaught rejections, they are logged by triggerErrors
        .catch(noop)
    })
  }

  // Initialization and Errors

  let readyHandlers = useCallbacks<OnReadyCallback>()
  let errorListeners = useCallbacks<_ErrorListener>()
  let ready: boolean

  /**
   * Trigger errorListeners added via onError and throws the error as well
   *
   * @param error - error to throw
   * @param to - location we were navigating to when the error happened
   * @param from - location we were navigating from when the error happened
   * @returns the error as a rejected promise
   */
  // 在路由导航出错时触发所有监听器、抛出错误，并中断导航流程
  function triggerError(
    // 参数	含义
    // error	抛出的错误（可能来自导航守卫、组件加载、用户代码等）
    // to	正在跳转的目标路由
    // from	当前的源路由
    error: any,
    to: RouteLocationNormalized,
    from: RouteLocationNormalizedLoaded
  ): Promise<unknown> {
    // 即使发生错误，也会调用 markAsReady()：
    // 触发 isReady() 的回调（带上错误）
    // 防止 router.isReady() 永远不 resolve/reject
    markAsReady(error)
    // 如果用户调用了 router.onError(fn) 注册了错误监听器，就会触发它们
    const list = errorListeners.list()
    if (list.length) {
      list.forEach(handler => handler(error, to, from))
    } else {
      if (__DEV__) {
        // 没有监听器时直接输出错误，方便开发调试
        warn('uncaught error during route navigation:')
      }
      console.error(error)
    }
    // reject the error no matter there were error listeners or not
    // 最终始终返回一个 reject(error)，用于中断导航流程
    return Promise.reject(error)
  }

  // 返回一个 Promise，用于等待 Router 初始化完成（首次导航完成）。
  function isReady(): Promise<void> {
    if (ready && currentRoute.value !== START_LOCATION_NORMALIZED)
      // 快速路径：已初始化
      // ready === true：已经初始化完成
      // 当前路由不再是初始空路由 START_LOCATION_NORMALIZED
      // 表示 首次跳转完成，立即返回 Promise.resolve()。
      return Promise.resolve()
    return new Promise((resolve, reject) => {
      // 等待路径：未完成
      // 把 resolve/reject 放到队列 readyHandlers 中
      // 后续在导航完成时由 markAsReady() 调用触发：
      readyHandlers.add([resolve, reject])
    })
  }

  /**
   * Mark the router as ready, resolving the promised returned by isReady(). Can
   * only be called once, otherwise does nothing.
   * @param err - optional error
   */
  // 标记 Router 初始化完成（ready）状态，并触发所有通过 router.isReady() 等待的回调。
  function markAsReady<E = any>(err: E): E
  function markAsReady<E = any>(): void
  // 背景：Router 的初始化是异步的
  // 在 Vue Router 中，createRouter() 后不会立即进入目标路由，它会等待：
  // 路由记录匹配
  // 异步组件加载
  // 守卫（beforeEach 等）执行完毕
  // 因此，router.isReady() 返回一个 Promise，开发者可以使用它：
  // router.isReady().then(() => {
  //   app.mount('
  function markAsReady<E = any>(err?: E): E | void {
    // 1. 防止重复调用 确保只处理一次。
    if (!ready) {
      // still not ready if an error happened
      // 2. 设置 ready 状态
      // 如果 err 存在（出错），则仍标记为未 ready。
      ready = !err
      // 3. 启动监听器
      // 设置浏览器监听器（如 popstate、hashchange），开始响应用户导航。
      setupListeners()
      // 4. 触发 isReady() 回调
      // 执行所有 isReady() 等待中的回调
      // 如果有错误，执行 reject(err)
      // 否则执行 resolve()
      readyHandlers
        .list()
        .forEach(([resolve, reject]) => (err ? reject(err) : resolve()))
      readyHandlers.reset()
    }
    // 返回值
    // 如果你传了一个 err（如导航失败、守卫报错），它会返回这个错误。
    return err
  }

  // Scroll behavior
  // 滚动行为处理逻辑，当你进行路由导航时，它决定页面是否滚动、滚动到哪儿。
  // 滚动到顶部
  // 保持上次滚动位置（用于前进/后退）
  // 滚动到某个锚点
  function handleScroll(
    // 参数	含义
    // to	即将进入的目标路由
    // from	当前正在离开的路由
    // isPush	是否是通过 router.push() 发起的（true 表示前进）
    // isFirstNavigation	是否是首次导航（页面首次加载）
    to: RouteLocationNormalizedLoaded,
    from: RouteLocationNormalizedLoaded,
    isPush: boolean,
    isFirstNavigation: boolean
  ): // the return is not meant to be used
  Promise<unknown> {
    const { scrollBehavior } = options
    // 1. 检查条件
    // SSR 环境或没配置 scrollBehavior 时跳过
    if (!isBrowser || !scrollBehavior) return Promise.resolve()

    // 2. 计算预期滚动位置
    // 返回按钮触发时，优先使用保存的滚动位置（popstate）
    // 首次导航时，使用 history.state.scroll（浏览器记录）
    // 否则返回 null，表示滚动到默认位置
    const scrollPosition: _ScrollPositionNormalized | null =
      (!isPush && getSavedScrollPosition(getScrollKey(to.fullPath, 0))) ||
      ((isFirstNavigation || !isPush) &&
        (history.state as HistoryState) &&
        history.state.scroll) ||
      null

    // 3. 延迟到下一个 "tick" 执行
    // nextTick()：等 DOM 更新完成后执行
    // 执行用户自定义的 scrollBehavior 函数
    // 返回的 position（可能是坐标或 false）再交给 scrollToPosition() 实现滚动
    // 捕获异常并触发错误处理
    return nextTick()
      .then(() => scrollBehavior(to, from, scrollPosition))
      .then(position => position && scrollToPosition(position))
      .catch(err => triggerError(err, to, from))
  }

  const go = (delta: number) => routerHistory.go(delta)

  let started: boolean | undefined
  const installedApps = new Set<App>()

  const router: Router = {
    currentRoute,
    listening: true,

    addRoute,
    removeRoute,
    clearRoutes: matcher.clearRoutes,
    hasRoute,
    getRoutes,
    resolve,
    options,

    push,
    replace,
    go,
    back: () => go(-1),
    forward: () => go(1),

    beforeEach: beforeGuards.add,
    beforeResolve: beforeResolveGuards.add,
    afterEach: afterGuards.add,

    onError: errorListeners.add,
    isReady,

    // install(app) 负责在 Vue 应用中注入所有与路由相关的内容，包括组件、响应式状态、插件钩子等。
    install(app: App) {
      const router = this
      // 1. 注入全局组件
      // 注册 <RouterLink> 和 <RouterView> 两个内置组件
      // 所以你才能在模板中直接使用它们
      app.component('RouterLink', RouterLink)
      app.component('RouterView', RouterView)

      // 2. 注入全局属性
      // 这会使得你在组件中可以使用：
      // this.$router
      // this.$route
      app.config.globalProperties.$router = router
      Object.defineProperty(app.config.globalProperties, '$route', {
        enumerable: true,
        get: () => unref(currentRoute),
      })

      // this initial navigation is only necessary on client, on server it doesn't
      // make sense because it will create an extra unnecessary navigation and could
      // lead to problems
      // 3. 客户端首次导航启动
      // 次加载页面时启动导航
      // 使用 routerHistory.location 获取当前地址，传入 push() 做一次初始化导航
      // 避免多次启动（只处理一次）
      if (
        isBrowser &&
        // used for the initial navigation client side to avoid pushing
        // multiple times when the router is used in multiple apps
        !started &&
        currentRoute.value === START_LOCATION_NORMALIZED
      ) {
        // see above
        started = true
        push(routerHistory.location).catch(err => {
          if (__DEV__) warn('Unexpected error when starting the router:', err)
        })
      }

      // 4. 创建 reactiveRoute 并提供响应式 $route
      // 这样处理后，提供出去的 $route 是响应式的，而且是“浅响应”，不会破坏原始结构。
      const reactiveRoute = {} as RouteLocationNormalizedLoaded
      for (const key in START_LOCATION_NORMALIZED) {
        Object.defineProperty(reactiveRoute, key, {
          get: () => currentRoute.value[key as keyof RouteLocationNormalized],
          enumerable: true,
        })
      }

      // 5. 提供依赖注入
      // inject(routerKey) 可获取 router 实例
      // inject(routeLocationKey) 获取当前路由信息（响应式）
      // inject(routerViewLocationKey) 用于 <RouterView> 内部传递上下文
      app.provide(routerKey, router)
      app.provide(routeLocationKey, shallowReactive(reactiveRoute))
      app.provide(routerViewLocationKey, currentRoute)

      // 6. 替换卸载钩子
      // 覆盖 app.unmount()，在卸载时清理路由状态
      // 如果多个 app 共用一个 router，只会在最后一个卸载时重置
      const unmountApp = app.unmount
      installedApps.add(app)
      app.unmount = function () {
        installedApps.delete(app)
        // the router is not attached to an app anymore
        if (installedApps.size < 1) {
          // invalidate the current navigation
          // 还原路由状态
          pendingLocation = START_LOCATION_NORMALIZED
          removeHistoryListener && removeHistoryListener()
          removeHistoryListener = null
          currentRoute.value = START_LOCATION_NORMALIZED
          started = false
          ready = false
        }
        unmountApp()
      }

      // TODO: this probably needs to be updated so it can be used by vue-termui
      // 7. 启动开发者工具支持
      // 注册 Vue Devtools 插件支持（在浏览器 DevTools 中显示路由信息）
      if ((__DEV__ || __FEATURE_PROD_DEVTOOLS__) && isBrowser) {
        addDevtools(app, router, matcher)
      }
    },
  }

  // TODO: type this as NavigationGuardReturn or similar instead of any
  // Vue Router 路由守卫队列的串行执行器，用于依次运行多个导航守卫（如 beforeEach, beforeRouteLeave, beforeRouteUpdate 等）。
  // 执行一组“延迟调用”的守卫函数，串行化执行，即：上一个执行完才执行下一个。
  function runGuardQueue(guards: Lazy<any>[]): Promise<any> {
    // guards: Lazy<any>[]
    // Lazy<any> 是惰性函数（如 () => guardFn()）
    // 每个元素是导航守卫的包装函数（不是直接执行，而是待执行）
    return guards.reduce(
      // reduce 串行链式执行
      // 逐个执行 guards 中的函数，且下一个 guard 必须等待前一个完成。
      (promise, guard) => promise.then(() => runWithContext(guard)),
      // runWithContext
      // 这是 Vue Router 在执行每个守卫时的上下文封装函数。
      // 通常会：
      // 设置 currentInstance
      // 捕获错误
      // 传入导航参数：to, from, next
      // 你可以认为它相当于：
      // const result = guard(to, from, next)
      // 但加了错误处理 + 执行上下文绑定。
      Promise.resolve()
    )
  }

  return router
}

// 路由跳转过程中用于提取“变更的路由记录”的关键工具函数。用于导航守卫执行逻辑中的核心计算。
function extractChangingRecords(
  to: RouteLocationNormalized,
  from: RouteLocationNormalizedLoaded
) {
  // leavingRecords	离开的路由记录（在 from.matched 中但不在 to.matched）
  // updatingRecords	两边都存在的记录（即更新中）
  // enteringRecords	进入的路由记录（在 to.matched 中但不在 from.matched）
  const leavingRecords: RouteRecordNormalized[] = []
  const updatingRecords: RouteRecordNormalized[] = []
  const enteringRecords: RouteRecordNormalized[] = []

  // 从浅到深，按 index 遍历最长的一方（最大 depth）
  const len = Math.max(from.matched.length, to.matched.length)

  // 遍历对比每一级路由记录
  for (let i = 0; i < len; i++) {
    const recordFrom = from.matched[i]
    // eavingRecords（离开）
    if (recordFrom) {
      if (to.matched.find(record => isSameRouteRecord(record, recordFrom)))
        updatingRecords.push(recordFrom)
      else leavingRecords.push(recordFrom)
    }
    const recordTo = to.matched[i]
    // enteringRecords（进入）
    // 如果 recordTo 不存在于 from.matched 中，说明它是新加入的
    if (recordTo) {
      // the type doesn't matter because we are comparing per reference
      if (!from.matched.find(record => isSameRouteRecord(record, recordTo))) {
        enteringRecords.push(recordTo)
      }
    }
  }

  // return [
  //   leavingRecords,   // 离开
  //   updatingRecords,  // 更新
  //   enteringRecords   // 进入
  // ]
  return [leavingRecords, updatingRecords, enteringRecords]

  // 例子
  // 假设你有以下路由嵌套：
  // [
  //   { path: '/', name: 'home' },
  //   { path: '/admin', name: 'admin', children: [
  //     { path: 'dashboard', name: 'dashboard' },
  //     { path: 'settings', name: 'settings' }
  //   ]}
  // ]
  // 当前路由：
  // /admin/dashboard → matched: [admin, dashboard]
  // 目标路由：
  // /admin/settings → matched: [admin, settings]
  // 那么：
  // leaving: [dashboard]
  // updating: [admin]
  // entering: [settings]
  //
  // 📌 应用场景
  // 这个函数的结果被用于：
  //
  // 路由守卫调用顺序决定：
  //
  // beforeRouteLeave 只在 leavingRecords 上调用
  // beforeRouteUpdate 在 updatingRecords 上调用
  // beforeRouteEnter 在 enteringRecords 上调用
  //
  // 动画过渡判断
  // 缓存判断（如 KeepAlive 的 include）
}
