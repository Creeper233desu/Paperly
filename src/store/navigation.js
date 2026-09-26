import { reactive } from 'vue'

export const primaryNavigation = reactive({ active: 'library', busy: false })

export function navigatePrimary(target) {
  if (primaryNavigation.busy) return
  const pages = getCurrentPages()
  const currentRoute = (pages[pages.length - 1]?.route || '').replace(/^\//, '')
  if (currentRoute === `pages/${target === 'library' ? 'library' : 'settings'}/index`) return
  primaryNavigation.active = target
  primaryNavigation.busy = true
  setTimeout(() => { primaryNavigation.busy = false }, 320)
  if (target === 'settings') {
    uni.navigateTo({ url: '/pages/settings/index', animationType: 'slide-in-right', animationDuration: 280 })
    return
  }
  const index = pages.map(page => (page.route || '').replace(/^\//, '')).lastIndexOf('pages/library/index')
  if (index >= 0 && index < pages.length - 1) {
    uni.navigateBack({ delta: pages.length - 1 - index, animationType: 'slide-out-right', animationDuration: 280 })
  } else {
    uni.reLaunch({ url: '/pages/library/index' })
  }
}
