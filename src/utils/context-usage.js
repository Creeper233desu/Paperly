// Provider tokenizers differ. This estimate is for an input preview, not billing.
export function estimateTokens(value) {
  const text = String(value || '')
  const han = (text.match(/[\u3400-\u9fff]/g) || []).length
  return Math.ceil(han * 1.2 + (text.length - han) / 4)
}

export function contextUsage({ system = '', summary = '', messages = [], draft = '', limit = 0 }) {
  const book = estimateTokens(system)
  const older = estimateTokens(summary)
  const recent = messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0)
  const question = estimateTokens(draft)
  const total = book + older + recent + question
  const window = Math.max(0, Number(limit) || 0)
  return { book, older, recent, question, total, window, percent: window ? Math.min(100, Math.round(total / window * 100)) : 0 }
}

export function formatTokenCount(value) {
  const number = Math.max(0, Number(value) || 0)
  return number >= 1000 ? `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k` : String(Math.round(number))
}
