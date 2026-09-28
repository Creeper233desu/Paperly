import test from 'node:test'
import assert from 'node:assert/strict'
import { addArticle, addBook, addChapter, getArticle, getBook } from '../src/store/library.js'
import { activeAssistantSession, registerAssistantEditor, sendAssistantMessage } from '../src/store/assistant-sessions.js'

const storage = new Map()
globalThis.uni = { getStorageSync: key => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, value) }

function replyWithTool(name, args) {
  class FakeXHR {
    open() {}
    setRequestHeader() {}
    send() {
      this.responseText = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name, arguments: JSON.stringify(args) } }] } }] })}\n\n`
      this.status = 200
      this.onload()
    }
  }
  globalThis.plus = { net: { XMLHttpRequest: FakeXHR } }
}
const replyWithInsert = articleId => replyWithTool('insert_text', { article_id: articleId, after: '甲', text: '新增' })

function exampleBook() {
  const book = addBook('自动修改测试')
  const chapter = addChapter(book.id, '第一章')
  const article = addArticle(book.id, chapter.id, '正文')
  return { book, chapter, article }
}

test('full access applies a safe edit to the book and marks the proposal accepted', async () => {
  const { book, chapter, article } = exampleBook()
  article.paragraphs = ['甲乙']
  replyWithInsert(article.id)
  await sendAssistantMessage({ book, articleId: article.id, draft: '甲乙', profile: { provider: 'openai', apiKey: 'key', model: 'test-model' }, approvalMode: 'full', content: '在甲后增加文字' })
  assert.deepEqual(getArticle(book.id, chapter.id, article.id).paragraphs, ['甲新增乙'])
  assert.equal(activeAssistantSession(book.id).proposals[0].status, 'accepted')
  delete globalThis.plus
})

test('full access rebases against a live editor draft and does not replace newer typing', async () => {
  const { book, chapter, article } = exampleBook()
  article.paragraphs = ['甲乙']
  let liveBody = '甲乙丙'
  const unregister = registerAssistantEditor(book.id, {
    articleId: () => article.id,
    body: () => liveBody,
    applyText: ready => { liveBody = ready.after; article.paragraphs = ready.paragraphs }
  })
  replyWithInsert(article.id)
  await sendAssistantMessage({ book, articleId: article.id, draft: '甲乙', profile: { provider: 'openai', apiKey: 'key', model: 'test-model' }, approvalMode: 'full', content: '在甲后增加文字' })
  assert.equal(liveBody, '甲新增乙丙')
  assert.equal(activeAssistantSession(book.id).proposals[0].status, 'accepted')
  unregister()
  delete globalThis.plus
})

test('review mode preserves the existing proposal confirmation step', async () => {
  const { book, chapter, article } = exampleBook()
  article.paragraphs = ['甲乙']
  replyWithInsert(article.id)
  await sendAssistantMessage({ book, articleId: article.id, draft: '甲乙', profile: { provider: 'openai', apiKey: 'key', model: 'test-model' }, content: '在甲后增加文字' })
  assert.deepEqual(getArticle(book.id, chapter.id, article.id).paragraphs, ['甲乙'])
  assert.equal(activeAssistantSession(book.id).proposals[0].status, undefined)
  delete globalThis.plus
})

test('full access applies a chapter rename and keeps the accepted card', async () => {
  const { book, chapter, article } = exampleBook()
  article.paragraphs = ['甲乙']
  replyWithTool('rename_chapter', { chapter_id: chapter.id, title: '更名后的章节' })
  await sendAssistantMessage({ book, articleId: article.id, draft: '甲乙', profile: { provider: 'openai', apiKey: 'key', model: 'test-model' }, approvalMode: 'full', content: '给章节改名' })
  assert.equal(getBook(book.id).chapters[0].title, '更名后的章节')
  assert.equal(activeAssistantSession(book.id).proposals[0].status, 'accepted')
  delete globalThis.plus
})
