import { reactive } from 'vue'

export const PRIMARY_TABS = ['library', 'statistics', 'settings']
export const primaryNavigation = reactive({ active: 'library', busy: false })

export function navigatePrimary(target) {
  if (primaryNavigation.busy || !PRIMARY_TABS.includes(target)) return
  const pages = getCurrentPages()
  const currentRoute = (pages[pages.length - 1]?.route || '').replace(/^\//, '')
  if (currentRoute === 'pages/library/index') { primaryNavigation.active = target; return }
  primaryNavigation.active = target
  primaryNavigation.busy = true
  setTimeout(() => { primaryNavigation.busy = false }, 320)
  const index = pages.map(page => (page.route || '').replace(/^\//, '')).lastIndexOf('pages/library/index')
  if (index >= 0 && index < pages.length - 1) {
    uni.navigateBack({ delta: pages.length - 1 - index, animationType: 'slide-out-right', animationDuration: 280 })
  } else {
    uni.reLaunch({ url: `/pages/library/index?tab=${target}` })
  }
}
