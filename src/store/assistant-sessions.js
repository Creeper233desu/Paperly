import { reactive } from 'vue'
import { bookContext, DEFAULT_AI_PROMPT, planBookEdit } from '../services/assistant.js'
import { buildChatRequest, createChatAccumulator, streamChat } from '../services/ai-providers.js'

const KEY = 'paperwriter.assistantSessions.v1'
export const assistantSessions = reactive({ sessions: [], activeByBook: {} })
const requests = new Map()
let loaded = false, saveTimer = null
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
function persist() { clearTimeout(saveTimer); saveTimer = null; uni.setStorageSync(KEY, JSON.stringify({ sessions: assistantSessions.sessions, activeByBook: assistantSessions.activeByBook })) }
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 350) }

export function loadAssistantSessions() {
  if (loaded) return assistantSessions
  loaded = true
  try {
    const raw = uni.getStorageSync(KEY)
    const saved = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
    if (Array.isArray(saved.sessions)) assistantSessions.sessions = saved.sessions
    if (saved.activeByBook && typeof saved.activeByBook === 'object') assistantSessions.activeByBook = saved.activeByBook
  } catch (_) { /* new installation */ }
  for (const session of assistantSessions.sessions) if (session.pending) {
    session.pending = false
    const last = session.messages?.at(-1)
    if (last?.role === 'assistant') last.content += '\n请求因应用进程结束而中断。'
  }
  return assistantSessions
}
export function sessionsForBook(bookId) { loadAssistantSessions(); return assistantSessions.sessions.filter(item => item.bookId === bookId) }
export function newAssistantSession(bookId) {
  loadAssistantSessions()
  const session = { id: uid(), bookId, title: '新对话', createdAt: Date.now(), updatedAt: Date.now(), messages: [], proposals: [], pending: false, summary: '', summaryThrough: 0 }
  assistantSessions.sessions.unshift(session)
  assistantSessions.activeByBook[bookId] = session.id
  persist()
  return assistantSessions.sessions[0]
}
export function activeAssistantSession(bookId) {
  loadAssistantSessions()
  return assistantSessions.sessions.find(item => item.id === assistantSessions.activeByBook[bookId] && item.bookId === bookId) || newAssistantSession(bookId)
}
export function selectAssistantSession(bookId, sessionId) {
  loadAssistantSessions()
  const session = assistantSessions.sessions.find(item => item.id === sessionId && item.bookId === bookId)
  if (session) { assistantSessions.activeByBook[bookId] = sessionId; persist() }
  return session
}
export function removeAssistantProposal(bookId, index) { const session = activeAssistantSession(bookId); session.proposals.splice(index, 1); persist() }

export function compactConversation(session) {
  const completed = session.messages.filter(item => item.role === 'user' || (item.role === 'assistant' && !item.streaming))
  const olderCount = Math.max(0, completed.length - 14)
  if (olderCount > session.summaryThrough) {
    const newOlder = completed.slice(session.summaryThrough, olderCount)
    const notes = newOlder.map(item => `${item.role === 'user' ? '作者' : '助手'}：${item.content.slice(0, 450)}`).join('\n')
    session.summary = `${session.summary}\n${notes}`.slice(-5000)
    session.summaryThrough = olderCount
  }
  return completed.slice(olderCount).map(item => ({ role: item.role, content: item.content }))
}

export function sendAssistantMessage({ book, articleId, draft, selectedText = '', profile, systemPrompt = DEFAULT_AI_PROMPT, content }) {
  const session = activeAssistantSession(book.id)
  if (session.pending || requests.has(session.id)) throw new Error('当前对话仍在回复中')
  if (!profile?.apiKey || !profile?.model) throw new Error('请先在设置中配置并选择可用模型')
  const question = String(content || '').trim()
  if (!question) throw new Error('请输入问题')
  const bookSnapshot = JSON.parse(JSON.stringify(book))
  session.messages.push({ role: 'user', content: question, at: Date.now() })
  if (session.title === '新对话') session.title = question.slice(0, 22)
  const history = compactConversation(session)
  const system = bookContext(bookSnapshot, articleId, draft, selectedText, systemPrompt) + (session.summary ? `\n较早对话摘要（节选）：\n${session.summary}` : '')
  const request = buildChatRequest(profile, system, history)
  session.messages.push({ role: 'assistant', content: '', thinking: '', streaming: true, at: Date.now(), model: profile.model })
  const answer = session.messages[session.messages.length - 1]
  session.pending = true; session.updatedAt = Date.now(); persist()
  const accumulator = createChatAccumulator(request.provider, current => {
    answer.content = current.content
    answer.thinking = current.thinking
    saveSoon()
  })
  const task = streamChat(request, event => accumulator.feed(event))
    .then(() => {
      const result = accumulator.finish()
      if (!result.content && !result.calls.length) answer.content = '模型没有返回文字内容。'
      for (const call of result.calls) {
        try { session.proposals.push(planBookEdit(bookSnapshot, call, articleId, draft)) }
        catch (error) { session.proposals.push({ title: '无法定位正文', description: call.name || '修改', error: error.message }) }
      }
      return result
    })
    .catch(error => { answer.content += `${answer.content ? '\n' : ''}请求失败：${error.message || '请检查网络和模型配置'}`; throw error })
    .finally(() => { answer.streaming = false; session.pending = false; session.updatedAt = Date.now(); requests.delete(session.id); persist() })
  requests.set(session.id, task)
  return task
}
