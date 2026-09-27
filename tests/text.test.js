import test from 'node:test'
import assert from 'node:assert/strict'
import { documentFromParagraphs, editDocument, editParagraph, findMatches, paragraphOffset, paragraphsFromDocument, replaceAt, replaceAll, stepMatchIndex, stripLegacyIndents } from '../src/utils/text.js'

test('continuous document lets backspace merge paragraphs', () => {
  const before = documentFromParagraphs(['第一段', '第二段'])
  assert.equal(before, '第一段\n第二段')
  const after = editDocument(before, '第一段第二段', 3)
  assert.deepEqual(paragraphsFromDocument(after.text), ['第一段第二段'])
  assert.equal(paragraphOffset(['第一段', '第二段'], 1, 1), 5)
  assert.deepEqual(editDocument('你好', '你（好', 2), { text: '你（）好', cursor: 2 })
})

test('auto pair inserts a matching closing mark at the caret', () => {
  assert.deepEqual(editParagraph('你好', '你（好', 2), { paragraphs: ['你（）好'], cursor: 2, split: false })
  assert.deepEqual(editParagraph('你好', '你（好', 2, false).paragraphs, ['你（好'])
})

test('enter in the middle preserves caret position and adds no stored indentation', () => {
  const split = editDocument('第一段第二段', '第一段\n第二段', 4, false)
  assert.deepEqual(split, { text: '第一段\n第二段', cursor: 4 })
  assert.deepEqual(paragraphsFromDocument(split.text), ['第一段', '第二段'])
  assert.deepEqual(editDocument(split.text, '第一段第二段', 3), { text: '第一段第二段', cursor: 3 })
})

test('legacy paragraph spaces are removed while preserving the resume position', () => {
  assert.deepEqual(stripLegacyIndents(['甲', '　　乙', '　　丙'], 9), { paragraphs: ['甲', '乙', '丙'], cursor: 5 })
})

test('paste with newlines becomes separate paragraphs', () => {
  assert.deepEqual(editParagraph('', '甲\n乙\n丙', 5), { paragraphs: ['甲', '乙', '丙'], cursor: 1, split: true })
})

test('search and replacement preserve surrounding text', () => {
  const paragraphs = ['天地天地', '天地']
  assert.deepEqual(findMatches(paragraphs, '天地'), [
    { paragraphIndex: 0, start: 0, end: 2 }, { paragraphIndex: 0, start: 2, end: 4 }, { paragraphIndex: 1, start: 0, end: 2 }
  ])
  assert.deepEqual(replaceAt(paragraphs, { paragraphIndex: 0, start: 2, end: 4 }, '山川'), ['天地山川', '天地'])
  assert.deepEqual(replaceAll(paragraphs, '天地', '山川'), { paragraphs: ['山川山川', '山川'], count: 3 })
  assert.equal(stepMatchIndex(-1, 3, 1), 0)
  assert.equal(stepMatchIndex(-1, 3, -1), 2)
  assert.equal(stepMatchIndex(0, 3, -1), 2)
  assert.equal(stepMatchIndex(2, 3, 1), 0)
})
