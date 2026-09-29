<template>
  <view class="settings-root" :class="themeClass()">
    <view class="screen" :class="themeClass()"><view class="page-wrap">
      <view class="topbar">
        <view class="brand"><image class="brand-mark" src="/static/brand/app-icon.png" mode="aspectFill" /><text>纸间</text></view>
        <text class="top-action" @tap="goLibrary">回到书架</text>
      </view>
      <view class="settings-heading"><view class="eyebrow">偏好设置</view><view class="page-title">让写作更舒适</view></view>
      <view class="settings-sections" :class="{ falling: iconsFalling }">
        <view class="section-tile card" @tap="openPanel('appearance')"><view class="section-symbol appearance-symbol"><view></view></view><text>外观主题</text></view>
        <view class="section-tile card" @tap="openPanel('fonts')"><view class="section-symbol font-symbol">Aa</view><text>文章字体</text></view>
        <view class="section-tile card" @tap="openPanel('editing')"><view class="section-symbol editing-symbol"><view></view><view></view><view></view></view><text>编辑体验</text></view>
        <view class="section-tile card" @tap="openPanel('ai')"><view class="section-symbol ai-symbol">✦</view><text>AI 写作助手</text></view>
        <view class="section-tile card" @tap="openPanel('app')"><view class="section-symbol app-symbol"><UiIcon name="gear" /></view><text>应用设置</text></view>
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
            <view class="accent-heading"><view class="option-name">主题颜色</view><view class="option-note">调整按钮与强调色</view></view>
            <view class="accent-grid"><view v-for="item in accentChoices" :key="item.id" class="accent-choice" :class="{ selected: prefs.accent === item.id }" @tap="setOption('accent', item.id)"><view class="accent-swatch" :style="{ backgroundColor:item.color }"><UiIcon v-if="prefs.accent === item.id" name="check" /></view><text>{{ item.label }}</text></view></view>
          </view>
          <view v-if="activePanel === 'fonts'">
            <view class="font-toolbar"><view class="modal-intro">点选字体即可查看效果并应用</view><view class="import-link" @tap="importCustom">＋ 导入 TTF / OTF</view></view>
            <view class="font-grid">
              <view v-for="item in fontChoices" :key="item.id" class="font-choice card" :class="{ selected: prefs.font === item.id }" @tap="chooseFont(item.id)" @longpress="item.custom && askRemove(item.id)">
                <view class="font-sample" :style="{ fontFamily: fontFamilyFor(item.id) }">夕阳、某处，花火。</view>
                <view class="font-verse" :style="{ fontFamily: fontFamilyFor(item.id) }">写下属于你的下一句。</view>
                <view class="font-bottom"><text>{{ item.label }}</text><text v-if="item.custom" class="remove-font" @tap.stop="askRemove(item.id)">移除</text><text v-else-if="prefs.font === item.id" class="selected-mark">✓</text></view>
                <view v-if="fontPreviewErrors[item.id]" class="font-error">预览失败，点选重试</view>
              </view>
            </view>
          </view>
          <view v-if="activePanel === 'editing'" class="editing-layout">
            <view><view class="modal-intro">让文字跟随你的节奏</view><view class="option-list card">
              <view class="option-row"><view><view class="option-name">正文字号</view><view class="option-note">当前 {{ prefs.fontSize }} px</view></view><view class="stepper"><text @tap="changeSize(-1)">−</text><text @tap="changeSize(1)">＋</text></view></view>
              <view class="option-row" @tap="setOption('focus', !prefs.focus)"><view><view class="option-name">聚焦当前段落</view><view class="option-note">淡化未在编辑的段落</view></view><view class="toggle" :class="{ on: prefs.focus }"><view></view></view></view>
              <view class="option-row" @tap="setOption('autoPair', !prefs.autoPair)"><view><view class="option-name">自动补全标点</view><view class="option-note">括号、引号与「」</view></view><view class="toggle" :class="{ on: prefs.autoPair }"><view></view></view></view>
              <view class="option-row" @tap="setOption('animatedCursor', !prefs.animatedCursor)"><view><view class="option-name">动画光标</view><view class="option-note">光标移动时显示柔和轨迹</view></view><view class="toggle" :class="{ on: prefs.animatedCursor }"><view></view></view></view>
              <view v-if="prefs.animatedCursor" class="cursor-options">
                <view class="cursor-option-title">光标样式</view>
                <view class="cursor-style-list"><view class="cursor-style-choice" :class="{ selected: prefs.cursorStyle === 'beam' }" @tap="setOption('cursorStyle', 'beam')"><view class="cursor-style-preview beam-preview">字<view></view></view><text>经典竖线</text></view><view class="cursor-style-choice" :class="{ selected: prefs.cursorStyle === 'neovim' }" @tap="setOption('cursorStyle', 'neovim')"><view class="cursor-style-preview block-preview">字<view></view></view><text>Neovim 方块</text></view></view>
                <view class="cursor-option-title">拖尾颜色</view>
                <view class="cursor-colors"><view v-for="color in cursorColors" :key="color" class="cursor-color" :class="{ selected: prefs.cursorTrailColor.toLowerCase() === color }" :style="{ backgroundColor: color }" @tap="chooseCursorColor(color)"><text v-if="prefs.cursorTrailColor.toLowerCase() === color">✓</text></view><view class="cursor-custom" :class="{ selected: !cursorColors.includes(prefs.cursorTrailColor.toLowerCase()) }" @tap="openColorPicker"><view class="cursor-custom-dot" :style="{ backgroundColor: prefs.cursorTrailColor }"></view><text>自定义</text></view></view>
                <view class="cursor-length-row"><view class="cursor-option-title">拖尾长度</view><text class="cursor-length-value">{{ trailLengthDraft }} px</text></view>
                <slider class="cursor-length-slider" :value="trailLengthDraft" :min="0" :max="96" :step="1" :activeColor="prefs.cursorTrailColor" :backgroundColor="isDark() ? '#404653' : '#dfe4ed'" block-color="#ffffff" :block-size="20" @changing="onTrailLengthChanging" @change="onTrailLengthChange" />
                <view class="cursor-demo"><view class="cursor-demo-line" :class="{ block: prefs.cursorStyle === 'neovim' }" :style="{ width: trailLengthDraft + 'px', background: prefs.cursorTrailColor, boxShadow: `0 0 5px ${prefs.cursorTrailColor}` }"></view><view class="cursor-demo-caret" :class="{ block: prefs.cursorStyle === 'neovim' }" :style="{ backgroundColor: prefs.cursorTrailColor, boxShadow: `0 0 12px ${prefs.cursorTrailColor}` }"></view><text>字句之间</text></view>
                <view class="cursor-live card" :style="{ '--preview-cursor': prefs.cursorTrailColor, '--preview-trail': trailLengthDraft + 'px' }"><text>实时光标预览</text><view class="cursor-live-line">写下每一个动人的瞬间<view class="cursor-live-motion" :class="{ neovim: prefs.cursorStyle === 'neovim' }"><view class="cursor-live-trail"></view><view class="cursor-live-head"></view></view></view></view>
              </view>
            </view></view>
            <view class="preview-column"><view class="preview-caption">实时预览</view><view class="type-preview card" :style="{ fontFamily: fontFamilyFor(prefs.font), fontSize: prefs.fontSize + 'px' }"><view>第一章</view><view>写下第一句，接下来的故事就有了开始。</view><view>窗外的风很轻，纸上的字也慢慢有了方向。</view></view></view>
          </view>
          <view v-if="activePanel === 'ai'" class="ai-settings">
            <view class="modal-intro">可以保存多组模型配置，在写作助手中随时切换。正文修改仍需由你确认。</view>
            <view class="saved-profiles"><view v-for="item in aiProfiles.profiles" :key="item.id" :class="{ selected: profileDraft.id === item.id }" @tap="editProfile(item)"><text>{{ item.name }}</text><small>{{ item.model || '未选择模型' }}</small></view><view class="add-profile" @tap="newProfile">＋ 新配置</view></view>
            <view class="ai-setting-card card"><view class="option-name">服务商</view><view class="provider-options"><view v-for="item in AI_PROVIDERS" :key="item.id" :class="{ selected: profileDraft.provider === item.id }" @tap="chooseProvider(item.id)">{{ item.name }}</view></view><input class="field" :value="profileDraft.name" placeholder="配置名称" @input="profileDraft.name = $event.detail.value" /></view>
            <view class="ai-setting-card card"><view class="option-name">API Key</view><view class="option-note">只保存在本机，多个配置各自保存密钥</view><input class="field" password :value="profileDraft.apiKey" placeholder="填写此服务商的 API Key" @input="profileDraft.apiKey = $event.detail.value; aiTestResult = ''" /><view class="option-name ai-field-label">API 地址</view><input class="field" :value="profileDraft.baseUrl" placeholder="https://.../v1" @input="profileDraft.baseUrl = $event.detail.value" /></view>
            <view class="ai-setting-card card"><view class="model-heading"><view><view class="option-name">可用模型</view><view class="option-note">从当前服务商实时获取</view></view><view @tap="testAi">{{ aiTesting ? '获取中…' : '获取模型 / 测试连接' }}</view></view><view v-if="profileDraft.models.length" class="model-options"><view v-for="id in profileDraft.models" :key="id" class="model-option" :class="{ selected: profileDraft.model === id }" @tap="profileDraft.model = id"><text>{{ id }}</text><text>{{ profileDraft.model === id ? '当前选择' : '点选使用' }}</text></view></view><view v-else class="option-note model-empty">填入密钥后获取模型列表</view></view>
            <view v-if="supportsReasoning(profileDraft)" class="ai-setting-card card"><view class="option-name">思考强度</view><view class="option-note">仅在所选模型支持时传入；思考内容由模型决定是否返回</view><view class="effort-options"><view v-for="level in effortLevels" :key="level" :class="{ selected: profileDraft.effort === level }" @tap="profileDraft.effort = level">{{ { auto:'自动', low:'低', medium:'中', high:'高', max:'最高' }[level] }}</view></view></view>
            <view class="ai-setting-card card"><view class="option-name">上下文窗口</view><view class="option-note">可选。填写服务商公布的 token 上限后，助手会显示预估使用比例；留空仅显示预估用量。</view><input class="field" type="number" :value="profileDraft.contextWindow || ''" placeholder="例如 128000" @input="profileDraft.contextWindow = $event.detail.value" /></view>
            <view class="ai-setting-card card"><view class="prompt-heading"><view><view class="option-name">系统提示词</view><view class="option-note">定义助手的写作方式和修改边界</view></view><text @tap="promptDraft = DEFAULT_AI_PROMPT">恢复默认</text></view><textarea v-model="promptDraft" class="prompt-input" maxlength="4000" /></view>
            <view class="ai-setting-actions"><view v-if="profileDraft.id" class="ghost-button" @tap="deleteProfile">删除此配置</view><view class="primary-button" @tap="saveAi">保存配置</view></view>
            <view v-if="aiTestResult" class="ai-test-result" :class="{ error: aiTestError }">{{ aiTestResult }}</view>
          </view>
          <view v-if="activePanel === 'app'" class="app-settings">
            <view class="app-setting-card card" @tap="languageOpen = !languageOpen"><view class="app-setting-icon"><UiIcon name="sliders" /></view><view class="app-setting-copy"><view class="option-name">应用语言</view><view class="option-note">简体中文</view></view><UiIcon class="language-chevron" :class="{ open:languageOpen }" name="chevron-right" /></view>
            <view v-if="languageOpen" class="language-panel card" @tap="setOption('language', 'zh-CN'); languageOpen = false"><text>简体中文</text><UiIcon name="check" /></view>
            <view class="app-setting-card card"><view class="app-setting-icon"><UiIcon name="file" /></view><view class="app-setting-copy"><view class="option-name">数据目录</view><view class="option-note">{{ dataDirectory.uri ? (dataDirectory.label || '已连接外部目录') : '尚未选择目录' }}</view><view class="option-note">书籍、封面、字体、会话与导出文件存放于 PaperWriter 子目录</view></view></view>
            <view class="app-action card" @tap="migrateDirectory"><view><view class="option-name">迁移数据目录</view><view class="option-note">选择新的空文件夹，保留旧目录作为备份</view></view><UiIcon name="chevron-right" /></view>
            <view class="app-action card destructive" @tap="showDeleteData = true"><view><view class="option-name">删除所有应用数据</view><view class="option-note">清空书籍、统计、字体、模型配置和当前数据目录</view></view><UiIcon name="chevron-right" /></view>
            <view class="app-setting-card card"><view class="app-setting-icon"><UiIcon name="gear" /></view><view class="app-setting-copy"><view class="option-name">软件版本</view><view class="option-note">纸间 · Android</view></view><view class="app-setting-value">{{ appVersion }}</view></view>
            <view v-if="appActionMessage" class="app-action-message" :class="{ error:appActionError }">{{ appActionMessage }}</view>
            <view v-if="dataDirectory.error && !appActionMessage" class="app-action-message error">同步提示：{{ dataDirectory.error }}</view>
            <view v-if="dataDirectory.lastSync" class="app-sync-note">上次备份：{{ dataDirectory.lastSync }}</view>
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
    <AppDialog :visible="showDeleteData" title="删除所有数据" message="将删除书籍、正文、统计、字体和 AI 配置，并清空所选目录中的 PaperWriter 文件夹。此操作无法撤销。" confirm-text="确认删除" :destructive="true" @cancel="showDeleteData = false" @confirm="confirmDeleteData" />
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, onMounted, onUnmounted, ref, watch } from 'vue'
import { accentChoices, isDark, loadPreferences, updatePreferences, themeClass } from '../../src/store/preferences'
import { fontFamilyFor, fontLabel, loadBundledFont, loadSelectedFont, loadCustomFont, importFont, removeFont } from '../../src/services/fonts'
import AppNav from '../../components/AppNav.vue'
import AppDialog from '../../components/AppDialog.vue'
import UiIcon from '../../components/UiIcon.vue'
import { chooseDataDirectory, dataDirectory, deleteAllData } from '../../src/services/data-directory.js'
import { reloadAppData } from '../../src/services/reload-data.js'
import { navigatePrimary } from '../../src/store/navigation'
import { hexToHsv, hsvToHex } from '../../src/utils/color'
import { DEFAULT_AI_PROMPT } from '../../src/services/assistant'
import { AI_PROVIDERS, fetchProviderModels, providerInfo, supportsReasoning } from '../../src/services/ai-providers'
import { aiProfiles, activeAiProfile, loadAiProfiles, removeAiProfile, saveAiProfile, selectAiProfile } from '../../src/store/ai-profiles'

