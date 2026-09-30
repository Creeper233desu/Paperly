import { reactive } from 'vue'
import { DEFAULT_AI_PROMPT, defaultAiPrompt, isDefaultAiPrompt } from '../services/assistant.js'
import { queueDirectorySync } from '../services/data-directory.js'
import { setLanguage, SUPPORTED_LANGUAGES } from '../i18n.js'
import { DATE_FORMATS, defaultDateFormat, formatDisplayDate } from '../utils/display-date.js'

const KEY = 'paperwriter.preferences.v1'
export const accentChoices = [
  { id: 'slate', label: '雾蓝', color: '#536787' },
  { id: 'jade', label: '青玉', color: '#3f806f' },
  { id: 'plum', label: '紫藤', color: '#8266a1' },
  { id: 'coral', label: '珊瑚', color: '#ac665c' },
  { id: 'amber', label: '琥珀', color: '#996e32' }
]
const defaults = { theme: 'system', accent: 'slate', language:'zh-CN', dateFormat:'zh-CN', font: 'system', fontSize: 18, focus: true, autoPair: true, animatedCursor: true, cursorStyle: 'neovim', cursorTrailColor: '#819bcb', cursorTrailLength: 32, customFonts: [], aiSystemPrompt: DEFAULT_AI_PROMPT, aiSidebarOpen: false, aiApprovalMode: 'review' }
export const preferences = reactive({ ...defaults })
const appearance = reactive({ dark: false })
let loaded = false

export function loadPreferences() {
  if (loaded) return preferences
  loaded = true
  let saved = {}
  try { saved = JSON.parse(uni.getStorageSync(KEY) || '{}') || {}; Object.assign(preferences, defaults, saved) } catch (_) { /* keep defaults */ }
  if (!Array.isArray(preferences.customFonts)) preferences.customFonts = []
  if (!accentChoices.some(choice => choice.id === preferences.accent)) preferences.accent = defaults.accent
  if (!SUPPORTED_LANGUAGES.includes(preferences.language)) preferences.language = defaults.language
  preferences.dateFormat = DATE_FORMATS.includes(saved.dateFormat) ? saved.dateFormat : defaultDateFormat(preferences.language)
  setLanguage(preferences.language)
  if (isDefaultAiPrompt(preferences.aiSystemPrompt)) preferences.aiSystemPrompt = defaultAiPrompt(preferences.language)
  if (!['review', 'full'].includes(preferences.aiApprovalMode)) preferences.aiApprovalMode = 'review'
  if (!['beam', 'neovim'].includes(preferences.cursorStyle)) preferences.cursorStyle = defaults.cursorStyle
  if (!/^#[0-9a-f]{6}$/i.test(preferences.cursorTrailColor)) preferences.cursorTrailColor = defaults.cursorTrailColor
  const trailLength = Number(preferences.cursorTrailLength)
  preferences.cursorTrailLength = Number.isFinite(trailLength) ? Math.min(96, Math.max(0, trailLength)) : defaults.cursorTrailLength
  if (preferences.font === 'song') preferences.font = 'noto'
  if (preferences.font === 'kai') preferences.font = 'wenkai'
  return preferences
}
export function reloadPreferences() { loaded = false; Object.assign(preferences, defaults); loadPreferences(); applyTheme() }
export function updatePreferences(patch) {
  loadPreferences(); Object.assign(preferences, patch)
  if (Object.prototype.hasOwnProperty.call(patch, 'language')) {
    if (!SUPPORTED_LANGUAGES.includes(preferences.language)) preferences.language = defaults.language
    if (!Object.prototype.hasOwnProperty.call(patch, 'dateFormat')) preferences.dateFormat = defaultDateFormat(preferences.language)
    setLanguage(preferences.language)
    if (isDefaultAiPrompt(preferences.aiSystemPrompt)) preferences.aiSystemPrompt = defaultAiPrompt(preferences.language)
  }
  if (!DATE_FORMATS.includes(preferences.dateFormat)) preferences.dateFormat = defaultDateFormat(preferences.language)
  uni.setStorageSync(KEY, JSON.stringify(preferences))
  queueDirectorySync()
  applyTheme()
}
export function displayDate(value, options) { return formatDisplayDate(value, loadPreferences().dateFormat, options) }
export function isDark() {
  loadPreferences()
  if (preferences.theme === 'dark') return true
  if (preferences.theme === 'light') return false
  try { return uni.getSystemInfoSync().theme === 'dark' } catch (_) { return false }
}
export function themeClass() { return `${appearance.dark ? 'theme-dark' : 'theme-light'} accent-${preferences.accent}` }
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
