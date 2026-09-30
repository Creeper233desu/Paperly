export function counterValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(number))) : 0
}
export function counterLabel(value, signed = false) {
  value = counterValue(value)
  return value > 0 && signed ? `+${value}` : String(value)
}

// Each digit travels through at most one revolution; even large deltas keep
// a bounded DOM and finish together. Places are keyed from the units column.
export function numberReels(previous, next, signed = false) {
  previous = counterValue(previous); next = counterValue(next)
  const from = String(Math.abs(previous)), to = String(Math.abs(next))
  const width = Math.max(from.length, to.length), direction = Math.abs(next) >= Math.abs(previous) ? 1 : -1
  const sign = value => value < 0 ? '−' : value > 0 && signed ? '+' : ' '
  const columns = [{ key:'sign', from:sign(previous), to:sign(next), sign:true }]
  for (let place = width - 1; place >= 0; place--) columns.push({ key:`digit-${place}`, from:from[from.length - 1 - place] || ' ', to:to[to.length - 1 - place] || ' ', place })
  return columns.map(column => {
    const rows = [column.from]
    if (column.from !== column.to) {
      if (column.sign || column.to === ' ') rows.push(column.to)
      else {
        let digit = column.from === ' ' ? (direction > 0 ? 9 : 0) : Number(column.from)
        do { digit = (digit + direction + 10) % 10; rows.push(String(digit)) } while (digit !== Number(column.to))
      }
    }
    return { ...column, rows }
  })
}
