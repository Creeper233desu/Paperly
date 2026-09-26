import test from 'node:test'
import assert from 'node:assert/strict'
import { navigatePrimary, primaryNavigation } from '../src/store/navigation.js'

test('book navigation returns to the existing shelf page', () => {
  const calls = []
  globalThis.getCurrentPages = () => [{ route: 'pages/library/index' }, { route: 'pages/book/index' }]
  globalThis.uni = { navigateBack: options => calls.push(options) }
  primaryNavigation.active = 'library'
  primaryNavigation.busy = false
  navigatePrimary('library')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].delta, 1)
  assert.equal(calls[0].animationType, 'slide-out-right')
})

test('primary tabs share the shelf page and switch without stacking a new page', () => {
  const calls = []
  globalThis.getCurrentPages = () => [{ route: 'pages/library/index' }]
  globalThis.uni = { navigateTo: options => calls.push(options), navigateBack: options => calls.push(options) }
  primaryNavigation.busy = false
  navigatePrimary('settings')
  assert.equal(primaryNavigation.active, 'settings')
  navigatePrimary('statistics')
  assert.equal(primaryNavigation.active, 'statistics')
  assert.equal(calls.length, 0)
})
