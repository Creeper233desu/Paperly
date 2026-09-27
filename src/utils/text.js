export const PAIRS = { '(': ')', '（': '）', '[': ']', '【': '】', '{': '}', '“': '”', '‘': '’', '「': '」', '《': '》' }

export function documentFromParagraphs(paragraphs) {
  return (paragraphs?.length ? paragraphs : ['']).join('\n')
}

export function paragraphsFromDocument(document) {
  return String(document).replace(/\r\n?/g, '\n').split('\n')
}

export function stripLegacyIndents(paragraphs, cursor = null) {
  let originalOffset = 0
  let nextCursor = cursor
  const cleaned = paragraphs.map((paragraph, index) => {
    let value = paragraph
    if (index && value.startsWith('\u3000\u3000')) {
      if (nextCursor !== null && cursor > originalOffset) nextCursor -= Math.min(2, cursor - originalOffset)
      value = value.slice(2)
    }
    originalOffset += paragraph.length + 1
    return value
  })
  return { paragraphs: cleaned, cursor: nextCursor }
}

export function editDocument(previous, value, cursor, autoPair = true) {
  const normalized = String(value).replace(/\r\n?/g, '\n')
  const hasCursor = Number.isFinite(cursor) && cursor >= 0
  const at = Math.max(0, Math.min(hasCursor ? cursor : normalized.length, normalized.length))
  if (normalized.length !== previous.length + 1) return { text: normalized, cursor: at }
  const inserted = normalized[at - 1]
  if (!autoPair) return { text: normalized, cursor: at }
  if (!PAIRS[inserted] || previous !== normalized.slice(0, at - 1) + normalized.slice(at)) return { text: normalized, cursor: at }
  return { text: normalized.slice(0, at) + PAIRS[inserted] + normalized.slice(at), cursor: at }
}

export function paragraphOffset(paragraphs, paragraphIndex, position = 0) {
  return paragraphs.slice(0, paragraphIndex).reduce((sum, paragraph) => sum + paragraph.length + 1, 0) + position
}

export function editParagraph(previous, value, cursor, autoPair = true) {
  const at = Math.max(0, Number.isFinite(cursor) ? cursor : value.length)
  if (value.includes('\n')) {
    const pieces = value.split(/\r?\n/)
    return { paragraphs: pieces, cursor: at - value.lastIndexOf('\n', at - 1) - 1, split: true }
  }
  if (!autoPair || value.length !== previous.length + 1) return { paragraphs: [value], cursor: at, split: false }
  const inserted = value[at - 1]
  if (!PAIRS[inserted] || previous !== value.slice(0, at - 1) + value.slice(at)) return { paragraphs: [value], cursor: at, split: false }
  return { paragraphs: [value.slice(0, at) + PAIRS[inserted] + value.slice(at)], cursor: at, split: false }
}

export function findMatches(paragraphs, query, caseSensitive = false) {
  if (!query) return []
  const needle = caseSensitive ? query : query.toLocaleLowerCase()
  const matches = []
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const haystack = caseSensitive ? paragraph : paragraph.toLocaleLowerCase()
    let from = 0, index
    while ((index = haystack.indexOf(needle, from)) !== -1) {
      matches.push({ paragraphIndex, start: index, end: index + query.length })
      from = index + Math.max(needle.length, 1)
    }
  })
  return matches
}

export function stepMatchIndex(current, count, direction) {
  if (!count) return -1
  if (current < 0) return direction < 0 ? count - 1 : 0
  return (current + direction + count) % count
}

export function replaceAt(paragraphs, match, replacement) {
  const copy = [...paragraphs]
  const text = copy[match.paragraphIndex]
  copy[match.paragraphIndex] = text.slice(0, match.start) + replacement + text.slice(match.end)
  return copy
}

export function replaceAll(paragraphs, query, replacement, caseSensitive = false) {
  const matches = findMatches(paragraphs, query, caseSensitive)
  const result = [...paragraphs]
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]
    result[match.paragraphIndex] = result[match.paragraphIndex].slice(0, match.start) + replacement + result[match.paragraphIndex].slice(match.end)
  }
  return { paragraphs: result, count: matches.length }
}
