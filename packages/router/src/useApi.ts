import { inject } from 'vue'
import { routerKey, routeLocationKey } from './injectionSymbols'
import { Router } from './router'
import { RouteMap } from './typed-routes/route-map'
import { RouteLocationNormalizedLoaded } from './typed-routes'

/**
 * Returns the router instance. Equivalent to using `$router` inside
 * templates.
 */
// 从 Vue 的依赖注入系统中取出路由实例，相当于在模板中使用 $router。
export function useRouter(): Router {
  return inject(routerKey)!
}

/**
 * Returns the current route location. Equivalent to using `$route` inside
 * templates.
 */
// 返回当前激活的路由对象，相当于在模板中使用 $route。
export function useRoute<Name extends keyof RouteMap = keyof RouteMap>(
  _name?: Name
): RouteLocationNormalizedLoaded<Name> {
  return inject(routeLocationKey)!
}
