import {
  RouterHistory,
  NavigationCallback,
  START,
  HistoryState,
  NavigationType,
  NavigationDirection,
  NavigationInformation,
  normalizeBase,
  createHref,
  HistoryLocation,
} from './common'

/**
 * Creates an in-memory based history. The main purpose of this history is to handle SSR. It starts in a special location that is nowhere.
 * It's up to the user to replace that location with the starter location by either calling `router.push` or `router.replace`.
 *
 * @param base - Base applied to all urls, defaults to '/'
 * @returns a history object that can be passed to the router constructor
 */
// 继 createWebHistory 和 createWebHashHistory 之后的第三种路由历史模式，主要用于 SSR 或 测试环境，也叫「内存历史模式」。
// 这是一个不依赖浏览器 window.history 的路由 history 实现，所有路由状态保存在内存中，没有真正改变地址栏，也不产生副作用。其核心用途包括：
// 服务端渲染（SSR）中模拟路由跳转
// 单元测试中模拟导航
// CLI 工具或嵌入式环境中无浏览器能力的路由处理

export function createMemoryHistory(base: string = ''): RouterHistory {
  let listeners: NavigationCallback[] = []
  // 它使用一个数组 queue 来模拟浏览器的历史栈：
  let queue: HistoryLocation[] = [START]
  let position: number = 0
  base = normalizeBase(base)

  function setLocation(location: HistoryLocation) {
    position++
    if (position !== queue.length) {
      // we are in the middle, we remove everything from here in the queue
      queue.splice(position)
    }
    queue.push(location)
  }

  function triggerListeners(
    to: HistoryLocation,
    from: HistoryLocation,
    { direction, delta }: Pick<NavigationInformation, 'direction' | 'delta'>
  ): void {
    const info: NavigationInformation = {
      direction,
      delta,
      type: NavigationType.pop,
    }
    for (const callback of listeners) {
      callback(to, from, info)
    }
  }

  // ush 和 replace
  // push(to)
  // → position++
  // → queue.push(to)
  //
  // replace(to)
  // → queue.splice(position--, 1)
  // → queue.push(to)

  // 举例：
  // history.push('/a')  // queue = ['/', '/a'], position = 1
  // history.push('/b')  // queue = ['/', '/a', '/b'], position = 2
  // history.go(-1)      // position = 1, location = '/a'
  const routerHistory: RouterHistory = {
    // rewritten by Object.defineProperty
    location: START,
    // TODO: should be kept in queue
    state: {},
    base,
    createHref: createHref.bind(null, base),

    replace(to) {
      // remove current entry and decrement position
      queue.splice(position--, 1)
      setLocation(to)
    },

    push(to, data?: HistoryState) {
      setLocation(to)
    },

    listen(callback) {
      listeners.push(callback)
      return () => {
        const index = listeners.indexOf(callback)
        if (index > -1) listeners.splice(index, 1)
      }
    },
    destroy() {
      listeners = []
      queue = [START]
      position = 0
    },

    go(delta, shouldTrigger = true) {
      const from = this.location
      const direction: NavigationDirection =
        // we are considering delta === 0 going forward, but in abstract mode
        // using 0 for the delta doesn't make sense like it does in html5 where
        // it reloads the page
        delta < 0 ? NavigationDirection.back : NavigationDirection.forward
      position = Math.max(0, Math.min(position + delta, queue.length - 1))
      if (shouldTrigger) {
        // 每次调用 go()，都会触发 triggerListeners()：
        triggerListeners(this.location, from, {
          direction,
          delta,
        })
      }
    },
  }

  Object.defineProperty(routerHistory, 'location', {
    enumerable: true,
    get: () => queue[position],
  })

  if (__TEST__) {
    // @ts-expect-error: only for tests
    routerHistory.changeURL = function (url: string) {
      const from = this.location
      queue.splice(position++ + 1, queue.length, url)
      triggerListeners(this.location, from, {
        direction: NavigationDirection.unknown,
        delta: 0,
      })
    }
  }

  return routerHistory
}
