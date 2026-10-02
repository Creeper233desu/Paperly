// renderjs has no supported unmount hook on App. Stop callbacks when its DOM
// owner disappears, before uni-app tries to look up a removed page container.
export function createRenderBridge(instance, onDispose = () => {}) {
  const root = instance.$ownerInstance?.$el || instance.$el
  const doc = root?.ownerDocument
  const win = doc?.defaultView
  let disposed = false, observer
  function dispose() {
    if (disposed) return
    disposed = true
    observer?.disconnect()
    win?.removeEventListener('pagehide', dispose)
    win?.removeEventListener('unload', dispose)
    onDispose()
  }
  function isActive() {
    if (!disposed && (!root?.isConnected || !instance.$ownerInstance?.callMethod)) dispose()
    return !disposed
  }
  if (win?.MutationObserver && doc?.documentElement) {
    observer = new win.MutationObserver(isActive)
    observer.observe(doc.documentElement, { childList: true, subtree: true })
  }
  win?.addEventListener('pagehide', dispose)
  win?.addEventListener('unload', dispose)
  return {
    isActive, dispose,
    call(method, data = {}) {
      if (!isActive()) return false
      instance.$ownerInstance.callMethod(method, data)
      return true
    }
  }
}
