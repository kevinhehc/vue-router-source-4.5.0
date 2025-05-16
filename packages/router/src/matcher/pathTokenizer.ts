export const enum TokenType {
  // 值	含义
  // Static	普通路径片段（如 /user）
  // Param	动态参数（如 :id, :slug(\\w+)?）
  // Group	目前未在主流程中使用，可能用于路径分组（例如 `(/foo
  Static,
  Param,
  Group,
}

const enum TokenizerState {
  // 状态名	描述
  // Static	普通路径字符
  // Param	进入 : 参数定义状态
  // ParamRegExp	参数后带括号，开始自定义正则
  // ParamRegExpEnd	处理完正则，判断是否有 ? + *
  // EscapeNext	转义字符 \ 出现时进入此状态
  Static,
  Param,
  ParamRegExp, // custom re for a param
  ParamRegExpEnd, // check if there is any ? + *
  EscapeNext,
}

interface TokenStatic {
  type: TokenType.Static
  value: string
}

interface TokenParam {
  type: TokenType.Param
  regexp?: string
  value: string
  optional: boolean
  repeatable: boolean
}

interface TokenGroup {
  type: TokenType.Group
  value: Exclude<Token, TokenGroup>[]
}

export type Token = TokenStatic | TokenParam | TokenGroup

const ROOT_TOKEN: Token = {
  type: TokenType.Static,
  value: '',
}

const VALID_PARAM_RE = /[a-zA-Z0-9_]/
// After some profiling, the cache seems to be unnecessary because tokenizePath
// (the slowest part of adding a route) is very fast

// const tokenCache = new Map<string, Token[][]>()
// 核心作用：路径字符串 → Token 数组
// const tokens = tokenizePath('/user/:id(\\d+)?')
// 会返回类似的结构：
// [
//   [
//     { type: Static, value: '/user' },
//     {
//       type: Param,
//       value: 'id',
//       regexp: '\\d+',
//       optional: true,
//       repeatable: false
//     }
//   ]
// ]


// 示例解析 /user/:id(\\d+)?
// 逐步处理过程如下：
//
// 字符	                状态变化	                      动作
// / → u → s ...	      Static	                      缓存进 buffer
// :	                  切换为 Param	                  之前的 /user 作为 Static token
// i d	                Param	                        加入 buffer
// (	                  ParamRegExp	                  自定义正则开始
// \\ d + )	            ParamRegExp → ParamRegExpEnd	缓存正则表达式
// ?	                  表示参数是 optional	            ---
// EOF	                consumeBuffer()              	生成 Param token
export function tokenizePath(path: string): Array<Token[]> {
  if (!path) return [[]]
  if (path === '/') return [[ROOT_TOKEN]]
  if (!path.startsWith('/')) {
    throw new Error(
      __DEV__
        ? `Route paths should start with a "/": "${path}" should be "/${path}".`
        : `Invalid path "${path}"`
    )
  }

  // if (tokenCache.has(path)) return tokenCache.get(path)!

  function crash(message: string) {
    throw new Error(`ERR (${state})/"${buffer}": ${message}`)
  }

  let state: TokenizerState = TokenizerState.Static
  let previousState: TokenizerState = state
  const tokens: Array<Token[]> = []
  // the segment will always be valid because we get into the initial state
  // with the leading /
  let segment!: Token[]

  function finalizeSegment() {
    if (segment) tokens.push(segment)
    segment = []
  }

  // index on the path
  let i = 0
  // char at index
  let char: string
  // buffer of the value read
  let buffer: string = ''
  // custom regexp for a param
  let customRe: string = ''

  function consumeBuffer() {
    if (!buffer) return

    if (state === TokenizerState.Static) {
      segment.push({
        type: TokenType.Static,
        value: buffer,
      })
    } else if (
      state === TokenizerState.Param ||
      state === TokenizerState.ParamRegExp ||
      state === TokenizerState.ParamRegExpEnd
    ) {
      if (segment.length > 1 && (char === '*' || char === '+'))
        crash(
          `A repeatable param (${buffer}) must be alone in its segment. eg: '/:ids+.`
        )
      segment.push({
        type: TokenType.Param,
        value: buffer,
        regexp: customRe,
        repeatable: char === '*' || char === '+',
        optional: char === '*' || char === '?',
      })
    } else {
      crash('Invalid state to consume buffer')
    }
    buffer = ''
  }

  function addCharToBuffer() {
    buffer += char
  }

  while (i < path.length) {
    char = path[i++]

    if (char === '\\' && state !== TokenizerState.ParamRegExp) {
      previousState = state
      state = TokenizerState.EscapeNext
      continue
    }

    switch (state) {
      case TokenizerState.Static:
        if (char === '/') {
          if (buffer) {
            consumeBuffer()
          }
          finalizeSegment()
        } else if (char === ':') {
          consumeBuffer()
          state = TokenizerState.Param
        } else {
          addCharToBuffer()
        }
        break

      case TokenizerState.EscapeNext:
        addCharToBuffer()
        state = previousState
        break

      case TokenizerState.Param:
        if (char === '(') {
          state = TokenizerState.ParamRegExp
        } else if (VALID_PARAM_RE.test(char)) {
          addCharToBuffer()
        } else {
          consumeBuffer()
          state = TokenizerState.Static
          // go back one character if we were not modifying
          if (char !== '*' && char !== '?' && char !== '+') i--
        }
        break

      case TokenizerState.ParamRegExp:
        // TODO: is it worth handling nested regexp? like :p(?:prefix_([^/]+)_suffix)
        // it already works by escaping the closing )
        // https://paths.esm.dev/?p=AAMeJbiAwQEcDKbAoAAkP60PG2R6QAvgNaA6AFACM2ABuQBB#
        // is this really something people need since you can also write
        // /prefix_:p()_suffix
        if (char === ')') {
          // handle the escaped )
          if (customRe[customRe.length - 1] == '\\')
            customRe = customRe.slice(0, -1) + char
          else state = TokenizerState.ParamRegExpEnd
        } else {
          customRe += char
        }
        break

      case TokenizerState.ParamRegExpEnd:
        // same as finalizing a param
        consumeBuffer()
        state = TokenizerState.Static
        // go back one character if we were not modifying
        if (char !== '*' && char !== '?' && char !== '+') i--
        customRe = ''
        break

      default:
        crash('Unknown state')
        break
    }
  }

  if (state === TokenizerState.ParamRegExp)
    crash(`Unfinished custom RegExp for param "${buffer}"`)

  consumeBuffer()
  finalizeSegment()

  // tokenCache.set(path, tokens)
  // 比如路径 /user/:id/details/:tab* 会被拆成两段：
  // [
  //   [ { Static: '/user' }, { Param: 'id' } ],
  //   [ { Static: '/details' }, { Param: 'tab', repeatable: true } ]
  // ]
  return tokens



  // 错误检查点

  // 参数不能和其他内容混在一起用 + *：
  // '/foo:bar+abc' // 会 crash

  // 正则未闭合：
  // '/:id(\\d+' // 抛出 Unfinished RegExp 错误

  // 非 / 开头路径也会报错：
  // 'user/:id' // "should start with /"
}
