import {
  RouteParamsGeneric,
  RouteComponent,
  RouteParamsRawGeneric,
  RouteParamValueRaw,
  RawRouteComponent,
} from '../types'

export * from './env'

// 一组内部工具函数，目的是提供一些小型、可复用的类型判断与参数处理工具。

/**
 * Allows differentiating lazy components from functional components and vue-class-component
 * @internal
 *
 * @param component
 */
// 作用：判断传入对象是否是一个“可被 Vue Router 使用”的组件（支持懒加载组件、函数式组件、Vue class 组件等）。
// 判断条件：
// 是对象
// 有 displayName（函数式组件标志）
// 有 props
// 有 __vccOpts（Vue Class Component 的标志）
export function isRouteComponent(
  component: RawRouteComponent
): component is RouteComponent {
  return (
    typeof component === 'object' ||
    'displayName' in component ||
    'props' in component ||
    '__vccOpts' in component
  )
}

// 作用：判断一个对象是否是 ES Module 格式（用于懒加载时 import() 的模块判断）
// 特点：
// 有 __esModule
// 或者 Symbol.toStringTag 是 'Module'
// 或者有 .default 并且 default 是合法的 RouteComponent
export function isESModule(obj: any): obj is { default: RouteComponent } {
  return (
    obj.__esModule ||
    obj[Symbol.toStringTag] === 'Module' ||
    // support CF with dynamic imports that do not
    // add the Module string tag
    (obj.default && isRouteComponent(obj.default))
  )
}

// 作用：简写 Object.assign，用于对象合并。
export const assign = Object.assign

// 作用：对路由参数进行统一转换处理。
// 常用于：
// 编码（encode）
// 转字符串（normalize）
// 解码（decode）
// 示例：
// applyToParams(encodeURIComponent, { id: 123, tags: ['vue', 'router'] })
// // => { id: '123', tags: ['vue', 'router'] }
export function applyToParams(
  fn: (v: string | number | null | undefined) => string,
  params: RouteParamsRawGeneric | undefined
): RouteParamsGeneric {
  const newParams: RouteParamsGeneric = {}

  for (const key in params) {
    const value = params[key]
    newParams[key] = isArray(value)
      ? value.map(fn)
      : fn(value as Exclude<RouteParamValueRaw, any[]>)
  }

  return newParams
}

// 作用：空函数，占位用。例如 .catch(noop) 来吞掉错误但不处理。
export const noop = () => {}

/**
 * Typesafe alternative to Array.isArray
 * https://github.com/microsoft/TypeScript/pull/48228
 */
// 作用：带类型推断的 Array.isArray 封装，支持 TypeScript 更智能的类型缩小（type narrowing）。
export const isArray: (arg: ArrayLike<any> | any) => arg is ReadonlyArray<any> =
  Array.isArray
