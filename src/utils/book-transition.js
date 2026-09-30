export const BOOK_COVER_COLORS = ['#58718e', '#807c9a', '#66887e', '#947d72']

export function bookCardId(id) {
  return 'shelf-book-' + [...String(id)].map(char => /[\w-]/.test(char) ? char : `-${char.codePointAt(0).toString(16)}-`).join('')
}
