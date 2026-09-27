import { reactive } from 'vue'

const KEY = 'paperwriter.preferences.v1'
const defaults = { theme: 'system', font: 'system', fontSize: 18, focus: false, autoPair: true, animatedCursor: true, cursorTrailColor: '#819bcb', cursorTrailLength: 32, customFonts: [] }
export const preferences = reactive({ ...defaults })
const appearance = reactive({ dark: false })
let loaded = false

export function loadPreferences() {
  if (loaded) return preferences
  loaded = true
  try { Object.assign(preferences, defaults, JSON.parse(uni.getStorageSync(KEY) || '{}')) } catch (_) { /* keep defaults */ }
  if (!Array.isArray(preferences.customFonts)) preferences.customFonts = []
  if (!/^#[0-9a-f]{6}$/i.test(preferences.cursorTrailColor)) preferences.cursorTrailColor = defaults.cursorTrailColor
  const trailLength = Number(preferences.cursorTrailLength)
  preferences.cursorTrailLength = Number.isFinite(trailLength) ? Math.min(96, Math.max(0, trailLength)) : defaults.cursorTrailLength
  if (preferences.font === 'song') preferences.font = 'noto'
  if (preferences.font === 'kai') preferences.font = 'wenkai'
  return preferences
}
export function updatePreferences(patch) {
  loadPreferences(); Object.assign(preferences, patch)
  uni.setStorageSync(KEY, JSON.stringify(preferences))
  applyTheme()
}
export function isDark() {
  loadPreferences()
  if (preferences.theme === 'dark') return true
  if (preferences.theme === 'light') return false
  try { return uni.getSystemInfoSync().theme === 'dark' } catch (_) { return false }
}
export function themeClass() { return appearance.dark ? 'theme-dark' : 'theme-light' }
export function applyTheme() {
  loadPreferences()
  appearance.dark = isDark()
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined') {
    plus.navigator.setStatusBarStyle(appearance.dark ? 'light' : 'dark')
    if (plus.os.name === 'iOS') plus.nativeUI.setUIStyle(preferences.theme === 'system' ? 'auto' : preferences.theme)
  }
  // #endif
}
export const fontFamilies = {
  system: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
  song: '"Songti SC", "SimSun", "Noto Serif CJK SC", serif',
  kai: '"Kaiti SC", "KaiTi", "STKaiti", serif',
  sans: '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  noto: '"PaperNotoSerif", serif',
  wenkai: '"PaperWenKai", serif'
}
