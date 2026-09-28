export const IMAGE_PREFIX = '\uFFFCimage:'
const IMAGE_LINE = /^\uFFFCimage:([a-z0-9-]+)$/i

export function imageMarker(id) { return `${IMAGE_PREFIX}${id}` }
export function imageIdFromParagraph(paragraph) { return String(paragraph || '').match(IMAGE_LINE)?.[1] || '' }
export function textOnlyParagraphs(paragraphs) { return (paragraphs || []).filter(paragraph => !imageIdFromParagraph(paragraph)) }
export function textOnlyDocument(value) { return String(value || '').split('\n').filter(line => !imageIdFromParagraph(line)).join('\n') }

export function insertImageAt(body, cursor, id) {
  const text = String(body || '')
  const at = Math.max(0, Math.min(text.length, Number(cursor) || 0))
  const prefix = at && text[at - 1] !== '\n' ? '\n' : ''
  const suffix = at < text.length && text[at] !== '\n' ? '\n' : ''
  const insertion = `${prefix}${imageMarker(id)}${suffix}`
  return { text: text.slice(0, at) + insertion + text.slice(at), cursor: at + insertion.length }
}

export function removeImageFromDocument(body, id) {
  const lines = String(body || '').split('\n').filter(line => line !== imageMarker(id))
  return lines.join('\n') || ''
}
