const integer = value => Math.floor(Number(value) || 0)
// A range is zero-based with an exclusive end, matching String.slice and DOM
// selections. Non-empty text always keeps at least one character selected.
export function textRange(length, start = 0, end = length) {
  length = Math.max(0, integer(length))
  if (!length) return { start: 0, end: 0 }
  start = Math.max(0, Math.min(length - 1, integer(start)))
  end = Math.max(start + 1, Math.min(length, integer(end)))
  return { start, end }
}
export function moveRangeEdge(length, range, side, value) {
  const current = textRange(length, range.start, range.end)
  if (side === 'start') return textRange(length, Math.min(integer(value), current.end - 1), current.end)
  return textRange(length, current.start, Math.max(current.start + 1, integer(value)))
}
export function rangeOffsetAt(clientX, bounds, length) {
  if (!bounds?.width) return 0
  return Math.round(Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)) * length)
}
