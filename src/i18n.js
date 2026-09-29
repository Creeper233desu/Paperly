import { reactive } from 'vue'
import { extraEnglish } from './locales/en-US.js'
import { extraJapanese } from './locales/ja-JP.js'
import { englishErrors } from './locales/errors-en-US.js'
import { japaneseErrors } from './locales/errors-ja-JP.js'

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP']
export const languageState = reactive({ current: 'zh-CN' })

export function setLanguage(language) {
  languageState.current = SUPPORTED_LANGUAGES.includes(language) ? language : 'zh-CN'
}

export const translations = {
  'en-US': {
    ...englishErrors,
    ...extraEnglish,
    '纸间': 'PaperWriter',
    '书架': 'Library', '统计': 'Statistics', '设置': 'Settings',
    '回到书架': 'Back to library', '偏好设置': 'Preferences', '让写作更舒适': 'Make writing feel better',
    '外观主题': 'Appearance', '文章字体': 'Writing font', '编辑体验': 'Editor',
    'AI 写作助手': 'AI writing assistant', '应用设置': 'App settings', '纸间 · 设置': 'PaperWriter · Settings',
    '应用语言': 'App language', '简体中文': '简体中文', '英文': 'English', '日文': '日本語',
    '跟随系统': 'Follow system', '浅色': 'Light', '深色': 'Dark',
    '主题颜色': 'Accent color', '调整按钮与强调色': 'Change buttons and accents',
    '数据目录': 'Data folder', '立即备份数据': 'Back up now', '删除所有应用数据': 'Delete all app data',
    '软件版本': 'App version', '选择适合此刻的光线': 'Choose your preferred light',
    '雾蓝': 'Slate', '青玉': 'Jade', '紫藤': 'Plum', '珊瑚': 'Coral', '琥珀': 'Amber',
    '系统默认': 'System default', '思源宋体': 'Noto Serif', '霞鹜文楷': 'LXGW WenKai', '系统无衬线': 'System sans serif'
  },
  'ja-JP': {
    ...japaneseErrors,
    ...extraJapanese,
    '纸间': '紙間',
    '书架': '本棚', '统计': '統計', '设置': '設定',
    '回到书架': '本棚に戻る', '偏好设置': '環境設定', '让写作更舒适': '心地よい執筆のために',
    '外观主题': '外観テーマ', '文章字体': '本文フォント', '编辑体验': '編集体験',
    'AI 写作助手': 'AI 執筆アシスタント', '应用设置': 'アプリ設定', '纸间 · 设置': '紙間 · 設定',
    '应用语言': 'アプリの言語', '简体中文': '简体中文', '英文': 'English', '日文': '日本語',
    '跟随系统': 'システムに合わせる', '浅色': 'ライト', '深色': 'ダーク',
    '主题颜色': 'アクセントカラー', '调整按钮与强调色': 'ボタンと強調色を変更',
    '数据目录': 'データフォルダー', '立即备份数据': '今すぐバックアップ', '删除所有应用数据': 'アプリの全データを削除',
    '软件版本': 'アプリのバージョン', '选择适合此刻的光线': '今の気分に合う明るさを選ぶ',
    '雾蓝': 'スレート', '青玉': '翡翠', '紫藤': '藤色', '珊瑚': '珊瑚色', '琥珀': '琥珀色',
    '系统默认': 'システム標準', '思源宋体': '源ノ明朝', '霞鹜文楷': '霞鶩文楷', '系统无衬线': 'システムゴシック'
  }
}

export function t(key, values = {}) {
  const message = translations[languageState.current]?.[key] || key
  return message.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`)
}

const messagePatterns = {}
export function localizeMessage(message) {
  const original = String(message ?? '')
  const locale = languageState.current
  if (locale === 'zh-CN') return original
  if (translations[locale]?.[original]) return t(original)
  if (!messagePatterns[locale]) {
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    messagePatterns[locale] = Object.keys(translations[locale] || {}).filter(key => /\{\w+\}/.test(key)).map(key => {
      const names = [...key.matchAll(/\{(\w+)\}/g)].map(match => match[1])
      const parts = key.split(/(\{\w+\})/g)
      const expression = parts.map(part => /^\{\w+\}$/.test(part) ? '(.+?)' : escape(part)).join('')
      return { key, names, expression:new RegExp(`^${expression}$`) }
    })
  }
  for (const { key, names, expression } of messagePatterns[locale]) {
    const match = expression.exec(original)
    if (match) return t(key, Object.fromEntries(names.map((name, index) => [name, name === 'error' ? localizeMessage(match[index + 1]) : match[index + 1]])))
  }
  return original
}

export function localeTag() { return languageState.current }
