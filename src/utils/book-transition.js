export const BOOK_MOTION_MS = 520
export const BOOK_COVER_COLORS = ['#58718e', '#807c9a', '#66887e', '#947d72']

export function bookCardId(id) {
  return 'shelf-book-' + [...String(id)].map(char => /[\w-]/.test(char) ? char : `-${char.codePointAt(0).toString(16)}-`).join('')
}

export function usableRect(rect) {
  return !!rect && ['left', 'top', 'width', 'height'].every(key => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0
}

// Query the component which owns the nodes, rather than crossing native page
// boundaries. The result is in viewport coordinates, including scroll offsets.
export function readBookRects(owner, selectors) {
  return new Promise(resolve => {
    let finished = false
    const finish = result => { if (finished) return; finished = true; clearTimeout(timer); resolve(result) }
    const timer = setTimeout(() => finish(null), 240)
    try {
      const keys = Object.keys(selectors)
      const query = uni.createSelectorQuery().in(owner)
      for (const selector of Object.values(selectors)) query.select(selector).fields({ rect:true, size:true, computedStyle:['font-size', 'font-weight', 'line-height', 'color', 'border-radius'] })
      query.exec(results => {
        const rects = Object.fromEntries(keys.map((key, index) => [key, results?.[index]]))
        finish(keys.every(key => usableRect(rects[key])) ? rects : null)
      })
    } catch { finish(null) }
  })
}

export function sharedRectStyle(rect, viewport) {
  if (!usableRect(rect) || !usableRect(viewport)) return {}
  return {
    width:`${rect.width}px`, height:`${rect.height}px`,
    transform:`translate3d(${rect.left - viewport.left}px,${rect.top - viewport.top}px,0)`,
    ...(rect['font-size'] ? { fontSize:rect['font-size'] } : {}),
    ...(rect['font-weight'] ? { fontWeight:rect['font-weight'] } : {}),
    ...(rect['line-height'] ? { lineHeight:rect['line-height'] } : {}),
    ...(rect.color ? { color:rect.color } : {}),
    ...(rect['border-radius'] ? { borderRadius:rect['border-radius'] } : {})
  }
}
