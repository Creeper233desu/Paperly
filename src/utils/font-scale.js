export const MIN_FONT_SIZE = 12
export const MAX_FONT_SIZE = 36
export function clampFontSize(value, fallback = 18) {
  const size = Number(value)
  return Number.isFinite(size) ? Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(size))) : fallback
}
export function scaleFontSize(current, ratio) {
  return Number.isFinite(ratio) && ratio > 0 ? clampFontSize(current * ratio) : current
}
export function touchDistance(touches) {
  return touches?.length === 2 ? Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY) : 0
}
