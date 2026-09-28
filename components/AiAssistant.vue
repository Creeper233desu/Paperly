<template>
  <view class="assistant-panel" :class="{ fullscreen }">
    <view class="assistant-head"><view><text class="assistant-kicker">纸间 · 写作助手</text><view class="assistant-title">和你的文字聊聊</view></view><view class="head-actions"><view class="head-action" :aria-label="fullscreen ? '退出全屏' : '全屏显示'" @tap="$emit('toggle-fullscreen')"><AssistantGlyph name="window" :expanded="fullscreen" /></view><view class="head-action" aria-label="关闭助手" @tap="$emit('close')"><AssistantGlyph name="close" /></view></view></view>
    <view class="assistant-bar"><view class="bar-choice" :class="{ selected: sessionMenuOpen }" @tap="toggleMenu('session')"><text>{{ session?.title || '新对话' }}</text><AssistantGlyph name="chevron" :open="sessionMenuOpen" /></view><view class="bar-new" @tap="createSession"><AssistantGlyph name="plus" /><text>新对话</text></view></view>
    <view class="menu-scrim" :class="{ visible: sessionMenuOpen || modelMenuOpen || effortMenuOpen || contextMenuOpen || approvalMenuOpen }" @tap="closeMenus" />
    <view class="pop-list session-list" :class="{ open: sessionMenuOpen }"><view class="menu-caption">当前书籍的会话</view><view v-for="item in bookSessions" :key="item.id" class="session-option" :class="{ active: item.id === session?.id }" @tap="switchSession(item.id)"><view class="session-label"><text>{{ item.title }}</text><small>{{ item.pending ? '回复中' : `${item.messages.length} 条消息` }}</small></view><view class="session-delete" aria-label="删除会话" @tap.stop="askDelete(item)"><AssistantGlyph name="close" /></view></view></view>
    <view v-if="selectedText" class="assistant-selection"><text>正在讨论的文字</text><view>{{ selectedText }}</view><text class="selection-clear" @tap="$emit('clear-selection')">清除选区</text></view>
    <scroll-view class="assistant-messages" scroll-y :scroll-top="scrollTop" :scroll-into-view="bottomAnchor"><view class="assistant-scroll-content">
      <view v-if="!session?.messages.length" class="assistant-empty"><view class="assistant-star"><AssistantGlyph name="sparkle" /></view><view>从一个问题开始</view><text>可以讨论表达和情节，也可以提出增添或删除正文的修改。修改会由你确认。</text></view>
      <view v-for="(message, index) in session?.messages || []" :key="index" class="assistant-message" :class="message.role"><text class="message-role">{{ message.role === 'user' ? '你' : message.model || '写作助手' }}</text><view v-if="message.thinking" class="thinking-block"><text>思考过程 · 模型返回</text><view>{{ message.thinking }}</view></view><view class="message-text">{{ message.content || (message.streaming ? '正在生成回复…' : '') }}<text v-if="message.streaming" class="stream-caret">▍</text></view></view>
      <view v-for="(proposal, index) in session?.proposals || []" :key="index" class="proposal-card" :class="{ resolved: proposal.status && proposal.status !== 'pending' }"><view class="proposal-label">{{ proposal.status === 'accepted' ? '✓ 已接受' : proposal.status === 'rejected' ? '× 已拒绝' : proposal.kind === 'structure' ? '待确认的篇章修改' : '待确认的正文修改' }}</view><view class="proposal-title">{{ proposal.title }} · {{ proposal.description }}</view><view class="proposal-diff"><text>{{ proposal.contextBefore }}</text><text v-if="proposal.removed" class="diff-removed">− {{ proposal.removed }}</text><text v-if="proposal.added" class="diff-added">＋ {{ proposal.added }}</text><text>{{ proposal.contextAfter }}</text></view><view v-if="proposal.error && (!proposal.status || proposal.status === 'pending')" class="proposal-error">{{ proposal.error }}</view><view v-if="!proposal.status || proposal.status === 'pending'" class="proposal-actions"><view @tap="rejectProposal(index)">拒绝</view><view v-if="!proposal.error" @tap="$emit('apply', index)">接受修改</view></view></view>
    </view><view :id="bottomAnchorId" class="scroll-anchor"></view><AssistantScrollFollower :tick="followTick" /></scroll-view>
    <view class="assistant-composer"><textarea v-model="draft" auto-height maxlength="4000" placeholder="描述想讨论的内容，或需要修改的地方…" /><view class="composer-foot"><view class="composer-selectors"><view class="model-trigger" :class="{ selected: modelMenuOpen }" @tap="toggleMenu('model')"><text>{{ profile?.model || '选择模型' }}</text><AssistantGlyph name="chevron" :open="modelMenuOpen" /></view><view v-if="supportsReasoning(profile)" class="effort-trigger" :class="{ selected: effortMenuOpen }" @tap="toggleMenu('effort')"><text>{{ effortLabel(profile?.effort) }}</text><AssistantGlyph name="chevron" :open="effortMenuOpen" /></view></view><view class="send-button" :class="{ disabled: session?.pending || !draft.trim(), pending: session?.pending }" :aria-label="session?.pending ? '回复中' : '发送消息'" @tap="send"><view v-if="session?.pending" class="send-pulse" /><AssistantGlyph v-else name="send" /></view></view><view class="composer-meta"><view class="approval-trigger" :class="{ selected: approvalMenuOpen || prefs.aiApprovalMode === 'full' }" @tap="toggleMenu('approval')"><text>{{ prefs.aiApprovalMode === 'full' ? '完全访问' : '修改需确认' }}</text><AssistantGlyph name="chevron" :open="approvalMenuOpen" /></view><view class="context-trigger" :class="{ selected: contextMenuOpen }" @tap="toggleMenu('context')"><view class="context-ring" :style="{ '--context-fill': `${usage.percent}%` }"><view /></view><text>上下文约 {{ formatTokenCount(usage.total) }}{{ usage.window ? ` / ${formatTokenCount(usage.window)}` : '' }} tokens</text><AssistantGlyph name="chevron" :open="contextMenuOpen" /></view></view></view>
    <view class="pop-list model-list" :class="{ open: modelMenuOpen }"><view class="menu-caption">选择模型</view><view v-if="!aiProfiles.profiles.length" class="empty-model" @tap="openSettings">先到设置添加模型配置</view><view v-for="item in aiProfiles.profiles" :key="item.id" class="profile-group"><text>{{ item.name }} · {{ providerInfo(item.provider).name }}</text><view v-for="model in item.models" :key="model" :class="{ active: profile?.id === item.id && profile?.model === model }" @tap="chooseModel(item, model)">{{ model }}</view><view v-if="!item.models.length" class="empty-model" @tap="openSettings">在设置中获取模型列表</view></view></view>
    <view class="pop-list effort-list" :class="{ open: effortMenuOpen }"><view class="menu-caption">思考强度</view><view v-for="option in effortOptions" :key="option" class="effort-item" :class="{ active: (profile?.effort || 'auto') === option }" @tap="chooseEffort(option)">{{ effortLabel(option) }}</view></view>
    <view class="pop-list context-list" :class="{ open: contextMenuOpen }"><view class="menu-caption">下次请求的上下文估算</view><view class="context-row"><text>书本内容与提示词</text><text>{{ formatTokenCount(usage.book) }}</text></view><view class="context-row"><text>较早对话摘要</text><text>{{ formatTokenCount(usage.older) }}</text></view><view class="context-row"><text>近期对话</text><text>{{ formatTokenCount(usage.recent) }}</text></view><view class="context-row"><text>正在输入</text><text>{{ formatTokenCount(usage.question) }}</text></view><view class="context-total"><text>预计使用</text><text>≈ {{ formatTokenCount(usage.total) }} tokens</text></view><view class="context-note">依据文字长度估算，实际用量由模型分词和服务商计算。{{ usage.window ? '比例基于设置中的窗口上限。' : '可在模型配置中填写窗口上限。' }}</view></view>
    <view class="pop-list approval-list" :class="{ open: approvalMenuOpen }"><view class="menu-caption">AI 修改权限</view><view class="approval-option" :class="{ active: prefs.aiApprovalMode !== 'full' }" @tap="chooseApproval('review')"><strong>修改需确认</strong><text>先看差异，再决定是否写入</text></view><view class="approval-option" :class="{ active: prefs.aiApprovalMode === 'full' }" @tap="chooseApproval('full')"><strong>完全访问</strong><text>自动修改当前书本，包括删除内容</text></view></view>
    <view v-if="fullWarningOpen" class="delete-shade" @tap="fullWarningOpen = false"><view class="delete-card" @tap.stop><view class="delete-heading">开启完全访问？</view><view class="delete-message">AI 的增删正文和篇章操作会直接写入当前书本，不再逐项等待确认。模型可能理解有误，删除章节或正文也会立即生效。请先备份重要内容；无法安全定位的修改会保留为待处理卡片。</view><view class="delete-actions"><view @tap="fullWarningOpen = false">保持确认</view><view class="destructive" @tap="confirmFullAccess">开启完全访问</view></view></view></view>
    <view v-if="deletingSession" class="delete-shade" @tap="deletingSession = null"><view class="delete-card" @tap.stop><view class="delete-heading">删除这段会话？</view><view class="delete-message">“{{ deletingSession.title }}”的消息和待确认修改将一起删除。</view><view class="delete-actions"><view @tap="deletingSession = null">取消</view><view class="destructive" @tap="confirmDelete">删除会话</view></view></view></view>
  </view>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import AssistantGlyph from './AssistantGlyph.vue'
