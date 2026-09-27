import test from 'node:test'
import assert from 'node:assert/strict'
import { effect } from 'vue'
import { activeAssistantSession, assistantSessions, compactConversation, deleteAssistantSession, newAssistantSession, sendAssistantMessage } from '../src/store/assistant-sessions.js'

test('a streaming reply remains in the book session while the editor is gone', async () => {
  const storage = new Map()
  globalThis.uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) }
  let release
  class FakeXHR {
    open() {}
    setRequestHeader() {}
    send() {
      this.readyState = 3
      this.responseText = 'data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n'
      this.onprogress()
      release = () => { this.responseText += 'data: {"choices":[{"delta":{"content":"第二段"}}]}\n\n'; this.status = 200; this.onload() }
    }
  }
  globalThis.plus = { net: { XMLHttpRequest: FakeXHR } }
  const book = { id: 'book-1', title: '书', author: '作者', chapters: [{ id: 'chapter', title: '章', articles: [{ id: 'article', title: '篇', paragraphs: ['原文'] }] }] }
  const request = sendAssistantMessage({ book, articleId: 'article', draft: '原文', profile: { provider: 'openai', apiKey: 'key', model: 'test-model', effort: 'auto' }, content: '请评价' })
  const reopened = activeAssistantSession('book-1')
  let displayed = ''
  effect(() => { displayed = reopened.messages[reopened.messages.length - 1]?.content || '' })
  assert.equal(reopened.pending, true)
  assert.equal(displayed, '第一段')
  release()
  await request
  assert.equal(displayed, '第一段第二段')
  assert.equal(activeAssistantSession('book-1').messages.at(-1).content, '第一段第二段')
  assert.equal(reopened.pending, false)
  assert.ok(storage.get('paperwriter.assistantSessions.v1').includes('第一段第二段'))
  assert.ok(assistantSessions.sessions.length > 0)
  delete globalThis.plus
})

test('long chats retain a bounded summary and recent turns', () => {
  const session = { messages: Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `第 ${index} 轮文字`.repeat(30) })), summary: '', summaryThrough: 0 }
  const recent = compactConversation(session)
  assert.equal(recent.length, 14)
  assert.match(session.summary, /第 0 轮文字/)
  assert.ok(session.summary.length <= 5000)
  const first = session.summary
  compactConversation(session)
  assert.equal(session.summary, first)
})

test('deleting a session selects another conversation and keeps one empty conversation when last is removed', () => {
  const storage = new Map()
  globalThis.uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) }
  const first = newAssistantSession('delete-book')
  const second = newAssistantSession('delete-book')
  assert.equal(activeAssistantSession('delete-book').id, second.id)
  assert.equal(deleteAssistantSession('delete-book', second.id), true)
  assert.equal(activeAssistantSession('delete-book').id, first.id)
  assert.equal(deleteAssistantSession('delete-book', first.id), true)
  const empty = activeAssistantSession('delete-book')
  assert.notEqual(empty.id, first.id)
  assert.equal(assistantSessions.sessions.filter(item => item.bookId === 'delete-book').length, 1)
  assert.ok(storage.get('paperwriter.assistantSessions.v1').includes(empty.id))
})
