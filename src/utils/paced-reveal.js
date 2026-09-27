// Show incremental content even when an Android WebView delivers the SSE body at once.
export function createPacedReveal(onUpdate, interval = 24) {
  const target = { content: '', thinking: '' }
  const shown = { content: '', thinking: '' }
  const waiting = []
  let timer = null, stride = 1
  const pending = () => target.content !== shown.content || target.thinking !== shown.thinking
  function advance(value, complete, amount) {
    if (!complete.startsWith(value)) value = ''
    return value + Array.from(complete.slice(value.length)).slice(0, amount).join('')
  }
  function tick() {
    timer = null
    if (shown.thinking !== target.thinking) shown.thinking = advance(shown.thinking, target.thinking, stride)
    else shown.content = advance(shown.content, target.content, stride)
    onUpdate({ ...shown })
    if (pending()) schedule()
    else while (waiting.length) waiting.shift()()
  }
  function schedule() { if (!timer && pending()) timer = setTimeout(tick, interval) }
  return {
    push(value) {
      target.content = String(value.content || '')
      target.thinking = String(value.thinking || '')
      stride = Math.max(stride, Math.ceil((Array.from(target.content).length + Array.from(target.thinking).length) / 120))
      schedule()
    },
    finish() { return pending() ? new Promise(resolve => { waiting.push(resolve); schedule() }) : Promise.resolve() }
  }
}
