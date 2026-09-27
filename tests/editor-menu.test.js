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
    updateFocus: () => {},
    scheduleCaret: () => { caretSchedules++ },
    hideCaret: () => {}
  }
  options.methods.onActiveChange.call(editor, true)
  assert.equal(selectionRequests, 1)
  assert.equal(caretSchedules, 1)
})

test('saved focus mode highlights the remembered paragraph when the editor reopens', () => {
  const ownerOptions = optionsFor(0)
  assert.notEqual(ownerOptions.computed.focusPayload.call({ focusMode: true, renderReady: false }), ownerOptions.computed.focusPayload.call({ focusMode: true, renderReady: true }))
  assert.notEqual(ownerOptions.computed.visualPayload.call({ animatedCursor: true, cursorStyle: 'beam', cursorTrailColor: '#819bcb', cursorTrailLength: 32, renderReady: false }), ownerOptions.computed.visualPayload.call({ animatedCursor: true, cursorStyle: 'beam', cursorTrailColor: '#819bcb', cursorTrailLength: 32, renderReady: true }))
  const options = optionsFor(1, { document: { activeElement: null } })
  const dimmed = []
  const editor = {
    editor: {}, pendingRequest: { start: 2 },
    getOffsets: () => null,
    readValue: () => '甲\n乙\n丙',
    blocks: () => [0, 1, 2].map(index => ({ classList: { toggle: (_, value) => { dimmed[index] = value } } }))
  }
  editor.updateFocus = options.methods.updateFocus.bind(editor)
  options.methods.onFocusMode.call(editor, '{"enabled":true,"ready":true}')
  assert.deepEqual(dimmed, [true, false, true])
})

test('focus toggling repairs a stale empty view without replacing unsaved text', () => {
  const scrollRoot = { scrollTop: 480 }
  const options = optionsFor(1, { document: { activeElement: null, scrollingElement: scrollRoot }, requestAnimationFrame: callback => callback() })
  let visible = '起笔'
  const sent = []
  const editor = {
    editor: { isContentEditable: true }, ready: true,
    blocks: () => [{ textContent: visible }],
    readValue: () => visible,
    renderValue: value => { visible = value; scrollRoot.scrollTop = 0 },
    getOffsets: () => ({ start: visible.length, end: visible.length }),
    updateFocus: () => {}, scheduleCaret: () => {}, reportCursor: () => {},
    $ownerInstance: { callMethod: (name, detail) => sent.push({ name, detail }) }
  }
  options.methods.onValueChange.call(editor, JSON.stringify({ id: 'a', revision: 0, value: '起笔' }))
  visible = '起笔之后'
  options.methods.reportInput.call(editor)
  options.methods.onValueChange.call(editor, JSON.stringify({ id: 'a', revision: 0, value: '起笔' }))
  assert.equal(visible, '起笔之后')
  visible = ''
  options.methods.onFocusMode.call(editor, JSON.stringify({ enabled: true, ready: true }))
  assert.equal(visible, '起笔之后')
  assert.equal(scrollRoot.scrollTop, 480)
  assert.equal(sent.find(item => item.name === 'onChange').detail.value, '起笔之后')
  options.methods.onValueChange.call(editor, JSON.stringify({ id: 'b', revision: 1, value: '另一篇' }))
  options.methods.onValueChange.call(editor, JSON.stringify({ id: 'a', revision: 0, value: '过期内容' }))
  assert.equal(visible, '另一篇')
  assert.equal(scrollRoot.scrollTop, 480)
  options.methods.onValueChange.call(editor, JSON.stringify({ id: 'empty', revision: 2, value: '' }))
  options.methods.onFocusMode.call(editor, JSON.stringify({ enabled: true, ready: true, documentId: 'empty', revision: 2, value: '' }))
  assert.equal(visible, '')
})