import AssistantScrollFollower from './AssistantScrollFollower.vue'
import { bookContext } from '../src/services/assistant.js'
import { contextUsage, formatTokenCount } from '../src/utils/context-usage.js'
import { loadPreferences, preferences, updatePreferences } from '../src/store/preferences.js'
import { aiProfiles, activeAiProfile, loadAiProfiles, saveAiProfile, selectAiProfile } from '../src/store/ai-profiles.js'
import { providerInfo, supportsReasoning } from '../src/services/ai-providers.js'
import { activeAssistantSession, assistantSessions, deleteAssistantSession, newAssistantSession, setAssistantProposalStatus, selectAssistantSession, sendAssistantMessage } from '../src/store/assistant-sessions.js'

const props = defineProps({ book: Object, articleId: String, body: String, selectedText: String, systemPrompt: String, fullscreen: Boolean, open: Boolean })
const emit = defineEmits(['close', 'clear-selection', 'apply', 'toggle-fullscreen'])
loadAiProfiles()
loadPreferences()
const prefs = preferences
const draft = ref(''), scrollTop = ref(0), followTick = ref(0), bottomAnchor = ref(''), bottomAnchorId = ref('assistant-end-0'), modelMenuOpen = ref(false), effortMenuOpen = ref(false), contextMenuOpen = ref(false), approvalMenuOpen = ref(false), fullWarningOpen = ref(false), sessionMenuOpen = ref(false), deletingSession = ref(null)
const profile = computed(() => activeAiProfile())
const session = computed(() => props.book?.id ? activeAssistantSession(props.book.id) : null)
const bookSessions = computed(() => { const bookId = props.book?.id; return bookId ? assistantSessions.sessions.filter(item => item.bookId === bookId).sort((a, b) => b.updatedAt - a.updatedAt) : [] })
const effortOptions = computed(() => profile.value?.provider === 'deepseek' ? ['auto', 'high', 'max'] : ['auto', 'low', 'medium', 'high'])
const usage = computed(() => {
  if (!props.book) return contextUsage({})
  const system = bookContext(props.book, props.articleId, props.body || '', props.selectedText || '', props.systemPrompt, prefs.aiApprovalMode)
  const messages = (session.value?.messages || []).filter(item => item.role === 'user' || (item.role === 'assistant' && !item.streaming)).slice(-14)
  return contextUsage({ system, summary: session.value?.summary || '', messages, draft: draft.value, limit: profile.value?.contextWindow })
})
function effortLabel(value) { return ({ auto: '自动', low: '低', medium: '中', high: '高', max: '最高' })[value || 'auto'] || '自动' }
function closeMenus() { sessionMenuOpen.value = false; modelMenuOpen.value = false; effortMenuOpen.value = false; contextMenuOpen.value = false; approvalMenuOpen.value = false }
function toggleMenu(which) { const menus = { session: sessionMenuOpen, model: modelMenuOpen, effort: effortMenuOpen, context: contextMenuOpen, approval: approvalMenuOpen }; const next = !menus[which].value; closeMenus(); menus[which].value = next }
function chooseApproval(mode) { closeMenus(); if (mode === 'full' && prefs.aiApprovalMode !== 'full') fullWarningOpen.value = true; else updatePreferences({ aiApprovalMode: mode }) }
function confirmFullAccess() { updatePreferences({ aiApprovalMode: 'full' }); fullWarningOpen.value = false }
let scrollRevision = 0, scrollTimer = null
function scrollToBottom() {
  if (scrollTimer) return
  scrollTimer = setTimeout(() => {
    scrollTimer = null
    const id = `assistant-end-${++scrollRevision}`
    bottomAnchorId.value = id
    nextTick(() => {
      bottomAnchor.value = id
      // A growing number also forces App-Vue scroll-view to reapply its position
      // when an anchor update and a streamed text layout land in the same frame.
      scrollTop.value = 1000000 + scrollRevision
      followTick.value = scrollRevision
    })
  }, 24)
}
watch(() => props.open, open => { if (open) scrollToBottom(); else closeMenus() }, { immediate: true })
watch(() => props.fullscreen, () => { if (props.open) scrollToBottom() })
watch(() => {
  const messages = session.value?.messages || []
  const last = messages[messages.length - 1]
  return [session.value?.id, messages.length, last?.content.length, last?.thinking?.length, session.value?.proposals.length]
}, () => { if (props.open) scrollToBottom() })
watch(() => props.selectedText, value => { if (value && props.open) scrollToBottom() })
onUnmounted(() => clearTimeout(scrollTimer))
function createSession() { if (props.book?.id) newAssistantSession(props.book.id); sessionMenuOpen.value = false; scrollToBottom() }
function switchSession(id) { selectAssistantSession(props.book.id, id); sessionMenuOpen.value = false; scrollToBottom() }
function chooseModel(item, model) { saveAiProfile({ ...item, model }); selectAiProfile(item.id); closeMenus() }
function chooseEffort(effort) { if (!profile.value) return; saveAiProfile({ ...profile.value, effort }); closeMenus() }
function askDelete(item) { sessionMenuOpen.value = false; if (item.pending) return uni.showToast({ title: '请等待当前回复完成', icon: 'none' }); deletingSession.value = item }
function confirmDelete() { if (!props.book || !deletingSession.value) return; try { deleteAssistantSession(props.book.id, deletingSession.value.id); deletingSession.value = null; scrollToBottom() } catch (error) { deletingSession.value = null; uni.showToast({ title: error.message, icon: 'none' }) } }
function openSettings() { modelMenuOpen.value = false; uni.navigateTo({ url: '/pages/settings/index' }) }
function getProposal(index) { return session.value?.proposals[index] }
function rejectProposal(index) { if (props.book?.id) setAssistantProposalStatus(props.book.id, index, 'rejected') }
function acceptProposal(index) { if (props.book?.id) setAssistantProposalStatus(props.book.id, index, 'accepted') }
defineExpose({ getProposal, acceptProposal })
function send() {
  const content = draft.value.trim()
  if (!content || session.value?.pending || !props.book) return
  draft.value = ''
  try {
    sendAssistantMessage({ book: props.book, articleId: props.articleId, draft: props.body, selectedText: props.selectedText, profile: profile.value, systemPrompt: props.systemPrompt, approvalMode: prefs.aiApprovalMode, content }).catch(() => {})
    emit('clear-selection')
    scrollToBottom()
  } catch (error) { draft.value = content; uni.showToast({ title: error.message, icon: 'none' }) }
}
</script>

