import { decode, encodeQueryKey, encodeQueryValue, PLUS_RE } from './encoding'
import { isArray } from './utils'

/**
 * Possible values in normalized {@link LocationQuery}. `null` renders the query
 * param but without an `=`.
 *
 * @example
 * ```
 * ?isNull&isEmpty=&other=other
 * gives
 * `{ isNull: null, isEmpty: '', other: 'other' }`.
 * ```
 *
 * @internal
 */
// null 表示参数存在但无值（如 ?foo）
// '' 表示空值（如 ?bar=）
// 'baz' 表示正常值（如 ?key=baz）
export type LocationQueryValue = string | null
/**
 * Possible values when defining a query.
 *
 * @internal
 */
// 用于用户传入的 query 类型。包含 undefined，但 undefined 会在处理时被去除。
export type LocationQueryValueRaw = LocationQueryValue | number | undefined
/**
 * Normalized query object that appears in {@link RouteLocationNormalized}
 *
 * @public
 */
// 最终规范化后（供 Vue Router 内部使用）的查询对象。
export type LocationQuery = Record<
  string,
  LocationQueryValue | LocationQueryValue[]
>
/**
 * Loose {@link LocationQuery} object that can be passed to functions like
 * {@link Router.push} and {@link Router.replace} or anywhere when creating a
 * {@link RouteLocationRaw}
 *
 * @public
 */
export type LocationQueryRaw = Record<
  string | number,
  LocationQueryValueRaw | LocationQueryValueRaw[]
>

/**
 * Transforms a queryString into a {@link LocationQuery} object. Accept both, a
 * version with the leading `?` and without Should work as URLSearchParams

 * @internal
 *
 * @param search - search string to parse
 * @returns a query object
 */
// 将查询字符串转为对象（?a=1&b&c=3 → { a: "1", b: null, c: "3" }）
// 核心逻辑：
// 允许传入带 ? 开头的字符串
// 将 + 解码为空格
// 解码键值（decodeURIComponent）
// 支持同名参数合并为数组（如 ?a=1&a=2 → { a: ["1", "2"] }）
export function parseQuery(search: string): LocationQuery {
  const query: LocationQuery = {}
  // avoid creating an object with an empty key and empty value
  // because of split('&')
  if (search === '' || search === '?') return query
  const hasLeadingIM = search[0] === '?'
  const searchParams = (hasLeadingIM ? search.slice(1) : search).split('&')
  for (let i = 0; i < searchParams.length; ++i) {
    // pre decode the + into space
    const searchParam = searchParams[i].replace(PLUS_RE, ' ')
    // allow the = character
    const eqPos = searchParam.indexOf('=')
    const key = decode(eqPos < 0 ? searchParam : searchParam.slice(0, eqPos))
    const value = eqPos < 0 ? null : decode(searchParam.slice(eqPos + 1))

    if (key in query) {
      // an extra variable for ts types
      let currentValue = query[key]
      if (!isArray(currentValue)) {
        currentValue = query[key] = [currentValue]
      }
      // we force the modification
      ;(currentValue as LocationQueryValue[]).push(value)
    } else {
      query[key] = value
    }
  }
  return query
}

/**
 * Stringifies a {@link LocationQueryRaw} object. Like `URLSearchParams`, it
 * doesn't prepend a `?`
 *
 * @internal
 *
 * @param query - query object to stringify
 * @returns string version of the query without the leading `?`
 */
// 将对象转为查询字符串（反向过程）
// 核心逻辑：
// 忽略 undefined
// null → ?key（无等号）
// 空字符串或值 → ?key=value
// 多值数组支持重复键（a=1&a=2）
// { a: 1, b: null, c: ['x', null, undefined] }
// → 'a=1&b&c=x&c'
export function stringifyQuery(query: LocationQueryRaw): string {
  let search = ''
  for (let key in query) {
    const value = query[key]
    key = encodeQueryKey(key)
    if (value == null) {
      // only null adds the value
      if (value !== undefined) {
        search += (search.length ? '&' : '') + key
      }
      continue
    }
    // keep null values
    const values: LocationQueryValueRaw[] = isArray(value)
      ? value.map(v => v && encodeQueryValue(v))
      : [value && encodeQueryValue(value)]

    values.forEach(value => {
      // skip undefined values in arrays as if they were not present
      // smaller code than using filter
      if (value !== undefined) {
        // only append & with non-empty search
        search += (search.length ? '&' : '') + key
        if (value != null) search += '=' + value
      }
    })
  }

  return search
}

/**
 * Transforms a {@link LocationQueryRaw} into a {@link LocationQuery} by casting
 * numbers into strings, removing keys with an undefined value and replacing
 * undefined with null in arrays
 *
 * @param query - query object to normalize
 * @returns a normalized query object
 */
// 对用户传入的 query 做规范化处理，转换为 LocationQuery
// 特点：
// number → string
// undefined → 删除
// 数组中 undefined → null（确保一致性）
// { a: 1, b: undefined, c: [2, null, undefined] }
// → { a: "1", c: ["2", null, null] }
export function normalizeQuery(
  query: LocationQueryRaw | undefined
): LocationQuery {
  const normalizedQuery: LocationQuery = {}

  for (const key in query) {
    const value = query[key]
    if (value !== undefined) {
      normalizedQuery[key] = isArray(value)
        ? value.map(v => (v == null ? null : '' + v))
        : value == null
        ? value
        : '' + value
    }
  }

  return normalizedQuery
}
