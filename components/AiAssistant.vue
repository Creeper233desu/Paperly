<template>
  <view class="assistant-panel">
    <view class="assistant-head"><view><text class="assistant-kicker">纸间 · DEEPSEEK</text><view class="assistant-title">写作助手</view></view><view class="assistant-close" @tap="$emit('close')">×</view></view>
    <view v-if="selectedText" class="assistant-selection"><text>正在讨论的文字</text><view>{{ selectedText }}</view><text class="selection-clear" @tap="$emit('clear-selection')">清除选区</text></view>
    <scroll-view class="assistant-messages" scroll-y :scroll-top="scrollTop">
      <view v-if="!messages.length" class="assistant-empty"><view class="assistant-star">✦</view><view>和你的文字聊聊</view><text>可以询问表达、节奏与情节，也可以请助手提议增添或删除正文。</text></view>
      <view v-for="(message, index) in messages" :key="index" class="assistant-message" :class="message.role"><text class="message-role">{{ message.role === 'user' ? '你' : '纸间助手' }}</text><view class="message-text">{{ message.content }}</view></view>
      <view v-for="(proposal, index) in proposals" :key="index" class="proposal-card"><view class="proposal-label">待确认的正文修改</view><view class="proposal-title">{{ proposal.title }} · {{ proposal.description }}</view><view class="proposal-diff"><text>{{ proposal.contextBefore }}</text><text v-if="proposal.removed" class="diff-removed">− {{ proposal.removed }}</text><text v-if="proposal.added" class="diff-added">＋ {{ proposal.added }}</text><text>{{ proposal.contextAfter }}</text></view><view v-if="proposal.error" class="proposal-error">{{ proposal.error }}</view><view v-else class="proposal-actions"><view @tap="removeProposal(index)">忽略</view><view @tap="$emit('apply', index)">接受修改</view></view></view>
      <view v-if="pending" class="assistant-thinking">正在思考 ···</view>
    </scroll-view>
    <view class="assistant-composer"><textarea v-model="draft" auto-height maxlength="2000" placeholder="问一问这段文字，或描述想要的改动…" /><view class="composer-foot"><text>{{ model }}</text><view :class="{ disabled: pending || !draft.trim() }" @tap="send">发送 ↗</view></view></view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import { askDeepSeek, planBookEdit } from '../src/services/assistant'

const props = defineProps({ book: Object, articleId: String, body: String, selectedText: String, apiKey: String, model: String, systemPrompt: String })
const emit = defineEmits(['close', 'clear-selection', 'apply'])
const draft = ref(''), pending = ref(false), messages = ref([]), proposals = ref([]), scrollTop = ref(0)
watch(() => props.book?.id, () => { messages.value = []; proposals.value = [] })
watch(() => props.selectedText, value => { if (value) scrollTop.value += 1000 })
async function send() {
  const content = draft.value.trim()
  if (!content || pending.value) return
  draft.value = ''; messages.value.push({ role: 'user', content }); pending.value = true; scrollTop.value += 1000
  try {
    const result = await askDeepSeek({ key: props.apiKey, model: props.model, book: props.book, articleId: props.articleId, draft: props.body, selectedText: props.selectedText, systemPrompt: props.systemPrompt, messages: messages.value })
    messages.value.push({ role: 'assistant', content: result.content || (result.calls.length ? '我准备了以下正文修改，请确认。' : '没有收到文字回复。') })
    proposals.value = result.calls.map(call => {
      try { return planBookEdit(props.book, call, props.articleId, props.body) }
      catch (error) { return { title: '无法定位正文', description: call.name, excerpt: JSON.stringify(call.args), error: error.message } }
    })
    emit('clear-selection')
  } catch (error) { messages.value.push({ role: 'assistant', content: `请求失败：${error.message || '请检查网络和配置'}` }) }
  finally { pending.value = false; scrollTop.value += 1000 }
}
function getProposal(index) { return proposals.value[index] }
function removeProposal(index) { proposals.value.splice(index, 1) }
defineExpose({ getProposal, removeProposal })
</script>

