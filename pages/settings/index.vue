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
                <view class="cursor-option-title">光标样式</view>
                <view class="cursor-style-list"><view class="cursor-style-choice" :class="{ selected: prefs.cursorStyle === 'beam' }" @tap="setOption('cursorStyle', 'beam')"><view class="cursor-style-preview beam-preview">字<view></view></view><text>经典竖线</text></view><view class="cursor-style-choice" :class="{ selected: prefs.cursorStyle === 'neovim' }" @tap="setOption('cursorStyle', 'neovim')"><view class="cursor-style-preview block-preview">字<view></view></view><text>Neovim 方块</text></view></view>
                <view class="cursor-option-title">拖尾颜色</view>
                <view class="cursor-colors"><view v-for="color in cursorColors" :key="color" class="cursor-color" :class="{ selected: prefs.cursorTrailColor.toLowerCase() === color }" :style="{ backgroundColor: color }" @tap="chooseCursorColor(color)"><text v-if="prefs.cursorTrailColor.toLowerCase() === color">✓</text></view><view class="cursor-custom" :class="{ selected: !cursorColors.includes(prefs.cursorTrailColor.toLowerCase()) }" @tap="openColorPicker"><view class="cursor-custom-dot" :style="{ backgroundColor: prefs.cursorTrailColor }"></view><text>自定义</text></view></view>
                <view class="cursor-length-row"><view class="cursor-option-title">拖尾长度</view><text class="cursor-length-value">{{ trailLengthDraft }} px</text></view>
                <slider class="cursor-length-slider" :value="trailLengthDraft" :min="0" :max="96" :step="1" :activeColor="prefs.cursorTrailColor" :backgroundColor="themeClass() === 'theme-dark' ? '#404653' : '#dfe4ed'" block-color="#ffffff" :block-size="20" @changing="onTrailLengthChanging" @change="onTrailLengthChange" />
                <view class="cursor-demo"><view v-if="prefs.cursorStyle !== 'neovim'" class="cursor-demo-line" :style="{ width: trailLengthDraft + 'px', background: prefs.cursorTrailColor, boxShadow: `0 0 5px ${prefs.cursorTrailColor}` }"></view><view class="cursor-demo-caret" :class="{ block: prefs.cursorStyle === 'neovim' }" :style="{ backgroundColor: prefs.cursorTrailColor, boxShadow: `0 0 12px ${prefs.cursorTrailColor}` }"></view><text>字句之间</text></view>
              </view>
            </view></view>
            <view class="preview-column"><view class="preview-caption">实时预览</view><view class="type-preview card" :style="{ fontFamily: fontFamilyFor(prefs.font), fontSize: prefs.fontSize + 'px' }"><view>第一章</view><view>写下第一句，接下来的故事就有了开始。</view><view>窗外的风很轻，纸上的字也慢慢有了方向。</view></view></view>
          </view>
        </view>
      </view>
    </view>
    <view v-if="colorPickerOpen" class="color-picker-overlay" :class="{ closing: colorPickerClosing }" @tap="closeColorPicker">
      <view class="color-picker-modal" @tap.stop>
        <view class="color-picker-head"><view><view class="modal-eyebrow">光标外观</view><view class="color-picker-title">选择一抹颜色</view></view><view class="modal-close" @tap="closeColorPicker">×</view></view>
        <view class="color-plane" :style="{ backgroundColor: hueColor }" @touchstart.stop="setPickerPoint" @touchmove.stop="setPickerPoint" @tap.stop="setPickerPoint"><view class="color-plane-white"></view><view class="color-plane-black"></view><view class="color-plane-knob" :style="{ left: pickerSaturation + '%', top: (100 - pickerValue) + '%' }"></view></view>
        <view class="hue-caption"><text>色相</text><text>轻触色板调整明暗与浓淡</text></view>
        <view class="hue-track"><slider :value="pickerHue" :min="0" :max="359" :step="1" activeColor="transparent" backgroundColor="transparent" block-color="#ffffff" :block-size="20" @changing="setPickerHue" @change="setPickerHue" /></view>
        <view class="color-picker-bottom"><view class="color-picker-preview"><view :style="{ backgroundColor: pickerColor }"></view><text>光标预览</text></view><view class="color-picker-actions"><text @tap="closeColorPicker">取消</text><text class="color-picker-apply" @tap="applyPickerColor">应用颜色</text></view></view>
      </view>
    </view>
    <AppDialog :visible="!!errorMessage" title="无法使用该字体" :message="errorMessage" confirm-text="知道了" @cancel="errorMessage = ''" @confirm="errorMessage = ''" />
    <AppDialog :visible="!!removeId" title="移除字体" :message="`确定移除「${fontLabel(removeId)}」？已写的文字不会删除。`" confirm-text="移除" :destructive="true" @cancel="removeId = ''" @confirm="confirmRemove" />
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, onMounted, onUnmounted, ref } from 'vue'
import { loadPreferences, updatePreferences, themeClass } from '../../src/store/preferences'
import { fontFamilyFor, fontLabel, loadBundledFont, loadSelectedFont, loadCustomFont, importFont, removeFont } from '../../src/services/fonts'
import AppNav from '../../components/AppNav.vue'
import AppDialog from '../../components/AppDialog.vue'
import { navigatePrimary } from '../../src/store/navigation'
import { hexToHsv, hsvToHex } from '../../src/utils/color'

