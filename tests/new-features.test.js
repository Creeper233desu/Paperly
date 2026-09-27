import test from 'node:test'
import assert from 'node:assert/strict'
import { editDocument } from '../src/utils/text.js'
import { askDeepSeek, bookContext, planBookEdit } from '../src/services/assistant.js'
import { layoutImageText, paintTextImage } from '../src/services/image-export.js'

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

test('custom AI prompt is included with current book context', () => {
  const context = bookContext({ ...book, title: '测试书', author: '作者' }, 'a', '未保存草稿', '草稿', '请保持简洁。')
  assert.match(context, /请保持简洁/)
  assert.match(context, /未保存草稿/)
  assert.match(context, /用户选中的文字：草稿/)
})

test('DeepSeek request exposes only the two proposed text tools', async () => {
  let request
  globalThis.uni = { request: options => { request = options; options.success({ statusCode: 200, data: { choices: [{ message: { content: '建议', tool_calls: [{ function: { name: 'insert_text', arguments: '{"article_id":"a","after":"甲","text":"新"}' } }] } }] } }) } }
  const result = await askDeepSeek({ key: 'test-key', model: 'deepseek-flash', book: { ...book, title: '测试书' }, articleId: 'a', draft: '甲乙丙', selectedText: '', systemPrompt: '简洁回答', messages: [{ role: 'user', content: '补一句' }] })
  assert.equal(request.header.Authorization, 'Bearer test-key')
  assert.deepEqual(request.data.tools.map(item => item.function.name), ['insert_text', 'delete_text'])
  assert.equal(result.calls[0].args.text, '新')
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