<style scoped>
.assistant-panel { position:relative; height:min(690px,calc(100vh - 170px)); min-height:360px; display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--line); border-radius:18px; box-shadow:0 16px 45px var(--shadow); overflow:hidden; transition:height .38s cubic-bezier(.22,.8,.22,1),border-radius .38s ease; }.assistant-panel.fullscreen { height:calc(100vh - var(--status-bar-height) - 78px); border-radius:12px; }.assistant-head { display:flex; align-items:center; justify-content:space-between; padding:16px; border-bottom:1px solid var(--line); }.assistant-kicker { font-size:10px; color:var(--accent); letter-spacing:.1em; }.assistant-title { margin-top:4px; font-size:16px; font-weight:700; }.head-actions { display:flex; gap:7px; }.head-actions view { min-width:28px; height:28px; padding:0 4px; border-radius:8px; background:var(--surface-alt); text-align:center; line-height:28px; color:var(--muted); font-size:16px; }.assistant-bar { display:flex; gap:8px; padding:9px 12px; border-bottom:1px solid var(--line); }.bar-choice { min-width:0; flex:1; display:flex; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:8px; background:var(--surface-alt); color:var(--text); font-size:11px; }.bar-choice text:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.bar-new { color:var(--accent); font-size:11px; padding:8px 4px; white-space:nowrap; }.assistant-selection { margin:9px 12px 0; padding:9px 11px; border-left:3px solid var(--accent); background:var(--accent-soft); border-radius:8px; font-size:11px; }.assistant-selection>text { color:var(--accent); }.assistant-selection>view { margin:6px 0; max-height:45px; overflow:hidden; line-height:1.5; }.assistant-selection .selection-clear { color:var(--muted); }.assistant-messages { flex:1; min-height:0; padding:14px 12px; box-sizing:border-box; }.assistant-empty { padding:42px 14px; text-align:center; font-size:15px; font-weight:650; }.assistant-empty text { display:block; margin-top:9px; color:var(--muted); font-size:11px; line-height:1.7; font-weight:400; }.assistant-star { margin:0 auto 14px; width:43px; height:43px; border-radius:14px; background:var(--accent-soft); color:var(--accent); line-height:43px; font-size:23px; }.assistant-message { margin-bottom:16px; }.assistant-message.user { padding-left:20px; }.message-role { color:var(--muted); font-size:10px; }.message-text { margin-top:5px; padding:11px; background:var(--surface-alt); border-radius:11px; font-size:12px; line-height:1.7; white-space:pre-wrap; overflow-wrap:anywhere; }.assistant-message.user .message-text { background:var(--accent-soft); }.stream-caret { color:var(--accent); animation:blink .7s step-end infinite; }.thinking-block { max-height:165px; overflow:auto; margin-top:7px; padding:10px; background:var(--accent-soft); border-left:2px solid var(--accent); border-radius:8px; color:var(--muted); font-size:11px; line-height:1.6; white-space:pre-wrap; }.thinking-block>text { display:block; color:var(--accent); font-size:10px; margin-bottom:5px; }.proposal-card { margin:0 0 15px; padding:12px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }.proposal-label { color:var(--accent); font-size:10px; }.proposal-title { margin-top:5px; font-size:12px; font-weight:650; }.proposal-diff { margin-top:8px; padding:9px; border-radius:8px; background:var(--surface-alt); font-size:11px; line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }.proposal-diff>text:first-child,.proposal-diff>text:last-child { color:var(--muted); }.diff-removed,.diff-added { display:block; padding:3px 6px; margin:2px 0; border-radius:5px; }.diff-removed { color:#b94a54; background:rgba(205,82,91,.15); text-decoration:line-through; }.diff-added { color:#237b5c; background:rgba(50,167,119,.17); }.proposal-error { color:var(--danger); font-size:11px; margin-top:10px; }.proposal-actions { display:flex; justify-content:flex-end; gap:9px; margin-top:10px; }.proposal-actions view { padding:8px 11px; border-radius:8px; background:var(--surface-alt); color:var(--muted); font-size:11px; }.proposal-actions view:last-child { background:var(--accent); color:white; }.assistant-composer { margin:0 12px 12px; padding:9px; border:1px solid var(--line); border-radius:12px; background:var(--surface-alt); }.assistant-composer textarea { width:100%; min-height:45px; max-height:120px; color:var(--text); background:transparent; font-size:12px; line-height:1.5; }.composer-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:10px; }.model-trigger { min-width:0; display:flex; gap:6px; color:var(--muted); }.model-trigger text:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.send-button { padding:8px 11px; border-radius:8px; background:var(--accent); color:#fff; white-space:nowrap; }.send-button.disabled { opacity:.5; }.pop-list { position:absolute; z-index:5; left:12px; right:12px; max-height:245px; overflow:auto; padding:7px; border:1px solid var(--line); border-radius:13px; background:var(--surface); box-shadow:0 15px 40px var(--shadow); animation:pop-in .18s ease; }.session-list { top:104px; }.model-list { bottom:75px; }.pop-list view { padding:9px; border-radius:8px; font-size:11px; }.pop-list view.active { color:var(--accent); background:var(--accent-soft); }.session-list>view { display:flex; justify-content:space-between; gap:10px; }.session-list small { color:var(--muted); white-space:nowrap; }.profile-group>text { color:var(--muted); font-size:10px; }.profile-group>view { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.empty-model { color:var(--accent); }@keyframes blink { 50% { opacity:0; } }@keyframes pop-in { from { opacity:0; transform:translateY(7px); } }
.session-option { align-items:center; }.session-label { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }.session-label text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.session-delete { width:26px; height:26px; padding:0 !important; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--muted); border-radius:8px; font-size:16px !important; }.session-delete:active { color:var(--danger); background:var(--surface-alt); }.effort-group { border-top:1px solid var(--line); margin-top:5px; }.effort-group>text { color:var(--muted); font-size:10px; }.effort-options { display:flex; flex-wrap:wrap; gap:4px; padding:5px 0 !important; }.effort-options>view { padding:7px 9px !important; background:var(--surface-alt); }.delete-shade { position:absolute; z-index:12; inset:0; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(9,13,22,.48); animation:pop-in .18s ease; }.delete-card { width:100%; max-width:320px; padding:20px; border:1px solid var(--line); border-radius:17px; background:var(--surface); box-shadow:0 20px 55px var(--shadow); }.delete-heading { font-size:16px; font-weight:700; }.delete-message { margin-top:9px; color:var(--muted); font-size:12px; line-height:1.6; overflow-wrap:anywhere; }.delete-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:21px; }.delete-actions view { padding:9px 13px; border-radius:9px; background:var(--surface-alt); color:var(--text); font-size:11px; }.delete-actions .destructive { background:var(--danger); color:#fff; }
.head-action { width:32px; min-width:32px !important; height:32px !important; padding:0 !important; display:flex; align-items:center; justify-content:center; border:1px solid transparent; border-radius:9px; transition:background .22s ease,color .22s ease,transform .22s ease,border-color .22s ease; }
.head-action:active { transform:scale(.88); color:var(--accent); border-color:var(--line); }
.head-action :deep(.glyph) { width:18px; min-width:0 !important; height:18px !important; padding:0 !important; background:transparent !important; line-height:normal; }
.bar-choice,.model-trigger,.bar-new,.send-button { align-items:center; transition:background .25s ease,color .25s ease,transform .22s ease,box-shadow .25s ease; }
.bar-choice { min-height:37px; box-sizing:border-box; font-size:12px; padding:7px 11px; border:1px solid transparent; }
.bar-choice.selected,.model-trigger.selected { background:var(--accent-soft); color:var(--accent); border-color:var(--line); }
.bar-choice:active,.bar-new:active,.model-trigger:active,.send-button:not(.disabled):active { transform:scale(.97); }
.bar-choice :deep(.glyph),.model-trigger :deep(.glyph) { width:16px; height:16px; color:var(--muted); }
.bar-new { display:flex; gap:5px; align-items:center; font-weight:600; }
.bar-new :deep(.glyph) { width:14px; height:14px; }
.assistant-star { display:flex; justify-content:center; align-items:center; }
.assistant-star :deep(.glyph) { width:22px; height:22px; }
.assistant-composer { transition:border-color .25s ease,box-shadow .25s ease,background .25s ease; }
.assistant-composer:focus-within { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); background:var(--surface); }
.model-trigger { max-width:72%; padding:6px 8px; border:1px solid transparent; border-radius:8px; font-size:11px; }
.send-button { display:flex; gap:5px; align-items:center; justify-content:center; min-width:65px; font-weight:600; }
.send-button:not(.disabled):active { box-shadow:0 4px 12px var(--shadow); }
.send-button :deep(.glyph) { width:15px; height:15px; }
.menu-scrim { position:absolute; inset:0; z-index:4; visibility:hidden; opacity:0; pointer-events:none; transition:opacity .22s ease,visibility .22s ease; background:rgba(7,12,20,.04); }
.menu-scrim.visible { visibility:visible; opacity:1; pointer-events:auto; }
.pop-list { z-index:6; max-height:min(245px,calc(100% - 145px)); visibility:hidden; opacity:0; pointer-events:none; animation:none; transform:translateY(-7px) scale(.98); transform-origin:top center; transition:opacity .23s ease,transform .28s cubic-bezier(.2,.8,.2,1),visibility .28s ease; }
.session-list { top:120px; }
.pop-list.open { visibility:visible; opacity:1; pointer-events:auto; transform:translateY(0) scale(1); }
.model-list { bottom:105px; transform-origin:bottom center; transform:translateY(8px) scale(.98); }
.menu-caption { padding:6px 9px 7px !important; color:var(--muted); font-size:10px !important; letter-spacing:.04em; }
.session-option,.profile-group>view,.effort-options>view { transition:background .22s ease,color .22s ease,transform .22s ease; }
.session-option:active,.profile-group>view:active { transform:translateX(3px); }
.session-option.active { box-shadow:inset 2px 0 var(--accent); }
.session-delete :deep(.glyph) { width:15px; height:15px; padding:0 !important; }
.composer-foot { min-height:34px; }
.composer-selectors { display:flex; align-items:center; min-width:0; flex:1; gap:4px; }
.model-trigger,.effort-trigger { display:flex; align-items:center; gap:5px; min-height:28px; box-sizing:border-box; padding:5px 7px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--text); font-size:10px; transition:background .2s ease,transform .2s ease,color .2s ease; }
.model-trigger { max-width:min(60%,155px); }
.effort-trigger { flex:none; color:var(--muted); }
.model-trigger text,.effort-trigger text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.model-trigger:active,.effort-trigger:active { transform:scale(.95); }
.model-trigger :deep(.glyph),.effort-trigger :deep(.glyph) { width:13px; height:13px; color:var(--muted); }
.effort-trigger.selected { background:var(--accent-soft); color:var(--accent); }
.send-button { width:32px; height:32px; min-width:32px; padding:0; border-radius:10px; box-shadow:0 4px 12px var(--shadow); }
.send-button.disabled { box-shadow:none; }
.send-button :deep(.glyph) { width:16px; height:16px; }
.send-pulse { width:5px; height:5px; border-radius:50%; background:#fff; box-shadow:-7px 0 #fff,7px 0 #fff; animation:send-breathe 1s ease-in-out infinite alternate; }
.context-trigger { display:flex; align-items:center; gap:6px; width:max-content; max-width:100%; min-height:22px; padding:2px 6px; margin:2px 0 -2px; border-radius:6px; color:var(--muted); font-size:10px; transition:background .22s ease,color .22s ease; }
.context-trigger.selected,.context-trigger:active { background:var(--accent-soft); color:var(--accent); }
.context-trigger text { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.context-trigger :deep(.glyph) { width:12px; height:12px; }
.context-ring { width:12px; height:12px; flex:none; padding:2px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; border-radius:50%; background:conic-gradient(var(--accent) var(--context-fill),var(--line) 0); }
.context-ring>view { width:7px; height:7px; border-radius:50%; background:var(--surface-alt); }
.model-list,.effort-list,.context-list { bottom:126px; }
.effort-list { left:auto; width:150px; }
.effort-item { margin:2px 0; }
.context-list { max-height:min(250px,calc(100% - 138px)); }
.context-row,.context-total { display:flex; justify-content:space-between; gap:8px; color:var(--muted); }
.context-row text:last-child,.context-total text:last-child { white-space:nowrap; font-variant-numeric:tabular-nums; }
.context-total { border-top:1px solid var(--line); margin-top:4px; color:var(--text); font-weight:650; }
.context-note { color:var(--muted); font-size:10px !important; line-height:1.5; }
@keyframes send-breathe { to { opacity:.35; transform:scale(.7); } }
@media (prefers-reduced-motion:reduce) { .assistant-panel,.head-action,.bar-choice,.model-trigger,.bar-new,.send-button,.assistant-composer,.menu-scrim,.pop-list,.session-option,.profile-group>view,.effort-options>view { transition:none !important; animation:none !important; } }
@media (prefers-reduced-motion:reduce) { .effort-trigger,.context-trigger,.send-pulse { transition:none !important; animation:none !important; } }
.scroll-anchor { height:1px; }
.proposal-card.resolved { opacity:.72; }
.proposal-card.resolved .proposal-label { color:var(--muted); }
.send-button { width:34px; height:34px; padding:0; box-sizing:border-box; border-radius:50%; display:flex; align-items:center; justify-content:center; background:#5276ad; color:#fff; box-shadow:0 3px 10px rgba(60,96,157,.24); transition:transform .2s ease,box-shadow .2s ease; }
.send-button:active { transform:scale(.9); }
.composer-meta { display:flex; align-items:center; justify-content:space-between; gap:4px; min-width:0; }
.approval-trigger { display:flex; align-items:center; gap:4px; padding:4px 6px; border-radius:7px; color:var(--muted); font-size:10px; white-space:nowrap; transition:background .2s ease,color .2s ease; }
.approval-trigger.selected { background:var(--accent-soft); color:var(--accent); }
.approval-trigger :deep(.glyph) { width:12px; height:12px; }
.approval-list { bottom:126px; }
.approval-option { display:flex; flex-direction:column; gap:4px; margin:2px 0; transition:background .2s ease,transform .2s ease; }
.approval-option:active { transform:scale(.98); }
.approval-option strong { font-size:12px; }
.approval-option text { color:var(--muted); font-size:10px; }
.approval-option.active { background:var(--accent-soft); color:var(--accent); }
@media (prefers-reduced-motion:reduce) { .approval-trigger,.approval-option { transition:none; } }
</style>