defineProps({ embedded: { type: Boolean, default: false } })
const emit = defineEmits(['modal-change'])
const prefs = loadPreferences()
const instance = getCurrentInstance()
const themes = [{ id: 'system', label: '跟随系统' }, { id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }]
const cursorColors = ['#819bcb', '#a48bc6', '#78aeb1', '#d0a571', '#d98591']
const trailLengthDraft = ref(prefs.cursorTrailLength)
const colorPickerOpen = ref(false), colorPickerClosing = ref(false)
const pickerHue = ref(0), pickerSaturation = ref(100), pickerValue = ref(100)
const hueColor = computed(() => hsvToHex(pickerHue.value, 100, 100))
const pickerColor = computed(() => hsvToHex(pickerHue.value, pickerSaturation.value, pickerValue.value))
const activePanel = ref(''), closing = ref(false), fontPreviewErrors = ref({})
const panelTitle = computed(() => ({ appearance: '外观主题', fonts: '文章字体', editing: '编辑体验' })[activePanel.value] || '')
const fontChoices = computed(() => [
  { id: 'system', label: '系统默认' }, { id: 'noto', label: '思源宋体' }, { id: 'wenkai', label: '霞鹜文楷' }, { id: 'sans', label: '系统无衬线' },
  ...prefs.customFonts.map(font => ({ id: font.id, label: font.name, custom: true }))
])
const errorMessage = ref(''), removeId = ref('')
let closeTimer = null, colorPickerTimer = null, pickerPointRequest = 0
onMounted(() => { loadSelectedFont().catch(() => {}); loadBundledFont('noto').then(() => loadBundledFont('wenkai')).catch(() => {}) })
onUnmounted(() => { clearTimeout(closeTimer); clearTimeout(colorPickerTimer); emit('modal-change', false) })
function goLibrary() { navigatePrimary('library') }
function openPanel(id) {
  clearTimeout(closeTimer)
  closing.value = false
  activePanel.value = id
  if (id === 'editing') trailLengthDraft.value = prefs.cursorTrailLength
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
function chooseCursorColor(color) { updatePreferences({ cursorTrailColor: color }) }
function onTrailLengthChanging(event) { trailLengthDraft.value = event.detail.value }
function onTrailLengthChange(event) { trailLengthDraft.value = event.detail.value; updatePreferences({ cursorTrailLength: event.detail.value }) }
function openColorPicker() {
  clearTimeout(colorPickerTimer)
  const color = hexToHsv(prefs.cursorTrailColor)
  pickerHue.value = color.hue; pickerSaturation.value = color.saturation; pickerValue.value = color.value
  colorPickerClosing.value = false; colorPickerOpen.value = true
}
function closeColorPicker() {
  if (!colorPickerOpen.value || colorPickerClosing.value) return
  colorPickerClosing.value = true
  colorPickerTimer = setTimeout(() => { colorPickerOpen.value = false; colorPickerClosing.value = false }, 190)
}
function setPickerHue(event) { pickerHue.value = event.detail.value }
function setPickerPoint(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0]
  const x = touch?.clientX ?? touch?.x ?? event.detail?.x, y = touch?.clientY ?? touch?.y ?? event.detail?.y
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  const request = ++pickerPointRequest
  uni.createSelectorQuery().in(instance.proxy).select('.color-plane').boundingClientRect(rect => {
    if (request !== pickerPointRequest || !rect?.width || !rect?.height) return
    pickerSaturation.value = Math.round(Math.min(1, Math.max(0, (x - rect.left) / rect.width)) * 100)
    pickerValue.value = Math.round((1 - Math.min(1, Math.max(0, (y - rect.top) / rect.height))) * 100)
  }).exec()
}
function applyPickerColor() { updatePreferences({ cursorTrailColor: pickerColor.value }); closeColorPicker() }
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
.cursor-colors { gap:11px; }.cursor-color { width:29px; height:29px; }.cursor-custom { display:flex; align-items:center; gap:6px; min-height:34px; padding:4px 9px; border:1px solid var(--line); border-radius:11px; background:var(--surface-alt); color:var(--muted); font-size:11px; font-weight:600; }.cursor-custom.selected { border-color:var(--accent); color:var(--accent); }.cursor-custom-dot { width:16px; height:16px; border-radius:50%; box-shadow:0 0 0 2px var(--surface),0 0 0 3px var(--line); }
.cursor-length-row { margin-bottom:4px; }.cursor-length-value { color:var(--accent); font-size:12px; font-weight:650; }.cursor-length-slider { width:100%; margin:0 0 12px; }.cursor-demo-caret { width:3px; }
.cursor-style-list { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin:0 0 23px; }.cursor-style-choice { display:flex; align-items:center; gap:9px; min-height:54px; padding:9px 11px; border:1px solid var(--line); border-radius:12px; background:var(--surface-alt); color:var(--muted); font-size:11px; font-weight:650; transition:border-color .18s ease,transform .18s ease; }.cursor-style-choice.selected { border-color:var(--accent); color:var(--accent); }.cursor-style-choice:active { transform:scale(.97); }.cursor-style-preview { position:relative; width:29px; height:31px; display:flex; align-items:center; justify-content:center; border-radius:7px; background:var(--surface); color:var(--text); font-size:15px; flex-shrink:0; }.beam-preview view { position:absolute; right:4px; top:5px; width:5px; height:21px; border-radius:2px; background:var(--accent); }.block-preview view { position:absolute; right:3px; top:4px; width:13px; height:23px; border-radius:3px; background:var(--accent); opacity:.5; }.cursor-demo-line { height:7px; }.cursor-demo-caret { width:6px; }.cursor-demo-caret.block { width:16px; opacity:.55; clip-path:polygon(0 10%,70% 0,100% 100%,0 88%); }
.color-picker-overlay { position:fixed; z-index:60; inset:0; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(13,18,28,.48); animation:overlay-in .19s ease both; }.color-picker-overlay.closing { animation:overlay-out .19s ease both; }.color-picker-modal { width:min(390px,calc(100vw - 36px)); padding:23px; border:1px solid var(--line); border-radius:24px; background:var(--surface); color:var(--text); box-shadow:0 26px 75px rgba(0,0,0,.26); animation:modal-in .22s cubic-bezier(.2,.78,.24,1) both; }.color-picker-overlay.closing .color-picker-modal { animation:modal-out .19s ease both; }.color-picker-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:19px; }.color-picker-title { font-size:20px; font-weight:700; margin-top:6px; }
.color-plane { position:relative; width:100%; height:185px; border-radius:14px; overflow:hidden; touch-action:none; }.color-plane-white,.color-plane-black { position:absolute; inset:0; pointer-events:none; }.color-plane-white { background:linear-gradient(90deg,#fff,transparent); }.color-plane-black { background:linear-gradient(0deg,#000,transparent); }.color-plane-knob { position:absolute; z-index:1; width:17px; height:17px; border:3px solid #fff; border-radius:50%; box-shadow:0 1px 6px rgba(0,0,0,.55); transform:translate(-50%,-50%); pointer-events:none; }.hue-caption { display:flex; justify-content:space-between; gap:8px; margin:19px 2px 9px; color:var(--muted); font-size:11px; }.hue-caption text:first-child { color:var(--text); font-weight:650; }.hue-track { height:30px; border-radius:14px; background:linear-gradient(90deg,#f44,#ff0,#0e5,#0ef,#25f,#e4f,#f44); }.hue-track slider { margin:0; }.color-picker-bottom { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:22px; }.color-picker-preview { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:11px; }.color-picker-preview view { width:23px; height:23px; border-radius:8px; box-shadow:0 0 0 1px var(--line); }.color-picker-actions { display:flex; align-items:center; gap:13px; color:var(--muted); font-size:12px; }.color-picker-apply { padding:10px 13px; border-radius:10px; background:var(--accent); color:#fff; font-weight:650; }
@keyframes cursor-options-in { from { opacity:0; transform:translateY(-7px); } }
@keyframes overlay-in { from { opacity:0; } } @keyframes overlay-out { to { opacity:0; } } @keyframes modal-in { from { opacity:0; transform:translateY(18px) scale(.96); } } @keyframes modal-out { to { opacity:0; transform:translateY(12px) scale(.97); } }
@media (max-width:620px) { .section-tile { height:98px; padding:17px 20px; }.section-symbol { width:54px; height:54px; border-radius:16px; }.modal-header { padding:20px 22px 17px; }.modal-body { padding:20px 22px 28px; }.editing-layout { grid-template-columns:1fr; }.preview-column { display:none; } }
@media (max-width:420px) { .theme-grid { gap:7px; }.theme-option { padding:7px; }.theme-label { font-size:11px; }.font-grid { grid-template-columns:1fr; }.font-toolbar { display:block; }.import-link { display:inline-block; margin-bottom:16px; } }
@media (prefers-reduced-motion:reduce) { .section-tile,.theme-option,.font-choice,.toggle,.toggle view,.cursor-color { transition:none; }.settings-overlay,.settings-modal,.settings-overlay.closing,.settings-overlay.closing .settings-modal,.cursor-options,.color-picker-overlay,.color-picker-overlay.closing,.color-picker-modal,.color-picker-overlay.closing .color-picker-modal { animation:none; } }
</style>
