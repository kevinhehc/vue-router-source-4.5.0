import { RouteRecord } from './types'
import {
  tokensToParser,
  PathParser,
  PathParserOptions,
} from './pathParserRanker'
import { tokenizePath } from './pathTokenizer'
import { warn } from '../warning'
import { assign } from '../utils'

// createRouteRecordMatcher 核心逻辑
// 把标准化后的路由记录 RouteRecord 转换为具备路径解析能力的 matcher 对象 RouteRecordMatcher。
export interface RouteRecordMatcher extends PathParser {
  //   record: RouteRecord                      // 原始的标准化路由记录
  //   parent: RouteRecordMatcher | undefined  // 父级 matcher（用于嵌套路由）
  //   children: RouteRecordMatcher[]          // 子 matcher（同样是嵌套路由）
  //   alias: RouteRecordMatcher[]             // 所有这个记录的别名 matcher
  record: RouteRecord
  parent: RouteRecordMatcher | undefined
  children: RouteRecordMatcher[]
  // aliases that must be removed when removing this record
  alias: RouteRecordMatcher[]
}

export function createRouteRecordMatcher(
  record: Readonly<RouteRecord>,
  parent: RouteRecordMatcher | undefined,
  options?: PathParserOptions
): RouteRecordMatcher {

  // 1. 构建路径解析器
  // tokenizePath(...) 会把 record.path 解析成 token 数组，比如 /user/:id 变成：
  // [
  //   { type: 'static', value: '/user/' },
  //   { type: 'param', name: 'id', ... }
  // ]
  // tokensToParser(...) 则基于这些 tokens 创建 PathParser 对象，包含：
  // 正则表达式 re
  // 参数 key 描述 keys
  // parse 和 stringify 方法
  const parser = tokensToParser(tokenizePath(record.path), options)

  // warn against params with the same name
  // 2. 检查重复的动态参数（开发环境）
  // 防止定义像 /user/:id/:id 这样重复参数名的路径。
  if (__DEV__) {
    const existingKeys = new Set<string>()
    for (const key of parser.keys) {
      if (existingKeys.has(key.name))
        warn(
          `Found duplicated params with name "${key.name}" for path "${record.path}". Only the last one will be available on "$route.params".`
        )
      existingKeys.add(key.name)
    }
  }

  // 3. 构造 RouteRecordMatcher 对象
  // 用 assign 合并 parser 和附加字段，构成 RouteRecordMatcher。
  // children 和 alias 默认初始化为空，稍后会通过其他逻辑补全。
  const matcher: RouteRecordMatcher = assign(parser, {
    record,
    parent,
    // these needs to be populated by the parent
    children: [],
    alias: [],
  })

  // 4. 构建 parent-child 层级关系
  if (parent) {
    // 如果 matcher 和 parent 都是 alias（或都不是 alias），那么才建立 parent-children 关系。
    // 这样可以避免 alias 和原始路由混在一起（这在路由查找和还原时有语义差异）。
    // both are aliases or both are not aliases
    // we don't want to mix them because the order is used when
    // passing originalRecord in Matcher.addRoute
    if (!matcher.record.aliasOf === !parent.record.aliasOf)
      parent.children.push(matcher)
  }

  return matcher
}