test('first focus toggle restores a newly typed article from its owner snapshot', () => {
  const options = optionsFor(1, { document: { activeElement: null, scrollingElement: { scrollTop: 0 } } })
  let visible = ''
  const editor = {
    editor: {}, documentId: 'new', localValue: '', awaitingEcho: false,
    readValue: () => visible, renderValue: value => { visible = value }, updateFocus: () => {}
  }
  options.methods.onFocusMode.call(editor, JSON.stringify({ enabled: true, ready: true, documentId: 'new', value: '新正文' }))
  assert.equal(visible, '新正文')
  assert.equal(editor.focusMode, true)
})

test('an empty new article becomes editable without Vue owning paragraph nodes', () => {
  const options = optionsFor(1, { document: { activeElement: null, scrollingElement: { scrollTop: 0 } }, requestAnimationFrame: callback => callback() })
  let blocks = []
  let ready = 0
  const editor = {
    editor: { isContentEditable: true },
    blocks: () => blocks, readValue: () => blocks.map(block => block.textContent).join('\n'),
    renderValue: value => { blocks = [{ textContent: value }] },
    getOffsets: () => null, updateFocus: () => {}, scheduleCaret: () => {},
    $ownerInstance: { callMethod: name => { if (name === 'onRenderReady') ready++ } }
  }
  options.methods.onValueChange.call(editor, JSON.stringify({ id: 'new', revision: 0, value: '' }))
  assert.equal(blocks.length, 1)
  assert.equal(ready, 1)
})

test('toolbar requests restore scroll and search requests animate to a match', () => {
  const scrollRoot = { scrollTop: 460 }
  const options = optionsFor(1, {
    document: { scrollingElement: scrollRoot },
    requestAnimationFrame: callback => callback(),
    setTimeout: callback => { callback(); return 1 }
  })
  const selections = []
  let revealed = 0
  const editor = {
    editor: { focus: () => { scrollRoot.scrollTop = 0 } }, active: true, documentId: 'a',
    readValue: () => '正文', renderValue: () => {}, updateFocus: () => {},
    setSelection: (start, end, animate) => selections.push({ start, end, animate }),
    reportCursor: () => {}, revealCaret: () => { revealed++ },
    $nextTick: callback => callback()
  }
  options.methods.onRequest.call(editor, { seq: 1, documentId: 'a', start: 1, end: 1, value: '正文', preserveScroll: true })
  assert.equal(scrollRoot.scrollTop, 460)
  options.methods.onRequest.call(editor, { seq: 2, documentId: 'a', start: 2, end: 2, value: '正文', animate: true, reveal: true, preserveScroll: false })
  assert.equal(selections[1].animate, true)
  assert.equal(selections[1].start, 2)
  assert.equal(revealed, 1)
})

test('typing suppresses cursor motion while deliberate navigation enables it', () => {
  const options = optionsFor(1)
  const animations = []
  const editor = {
    getOffsets: () => ({ start: 2, end: 2 }),
    $ownerInstance: { callMethod: () => {} },
    updateFocus: () => {},
    scheduleCaret: animate => animations.push(animate)
  }
  options.methods.reportCursor.call(editor)
  options.methods.reportCursor.call(editor, true)
  assert.deepEqual(animations, [false, true])
})

test('focus mode and cursor animation update independently', () => {
  const options = optionsFor(1, { document: { activeElement: null } })
  const editor = {
    editor: null, focusMode: true, animatedCursor: true,
    updateFocus: () => {}, hideCaret: () => {}, scheduleCaret: () => {}
  }
  options.methods.onVisualSettings.call(editor, JSON.stringify({ enabled: false, style: 'neovim', color: '#819bcb', length: 32, ready: true }))
  assert.equal(editor.focusMode, true)
  assert.equal(editor.animatedCursor, false)
  assert.equal(editor.cursorStyle, 'neovim')
  options.methods.onFocusMode.call(editor, JSON.stringify({ enabled: false, ready: true }))
  assert.equal(editor.focusMode, false)
  assert.equal(editor.animatedCursor, false)
})
