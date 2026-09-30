export const DATE_FORMATS = ['zh-CN', 'en-US', 'ja-JP']
export const defaultDateFormat = language => DATE_FORMATS.includes(language) ? language : 'zh-CN'

const weekdays = {
  'zh-CN': ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  'ja-JP': ['日', '月', '火', '水', '木', '金', '土'],
  'en-US': ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
}
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const twoDigits = number => String(number).padStart(2, '0')

function asDate(value) {
  if (value === null || value === undefined || value === '') return null
  // Statistics keys represent local calendar days, not UTC timestamps.
  const day = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (day) {
    const date = new Date(0)
    date.setHours(12, 0, 0, 0)
    date.setFullYear(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    return date.getFullYear() === Number(day[1]) && date.getMonth() + 1 === Number(day[2]) && date.getDate() === Number(day[3]) ? date : null
  }
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

// Explicit layouts avoid differences in Android's locale/Intl support.
export function formatDisplayDate(value, format = 'zh-CN', { includeTime = false } = {}) {
  const date = asDate(value)
  if (!date) return ''
  format = defaultDateFormat(format)
  const year = date.getFullYear(), month = date.getMonth(), day = date.getDate(), weekday = weekdays[format][date.getDay()]
  const text = format === 'en-US' ? `${weekday} ${months[month]} ${twoDigits(day)} ${year}`
    : format === 'ja-JP' ? `${year}年${month + 1}月${day}日（${weekday}）`
    : `${year}年${month + 1}月${day}日，${weekday}`
  return includeTime ? `${text} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}` : text
}
