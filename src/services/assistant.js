import { documentFromParagraphs, paragraphsFromDocument } from '../utils/text.js'

export const DEFAULT_AI_PROMPT = '你是「纸间」的写作助手。请用简体中文回答，尊重作者的语气、视角和情节设定。讨论文字时指出具体依据，给出可操作的建议；不要把推测说成书中事实。只有作者明确要求修改时才调用工具。正文文字可用 insert_text、delete_text；篇章结构可用 add_chapter、delete_chapter、rename_chapter、add_article、delete_article、rename_article。操作必须限于当前书本，目标 ID 必须来自提供的目录；文字定位片段必须与原文完全一致且唯一。不要宣称改动已经生效。所有提议会先作为差异展示，作者接受后才写入。'

export const TEXT_TOOLS = [
  { type: 'function', function: { name: 'insert_text', description: '在当前书本的某篇正文中插入文字。after 必须是正文中唯一存在的原文片段；在正文开头插入时将 after 设为空字符串。', parameters: { type: 'object', properties: { article_id: { type: 'string' }, after: { type: 'string' }, text: { type: 'string' } }, required: ['article_id', 'after', 'text'] } } },
  { type: 'function', function: { name: 'delete_text', description: '删除当前书本某篇正文中唯一匹配的原文片段。', parameters: { type: 'object', properties: { article_id: { type: 'string' }, text: { type: 'string' } }, required: ['article_id', 'text'] } } },
  { type: 'function', function: { name: 'add_chapter', description: '在当前书本末尾新建章节。', parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } } },
  { type: 'function', function: { name: 'delete_chapter', description: '删除当前书本中的章节及其全部正文。', parameters: { type: 'object', properties: { chapter_id: { type: 'string' } }, required: ['chapter_id'] } } },
  { type: 'function', function: { name: 'rename_chapter', description: '修改当前书本中的章节名称。', parameters: { type: 'object', properties: { chapter_id: { type: 'string' }, title: { type: 'string' } }, required: ['chapter_id', 'title'] } } },
  { type: 'function', function: { name: 'add_article', description: '在指定章节末尾新建正文。', parameters: { type: 'object', properties: { chapter_id: { type: 'string' }, title: { type: 'string' } }, required: ['chapter_id', 'title'] } } },
  { type: 'function', function: { name: 'delete_article', description: '删除当前书本中的指定正文。', parameters: { type: 'object', properties: { article_id: { type: 'string' } }, required: ['article_id'] } } },
  { type: 'function', function: { name: 'rename_article', description: '修改当前书本中指定正文的篇名。', parameters: { type: 'object', properties: { article_id: { type: 'string' }, title: { type: 'string' } }, required: ['article_id', 'title'] } } }
]

export function bookContext(book, currentArticleId, currentDraft, selectedText = '', systemPrompt = DEFAULT_AI_PROMPT) {
  let remaining = 42000
  const articles = book.chapters.flatMap(chapter => chapter.articles.map(article => ({
    id: article.id, chapter_id: chapter.id, chapter: chapter.title, title: article.title || '无题正文',
    text: article.id === currentArticleId ? currentDraft : documentFromParagraphs(article.paragraphs)
  })))
  articles.sort((a, b) => Number(b.id === currentArticleId) - Number(a.id === currentArticleId))
  articles.forEach(article => { const limit = Math.min(remaining, article.id === currentArticleId ? 18000 : 1600); article.truncated = article.text.length > limit; article.text = article.text.slice(0, limit); remaining -= article.text.length })
  const chapters = book.chapters.map(chapter => ({ id: chapter.id, title: chapter.title, article_ids: chapter.articles.map(article => article.id) }))
  return `${systemPrompt.trim() || DEFAULT_AI_PROMPT}\n应用规则：工具调用只会生成提案，作者确认后才会执行；不得操作当前书本之外的内容。\n书名：${book.title}\n作者：${book.author || '未设置'}\n当前正文 ID：${currentArticleId}\n章节目录：${JSON.stringify(chapters)}\n用户选中的文字：${selectedText || '无'}\n书本正文：${JSON.stringify(articles)}`
}

export function planBookEdit(book, call, currentArticleId, currentDraft) {
  if (call.error) throw new Error(call.error)
  if (['add_chapter', 'delete_chapter', 'rename_chapter', 'add_article', 'delete_article', 'rename_article'].includes(call.name)) return planStructureEdit(book, call)
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
  return { chapterId: hit.chapter.id, articleId: hit.article.id, title: hit.article.title || '无题正文', before, after, cursor: position + inserted.length, description: call.name === 'insert_text' ? `增添 ${inserted.length} 字` : `删除 ${target.length} 字`, excerpt: call.name === 'insert_text' ? inserted : target, removed: call.name === 'delete_text' ? target : '', added: inserted, contextBefore: before.slice(Math.max(0, position - 44), position), contextAfter: before.slice(position + (call.name === 'delete_text' ? target.length : 0), position + (call.name === 'delete_text' ? target.length : 0) + 44), paragraphs: paragraphsFromDocument(after), operation: { name: call.name, args: { ...call.args } } }
}

export function rebaseBookEdit(book, proposal, currentArticleId, currentDraft) {
  const operation = proposal.operation || (proposal.removed
    ? { name: 'delete_text', args: { article_id: proposal.articleId, text: proposal.removed } }
    : proposal.added ? { name: 'insert_text', args: { article_id: proposal.articleId, after: proposal.contextBefore || '', text: proposal.added } } : null)
  if (!operation) throw new Error('旧提案缺少定位信息，请重新生成修改')
  return planBookEdit(book, operation, currentArticleId, currentDraft)
}

