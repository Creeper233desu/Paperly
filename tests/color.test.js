import test from 'node:test'
import assert from 'node:assert/strict'
import { hexToHsv, hsvToHex } from '../src/utils/color.js'

test('custom cursor picker converts colors and keeps selected hues', () => {
  assert.equal(hsvToHex(0, 100, 100), '#ff0000')
  assert.equal(hsvToHex(120, 100, 100), '#00ff00')
  assert.equal(hsvToHex(240, 100, 100), '#0000ff')
  const original = '#819bcb'
  const hsv = hexToHsv(original)
  const recreated = hsvToHex(hsv.hue, hsv.saturation, hsv.value)
  const channels = [1, 3, 5].map(index => Math.abs(parseInt(original.slice(index, index + 2), 16) - parseInt(recreated.slice(index, index + 2), 16)))
  assert.ok(channels.every(delta => delta <= 2))
})
