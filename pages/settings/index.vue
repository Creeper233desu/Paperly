<template>
  <view class="settings-root"><view class="screen" :class="themeClass()"><view class="page-wrap">
    <view class="topbar"><view class="brand"><text class="brand-mark">纸</text><text>纸间</text></view><text class="top-action" @tap="goLibrary">回到书架　↗</text></view>
    <view class="settings-heading"><view class="eyebrow">偏好设置</view><view class="page-title">让写作更舒适</view><view class="subtle">字体、光线与专注程度，都由你决定。</view></view>
    <view class="settings-layout"><view class="settings-main"><view class="section-title">外观主题</view><view class="theme-grid"><view v-for="item in themes" :key="item.id" class="theme-option card" :class="{ selected: prefs.theme === item.id }" @tap="setTheme(item.id)"><view class="theme-preview" :class="'preview-' + item.id"><view></view><view></view><view></view></view><view class="theme-label"><text>{{ item.label }}</text><text v-if="prefs.theme === item.id" class="selected-mark">✓</text></view></view></view>
      <view class="section-head"><view class="section-title">文章字体</view><view class="import-link" @tap="importCustom">＋ 导入 TTF / OTF</view></view><view class="font-grid"><view v-for="item in fontChoices" :key="item.id" class="font-choice card" :class="{ selected: prefs.font === item.id }" @tap="chooseFont(item.id)" @longpress="item.custom && askRemove(item.id)"><view class="font-sample" :style="{ fontFamily: fontFamilyFor(item.id) }">春风又绿江南岸</view><view class="font-bottom"><text>{{ item.label }}</text><text v-if="item.custom" class="remove-font" @tap.stop="askRemove(item.id)">移除</text><text v-else-if="prefs.font === item.id" class="selected-mark">✓</text></view></view></view>
      <view class="section-title">编辑体验</view><view class="option-list card"><view class="option-row"><view><view class="option-name">正文字号</view><view class="option-note">当前 {{ prefs.fontSize }} px</view></view><view class="stepper"><text @tap="changeSize(-1)">−</text><text @tap="changeSize(1)">＋</text></view></view><view class="option-row" @tap="setOption('focus', !prefs.focus)"><view><view class="option-name">聚焦当前段落</view><view class="option-note">淡化未在编辑的段落</view></view><view class="toggle" :class="{ on: prefs.focus }"><view></view></view></view><view class="option-row" @tap="setOption('autoPair', !prefs.autoPair)"><view><view class="option-name">自动补全标点</view><view class="option-note">括号、引号与书名号</view></view><view class="toggle" :class="{ on: prefs.autoPair }"><view></view></view></view></view>
    </view><view class="preview-column"><view class="preview-caption">实时预览</view><view class="type-preview card" :style="{ fontFamily: fontFamilyFor(prefs.font), fontSize: prefs.fontSize + 'px' }"><view>第一章</view><view>写下第一句，接下来的故事就有了开始。</view><view>窗外的风很轻，纸上的字也慢慢有了方向。</view></view><view class="preview-note">自定义字体只应用于文章正文。大字体文件加载可能需要几秒。</view></view></view>
  </view></view><AppNav v-if="!embedded" active="settings" />
  <AppDialog :visible="!!errorMessage" title="无法使用该字体" :message="errorMessage" confirm-text="知道了" @cancel="errorMessage = ''" @confirm="errorMessage = ''" />
  <AppDialog :visible="!!removeId" title="移除字体" :message="`确定移除「${fontLabel(removeId)}」？已写的文字不会删除。`" confirm-text="移除" :destructive="true" @cancel="removeId = ''" @confirm="confirmRemove" />
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { loadPreferences, updatePreferences, themeClass } from '../../src/store/preferences'
import { fontFamilyFor, fontLabel, loadBundledFont, loadSelectedFont, loadCustomFont, importFont, removeFont } from '../../src/services/fonts'
import AppNav from '../../components/AppNav.vue'
import AppDialog from '../../components/AppDialog.vue'
import { navigatePrimary } from '../../src/store/navigation'

