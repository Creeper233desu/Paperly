import test from 'node:test'
import assert from 'node:assert/strict'
import { imageIdFromParagraph, imageMarker, insertImageAt, removeImageFromDocument, textOnlyDocument, textOnlyParagraphs } from '../src/utils/media.js'

test('image markers stay between paragraphs while text extraction omits image content', () => {
  const inserted = insertImageAt('甲乙', 1, 'img-1')
  assert.equal(inserted.text, `甲\n${imageMarker('img-1')}\n乙`)
  assert.equal(imageIdFromParagraph(imageMarker('img-1')), 'img-1')
  assert.equal(textOnlyDocument(inserted.text), '甲\n乙')
  assert.deepEqual(textOnlyParagraphs(inserted.text.split('\n')), ['甲', '乙'])
  assert.equal(removeImageFromDocument(inserted.text, 'img-1'), '甲\n乙')
})
