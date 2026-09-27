const KEY = 'paperwriter.imageExportDraft.v1'

// Keep the selected text outside the page URL. This also survives the short page transition.
export function prepareImageExport(draft) {
  const payload = { ...draft, createdAt: Date.now() }
  uni.setStorageSync(KEY, JSON.stringify(payload))
}

export function takeImageExport() {
  try {
    const value = uni.getStorageSync(KEY)
    uni.removeStorageSync(KEY)
    const draft = typeof value === 'string' ? JSON.parse(value) : value
    return draft && Date.now() - draft.createdAt < 60000 ? draft : null
  } catch (_) { return null }
}
