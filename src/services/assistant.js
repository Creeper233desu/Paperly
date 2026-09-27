import { documentFromParagraphs, paragraphsFromDocument } from '../utils/text.js'

export const DEEPSEEK_MODELS = [
  { id: 'deepseek-flash', name: 'DeepSeek Flash' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }
]
export const DEFAULT_AI_PROMPT = '你是「纸间」的写作助手。请用简体中文回答，尊重作者的语气、视角和情节设定。讨论文字时指出具体依据，给出可操作的建议；不要把推测说成书中事实。只有作者明确要求修改正文时，才使用 insert_text 或 delete_text 提议增添或删除。操作必须限于当前书本，article_id 必须来自提供的目录，定位片段必须与原文完全一致且唯一。不要调用其他工具，不要宣称改动已经生效。所有提议会先作为差异展示，作者接受后才写入。'

function request(path, key, data) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `https://api.deepseek.com${path}`,
      method: data ? 'POST' : 'GET',
      header: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      data,
      timeout: 45000,
      success: response => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(response.data?.error?.message || `服务返回 ${response.statusCode}`))
        resolve(response.data)
      },
      fail: error => reject(new Error(error?.errMsg || '网络连接失败'))
    })
  })
}

export async function testDeepSeek(key, model) {
  if (!key?.trim()) throw new Error('请填写 API Key')
  const result = await request('/models', key.trim())
  const models = result?.data?.map(item => item.id) || []
  if (!models.includes(model)) throw new Error('已连接，但所选模型不在可用列表中')
  return models
}

const tools = [
  { type: 'function', function: { name: 'insert_text', description: '在当前书本的某篇正文中插入文字。after 必须是正文中唯一存在的原文片段；在正文开头插入时将 after 设为空字符串。', parameters: { type: 'object', properties: { article_id: { type: 'string' }, after: { type: 'string' }, text: { type: 'string' } }, required: ['article_id', 'after', 'text'] } } },
  { type: 'function', function: { name: 'delete_text', description: '删除当前书本某篇正文中唯一匹配的原文片段。', parameters: { type: 'object', properties: { article_id: { type: 'string' }, text: { type: 'string' } }, required: ['article_id', 'text'] } } }
]

export function bookContext(book, currentArticleId, currentDraft, selectedText = '', systemPrompt = DEFAULT_AI_PROMPT) {
  let remaining = 42000
  const articles = book.chapters.flatMap(chapter => chapter.articles.map(article => ({
    id: article.id, chapter: chapter.title, title: article.title || '无题正文',
    text: article.id === currentArticleId ? currentDraft : documentFromParagraphs(article.paragraphs)
  })))
  articles.sort((a, b) => Number(b.id === currentArticleId) - Number(a.id === currentArticleId))
  articles.forEach(article => { const limit = Math.min(remaining, article.id === currentArticleId ? 18000 : 1600); article.truncated = article.text.length > limit; article.text = article.text.slice(0, limit); remaining -= article.text.length })
  return `${systemPrompt.trim() || DEFAULT_AI_PROMPT}\n应用规则：工具调用只会生成提案，作者确认后才会执行；不得操作当前书本之外的内容。\n书名：${book.title}\n作者：${book.author || '未设置'}\n当前正文 ID：${currentArticleId}\n用户选中的文字：${selectedText || '无'}\n书本正文：${JSON.stringify(articles)}`
}

export async function askDeepSeek({ key, model, book, articleId, draft, selectedText, systemPrompt, messages }) {
  if (!key?.trim()) throw new Error('请先在设置中配置 DeepSeek API Key')
  const response = await request('/chat/completions', key.trim(), {
    model,
    stream: false,
    messages: [{ role: 'system', content: bookContext(book, articleId, draft, selectedText, systemPrompt) }, ...messages.slice(-16).map(item => ({ role: item.role, content: item.content }))],
    tools,
    tool_choice: 'auto'
  })
  const message = response?.choices?.[0]?.message
  if (!message) throw new Error('模型没有返回内容')
  return { content: message.content || '', calls: (message.tool_calls || []).map(call => {
    try { return { name: call.function.name, args: JSON.parse(call.function.arguments || '{}') } }
    catch (_) { return { name: call.function.name, args: {}, error: '工具参数无法解析' } }
  }) }
}

export function planBookEdit(book, call, currentArticleId, currentDraft) {
  if (call.error) throw new Error(call.error)
  if (!['insert_text', 'delete_text'].includes(call.name)) throw new Error('不支持的操作')
  const hit = book.chapters.flatMap(chapter => chapter.articles.map(article => ({ chapter, article }))).find(item => item.article.id === call.args?.article_id)
  if (!hit) throw new Error('目标正文不属于当前书本')
  const before = hit.article.id === currentArticleId ? currentDraft : documentFromParagraphs(hit.article.paragraphs)
  const target = call.name === 'insert_text' ? call.args.after : call.args.text
  const inserted = call.name === 'insert_text' ? call.args.text : ''
  if (typeof target !== 'string' || typeof inserted !== 'string' || (!target && call.name === 'delete_text') || (call.name === 'insert_text' && !inserted)) throw new Error('工具参数不完整')
  if (target.length > 4000 || inserted.length > 4000) throw new Error('单次改动过长')
  const at = target ? before.indexOf(target) : -1
  if (target && (at < 0 || before.indexOf(target, at + 1) >= 0)) throw new Error('原文不存在或不唯一，无法安全定位')
  const position = call.name === 'insert_text' ? (target ? at + target.length : 0) : at
  const after = call.name === 'insert_text' ? before.slice(0, position) + inserted + before.slice(position) : before.slice(0, at) + before.slice(at + target.length)
  return { chapterId: hit.chapter.id, articleId: hit.article.id, title: hit.article.title || '无题正文', before, after, cursor: position + inserted.length, description: call.name === 'insert_text' ? `增添 ${inserted.length} 字` : `删除 ${target.length} 字`, excerpt: call.name === 'insert_text' ? inserted : target, removed: call.name === 'delete_text' ? target : '', added: inserted, contextBefore: before.slice(Math.max(0, position - 44), position), contextAfter: before.slice(position + (call.name === 'delete_text' ? target.length : 0), position + (call.name === 'delete_text' ? target.length : 0) + 44), paragraphs: paragraphsFromDocument(after) }
}
