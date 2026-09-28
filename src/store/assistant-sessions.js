import { reactive } from 'vue'
import { applyStructureToSnapshot, bookContext, DEFAULT_AI_PROMPT, planBookEdits, rebaseBookEdit } from '../services/assistant.js'
import { documentFromParagraphs } from '../utils/text.js'
import { buildChatRequest, createChatAccumulator, requestCompleteChat, streamChat } from '../services/ai-providers.js'
import { createPacedReveal } from '../utils/paced-reveal.js'
import { applyAssistantProposal } from '../services/assistant-apply.js'

const KEY = 'paperwriter.assistantSessions.v1'
export const assistantSessions = reactive({ sessions: [], activeByBook: {} })
const requests = new Map()
const editors = new Map()
let loaded = false, saveTimer = null
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
function persist() { clearTimeout(saveTimer); saveTimer = null; uni.setStorageSync(KEY, JSON.stringify({ sessions: assistantSessions.sessions, activeByBook: assistantSessions.activeByBook })) }
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 350) }

export function registerAssistantEditor(bookId, editor) {
  editors.set(bookId, editor)
  return () => { if (editors.get(bookId) === editor) editors.delete(bookId) }
}

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
export function deleteAssistantSession(bookId, sessionId) {
  loadAssistantSessions()
  const index = assistantSessions.sessions.findIndex(item => item.id === sessionId && item.bookId === bookId)
  if (index < 0) return false
  if (assistantSessions.sessions[index].pending || requests.has(sessionId)) throw new Error('请等待当前回复完成后再删除会话')
  assistantSessions.sessions.splice(index, 1)
  if (assistantSessions.activeByBook[bookId] === sessionId) {
    const next = assistantSessions.sessions.filter(item => item.bookId === bookId).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (next) assistantSessions.activeByBook[bookId] = next.id
    else { delete assistantSessions.activeByBook[bookId]; newAssistantSession(bookId) }
  }
  persist()
  return true
}
export function removeAssistantProposal(bookId, index) { const session = activeAssistantSession(bookId); session.proposals.splice(index, 1); persist() }
export function setAssistantProposalStatus(bookId, index, status) {
  if (!['accepted', 'rejected'].includes(status)) throw new Error('无效的提案状态')
  const session = activeAssistantSession(bookId)
  const proposal = session.proposals[index]
  if (!proposal || (proposal.status && proposal.status !== 'pending')) return false
  proposal.status = status
  proposal.resolvedAt = Date.now()
  persist()
  return true
}
export function refreshAssistantProposals(book, currentArticleId, currentDraft) {
  const session = activeAssistantSession(book.id)
  for (const proposal of session.proposals) {
    if (proposal.status && proposal.status !== 'pending') continue
    if (proposal.kind === 'structure') continue
    if (!proposal.articleId) continue
    const article = book.chapters.flatMap(chapter => chapter.articles).find(item => item.id === proposal.articleId)
    if (!article) { proposal.error = '目标正文已不存在'; continue }
    const latest = proposal.articleId === currentArticleId ? currentDraft : documentFromParagraphs(article.paragraphs)
    if (latest === proposal.before) { delete proposal.error; continue }
    try { Object.assign(proposal, rebaseBookEdit(book, proposal, currentArticleId, currentDraft)); delete proposal.error }
    catch (error) { proposal.error = error.message }
  }
  persist()
}

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

export function sendAssistantMessage({ book, articleId, draft, selectedText = '', profile, systemPrompt = DEFAULT_AI_PROMPT, approvalMode = 'review', content }) {
  const session = activeAssistantSession(book.id)
  if (session.pending || requests.has(session.id)) throw new Error('当前对话仍在回复中')
  if (!profile?.apiKey || !profile?.model) throw new Error('请先在设置中配置并选择可用模型')
  const question = String(content || '').trim()
  if (!question) throw new Error('请输入问题')
  const bookSnapshot = JSON.parse(JSON.stringify(book))
  session.messages.push({ role: 'user', content: question, at: Date.now() })
  if (session.title === '新对话') session.title = question.slice(0, 22)
  const history = compactConversation(session)
  const system = bookContext(bookSnapshot, articleId, draft, selectedText, systemPrompt, approvalMode) + (session.summary ? `\n较早对话摘要（节选）：\n${session.summary}` : '')
  const request = buildChatRequest(profile, system, history)
  session.messages.push({ role: 'assistant', content: '', thinking: '', streaming: true, at: Date.now(), model: profile.model })
  const answer = session.messages[session.messages.length - 1]
  session.pending = true; session.updatedAt = Date.now(); persist()
  const reveal = createPacedReveal(current => {
    answer.content = current.content
    answer.thinking = current.thinking
    saveSoon()
  })
  const accumulator = createChatAccumulator(request.provider, current => reveal.push(current))
  const task = streamChat(request, event => accumulator.feed(event))
    .then(async () => {
      let result = accumulator.finish()
      if (!result.content.trim() && !result.calls.length) result = await requestCompleteChat(request)
      reveal.push({ content: result.content || (result.calls.length ? '' : '服务没有返回可显示内容，请重试。'), thinking: result.thinking })
      await reveal.finish()
      const workingBook = JSON.parse(JSON.stringify(bookSnapshot))
      let workingDraft = draft
      const proposalCountBefore = session.proposals.length
      for (const call of result.calls) {
        try {
          for (const proposal of planBookEdits(workingBook, call, articleId, workingDraft)) {
            session.proposals.push(proposal)
            if (proposal.kind === 'structure') applyStructureToSnapshot(workingBook, proposal)
            else {
              const article = workingBook.chapters.flatMap(chapter => chapter.articles).find(item => item.id === proposal.articleId)
              if (article) article.paragraphs = proposal.paragraphs
              if (proposal.articleId === articleId) workingDraft = proposal.after
            }
          }
        }
        catch (error) { session.proposals.push({ title: '无法定位正文', description: call.name || '修改', error: error.message }) }
      }
      if (approvalMode === 'full') {
        for (let index = proposalCountBefore; index < session.proposals.length; index++) {
          const proposal = session.proposals[index]
          if (proposal.error) continue
          try {
            applyAssistantProposal(book.id, proposal, editors.get(book.id))
            proposal.status = 'accepted'; proposal.resolvedAt = Date.now()
          } catch (error) { proposal.error = error.message || '自动应用失败' }
        }
      }
      if (!answer.content && result.calls.length) {
        const added = session.proposals.slice(proposalCountBefore)
        const applied = added.filter(item => item.status === 'accepted').length
        answer.content = approvalMode === 'full'
          ? `已自动应用 ${applied} 项修改${added.length > applied ? `；${added.length - applied} 项无法安全应用，请查看卡片` : ''}。`
          : added.length ? `已生成 ${added.length} 项修改提案，请逐项审阅。` : '没有找到需要修改的内容。'
      }
      return result
    })
    .catch(async error => {
      const visible = accumulator.result.content
      reveal.push({ content: `${visible}${visible ? '\n' : ''}请求失败：${error.message || '请检查网络和模型配置'}`, thinking: accumulator.result.thinking })
      await reveal.finish()
      throw error
    })
    .finally(() => { answer.streaming = false; session.pending = false; session.updatedAt = Date.now(); requests.delete(session.id); persist() })
  requests.set(session.id, task)
  return task
}
