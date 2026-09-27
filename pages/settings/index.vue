<template>
  <view class="settings-root" :class="themeClass()">
    <view class="screen" :class="themeClass()"><view class="page-wrap">
      <view class="topbar">
        <view class="brand"><text class="brand-mark">纸</text><text>纸间</text></view>
        <text class="top-action" @tap="goLibrary">回到书架</text>
      </view>
      <view class="settings-heading"><view class="eyebrow">偏好设置</view><view class="page-title">让写作更舒适</view></view>
      <view class="settings-sections">
        <view class="section-tile card" @tap="openPanel('appearance')"><view class="section-symbol appearance-symbol"><view></view></view><text>外观主题</text></view>
        <view class="section-tile card" @tap="openPanel('fonts')"><view class="section-symbol font-symbol">Aa</view><text>文章字体</text></view>
        <view class="section-tile card" @tap="openPanel('editing')"><view class="section-symbol editing-symbol"><view></view><view></view><view></view></view><text>编辑体验</text></view>
      </view>
    </view></view>
    <AppNav v-if="!embedded" active="settings" />
    <view v-if="activePanel" class="settings-overlay" :class="{ closing }" @tap="closePanel">
      <view class="settings-modal" @tap.stop>
        <view class="modal-header"><view><view class="modal-eyebrow">纸间 · 设置</view><view class="modal-title">{{ panelTitle }}</view></view><view class="modal-close" @tap="closePanel">×</view></view>
        <view class="modal-body">
          <view v-if="activePanel === 'appearance'">
            <view class="modal-intro">选择适合此刻的光线</view>
            <view class="theme-grid">
              <view v-for="item in themes" :key="item.id" class="theme-option card" :class="{ selected: prefs.theme === item.id }" @tap="setTheme(item.id)">
                <view class="theme-preview" :class="'preview-' + item.id"><view></view><view></view><view></view></view>
                <view class="theme-label"><text>{{ item.label }}</text><text v-if="prefs.theme === item.id" class="selected-mark">✓</text></view>
              </view>
            </view>
          </view>
          <view v-if="activePanel === 'fonts'">
            <view class="font-toolbar"><view class="modal-intro">点选字体即可查看效果并应用</view><view class="import-link" @tap="importCustom">＋ 导入 TTF / OTF</view></view>
            <view class="font-grid">
              <view v-for="item in fontChoices" :key="item.id" class="font-choice card" :class="{ selected: prefs.font === item.id }" @tap="chooseFont(item.id)" @longpress="item.custom && askRemove(item.id)">
                <view class="font-sample" :style="{ fontFamily: fontFamilyFor(item.id) }">春风又绿江南岸</view>
                <view class="font-verse" :style="{ fontFamily: fontFamilyFor(item.id) }">在纸上，写下属于你的下一句。</view>
                <view class="font-bottom"><text>{{ item.label }}</text><text v-if="item.custom" class="remove-font" @tap.stop="askRemove(item.id)">移除</text><text v-else-if="prefs.font === item.id" class="selected-mark">✓</text></view>
                <view v-if="fontPreviewErrors[item.id]" class="font-error">预览失败，点选重试</view>
              </view>
            </view>
          </view>
          <view v-if="activePanel === 'editing'" class="editing-layout">
            <view><view class="modal-intro">让文字跟随你的节奏</view><view class="option-list card">
              <view class="option-row"><view><view class="option-name">正文字号</view><view class="option-note">当前 {{ prefs.fontSize }} px</view></view><view class="stepper"><text @tap="changeSize(-1)">−</text><text @tap="changeSize(1)">＋</text></view></view>
              <view class="option-row" @tap="setOption('focus', !prefs.focus)"><view><view class="option-name">聚焦当前段落</view><view class="option-note">淡化未在编辑的段落</view></view><view class="toggle" :class="{ on: prefs.focus }"><view></view></view></view>
              <view class="option-row" @tap="setOption('autoPair', !prefs.autoPair)"><view><view class="option-name">自动补全标点</view><view class="option-note">括号、引号与书名号</view></view><view class="toggle" :class="{ on: prefs.autoPair }"><view></view></view></view>
              <view class="option-row" @tap="setOption('animatedCursor', !prefs.animatedCursor)"><view><view class="option-name">动画光标</view><view class="option-note">光标移动时显示柔和轨迹</view></view><view class="toggle" :class="{ on: prefs.animatedCursor }"><view></view></view></view>
              <view v-if="prefs.animatedCursor" class="cursor-options">
                <view class="cursor-option-title">拖尾颜色</view>
                <view class="cursor-colors"><view v-for="color in cursorColors" :key="color" class="cursor-color" :class="{ selected: prefs.cursorTrailColor.toLowerCase() === color }" :style="{ backgroundColor: color }" @tap="chooseCursorColor(color)"><text v-if="prefs.cursorTrailColor.toLowerCase() === color">✓</text></view><input class="cursor-hex" :value="colorDraft" maxlength="7" placeholder="#819bcb" @input="colorDraft = $event.detail.value" @blur="saveCursorHex" /></view>
                <view class="cursor-length-row"><view><view class="cursor-option-title">拖尾长度</view><view class="option-note">0–96 px</view></view><view class="cursor-length-controls"><input class="cursor-length-input" type="number" :value="lengthDraft" @input="lengthDraft = $event.detail.value" @blur="saveTrailLength" /><view class="stepper"><text @tap="changeTrailLength(-8)">−</text><text @tap="changeTrailLength(8)">＋</text></view></view></view>
                <view class="cursor-demo"><view class="cursor-demo-line" :style="{ width: prefs.cursorTrailLength + 'px', background: `linear-gradient(90deg, transparent, ${prefs.cursorTrailColor})` }"></view><view class="cursor-demo-caret" :style="{ backgroundColor: prefs.cursorTrailColor, boxShadow: `0 0 12px ${prefs.cursorTrailColor}` }"></view><text>字句之间</text></view>
              </view>
            </view></view>
            <view class="preview-column"><view class="preview-caption">实时预览</view><view class="type-preview card" :style="{ fontFamily: fontFamilyFor(prefs.font), fontSize: prefs.fontSize + 'px' }"><view>第一章</view><view>写下第一句，接下来的故事就有了开始。</view><view>窗外的风很轻，纸上的字也慢慢有了方向。</view></view></view>
          </view>
        </view>
      </view>
    </view>
    <AppDialog :visible="!!errorMessage" title="无法使用该字体" :message="errorMessage" confirm-text="知道了" @cancel="errorMessage = ''" @confirm="errorMessage = ''" />
    <AppDialog :visible="!!removeId" title="移除字体" :message="`确定移除「${fontLabel(removeId)}」？已写的文字不会删除。`" confirm-text="移除" :destructive="true" @cancel="removeId = ''" @confirm="confirmRemove" />
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { loadPreferences, updatePreferences, themeClass } from '../../src/store/preferences'
import { fontFamilyFor, fontLabel, loadBundledFont, loadSelectedFont, loadCustomFont, importFont, removeFont } from '../../src/services/fonts'
import AppNav from '../../components/AppNav.vue'
import AppDialog from '../../components/AppDialog.vue'
import { navigatePrimary } from '../../src/store/navigation'

