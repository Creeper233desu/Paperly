import test from 'node:test'
import assert from 'node:assert/strict'
import { clampFontSize, scaleFontSize, touchDistance } from '../src/utils/font-scale.js'
test('reader and editor scale identically within the shared slider range', () => {
  assert.equal(scaleFontSize(18, 1.2), 22)
  assert.equal(scaleFontSize(18, .8), 14)
  assert.equal(scaleFontSize(30, 2), 36)
  assert.equal(scaleFontSize(12, .5), 12)
  assert.equal(clampFontSize(NaN,22),22)
  assert.equal(touchDistance([{ clientX:0,clientY:0 },{ clientX:30,clientY:40 }]),50)
  assert.equal(touchDistance([{ clientX:0,clientY:0 }]),0)
})
