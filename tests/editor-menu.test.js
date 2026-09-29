import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../components/DocumentInput.vue', import.meta.url), 'utf8')
const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]

function optionsFor(index, globals = {}) {
  const context = { module: { exports: {} }, t: value => value, ...globals }
  runInNewContext(scripts[index][1].replace(/^import\s+\{\s*t\s*\}\s+from\s+['"][^'"]+['"]\s*;?\s*/m, '').replace('export default', 'module.exports ='), context)
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

test('selected text can be sent to AI without changing the document', () => {
  const events = []
  const options = optionsFor(0, { uni: {}, setTimeout: () => 1 })
  const editor = { value: '甲乙丙', documentId: 'article-1', menu: { open: true, closing: false, start: 1, end: 2 }, $emit: (name, payload) => events.push({ name, payload }) }
  editor.closeMenu = options.methods.closeMenu.bind(editor)
  options.methods.runMenuAction.call(editor, 'ask')
  assert.equal(events.length, 1)
  assert.equal(events[0].name, 'ask-ai')
  assert.equal(events[0].payload.text, '乙')
})

test('selected text can open image export without changing the document', () => {
  const events = []
  const options = optionsFor(0, { uni: {}, setTimeout: () => 1 })
  const editor = { value: '甲乙丙', documentId: 'article-1', menu: { open: true, closing: false, start: 1, end: 3 }, $emit: (name, payload) => events.push({ name, payload }) }
  editor.closeMenu = options.methods.closeMenu.bind(editor)
  options.methods.runMenuAction.call(editor, 'export')
  assert.equal(events.length, 1)
  assert.equal(events[0].name, 'export-image')
  assert.deepEqual(JSON.parse(JSON.stringify(events[0].payload)), { text: '乙丙', start: 1, end: 3, documentId: 'article-1' })
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

test('the native fallback hands off immediately when the paragraph editor is ready', () => {
  const options = optionsFor(0)
  const editor = { fallbackFocus: true, renderReady: false, pendingReady: false }
  options.methods.onRenderReady.call(editor)
  assert.equal(editor.renderReady, true)
  assert.equal(editor.pendingReady, false)
})

test('renderjs binds the current editor host and asks the owner to replay its state', () => {
  const calls = []
  const nativeEditor = { isContentEditable: false, setAttribute: () => {}, addEventListener: () => {} }
  const currentHost = {
    id: 'paper-editor-current',
    classList: { contains: name => name === 'document-input-host' },
    querySelector: selector => selector === '.document-input' ? nativeEditor : { style: {} }
  }
  const options = optionsFor(1, {
    document: { getElementById: id => id === currentHost.id ? currentHost : null, addEventListener: () => {}, removeEventListener: () => {} },
    window: {}
  })
  const editor = {
    hostId: currentHost.id,
    $el: { classList: { contains: () => true } },
    $ownerInstance: { callMethod: (name, id) => calls.push({ name, id }) }
  }
  for (const [name, method] of Object.entries(options.methods)) editor[name] = method.bind(editor)
  editor.attachEditor()
  assert.equal(editor.host, currentHost)
  assert.equal(editor.editor, nativeEditor)
  assert.deepEqual(calls, [{ name: 'onRenderMounted', id: currentHost.id }])
  editor.attachEditor()
  assert.equal(calls.length, 1)
})

test('a fresh render mount replays focus and cursor settings independently', () => {
  const options = optionsFor(0)
  const editor = { hostId: 'paper-editor-new', bridgeEpoch: 0, documentId: 'a', documentRevision: 0, value: '正文', focusMode: true, focusSnapshot: '正文', animatedCursor: true, cursorStyle: 'beam', cursorTrailColor: '#819bcb', cursorTrailLength: 32, renderReady: false }
  const before = [options.computed.documentPayload.call(editor), options.computed.focusPayload.call(editor), options.computed.visualPayload.call(editor)]
  options.methods.onRenderMounted.call(editor, 'paper-editor-old')
  assert.equal(editor.bridgeEpoch, 0)
  options.methods.onRenderMounted.call(editor, editor.hostId)
  const after = [options.computed.documentPayload.call(editor), options.computed.focusPayload.call(editor), options.computed.visualPayload.call(editor)]
  assert.equal(editor.bridgeEpoch, 1)
  assert.ok(after.every((payload, index) => payload !== before[index]))
  assert.equal(JSON.parse(after[1]).enabled, true)
  assert.equal(JSON.parse(after[2]).enabled, true)
})

test('paragraph updates retain unchanged nodes and wait to refresh focus until selection is restored', () => {
  function node() {
    return {
      className: '', children: [], parent: null, _text: '',
      get classList() { return { contains: name => this.className === name } },
      get textContent() { return this._text || this.children.map(child => child.textContent).join('') },
      set textContent(value) { this._text = value; this.children = [] },
      get firstChild() { return this.children[0] || null },
      appendChild(child) { child.parent = this; this.children.push(child) },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1) },
      remove() { this.parent?.removeChild(this) },
      querySelector: tag => tag === 'br' ? this.children.find(child => child.tag === 'br') : null
    }
  }
  const options = optionsFor(1, { document: { createElement: tag => Object.assign(node(), { tag }) } })
  const editor = { editor: node(), updateFocus: () => { throw new Error('focus updated before the new selection') } }
  editor.blocks = options.methods.blocks.bind(editor)
  options.methods.renderValue.call(editor, '第一段\n第二段')
  const first = editor.editor.children[0]
  options.methods.renderValue.call(editor, '第一段\n改写段')
  assert.equal(editor.editor.children[0], first)
  assert.equal(editor.editor.children[1].textContent, '改写段')
  assert.equal(editor.editor.children.length, 2)
})

test('an external text update restores the requested caret before refreshing focus', () => {
  const steps = []
  const nativeEditor = {}
  let visible = '第一段\n第二段'
  const options = optionsFor(1, { document: { activeElement: nativeEditor, scrollingElement: { scrollTop: 0 } }, requestAnimationFrame: () => 1 })
  const editor = {
    editor: nativeEditor, documentId: 'a', documentRevision: 0, localValue: visible, ready: true,
    pendingRequest: { documentId: 'a', start: 6, value: '第一段\n改写段' },
    blocks: () => [{}, {}], readValue: () => visible, getOffsets: () => ({ start: 0, end: 0 }),
    renderValue: value => { steps.push('render'); visible = value },
    setSelection: () => steps.push('selection'), updateFocus: () => steps.push('focus'), scheduleCaret: () => {}
  }
  options.methods.onValueChange.call(editor, JSON.stringify({ id: 'a', revision: 0, value: '第一段\n改写段' }))
  assert.deepEqual(steps, ['render', 'selection', 'focus'])
  assert.equal(editor.lastFocusOffset, 6)
})

test('the beam cursor keeps a visibly thick, solid trail', () => {
  const timers = []
  const nativeEditor = { style: {} }
  const range = { getClientRects: () => [{ left: 88, top: 20, height: 28 }], startContainer: { nodeType: 1 } }
  const options = optionsFor(1, {
    document: { activeElement: nativeEditor },
    window: { getSelection: () => ({ rangeCount: 1, isCollapsed: true, getRangeAt: () => range }), getComputedStyle: () => ({ fontSize: '20px' }) },
    setTimeout: callback => { timers.push(callback); return timers.length }, clearTimeout: () => {}
  })
  const editor = {
    editor: nativeEditor, glow: { style: {} }, trail: { style: {} }, host: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    active: true, animatedCursor: true, cursorStyle: 'beam', trailColor: '#123456', trailLength: 32,
    previousPoint: { x: 10, y: 22 }, hideCaret: () => {}, hideJelly: () => {}
  }
  options.methods.positionCaret.call(editor, true)
  assert.equal(editor.glow.style.width, '6px')
  assert.equal(editor.trail.style.background, '#123456')
  assert.equal(editor.trail.style.height, '19px')
  assert.equal(editor.trail.style.opacity, '1')
  editor.cursorStyle = 'neovim'
  editor.setJellyTarget = () => true
  options.methods.positionCaret.call(editor, true)
  assert.equal(editor.trail.style.opacity, '0')
  assert.equal(editor.trail.style.transition, 'none')
})

test('the Neovim cursor stays connected, follows the trail setting and settles after navigation', () => {
  const frames = []
  const makeSvgNode = () => ({ style: {}, attributes: {}, children: [], setAttribute(name, value) { this.attributes[name] = value }, appendChild(child) { this.children.push(child) } })
  const options = optionsFor(1, {
    document: { createElementNS: () => makeSvgNode() },
    window: { matchMedia: () => ({ matches: false }) },
    performance: { now: () => 0 },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length },
    cancelAnimationFrame: () => {}
  })
  const editor = { jellyLayer: makeSvgNode(), trailColor: '#123456', trailLength: 64 }
  for (const [name, method] of Object.entries(options.methods)) editor[name] = method.bind(editor)
  editor.setJellyTarget(10, 10, 20, 30, false)
  const staticPath = editor.jellyPath.attributes.d
  editor.setJellyTarget(40, 10, 20, 30, true)
  const firstFrame = frames.shift()
  firstFrame(16)
  const width = () => Math.max(...editor.jellyCorners.map(point => point.x)) - Math.min(...editor.jellyCorners.map(point => point.x))
  assert.ok(width() > 20)
  assert.notEqual(editor.jellyPath.attributes.d, staticPath)
  const beforeRepeat = editor.jellyCorners[0].x
  editor.setJellyTarget(40, 10, 20, 30, true)
  assert.equal(editor.jellyCorners[0].x, beforeRepeat)
  let time = 32, steps = 0
  while (frames.length && steps++ < 80) frames.shift()(time += 16)
  assert.ok(steps < 80)
  assert.ok(Math.abs(editor.jellyCorners[0].x - 40) < .01)
  for (const x of [70, 100, 130]) editor.setJellyTarget(x, 10, 20, 30, true)
  frames.shift()(time += 16)
  assert.ok(width() <= 84.1)
  assert.ok(editor.jellyCorners.length >= 4)
  steps = 0
  while (frames.length && steps++ < 80) frames.shift()(time += 16)
  assert.ok(steps < 80)
  editor.setJellyTarget(50, 240, 20, 30, true)
  assert.notEqual(editor.jellyCorners[0].y, 240)
  assert.ok(frames.length > 0)
  frames.shift()(time += 16)
  assert.ok(Math.max(...editor.jellyCorners.map(point => point.y)) - Math.min(...editor.jellyCorners.map(point => point.y)) <= 94.1)
  editor.setJellyTarget(60, 50, 20, 30, false)
  assert.equal(editor.jellyCorners[0].x, 60)
  editor.trailLength = 8
  editor.setJellyTarget(160, 50, 20, 30, true)
  frames.shift()(time += 16)
  const shortWidth = width()
  assert.ok(shortWidth <= 28.1)
  editor.setJellyTarget(60, 50, 20, 30, false)
  editor.trailLength = 96
  editor.setJellyTarget(160, 50, 20, 30, true)
  frames.shift()(time += 16)
  assert.ok(width() > shortWidth + 20)
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
