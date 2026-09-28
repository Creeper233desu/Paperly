import { rebaseBookEdit, validateStructureProposal } from './assistant.js'
import { documentFromParagraphs } from '../utils/text.js'
import { addArticle, addChapter, deleteArticle, deleteChapter, getArticle, getBook, renameArticle, renameChapter, saveArticle } from '../store/library.js'

// Called by the session store even when the editor page is no longer visible.
export function applyAssistantProposal(bookId, proposal, editor = null) {
  const book = getBook(bookId)
  if (!book) throw new Error('书籍已不存在')
  if (proposal.error) throw new Error(proposal.error)
  if (proposal.kind === 'structure') {
    if (!validateStructureProposal(book, proposal)) throw new Error('篇章已变化，无法安全应用')
    const { name, args } = proposal.operation
    if (name === 'add_chapter') addChapter(bookId, args.title, args.assigned_id)
    else if (name === 'delete_chapter') deleteChapter(bookId, args.chapter_id)
    else if (name === 'rename_chapter') renameChapter(bookId, args.chapter_id, args.title)
    else if (name === 'add_article') addArticle(bookId, args.chapter_id, args.title, args.assigned_id)
    else if (name === 'delete_article') deleteArticle(bookId, proposal.chapterId, args.article_id)
    else if (name === 'rename_article') renameArticle(bookId, proposal.chapterId, args.article_id, args.title)
    else throw new Error('不支持的篇章操作')
    editor?.onStructure?.(proposal)
    return
  }
  const target = getArticle(bookId, proposal.chapterId, proposal.articleId)
  if (!target) throw new Error('目标正文已不存在')
  const live = editor?.articleId?.() === proposal.articleId
  const latest = live ? editor.body() : documentFromParagraphs(target.paragraphs)
  const ready = latest === proposal.before ? proposal : rebaseBookEdit(book, proposal, live ? proposal.articleId : '', latest)
  if (live) editor.applyText(ready)
  else saveArticle(bookId, ready.chapterId, ready.articleId, { paragraphs: ready.paragraphs, cursor: ready.cursor })
}
