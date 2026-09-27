import test from 'node:test'
import assert from 'node:assert/strict'

test('cursor animation options load with defaults and persist custom appearance', async () => {
  let stored = ''
  globalThis.uni = {
    getStorageSync: () => stored,
    setStorageSync: (_, value) => { stored = value },
    getSystemInfoSync: () => ({ theme: 'light' })
  }
  const settings = await import(`../src/store/preferences.js?cursor-options=${Date.now()}`)
  const prefs = settings.loadPreferences()
  assert.equal(prefs.animatedCursor, true)
  assert.equal(prefs.cursorTrailLength, 32)
  settings.updatePreferences({ animatedCursor: false, cursorTrailColor: '#a48bc6', cursorTrailLength: 48 })
  assert.deepEqual(JSON.parse(stored).cursorTrailColor, '#a48bc6')
  assert.equal(JSON.parse(stored).cursorTrailLength, 48)
  assert.equal(prefs.animatedCursor, false)
})
