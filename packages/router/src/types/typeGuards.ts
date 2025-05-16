import type { RouteLocationRaw, RouteRecordNameGeneric } from '../typed-routes'

// 类型判断

export function isRouteLocation(route: any): route is RouteLocationRaw {
  return typeof route === 'string' || (route && typeof route === 'object')
}

export function isRouteName(name: any): name is RouteRecordNameGeneric {
  return typeof name === 'string' || typeof name === 'symbol'
}
