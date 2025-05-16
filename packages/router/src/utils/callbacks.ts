/**
 * Create a list of callbacks that can be reset. Used to create before and after navigation guards list
 */
// 定义了一个通用的回调管理工具函数 useCallbacks<T>()，
// 在 Vue Router 中用于管理导航守卫、ready 处理器、错误监听器等。
// useCallbacks<T>() 是一个轻量、实用的 事件订阅管理器，是 Vue Router 内部核心机制（导航守卫、错误处理、初始化控制）的基础工具之一。
// 如果你正在构建路由系统、事件总线、插件系统，这种模式非常值得借鉴。需要我帮你把它提炼成一个可复用的独立工具函数或封装类也可以告诉我。
export function useCallbacks<T>() {
  let handlers: T[] = []

  function add(handler: T): () => void {
    handlers.push(handler)
    return () => {
      const i = handlers.indexOf(handler)
      if (i > -1) handlers.splice(i, 1)
    }
  }

  function reset() {
    handlers = []
  }

  // 返回一个 回调注册器对象
  // 提供 3 个核心方法：
  // add(handler: T): () => void：添加一个回调，并返回用于移除的函数
  // list(): T[]：获取所有当前的回调副本（防止外部修改原始数组）
  // reset(): void：清空所有回调
  return {
    add,
    list: () => handlers.slice(),
    reset,
  }
}