function nodeFingerprint(node) {
  const content = node.articles
    ? { id: node.id, title: node.title, articles: node.articles.map(article => ({ id: article.id, title: article.title, paragraphs: article.paragraphs })) }
    : { id: node.id, title: node.title, paragraphs: node.paragraphs }
  const raw = JSON.stringify(content)
  let hash = 2166136261
  for (let index = 0; index < raw.length; index++) hash = Math.imul(hash ^ raw.charCodeAt(index), 16777619)
  return `${raw.length}:${hash >>> 0}`
}

function titleArg(value, required = false) {
  if (typeof value !== 'string' || value.length > 100 || (required && !value.trim())) throw new Error('名称缺失或过长')
  return value.trim()
}

export function planStructureEdit(book, call) {
  const { name, args = {} } = call
  const chapter = book.chapters.find(item => item.id === args.chapter_id)
  const hit = book.chapters.flatMap(group => group.articles.map(article => ({ chapter: group, article }))).find(item => item.article.id === args.article_id)
  const operation = { name, args: { ...args } }
  const proposal = { kind: 'structure', operation, status: 'pending', title: book.title, description: '', contextBefore: '', contextAfter: '', removed: '', added: '' }
  switch (name) {
    case 'add_chapter': {
      const title = titleArg(args.title, true)
      operation.args.title = title
      operation.args.assigned_id = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
      proposal.description = '新增章节'; proposal.added = title
      break
    }
    case 'delete_chapter':
      if (!chapter) throw new Error('目标章节不属于当前书本')
      proposal.chapterId = chapter.id; proposal.fingerprint = nodeFingerprint(chapter)
      proposal.title = chapter.title; proposal.description = `删除章节及 ${chapter.articles.length} 篇正文`; proposal.removed = chapter.title
      break
    case 'rename_chapter': {
      if (!chapter) throw new Error('目标章节不属于当前书本')
      const title = titleArg(args.title, true)
      proposal.chapterId = chapter.id; proposal.previousTitle = chapter.title
      proposal.title = chapter.title; proposal.description = '修改章节名'; proposal.removed = chapter.title; proposal.added = title
      operation.args.title = title
      break
    }
    case 'add_article': {
      if (!chapter) throw new Error('目标章节不属于当前书本')
      const title = titleArg(args.title)
      operation.args.title = title
      operation.args.assigned_id = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
      proposal.chapterId = chapter.id; proposal.title = chapter.title; proposal.description = '新增正文'; proposal.added = title || '无题正文'
      break
    }
    case 'delete_article':
      if (!hit) throw new Error('目标正文不属于当前书本')
      proposal.chapterId = hit.chapter.id; proposal.articleId = hit.article.id; proposal.fingerprint = nodeFingerprint(hit.article)
      proposal.title = hit.article.title || '无题正文'; proposal.description = '删除正文'; proposal.removed = proposal.title
      break
    case 'rename_article': {
      if (!hit) throw new Error('目标正文不属于当前书本')
      const title = titleArg(args.title)
      proposal.chapterId = hit.chapter.id; proposal.articleId = hit.article.id; proposal.previousTitle = hit.article.title
      proposal.title = hit.article.title || '无题正文'; proposal.description = '修改篇名'; proposal.removed = proposal.title; proposal.added = title || '无题正文'
      operation.args.title = title
      break
    }
    default: throw new Error('不支持的操作')
  }
  return proposal
}

export function validateStructureProposal(book, proposal) {
  const { name, args } = proposal.operation || {}
  const chapter = book.chapters.find(item => item.id === args?.chapter_id)
  const hit = book.chapters.flatMap(group => group.articles.map(article => ({ chapter: group, article }))).find(item => item.article.id === args?.article_id)
  if (name === 'add_chapter') return !book.chapters.some(item => item.id === args.assigned_id)
  if (name === 'add_article') return !!chapter && !chapter.articles.some(item => item.id === args.assigned_id)
  if (name === 'delete_chapter') return !!chapter && nodeFingerprint(chapter) === proposal.fingerprint
  if (name === 'rename_chapter') return !!chapter && chapter.title === proposal.previousTitle
  if (name === 'delete_article') return !!hit && nodeFingerprint(hit.article) === proposal.fingerprint
  if (name === 'rename_article') return !!hit && hit.article.title === proposal.previousTitle
  return false
}

export function applyStructureToSnapshot(book, proposal) {
  if (!validateStructureProposal(book, proposal)) throw new Error('篇章已变化，请重新生成提案')
  const { name, args } = proposal.operation
  const chapter = book.chapters.find(item => item.id === args.chapter_id)
  const hit = book.chapters.flatMap(group => group.articles.map(article => ({ chapter: group, article }))).find(item => item.article.id === args.article_id)
  if (name === 'add_chapter') book.chapters.push({ id: args.assigned_id, title: args.title, articles: [] })
  else if (name === 'delete_chapter') book.chapters = book.chapters.filter(item => item.id !== args.chapter_id)
  else if (name === 'rename_chapter') chapter.title = args.title
  else if (name === 'add_article') chapter.articles.push({ id: args.assigned_id, title: args.title, paragraphs: [''] })
  else if (name === 'delete_article') hit.chapter.articles = hit.chapter.articles.filter(item => item.id !== args.article_id)
  else if (name === 'rename_article') hit.article.title = args.title
  return book
}