<style scoped>
.assistant-panel { height:min(650px,calc(100vh - 190px)); min-height:360px; display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--line); border-radius:20px; box-shadow:0 16px 45px var(--shadow); overflow:hidden; }
.assistant-head { display:flex; align-items:center; justify-content:space-between; padding:17px 18px; border-bottom:1px solid var(--line); }.assistant-kicker { font-size:10px; color:var(--accent); letter-spacing:.12em; }.assistant-title { margin-top:4px; font-size:16px; font-weight:700; }.assistant-close { width:27px; height:27px; border-radius:8px; background:var(--surface-alt); text-align:center; line-height:25px; color:var(--muted); font-size:22px; }
.assistant-selection { margin:11px 12px 0; padding:10px 12px; border-left:3px solid var(--accent); background:var(--accent-soft); border-radius:9px; font-size:11px; }.assistant-selection>text { color:var(--accent); }.assistant-selection>view { margin:7px 0; max-height:50px; overflow:hidden; line-height:1.5; }.assistant-selection .selection-clear { color:var(--muted); }
.assistant-messages { flex:1; min-height:0; padding:14px 13px; box-sizing:border-box; }.assistant-empty { padding:42px 12px; text-align:center; font-size:15px; font-weight:650; }.assistant-empty text { display:block; margin-top:10px; color:var(--muted); font-size:12px; line-height:1.7; font-weight:400; }.assistant-star { margin:0 auto 14px; width:44px; height:44px; border-radius:14px; background:var(--accent-soft); color:var(--accent); line-height:44px; font-size:24px; }.assistant-message { margin-bottom:16px; }.assistant-message.user { padding-left:22px; }.message-role { color:var(--muted); font-size:10px; }.message-text { margin-top:5px; padding:11px 12px; background:var(--surface-alt); border-radius:12px; font-size:12px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }.assistant-message.user .message-text { background:var(--accent-soft); }.assistant-thinking { color:var(--muted); font-size:12px; padding:5px 8px 18px; }
.proposal-card { margin:0 0 15px; padding:12px; border:1px solid var(--line); border-radius:13px; background:var(--surface); }.proposal-label { color:var(--accent); font-size:10px; }.proposal-title { margin-top:5px; font-size:12px; font-weight:650; }.proposal-excerpt { max-height:80px; overflow:hidden; margin-top:8px; padding:9px; border-radius:8px; background:var(--surface-alt); color:var(--muted); font-size:11px; line-height:1.55; white-space:pre-wrap; }.proposal-error { color:var(--danger); font-size:11px; margin-top:10px; }.proposal-apply { display:inline-block; margin-top:10px; padding:8px 11px; border-radius:9px; background:var(--accent); color:#fff; font-size:11px; }
.proposal-diff { margin-top:9px; padding:10px; border-radius:9px; background:var(--surface-alt); font-size:11px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }.proposal-diff>text:first-child,.proposal-diff>text:last-child { color:var(--muted); }.proposal-diff .diff-removed,.proposal-diff .diff-added { display:block; padding:3px 6px; margin:2px 0; border-radius:5px; }.diff-removed { color:#b94a54; background:rgba(205,82,91,.15); text-decoration:line-through; }.diff-added { color:#237b5c; background:rgba(50,167,119,.17); }.proposal-actions { display:flex; justify-content:flex-end; gap:9px; margin-top:10px; }.proposal-actions view { padding:8px 11px; border-radius:9px; background:var(--surface-alt); color:var(--muted); font-size:11px; }.proposal-actions view:last-child { background:var(--accent); color:#fff; }
.assistant-composer { margin:0 12px 12px; padding:10px; border:1px solid var(--line); border-radius:13px; background:var(--surface-alt); }.assistant-composer textarea { width:100%; min-height:45px; max-height:120px; color:var(--text); font-size:12px; line-height:1.5; background:transparent; }.composer-foot { display:flex; align-items:center; justify-content:space-between; color:var(--muted); font-size:10px; }.composer-foot view { padding:7px 10px; border-radius:8px; background:var(--accent); color:#fff; font-size:11px; }.composer-foot view.disabled { opacity:.45; }
</style>
