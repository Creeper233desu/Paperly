import test from 'node:test'
import assert from 'node:assert/strict'
import { editParagraph, findMatches, replaceAt, replaceAll } from '../src/utils/text.js'

test('auto pair inserts a matching closing mark at the caret', () => {
  assert.deepEqual(editParagraph('你好', '你（好', 2), { paragraphs: ['你（）好'], cursor: 2, split: false })
  assert.deepEqual(editParagraph('你好', '你（好', 2, false).paragraphs, ['你（好'])
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
})
