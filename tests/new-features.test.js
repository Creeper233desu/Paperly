import test from 'node:test'
import assert from 'node:assert/strict'
import { editDocument } from '../src/utils/text.js'
import { applyStructureToSnapshot, bookContext, planBookEdit, rebaseBookEdit, validateStructureProposal } from '../src/services/assistant.js'
import { createTextPng, layoutImageText, paintTextImage } from '../src/services/image-export.js'

test('corner quotes pair at the caret', () => {
  assert.deepEqual(editDocument('甲乙', '甲「乙', 2), { text: '甲「」乙', cursor: 2 })
})

const book = { chapters: [{ id: 'ch', title: '第一章', articles: [{ id: 'a', title: '开篇', paragraphs: ['甲乙丙'] }] }] }
test('AI changes are scoped and anchored, including insertion at the beginning', () => {
  const insert = planBookEdit(book, { name: 'insert_text', args: { article_id: 'a', after: '', text: '序' } }, 'a', '甲乙丙')
  assert.equal(insert.after, '序甲乙丙')
  assert.equal(insert.chapterId, 'ch')
  const remove = planBookEdit(book, { name: 'delete_text', args: { article_id: 'a', text: '乙' } }, 'a', '甲乙丙')
  assert.equal(remove.after, '甲丙')
  assert.throws(() => planBookEdit(book, { name: 'delete_text', args: { article_id: 'outside', text: '乙' } }, 'a', '甲乙丙'), /不属于当前书本/)
  assert.throws(() => planBookEdit(book, { name: 'delete_text', args: { article_id: 'a', text: '甲' } }, 'a', '甲甲'), /不唯一/)
})

test('a second independent AI proposal safely rebases after the first is accepted', () => {
  const first = planBookEdit(book, { name: 'insert_text', args: { article_id: 'a', after: '甲', text: '新' } }, 'a', '甲乙丙')
  const second = planBookEdit(book, { name: 'delete_text', args: { article_id: 'a', text: '乙' } }, 'a', '甲乙丙')
  const updated = { chapters: [{ id: 'ch', title: '第一章', articles: [{ id: 'a', title: '开篇', paragraphs: first.paragraphs }] }] }
  assert.equal(rebaseBookEdit(updated, second, 'a', first.after).after, '甲新丙')
  assert.throws(() => rebaseBookEdit(updated, second, 'a', '甲新乙乙丙'), /不唯一/)
})

test('AI chapter and article proposals stay scoped and reject stale destructive changes', () => {
  const draft = structuredClone(book)
  const add = planBookEdit(draft, { name: 'add_article', args: { chapter_id: 'ch', title: '续篇' } }, 'a', '甲乙丙')
  assert.equal(add.kind, 'structure')
  assert.equal(validateStructureProposal(draft, add), true)
  applyStructureToSnapshot(draft, add)
  assert.equal(draft.chapters[0].articles[1].title, '续篇')
  const rename = planBookEdit(draft, { name: 'rename_article', args: { article_id: add.operation.args.assigned_id, title: '终篇' } }, 'a', '甲乙丙')
  applyStructureToSnapshot(draft, rename)
  assert.equal(draft.chapters[0].articles[1].title, '终篇')
  const remove = planBookEdit(draft, { name: 'delete_chapter', args: { chapter_id: 'ch' } }, 'a', '甲乙丙')
  draft.chapters[0].articles[0].updatedAt = 'new-save-time'
  assert.equal(validateStructureProposal(draft, remove), true)
  draft.chapters[0].articles[0].paragraphs = ['正文已变化']
  assert.equal(validateStructureProposal(draft, remove), false)
  assert.throws(() => applyStructureToSnapshot(draft, remove), /已变化/)
  assert.throws(() => planBookEdit(draft, { name: 'delete_article', args: { article_id: 'outside' } }, 'a', '甲乙丙'), /不属于当前书本/)
})

test('custom AI prompt is included with current book context', () => {
  const context = bookContext({ ...book, title: '测试书', author: '作者' }, 'a', '未保存草稿', '草稿', '请保持简洁。')
  assert.match(context, /请保持简洁/)
  assert.match(context, /未保存草稿/)
  assert.match(context, /用户选中的文字：草稿/)
})

test('PNG layout includes all selected lines, optional heading and app mark', () => {
  const calls = []
  const ctx = { setFontSize: size => calls.push(['font', size]), measureText: text => ({ width: text.length * 34 }), setFillStyle: color => calls.push(['color', color]), fillRect: (...args) => calls.push(['rect', ...args]), fillText: (...args) => calls.push(['text', ...args]), setGlobalAlpha: alpha => calls.push(['alpha', alpha]) }
  const layout = layoutImageText(ctx, '第一段\n第二段', '书名 · 作者')
  assert.deepEqual(layout.lines, ['第一段', '第二段'])
  paintTextImage(ctx, layout, 'dark')
  assert.ok(calls.some(call => call[0] === 'text' && call[1] === 'PAPERWRITER'))
  assert.ok(calls.some(call => call[0] === 'text' && call[1] === '书名 · 作者'))
})

test('PNG generation resizes, draws and returns a real file path before save/share', async () => {
  const sequence = []
  const ctx = {
    setFontSize: () => {}, measureText: text => ({ width: text.length * 34 }), setFillStyle: () => {},
    fillRect: () => {}, fillText: text => sequence.push(['text', text]), setGlobalAlpha: () => {},
    draw: (_, done) => { sequence.push(['draw']); done() }
  }
  const api = {
    createCanvasContext: id => { assert.equal(id, 'writer-image-export'); return ctx },
    canvasToTempFilePath: (options, instance) => { sequence.push(['export', options.width, options.height]); assert.equal(instance, 'page'); options.success({ tempFilePath: '_tmp/card.png' }) }
  }
  const path = await createTextPng({ canvasId: 'writer-image-export', instance: 'page', text: '甲乙', info: '书名', style: 'dark', resize: layout => sequence.push(['resize', layout.height]), nextFrame: () => Promise.resolve(), settle: () => Promise.resolve(), api })
  assert.equal(path, '_tmp/card.png')
  assert.deepEqual(sequence.map(item => item[0]).filter(item => item !== 'text'), ['resize', 'draw', 'export'])
  assert.ok(sequence.some(item => item[0] === 'text' && item[1] === 'PAPERWRITER'))
})