defineProps({ embedded: { type: Boolean, default: false } })
const prefs = loadPreferences()
const themes = [{ id: 'system', label: '跟随系统' }, { id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }]
const fontChoices = computed(() => [
  { id: 'system', label: '系统默认' }, { id: 'noto', label: '思源宋体' }, { id: 'wenkai', label: '霞鹜文楷' }, { id: 'sans', label: '系统无衬线' },
  ...prefs.customFonts.map(font => ({ id: font.id, label: font.name, custom: true }))
])
const errorMessage = ref(''), removeId = ref('')
onMounted(() => { loadSelectedFont().catch(() => {}); loadBundledFont('noto').then(() => loadBundledFont('wenkai')).catch(() => {}) })
function goLibrary() { navigatePrimary('library') }
function setTheme(theme) { updatePreferences({ theme }) }
function setOption(key, value) { updatePreferences({ [key]: value }) }
function changeSize(delta) { updatePreferences({ fontSize: Math.min(30, Math.max(14, prefs.fontSize + delta)) }) }
async function chooseFont(id) {
  try {
    if (id === 'noto' || id === 'wenkai') await loadBundledFont(id)
    else if (prefs.customFonts.some(font => font.id === id)) await loadCustomFont(prefs.customFonts.find(font => font.id === id))
    updatePreferences({ font: id })
  } catch (error) { errorMessage.value = error.message || '字体加载失败' }
}
async function importCustom() {
  try { await importFont() }
  catch (error) { if (!String(error.message).includes('取消')) errorMessage.value = error.message || '导入失败' }
}
function askRemove(id) { removeId.value = id }
function confirmRemove() { removeFont(removeId.value); removeId.value = '' }
</script>

<style scoped>
.brand { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 750; }.brand-mark { width: 31px; height: 31px; border-radius: 9px; background: var(--accent); color: #fff; text-align: center; line-height: 31px; font-size: 17px; }.settings-heading { margin: 32px 0 30px; }.eyebrow { color: var(--accent); font-size: 11px; letter-spacing: .12em; }.settings-heading .page-title { margin: 13px 0 8px; }
.settings-layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 46px; }.section-title { margin: 25px 0 16px; }.theme-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }.theme-option { padding: 11px; transition: border-color .2s ease, transform .2s ease; }.theme-option:active, .font-choice:active { transform: scale(.98); }.theme-option.selected, .font-choice.selected { border-color: var(--accent); }.theme-preview { height: 83px; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; justify-content: center; gap: 8px; }.theme-preview view { height: 7px; border-radius: 4px; background: currentColor; opacity: .45; }.theme-preview view:nth-child(1) { width: 45%; }.theme-preview view:nth-child(2) { width: 82%; }.theme-preview view:nth-child(3) { width: 65%; }.preview-system { color: #5d6b82; background: linear-gradient(110deg,#e7eaf0 50%,#272d39 50%); }.preview-light { color: #788499; background: #f5f5f2; }.preview-dark { color: #c1c8d4; background: #21252e; }.theme-label { display: flex; justify-content: space-between; padding: 11px 3px 3px; font-size: 12px; font-weight: 600; }.selected-mark { color: var(--accent); }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-top: 22px; }.section-head .section-title { margin: 20px 0 15px; }.import-link { color: var(--accent); font-size: 12px; font-weight: 650; }.font-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }.font-choice { padding: 19px; min-height: 105px; transition: border-color .2s ease, transform .2s ease; }.font-sample { font-size: 21px; line-height: 1.7; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }.font-bottom { display: flex; justify-content: space-between; margin-top: 13px; font-size: 12px; color: var(--muted); }.remove-font { color: var(--danger); }
.option-list { padding: 0 20px; }.option-row { display: flex; align-items: center; justify-content: space-between; min-height: 78px; border-bottom: 1px solid var(--line); gap: 12px; }.option-row:last-child { border-bottom: none; }.option-name { font-size: 14px; font-weight: 600; }.option-note { color: var(--muted); font-size: 11px; margin-top: 5px; }.stepper { display: flex; gap: 7px; }.stepper text { width: 33px; height: 33px; line-height: 33px; text-align: center; border-radius: 9px; color: var(--accent); background: var(--accent-soft); font-size: 22px; }.toggle { width: 42px; height: 25px; border-radius: 20px; background: var(--line); padding: 3px; transition: background .2s ease; }.toggle view { width: 19px; height: 19px; border-radius: 50%; background: #fff; transition: transform .2s ease; }.toggle.on { background: var(--accent); }.toggle.on view { transform: translateX(17px); }
.preview-column { position: sticky; top: 55px; height: fit-content; }.preview-caption { font-size: 11px; color: var(--muted); margin: 26px 0 16px; }.type-preview { padding: 35px 27px; min-height: 330px; line-height: 1.85; }.type-preview view:first-child { color: var(--muted); font-size: .75em; margin-bottom: 23px; }.type-preview view:nth-child(2) { margin-bottom: 22px; }.type-preview view:nth-child(3) { color: var(--muted); }.preview-note { font-size: 11px; color: var(--muted); line-height: 1.6; margin-top: 14px; }
@media (max-width: 700px) { .settings-layout { grid-template-columns: 1fr; }.preview-column { display: none; } }
@media (max-width: 430px) { .theme-grid { gap: 7px; }.theme-option { padding: 7px; }.theme-label { font-size: 11px; }.font-grid { gap: 9px; }.font-choice { padding: 14px; }.font-sample { font-size: 17px; } }
@media (prefers-reduced-motion: reduce) { .theme-option, .font-choice, .toggle, .toggle view { transition: none; } }
</style>