const props = defineProps({ embedded: { type: Boolean, default: false }, active: { type: Boolean, default: true } })
const emit = defineEmits(['modal-change'])
const prefs = loadPreferences()
loadAiProfiles()
const emptyProfile = () => ({ id: '', provider: 'openai', name: '', apiKey: '', baseUrl: providerInfo('openai').baseUrl, model: '', models: [], effort: 'auto', contextWindow: 0 })
const profileDraft = ref(emptyProfile()), aiTesting = ref(false), aiTestResult = ref(''), aiTestError = ref(false)
const effortLevels = computed(() => profileDraft.value.provider === 'deepseek' ? ['auto', 'high', 'max'] : ['auto', 'low', 'medium', 'high'])
const promptDraft = ref(prefs.aiSystemPrompt || DEFAULT_AI_PROMPT)
const instance = getCurrentInstance()
const themes = [{ id: 'system', label: '跟随系统' }, { id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }]
const cursorColors = ['#819bcb', '#a48bc6', '#78aeb1', '#d0a571', '#d98591']
const trailLengthDraft = ref(prefs.cursorTrailLength)
const colorPickerOpen = ref(false), colorPickerClosing = ref(false)
const pickerHue = ref(0), pickerSaturation = ref(100), pickerValue = ref(100)
const hueColor = computed(() => hsvToHex(pickerHue.value, 100, 100))
const pickerColor = computed(() => hsvToHex(pickerHue.value, pickerSaturation.value, pickerValue.value))
const activePanel = ref(''), closing = ref(false), fontPreviewErrors = ref({})
const iconsFalling = ref(false)
let iconTimer
const panelTitle = computed(() => ({ appearance: '外观主题', fonts: '文章字体', editing: '编辑体验', ai: 'AI 写作助手', app: '应用设置' })[activePanel.value] || '')
const appVersion = ref('1.3.5'), showDeleteData = ref(false), languageOpen = ref(false), appActionMessage = ref(''), appActionError = ref(false)
const fontChoices = computed(() => [
  { id: 'system', label: '系统默认' }, { id: 'noto', label: '思源宋体' }, { id: 'wenkai', label: '霞鹜文楷' }, { id: 'sans', label: '系统无衬线' },
  ...prefs.customFonts.map(font => ({ id: font.id, label: font.name, custom: true }))
])
const errorMessage = ref(''), removeId = ref('')
let closeTimer = null, colorPickerTimer = null, pickerPointRequest = 0
function dropIcons() { clearTimeout(iconTimer); iconsFalling.value = false; setTimeout(() => { iconsFalling.value = true; iconTimer = setTimeout(() => { iconsFalling.value = false }, 1100) }, 20) }
watch(() => props.active, active => { if (active) dropIcons() })
onMounted(() => { if (props.active) dropIcons(); if (typeof plus !== 'undefined') appVersion.value = plus.runtime.version || appVersion.value; loadSelectedFont().catch(() => {}); loadBundledFont('noto').then(() => loadBundledFont('wenkai')).catch(() => {}) })
onUnmounted(() => { clearTimeout(closeTimer); clearTimeout(colorPickerTimer); clearTimeout(iconTimer); emit('modal-change', false) })
function goLibrary() { navigatePrimary('library') }
function openPanel(id) {
  clearTimeout(closeTimer)
  closing.value = false
  activePanel.value = id
  if (id === 'editing') trailLengthDraft.value = prefs.cursorTrailLength
  if (id === 'ai') { profileDraft.value = { ...(activeAiProfile() || emptyProfile()) }; promptDraft.value = prefs.aiSystemPrompt || DEFAULT_AI_PROMPT; aiTestResult.value = '' }
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
async function migrateDirectory() {
  if (dataDirectory.busy) return
  appActionMessage.value = ''; appActionError.value = false
  try { const changed = await chooseDataDirectory({ migrate:true }); appActionMessage.value = changed ? '数据已复制到新目录。旧目录保留为备份。' : '目录未更改。' }
  catch (error) { if (!String(error.message).includes('取消')) { appActionMessage.value = error.message || '迁移失败'; appActionError.value = true } }
}
async function confirmDeleteData() {
  showDeleteData.value = false; appActionMessage.value = ''; appActionError.value = false
  try { await deleteAllData(); reloadAppData(); appActionMessage.value = '应用数据已清空。' }
  catch (error) { appActionMessage.value = error.message || '删除失败'; appActionError.value = true }
}
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
async function testAi() {
  if (aiTesting.value) return
  aiTesting.value = true; aiTestResult.value = ''; aiTestError.value = false
  try { const models = await fetchProviderModels(profileDraft.value); profileDraft.value.models = models; if (!models.includes(profileDraft.value.model)) profileDraft.value.model = models[0]; aiTestResult.value = `连接成功，获取到 ${models.length} 个模型` }
  catch (error) { aiTestError.value = true; aiTestResult.value = error.message || '连接失败' }
  finally { aiTesting.value = false }
}
function editProfile(item) { profileDraft.value = { ...item, models: [...(item.models || [])] }; aiTestResult.value = '' }
function newProfile() { profileDraft.value = emptyProfile(); aiTestResult.value = '' }
function chooseProvider(id) { profileDraft.value = { ...emptyProfile(), provider: id, baseUrl: providerInfo(id).baseUrl }; aiTestResult.value = '' }
function deleteProfile() { if (!profileDraft.value.id) return; removeAiProfile(profileDraft.value.id); profileDraft.value = { ...(activeAiProfile() || emptyProfile()) }; aiTestResult.value = '配置已删除' }
function saveAi() {
  if (!profileDraft.value.apiKey?.trim()) return uni.showToast({ title: '请先填写 API Key', icon: 'none' })
  if (!profileDraft.value.models.includes(profileDraft.value.model)) return uni.showToast({ title: '请先获取并选择模型', icon: 'none' })
  const saved = saveAiProfile(profileDraft.value)
  selectAiProfile(saved.id)
  profileDraft.value = { ...saved, models: [...saved.models] }
  updatePreferences({ aiSystemPrompt: promptDraft.value.trim() || DEFAULT_AI_PROMPT })
  aiTestResult.value = '配置已保存，可在编辑器中使用'; aiTestError.value = false
}
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
.settings-sections.falling .section-symbol { animation:section-symbol-drop .8s cubic-bezier(.2,.72,.3,1) both; }
.settings-sections.falling .section-tile:nth-child(2) .section-symbol { animation-delay:.07s; }
.settings-sections.falling .section-tile:nth-child(3) .section-symbol { animation-delay:.14s; }
.settings-sections.falling .section-tile:nth-child(4) .section-symbol { animation-delay:.21s; }
.settings-sections.falling .section-tile:nth-child(5) .section-symbol { animation-delay:.28s; }
@keyframes section-symbol-drop { 0% { opacity:0; transform:translateY(-80vh) rotate(-14deg); } 58% { opacity:1; transform:translateY(9px) rotate(5deg); } 77% { transform:translateY(-5px) rotate(-2deg); } 100% { transform:none; } }
.accent-heading { margin:28px 0 14px; }
.accent-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }
.accent-choice { display:flex; align-items:center; flex-direction:column; gap:8px; padding:10px 4px; border:1px solid var(--line); border-radius:14px; color:var(--muted); font-size:11px; transition:transform .2s ease,border-color .2s ease,background .2s ease; }
.accent-choice.selected { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); }
.accent-choice:active { transform:scale(.94); }
.accent-swatch { width:34px; height:34px; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#fff; box-shadow:0 4px 10px var(--shadow); }
.accent-swatch .ui-icon { transform:scale(.7); }
.app-settings { display:flex; flex-direction:column; gap:12px; }
.app-setting-card,.app-action { display:flex; align-items:center; gap:15px; padding:19px; min-height:78px; }
.app-setting-icon { display:flex; align-items:center; justify-content:center; flex:none; width:39px; height:39px; border-radius:12px; color:var(--accent); background:var(--accent-soft); }
.app-setting-copy,.app-action>view:first-child { flex:1; min-width:0; }
.app-setting-copy .option-note { overflow-wrap:anywhere; }
.app-setting-value { color:var(--muted); font-size:11px; text-align:right; }
.language-chevron { color:var(--muted); transition:transform .2s ease; }.language-chevron.open { transform:rotate(90deg); }.language-panel { margin-top:-5px; padding:17px 20px; display:flex; justify-content:space-between; align-items:center; color:var(--accent); font-size:13px; animation:cursor-options-in .2s ease both; }
.app-action { justify-content:space-between; transition:transform .2s ease,border-color .2s ease; }
.app-action:active { transform:scale(.985); border-color:var(--accent); }
.app-action>view:last-child { color:var(--muted); }
.app-action.destructive .option-name { color:var(--danger); }
.app-action-message,.app-sync-note { padding:9px 3px; color:var(--accent); font-size:12px; line-height:1.5; }
.app-action-message.error { color:var(--danger); }.app-sync-note { color:var(--muted); }
.settings-overlay { position:fixed; z-index:40; inset:0; display:flex; align-items:center; justify-content:center; padding:14px; background:rgba(13,18,28,.54); animation:overlay-in .24s ease both; }.settings-modal { width:min(720px,calc(100vw - 28px)); height:75vh; max-height:calc(100vh - 28px); min-height:320px; border-radius:28px; background:var(--surface); color:var(--text); border:1px solid var(--line); box-shadow:0 30px 90px rgba(0,0,0,.26); display:flex; flex-direction:column; overflow:hidden; animation:modal-in .28s cubic-bezier(.2,.78,.24,1) both; }.settings-overlay.closing { animation:overlay-out .24s ease both; }.settings-overlay.closing .settings-modal { animation:modal-out .24s ease both; }
.modal-header { flex-shrink:0; padding:26px 30px 20px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; }.modal-title { margin-top:7px; font-size:25px; font-weight:700; }.modal-close { width:34px; height:34px; border-radius:11px; background:var(--surface-alt); color:var(--muted); font-size:25px; line-height:31px; text-align:center; }.modal-body { flex:1; min-height:0; overflow-y:auto; padding:24px 30px 34px; }.modal-intro { color:var(--muted); font-size:13px; margin-bottom:21px; }
.theme-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }.theme-option { padding:11px; transition:border-color .2s ease,transform .2s ease; }.theme-option:active,.font-choice:active { transform:scale(.98); }.theme-option.selected,.font-choice.selected { border-color:var(--accent); }.theme-preview { height:94px; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:center; gap:8px; }.theme-preview view { height:7px; border-radius:4px; background:currentColor; opacity:.45; }.theme-preview view:nth-child(1) { width:45%; }.theme-preview view:nth-child(2) { width:82%; }.theme-preview view:nth-child(3) { width:65%; }.preview-system { color:#5d6b82; background:linear-gradient(110deg,#e7eaf0 50%,#272d39 50%); }.preview-light { color:#788499; background:#f5f5f2; }.preview-dark { color:#c1c8d4; background:#21252e; }.theme-label { display:flex; justify-content:space-between; padding:11px 3px 3px; font-size:12px; font-weight:600; }.selected-mark { color:var(--accent); }
.font-toolbar { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }.import-link { color:var(--accent); font-size:12px; font-weight:650; white-space:nowrap; padding:4px 0; }.font-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }.font-choice { padding:20px; min-height:130px; transition:border-color .2s ease,transform .2s ease; }.font-sample { font-size:23px; line-height:1.55; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }.font-verse { font-size:13px; margin-top:6px; color:var(--muted); overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }.font-bottom { display:flex; justify-content:space-between; margin-top:16px; font-size:12px; color:var(--muted); }.remove-font,.font-error { color:var(--danger); }.font-error { font-size:11px; margin-top:9px; }
.editing-layout { display:grid; grid-template-columns:minmax(0,1fr) 210px; gap:22px; }.option-list { padding:0 18px; }.option-row { display:flex; align-items:center; justify-content:space-between; min-height:77px; border-bottom:1px solid var(--line); gap:12px; }.option-row:last-child { border-bottom:0; }.option-name { font-size:14px; font-weight:600; }.option-note { color:var(--muted); font-size:11px; margin-top:5px; }.stepper { display:flex; gap:7px; }.stepper text { width:33px; height:33px; line-height:33px; text-align:center; border-radius:9px; color:var(--accent); background:var(--accent-soft); font-size:22px; }.toggle { width:42px; height:25px; border-radius:20px; background:var(--line); padding:3px; transition:background .2s ease; }.toggle view { width:19px; height:19px; border-radius:50%; background:#fff; transition:transform .2s ease; }.toggle.on { background:var(--accent); }.toggle.on view { transform:translateX(17px); }.preview-caption { font-size:11px; color:var(--muted); margin-bottom:16px; }.type-preview { padding:28px 20px; min-height:250px; line-height:1.85; }.type-preview view:first-child { color:var(--muted); font-size:.75em; margin-bottom:20px; }.type-preview view:nth-child(2) { margin-bottom:17px; }.type-preview view:nth-child(3) { color:var(--muted); }
.cursor-options { padding:18px 2px 20px; animation:cursor-options-in .22s cubic-bezier(.2,.75,.25,1) both; }.cursor-option-title { color:var(--text); font-size:12px; font-weight:650; margin-bottom:11px; }.cursor-colors { display:flex; align-items:center; flex-wrap:wrap; gap:9px; }.cursor-color { width:27px; height:27px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; box-shadow:0 2px 8px var(--shadow); transition:transform .18s ease,outline .18s ease; }.cursor-color.selected { outline:2px solid var(--accent); outline-offset:3px; transform:scale(1.08); }.cursor-hex { width:92px; height:32px; margin-left:3px; border:1px solid var(--line); border-radius:9px; background:var(--surface-alt); color:var(--text); text-align:center; font-size:11px; }.cursor-length-row { display:flex; align-items:center; justify-content:space-between; margin:24px 0 16px; }.cursor-length-row .cursor-option-title { margin:0; }.cursor-demo { display:flex; align-items:center; min-height:45px; padding:0 16px; border-radius:12px; background:var(--surface-alt); color:var(--muted); font-size:13px; }.cursor-demo-line { height:3px; border-radius:4px; flex-shrink:0; }.cursor-demo-caret { width:2px; height:23px; border-radius:2px; flex-shrink:0; margin-right:9px; }.cursor-demo text { white-space:nowrap; }.cursor-options .stepper text { width:28px; height:28px; line-height:28px; font-size:19px; }
.cursor-colors { gap:11px; }.cursor-color { width:29px; height:29px; }.cursor-custom { display:flex; align-items:center; gap:6px; min-height:34px; padding:4px 9px; border:1px solid var(--line); border-radius:11px; background:var(--surface-alt); color:var(--muted); font-size:11px; font-weight:600; }.cursor-custom.selected { border-color:var(--accent); color:var(--accent); }.cursor-custom-dot { width:16px; height:16px; border-radius:50%; box-shadow:0 0 0 2px var(--surface),0 0 0 3px var(--line); }
.cursor-length-row { margin-bottom:4px; }.cursor-length-value { color:var(--accent); font-size:12px; font-weight:650; }.cursor-length-slider { width:100%; margin:0 0 12px; }.cursor-demo-caret { width:3px; }
.cursor-style-list { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin:0 0 23px; }.cursor-style-choice { display:flex; align-items:center; gap:9px; min-height:54px; padding:9px 11px; border:1px solid var(--line); border-radius:12px; background:var(--surface-alt); color:var(--muted); font-size:11px; font-weight:650; transition:border-color .18s ease,transform .18s ease; }.cursor-style-choice.selected { border-color:var(--accent); color:var(--accent); }.cursor-style-choice:active { transform:scale(.97); }.cursor-style-preview { position:relative; width:29px; height:31px; display:flex; align-items:center; justify-content:center; border-radius:7px; background:var(--surface); color:var(--text); font-size:15px; flex-shrink:0; }.beam-preview view { position:absolute; right:4px; top:5px; width:5px; height:21px; border-radius:2px; background:var(--accent); }.block-preview view { position:absolute; right:3px; top:4px; width:13px; height:23px; border-radius:3px; background:var(--accent); opacity:.5; }.cursor-demo-line { height:19px; }.cursor-demo-caret { width:6px; }.cursor-demo-caret.block { width:16px; opacity:.55; clip-path:polygon(0 10%,70% 0,100% 100%,0 88%); }
.cursor-live { margin-top:17px; padding:14px 17px; overflow:hidden; }.cursor-live>text { font-size:11px; color:var(--muted); }.cursor-live-line { position:relative; margin-top:13px; white-space:nowrap; color:var(--text); font-size:16px; letter-spacing:.03em; }.cursor-live-motion { position:absolute; top:-2px; left:0; width:6px; height:27px; animation:cursor-live-travel 3.2s cubic-bezier(.22,.76,.25,1) infinite alternate; }.cursor-live-head { position:absolute; left:0; top:0; width:6px; height:25px; border-radius:3px; background:var(--preview-cursor); box-shadow:0 0 10px var(--preview-cursor); }.cursor-live-trail { position:absolute; right:4px; top:2px; width:var(--preview-trail); max-width:96px; height:21px; border-radius:4px; background:var(--preview-cursor); opacity:.2; filter:blur(3px); }.cursor-live-motion.neovim,.cursor-live-motion.neovim .cursor-live-head { width:17px; }.cursor-live-motion.neovim .cursor-live-head { opacity:.55; animation:cursor-live-shape 3.2s ease infinite alternate; }.cursor-live-motion.neovim .cursor-live-trail { display:none; }@keyframes cursor-live-travel { 0%,12% { transform:translateX(5px) } 55%,100% { transform:translateX(min(230px,72vw)) } }@keyframes cursor-live-shape { 0%,100% { transform:scale(1,1) } 48% { transform:scale(1.8,.8) } }
.cursor-demo-line.block { height:21px; border-radius:3px; opacity:.42; }.cursor-demo-caret.block { width:17px; opacity:.65; }.cursor-live-motion.neovim .cursor-live-trail { display:block; right:13px; top:0; height:25px; border-radius:3px; opacity:.32; filter:blur(1px); animation:cursor-live-shape 3.2s ease infinite alternate; }
.brand-mark { background:transparent; object-fit:contain; }
.ai-symbol { font-size:27px; }.ai-settings { max-width:520px; margin:0 auto; }.ai-setting-card { padding:18px; margin-bottom:13px; }.ai-setting-card .field { margin:15px 0 0; }.model-options { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:14px; }.model-option { min-height:70px; padding:12px; border:1px solid var(--line); border-radius:13px; background:var(--surface-alt); display:flex; flex-direction:column; gap:7px; font-size:13px; }.model-option text:last-child { color:var(--muted); font-size:11px; }.model-option.selected { border-color:var(--accent); background:var(--accent-soft); }.ai-setting-actions { display:flex; justify-content:flex-end; gap:9px; margin-top:19px; }.ai-test-result { margin-top:15px; font-size:12px; color:var(--accent); }.ai-test-result.error { color:var(--danger); }
.saved-profiles { display:flex; gap:8px; overflow:auto; padding:1px 0 13px; margin-bottom:12px; }.saved-profiles>view { flex-shrink:0; min-width:110px; padding:10px 12px; border:1px solid var(--line); border-radius:11px; background:var(--surface-alt); font-size:12px; }.saved-profiles>view.selected { border-color:var(--accent); color:var(--accent); background:var(--accent-soft); }.saved-profiles small { display:block; margin-top:4px; color:var(--muted); font-size:10px; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.saved-profiles .add-profile { display:flex; align-items:center; color:var(--accent); }.provider-options,.effort-options { display:flex; flex-wrap:wrap; gap:8px; margin-top:13px; }.provider-options>view,.effort-options>view { padding:8px 11px; border:1px solid var(--line); border-radius:9px; background:var(--surface-alt); color:var(--muted); font-size:11px; }.provider-options>view.selected,.effort-options>view.selected { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); }.ai-field-label { margin-top:17px; }.model-heading { display:flex; justify-content:space-between; align-items:center; gap:10px; }.model-heading>view:last-child { padding:9px 11px; border-radius:9px; background:var(--accent-soft); color:var(--accent); font-size:11px; white-space:nowrap; }.model-options { max-height:230px; overflow:auto; }.model-option { min-width:0; overflow-wrap:anywhere; }.model-empty { margin-top:14px; }
.prompt-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }.prompt-heading>text { color:var(--accent); font-size:11px; white-space:nowrap; }.prompt-input { display:block; width:100%; height:170px; margin-top:14px; padding:12px; border:1px solid var(--line); border-radius:11px; background:var(--surface-alt); color:var(--text); font-size:12px; line-height:1.6; }
.color-picker-overlay { position:fixed; z-index:60; inset:0; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(13,18,28,.48); animation:overlay-in .19s ease both; }.color-picker-overlay.closing { animation:overlay-out .19s ease both; }.color-picker-modal { width:min(390px,calc(100vw - 36px)); padding:23px; border:1px solid var(--line); border-radius:24px; background:var(--surface); color:var(--text); box-shadow:0 26px 75px rgba(0,0,0,.26); animation:modal-in .22s cubic-bezier(.2,.78,.24,1) both; }.color-picker-overlay.closing .color-picker-modal { animation:modal-out .19s ease both; }.color-picker-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:19px; }.color-picker-title { font-size:20px; font-weight:700; margin-top:6px; }
.color-plane { position:relative; width:100%; height:185px; border-radius:14px; overflow:hidden; touch-action:none; }.color-plane-white,.color-plane-black { position:absolute; inset:0; pointer-events:none; }.color-plane-white { background:linear-gradient(90deg,#fff,transparent); }.color-plane-black { background:linear-gradient(0deg,#000,transparent); }.color-plane-knob { position:absolute; z-index:1; width:17px; height:17px; border:3px solid #fff; border-radius:50%; box-shadow:0 1px 6px rgba(0,0,0,.55); transform:translate(-50%,-50%); pointer-events:none; }.hue-caption { display:flex; justify-content:space-between; gap:8px; margin:19px 2px 9px; color:var(--muted); font-size:11px; }.hue-caption text:first-child { color:var(--text); font-weight:650; }.hue-track { height:30px; border-radius:14px; background:linear-gradient(90deg,#f44,#ff0,#0e5,#0ef,#25f,#e4f,#f44); }.hue-track slider { margin:0; }.color-picker-bottom { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:22px; }.color-picker-preview { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:11px; }.color-picker-preview view { width:23px; height:23px; border-radius:8px; box-shadow:0 0 0 1px var(--line); }.color-picker-actions { display:flex; align-items:center; gap:13px; color:var(--muted); font-size:12px; }.color-picker-apply { padding:10px 13px; border-radius:10px; background:var(--accent); color:#fff; font-weight:650; }
@keyframes cursor-options-in { from { opacity:0; transform:translateY(-7px); } }
@keyframes overlay-in { from { opacity:0; } } @keyframes overlay-out { to { opacity:0; } } @keyframes modal-in { from { opacity:0; transform:translateY(18px) scale(.96); } } @keyframes modal-out { to { opacity:0; transform:translateY(12px) scale(.97); } }
@media (max-width:620px) { .section-tile { height:98px; padding:17px 20px; }.section-symbol { width:54px; height:54px; border-radius:16px; }.modal-header { padding:20px 22px 17px; }.modal-body { padding:20px 22px 28px; }.editing-layout { grid-template-columns:1fr; }.preview-column { display:none; }.app-setting-value { display:none; } }
@media (max-width:420px) { .theme-grid { gap:7px; }.theme-option { padding:7px; }.theme-label { font-size:11px; }.font-grid { grid-template-columns:1fr; }.font-toolbar { display:block; }.import-link { display:inline-block; margin-bottom:16px; } }
@media (prefers-reduced-motion:reduce) { .section-tile,.theme-option,.font-choice,.toggle,.toggle view,.cursor-color { transition:none; }.settings-sections.falling .section-symbol,.settings-overlay,.settings-modal,.settings-overlay.closing,.settings-overlay.closing .settings-modal,.cursor-options,.color-picker-overlay,.color-picker-overlay.closing,.color-picker-modal,.color-picker-overlay.closing .color-picker-modal { animation:none; } }
</style>