defineProps({ embedded: { type: Boolean, default: false } })
const emit = defineEmits(['modal-change'])
const prefs = loadPreferences()
const themes = [{ id: 'system', label: '跟随系统' }, { id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }]
const cursorColors = ['#819bcb', '#a48bc6', '#78aeb1', '#d0a571', '#d98591']
const colorDraft = ref(prefs.cursorTrailColor)
const lengthDraft = ref(String(prefs.cursorTrailLength))
const activePanel = ref(''), closing = ref(false), fontPreviewErrors = ref({})
const panelTitle = computed(() => ({ appearance: '外观主题', fonts: '文章字体', editing: '编辑体验' })[activePanel.value] || '')
const fontChoices = computed(() => [
  { id: 'system', label: '系统默认' }, { id: 'noto', label: '思源宋体' }, { id: 'wenkai', label: '霞鹜文楷' }, { id: 'sans', label: '系统无衬线' },
  ...prefs.customFonts.map(font => ({ id: font.id, label: font.name, custom: true }))
])
const errorMessage = ref(''), removeId = ref('')
let closeTimer = null
onMounted(() => { loadSelectedFont().catch(() => {}); loadBundledFont('noto').then(() => loadBundledFont('wenkai')).catch(() => {}) })
onUnmounted(() => { clearTimeout(closeTimer); emit('modal-change', false) })
function goLibrary() { navigatePrimary('library') }
function openPanel(id) {
  clearTimeout(closeTimer)
  closing.value = false
  activePanel.value = id
  if (id === 'editing') { colorDraft.value = prefs.cursorTrailColor; lengthDraft.value = String(prefs.cursorTrailLength) }
  emit('modal-change', true)
  if (id === 'fonts') prepareFontPreviews()
}
function closePanel() {
  if (!activePanel.value || closing.value) return
  closing.value = true
  closeTimer = setTimeout(() => { activePanel.value = ''; closing.value = false; emit('modal-change', false) }, 240)
}
async function prepareFontPreviews() {
  const fonts = [...prefs.customFonts]
  const results = await Promise.allSettled(fonts.map(loadCustomFont))
  fontPreviewErrors.value = Object.fromEntries(fonts.filter((_, index) => results[index].status === 'rejected').map(font => [font.id, true]))
}
function setTheme(theme) { updatePreferences({ theme }) }
function setOption(key, value) { updatePreferences({ [key]: value }) }
function chooseCursorColor(color) { colorDraft.value = color; updatePreferences({ cursorTrailColor: color }) }
function saveCursorHex() { const color = colorDraft.value.trim(); if (/^#[0-9a-f]{6}$/i.test(color)) updatePreferences({ cursorTrailColor: color.toLowerCase() }); else colorDraft.value = prefs.cursorTrailColor }
function saveTrailLength() { const value = Number(lengthDraft.value); if (String(lengthDraft.value).trim() && Number.isFinite(value)) updatePreferences({ cursorTrailLength: Math.min(96, Math.max(0, Math.round(value))) }); lengthDraft.value = String(prefs.cursorTrailLength) }
function changeTrailLength(delta) { const value = Math.min(96, Math.max(0, prefs.cursorTrailLength + delta)); lengthDraft.value = String(value); updatePreferences({ cursorTrailLength: value }) }
function changeSize(delta) { updatePreferences({ fontSize: Math.min(30, Math.max(14, prefs.fontSize + delta)) }) }
async function chooseFont(id) {
  try {
    if (id === 'noto' || id === 'wenkai') await loadBundledFont(id)
    else if (prefs.customFonts.some(font => font.id === id)) await loadCustomFont(prefs.customFonts.find(font => font.id === id))
    const nextErrors = { ...fontPreviewErrors.value }; delete nextErrors[id]; fontPreviewErrors.value = nextErrors
    updatePreferences({ font: id })
  } catch (error) { errorMessage.value = error.message || '字体加载失败' }
}
async function importCustom() {
  try { const font = await importFont(); const nextErrors = { ...fontPreviewErrors.value }; delete nextErrors[font.id]; fontPreviewErrors.value = nextErrors }
  catch (error) { if (!String(error.message).includes('取消')) errorMessage.value = error.message || '导入失败' }
}
function askRemove(id) { removeId.value = id }
function confirmRemove() { removeFont(removeId.value); removeId.value = '' }
</script>

<style scoped>
.brand { display:flex; align-items:center; gap:10px; font-size:20px; font-weight:750; }.brand-mark { width:31px; height:31px; border-radius:9px; background:var(--accent); color:#fff; text-align:center; line-height:31px; font-size:17px; }
.settings-heading { margin:34px 0; }.eyebrow,.modal-eyebrow { color:var(--accent); font-size:11px; letter-spacing:.12em; }.settings-heading .page-title { margin:13px 0 8px; }
.settings-sections { max-width:850px; display:grid; gap:15px; }.section-tile { height:116px; padding:23px 28px; display:flex; align-items:center; gap:24px; font-size:19px; font-weight:650; transition:transform .24s ease,border-color .24s ease; }.section-tile:active { transform:scale(.985); border-color:var(--accent); }
.section-symbol { width:62px; height:62px; flex-shrink:0; border-radius:19px; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; }.appearance-symbol view { width:26px; height:26px; border:2px solid currentColor; border-radius:50%; box-shadow:inset 8px 0 0 var(--accent-soft); }.font-symbol { font-family:Georgia,serif; font-size:28px; }.editing-symbol { flex-direction:column; gap:5px; }.editing-symbol view { width:26px; height:2px; border-radius:2px; background:currentColor; }.editing-symbol view:nth-child(2) { width:18px; margin-left:-8px; }
.settings-overlay { position:fixed; z-index:40; inset:0; display:flex; align-items:center; justify-content:center; padding:14px; background:rgba(13,18,28,.54); animation:overlay-in .24s ease both; }.settings-modal { width:min(720px,calc(100vw - 28px)); height:75vh; max-height:calc(100vh - 28px); min-height:320px; border-radius:28px; background:var(--surface); color:var(--text); border:1px solid var(--line); box-shadow:0 30px 90px rgba(0,0,0,.26); display:flex; flex-direction:column; overflow:hidden; animation:modal-in .28s cubic-bezier(.2,.78,.24,1) both; }.settings-overlay.closing { animation:overlay-out .24s ease both; }.settings-overlay.closing .settings-modal { animation:modal-out .24s ease both; }
.modal-header { flex-shrink:0; padding:26px 30px 20px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; }.modal-title { margin-top:7px; font-size:25px; font-weight:700; }.modal-close { width:34px; height:34px; border-radius:11px; background:var(--surface-alt); color:var(--muted); font-size:25px; line-height:31px; text-align:center; }.modal-body { flex:1; min-height:0; overflow-y:auto; padding:24px 30px 34px; }.modal-intro { color:var(--muted); font-size:13px; margin-bottom:21px; }
.theme-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }.theme-option { padding:11px; transition:border-color .2s ease,transform .2s ease; }.theme-option:active,.font-choice:active { transform:scale(.98); }.theme-option.selected,.font-choice.selected { border-color:var(--accent); }.theme-preview { height:94px; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:center; gap:8px; }.theme-preview view { height:7px; border-radius:4px; background:currentColor; opacity:.45; }.theme-preview view:nth-child(1) { width:45%; }.theme-preview view:nth-child(2) { width:82%; }.theme-preview view:nth-child(3) { width:65%; }.preview-system { color:#5d6b82; background:linear-gradient(110deg,#e7eaf0 50%,#272d39 50%); }.preview-light { color:#788499; background:#f5f5f2; }.preview-dark { color:#c1c8d4; background:#21252e; }.theme-label { display:flex; justify-content:space-between; padding:11px 3px 3px; font-size:12px; font-weight:600; }.selected-mark { color:var(--accent); }
.font-toolbar { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }.import-link { color:var(--accent); font-size:12px; font-weight:650; white-space:nowrap; padding:4px 0; }.font-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }.font-choice { padding:20px; min-height:130px; transition:border-color .2s ease,transform .2s ease; }.font-sample { font-size:23px; line-height:1.55; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }.font-verse { font-size:13px; margin-top:6px; color:var(--muted); overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }.font-bottom { display:flex; justify-content:space-between; margin-top:16px; font-size:12px; color:var(--muted); }.remove-font,.font-error { color:var(--danger); }.font-error { font-size:11px; margin-top:9px; }
.editing-layout { display:grid; grid-template-columns:minmax(0,1fr) 210px; gap:22px; }.option-list { padding:0 18px; }.option-row { display:flex; align-items:center; justify-content:space-between; min-height:77px; border-bottom:1px solid var(--line); gap:12px; }.option-row:last-child { border-bottom:0; }.option-name { font-size:14px; font-weight:600; }.option-note { color:var(--muted); font-size:11px; margin-top:5px; }.stepper { display:flex; gap:7px; }.stepper text { width:33px; height:33px; line-height:33px; text-align:center; border-radius:9px; color:var(--accent); background:var(--accent-soft); font-size:22px; }.toggle { width:42px; height:25px; border-radius:20px; background:var(--line); padding:3px; transition:background .2s ease; }.toggle view { width:19px; height:19px; border-radius:50%; background:#fff; transition:transform .2s ease; }.toggle.on { background:var(--accent); }.toggle.on view { transform:translateX(17px); }.preview-caption { font-size:11px; color:var(--muted); margin-bottom:16px; }.type-preview { padding:28px 20px; min-height:250px; line-height:1.85; }.type-preview view:first-child { color:var(--muted); font-size:.75em; margin-bottom:20px; }.type-preview view:nth-child(2) { margin-bottom:17px; }.type-preview view:nth-child(3) { color:var(--muted); }
.cursor-options { padding:18px 2px 20px; animation:cursor-options-in .22s cubic-bezier(.2,.75,.25,1) both; }.cursor-option-title { color:var(--text); font-size:12px; font-weight:650; margin-bottom:11px; }.cursor-colors { display:flex; align-items:center; flex-wrap:wrap; gap:9px; }.cursor-color { width:27px; height:27px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; box-shadow:0 2px 8px var(--shadow); transition:transform .18s ease,outline .18s ease; }.cursor-color.selected { outline:2px solid var(--accent); outline-offset:3px; transform:scale(1.08); }.cursor-hex { width:92px; height:32px; margin-left:3px; border:1px solid var(--line); border-radius:9px; background:var(--surface-alt); color:var(--text); text-align:center; font-size:11px; }.cursor-length-row { display:flex; align-items:center; justify-content:space-between; margin:24px 0 16px; }.cursor-length-row .cursor-option-title { margin:0; }.cursor-demo { display:flex; align-items:center; min-height:45px; padding:0 16px; border-radius:12px; background:var(--surface-alt); color:var(--muted); font-size:13px; }.cursor-demo-line { height:3px; border-radius:4px; flex-shrink:0; }.cursor-demo-caret { width:2px; height:23px; border-radius:2px; flex-shrink:0; margin-right:9px; }.cursor-demo text { white-space:nowrap; }.cursor-options .stepper text { width:28px; height:28px; line-height:28px; font-size:19px; }
.cursor-length-controls { display:flex; align-items:center; gap:8px; }.cursor-length-input { width:52px; height:30px; border:1px solid var(--line); border-radius:9px; background:var(--surface-alt); color:var(--text); text-align:center; font-size:12px; }
@keyframes cursor-options-in { from { opacity:0; transform:translateY(-7px); } }
@keyframes overlay-in { from { opacity:0; } } @keyframes overlay-out { to { opacity:0; } } @keyframes modal-in { from { opacity:0; transform:translateY(18px) scale(.96); } } @keyframes modal-out { to { opacity:0; transform:translateY(12px) scale(.97); } }
@media (max-width:620px) { .section-tile { height:98px; padding:17px 20px; }.section-symbol { width:54px; height:54px; border-radius:16px; }.modal-header { padding:20px 22px 17px; }.modal-body { padding:20px 22px 28px; }.editing-layout { grid-template-columns:1fr; }.preview-column { display:none; } }
@media (max-width:420px) { .theme-grid { gap:7px; }.theme-option { padding:7px; }.theme-label { font-size:11px; }.font-grid { grid-template-columns:1fr; }.font-toolbar { display:block; }.import-link { display:inline-block; margin-bottom:16px; } }
@media (prefers-reduced-motion:reduce) { .section-tile,.theme-option,.font-choice,.toggle,.toggle view,.cursor-color { transition:none; }.settings-overlay,.settings-modal,.settings-overlay.closing,.settings-overlay.closing .settings-modal,.cursor-options { animation:none; } }
</style>
