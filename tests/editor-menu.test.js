import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../components/DocumentInput.vue', import.meta.url), 'utf8')
const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]

function optionsFor(index, globals = {}) {
  const context = { module: { exports: {} }, ...globals }
  runInNewContext(scripts[index][1].replace('export default', 'module.exports ='), context)
  return context.module.exports
}

test('custom selection menu copies, cuts, pastes and selects all using the stored range', () => {
  let clipboard = ''
  const events = []
  const uni = {
    setClipboardData: ({ data, success }) => { clipboard = data; success() },
    getClipboardData: ({ success }) => success({ data: clipboard }),
    showToast: () => {}
  }
  const options = optionsFor(0, { uni, setTimeout: () => 1 })
  const editor = {
    value: '甲乙丙', menu: { open: true, closing: false, start: 1, end: 2 },
    cursorRequest: { seq: 0 }, menuSeq: 0, menuRequest: null, renderReady: true,
    $emit: (name, payload) => events.push({ name, payload })
  }
  for (const [name, method] of Object.entries(options.methods)) editor[name] = method.bind(editor)
  editor.runMenuAction('copy')
  assert.equal(clipboard, '乙')
  assert.equal(events.filter(item => item.name === 'input').length, 0)

  editor.menu = { open: true, closing: false, start: 1, end: 2 }
  editor.runMenuAction('cut')
  assert.equal(events.at(-2).payload.detail.value, '甲丙')
  assert.equal(editor.menuRequest.start, 1)
  editor.value = '甲丙'
  editor.menu = { open: true, closing: false, start: 1, end: 1 }
  editor.runMenuAction('paste')
  assert.equal(events.at(-2).payload.detail.value, '甲乙丙')
  assert.equal(events.at(-2).payload.detail.source, 'menu')

  editor.value = '甲乙丙'
  editor.menu = { open: true, closing: false, start: 1, end: 1 }
  editor.runMenuAction('all')
  assert.equal(editor.menuRequest.start, 0)
  assert.equal(editor.menuRequest.end, 3)
})

test('editor activation schedules the animated caret after a new page mount', () => {
  let selectionRequests = 0, caretSchedules = 0
  const options = optionsFor(1, { requestAnimationFrame: callback => callback() })
  const editor = {
    pendingRequest: { seq: 2 },
    onRequest: () => { selectionRequests++ },
    scheduleCaret: () => { caretSchedules++ },
    hideCaret: () => {}
  }
  options.methods.onActiveChange.call(editor, true)
  assert.equal(selectionRequests, 1)
  assert.equal(caretSchedules, 1)
})
