<template>
  <view class="reader-screen" :class="themeClass()">
    <view class="reader-header"><view class="back-action" @tap="back"><view class="back-chevron"></view><text>返回书籍</text></view><view class="header-title"><strong>{{ book?.title || '阅读' }}</strong><text>{{ positionLabel }}</text></view><view class="header-actions"><view class="toc-button" :class="{ selected: tocOpen }" @tap="tocOpen = !tocOpen"><view class="toc-glyph"><view></view><view></view><view></view></view><text>目录</text></view><view class="page-control" :class="{ disabled: currentIndex <= 0 }" @tap="change(-1)">‹</view><view class="page-control" :class="{ disabled: currentIndex >= itemCount - 1 }" @tap="change(1)">›</view></view></view>
    <view v-if="tocOpen" class="toc-backdrop" @tap="tocOpen = false"></view>
    <view class="reader-layout"><view class="reader-toc" :class="{ open: tocOpen }"><view class="toc-head"><text>书籍目录</text><view @tap="tocOpen = false">×</view></view><scroll-view scroll-y class="toc-scroll"><template v-if="pdf"><view v-for="page in pdfCount" :key="page" class="toc-page" :class="{ current: currentIndex === page - 1 }" @tap="select(page - 1)">第 {{ page }} 页</view></template><template v-else><view v-for="(group, groupIndex) in outline" :key="groupIndex" class="toc-group"><view class="toc-chapter">{{ group.title }}</view><view v-for="article in group.articles" :key="article.id" class="toc-article" :class="{ current: sections[currentIndex]?.id === article.id }" @tap="selectById(article.id)">{{ article.title || group.title }}</view></view></template></scroll-view></view>
      <scroll-view class="reader-content" scroll-y :scroll-into-view="topAnchor" @touchstart="onTouchStart" @touchend="onTouchEnd"><view :id="topAnchorId" class="reader-top-anchor"></view><view v-if="loading" class="reader-loading">正在准备阅读内容…</view><view v-else-if="error" class="reader-error">{{ error }}</view><view v-else-if="pdf" class="pdf-stage"><image v-if="pdfImage" class="pdf-page" :src="pdfImage.src" :style="{ aspectRatio: `${pdfImage.width} / ${pdfImage.height}` }" mode="widthFix" /><view v-else class="reader-loading">正在绘制这一页…</view><view class="page-label">{{ currentIndex + 1 }} / {{ pdfCount }}</view></view><view v-else-if="currentSection" class="reading-sheet" :style="{ '--reading-font': fontFamilyFor(prefs.font), '--reading-size': `${prefs.fontSize}px` }"><view v-if="currentIndex === 0 && book?.cover" class="opening-cover"><image :src="book.cover" mode="aspectFit" /><view><strong>{{ book.title }}</strong><text>{{ book.author }}</text></view></view><view class="chapter-kicker">{{ currentSection.chapterTitle }}</view><view v-if="currentSection.title && currentSection.title !== currentSection.chapterTitle" class="section-title">{{ currentSection.title }}</view><view v-for="(block, index) in displayBlocks" :key="index" class="read-block" :class="block.type"><image v-if="block.type === 'image' && block.src" :src="block.src" mode="widthFix" /><text v-else-if="block.type !== 'image'">{{ block.text }}</text></view><view class="section-end">— {{ currentIndex + 1 }} / {{ itemCount }} —</view></view><view v-else class="reader-loading">这本书还没有正文。返回书籍页添加章节后即可阅读。</view></scroll-view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { getBook } from '../../src/store/library'
import { loadPreferences, preferences, themeClass } from '../../src/store/preferences'
import { fontFamilyFor, loadSelectedFont } from '../../src/services/fonts'
import { imageIdFromParagraph } from '../../src/utils/media'
import { parseEpub, epubImageSource } from '../../src/services/epub'
import { readEpubBytes } from '../../src/services/android-readable-picker'
import { openPdfReader } from '../../src/services/pdf-reader'

loadPreferences()
const prefs = preferences
const bookId = ref(''), book = computed(() => getBook(bookId.value))
const sections = ref([]), outline = ref([]), currentIndex = ref(0), tocOpen = ref(false), loading = ref(true), error = ref('')
const pdf = ref(false), pdfCount = ref(0), pdfImage = ref(null), topAnchor = ref(''), topAnchorId = ref('reader-top-0')
let epub = null, pdfReader = null, renderRevision = 0, anchorRevision = 0, touchStart = null
const itemCount = computed(() => pdf.value ? pdfCount.value : sections.value.length)
const currentSection = computed(() => sections.value[currentIndex.value])
const positionLabel = computed(() => pdf.value ? `第 ${currentIndex.value + 1} / ${pdfCount.value} 页` : currentSection.value ? `${currentSection.value.chapterTitle} · ${currentIndex.value + 1} / ${itemCount.value}` : '')
const displayBlocks = computed(() => (currentSection.value?.blocks || []).map(block => block.type !== 'image' ? block : ({ ...block, src: epub ? epubImageSource(epub, block.path) : block.src || '' })))

function writableSections(source) {
  const groups = []
  const items = []
  for (const chapter of source.chapters || []) {
    const group = { title: chapter.title, articles: [] }
    for (const article of chapter.articles || []) {
      group.articles.push({ id: article.id, title: article.title || chapter.title })
      items.push({ id: article.id, chapterTitle: chapter.title, title: article.title, blocks: (article.paragraphs || []).map(paragraph => {
        const imageId = imageIdFromParagraph(paragraph)
        return imageId ? { type: 'image', src: article.images?.[imageId]?.path || '', alt: '正文插图' } : { type: 'paragraph', text: paragraph }
      }) })
    }
    groups.push(group)
  }
  return { groups, items }
}

onLoad(async options => {
  bookId.value = options.bookId || ''
  const source = book.value
  if (!source) { error.value = '书籍不存在'; loading.value = false; return }
  loadSelectedFont().catch(() => {})
  try {
    if (options.pdfPath || source.readOnly?.format === 'pdf') {
      pdf.value = true
      let pdfPath = options.pdfPath || source.readOnly.path
      if (options.pdfPath) { try { pdfPath = decodeURIComponent(pdfPath) } catch (_) { /* uni-app already decoded the route */ } }
      pdfReader = openPdfReader(pdfPath)
      pdfCount.value = pdfReader.count
      if (!pdfCount.value) throw new Error('PDF 中没有页面')
      currentIndex.value = Math.max(0, Math.min(pdfCount.value - 1, Number(options.page) || 0))
      loading.value = false
      renderPdfPage()
    } else if (source.readOnly?.format === 'epub') {
      epub = parseEpub(await readEpubBytes(source.readOnly.path), source.readOnly.fileName)
      sections.value = epub.sections
      outline.value = epub.outline
      currentIndex.value = Math.max(0, sections.value.findIndex(section => section.id === options.section))
      loading.value = false
    } else {
      const parsed = writableSections(source)
      sections.value = parsed.items
      outline.value = parsed.groups
      currentIndex.value = Math.max(0, sections.value.findIndex(section => section.id === options.section))
      loading.value = false
    }
  } catch (cause) { error.value = cause?.message || '无法打开书籍'; loading.value = false; pdfReader?.close(); pdfReader = null }
})
onUnload(() => { pdfReader?.close(); pdfReader = null; epub = null })
function back() { uni.navigateBack() }
function resetScroll() {
  const id = `reader-top-${++anchorRevision}`
  topAnchorId.value = id
  nextTick(() => { topAnchor.value = id })
}
function renderPdfPage() {
  const revision = ++renderRevision
  pdfImage.value = null
  setTimeout(() => {
    if (!pdfReader || revision !== renderRevision) return
    try { pdfImage.value = pdfReader.render(currentIndex.value, Math.min(1300, Math.max(800, uni.getSystemInfoSync().windowWidth * 1.5))) }
    catch (cause) { error.value = cause?.message || 'PDF 页面绘制失败' }
  }, 0)
}
function select(index) {
  if (index < 0 || index >= itemCount.value) return
  currentIndex.value = index
  tocOpen.value = false
  resetScroll()
  if (pdf.value) renderPdfPage()
}
function selectById(id) { select(sections.value.findIndex(item => item.id === id)) }
function change(step) { select(currentIndex.value + step) }
function onTouchStart(event) { const point = event.touches?.[0]; if (point) touchStart = { x: point.clientX, y: point.clientY } }
function onTouchEnd(event) {
  const point = event.changedTouches?.[0]
  if (!point || !touchStart) return
  const dx = point.clientX - touchStart.x, dy = point.clientY - touchStart.y
  touchStart = null
  if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.6) change(dx < 0 ? 1 : -1)
}
</script>

<style scoped>
.reader-screen { height:100vh; box-sizing:border-box; padding-top:var(--status-bar-height); background:var(--bg); color:var(--text); overflow:hidden; }
.reader-header { height:64px; display:flex; align-items:center; gap:16px; padding:0 28px; box-sizing:border-box; border-bottom:1px solid var(--line); background:var(--surface); }
.back-action { display:flex; align-items:center; gap:9px; min-width:140px; color:var(--accent); font-size:13px; }
.back-chevron { width:8px; height:8px; border-left:2px solid currentColor; border-bottom:2px solid currentColor; transform:rotate(45deg); }
.header-title { min-width:0; flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; }.header-title strong { font-size:14px; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.header-title text { font-size:10px; color:var(--muted); }
.header-actions { display:flex; align-items:center; gap:8px; }.toc-button { display:flex; align-items:center; gap:7px; padding:8px 10px; border-radius:9px; color:var(--muted); font-size:12px; }.toc-button.selected { background:var(--accent-soft); color:var(--accent); }.toc-glyph { width:16px; display:flex; flex-direction:column; gap:3px; }.toc-glyph view { width:16px; height:1.5px; background:currentColor; border-radius:2px; }.toc-glyph view:nth-child(2) { width:12px; }.page-control { display:flex; align-items:center; justify-content:center; width:31px; height:31px; border-radius:8px; background:var(--surface-alt); font-size:24px; line-height:1; transition:transform .2s ease,opacity .2s ease; }.page-control:active { transform:scale(.88); }.page-control.disabled { opacity:.3; }
.reader-layout { height:calc(100vh - var(--status-bar-height) - 64px); display:grid; grid-template-columns:minmax(230px,270px) minmax(0,1fr); }
.reader-toc { display:flex; flex-direction:column; min-height:0; border-right:1px solid var(--line); background:var(--surface); }.toc-head { display:flex; justify-content:space-between; padding:24px 23px 13px; color:var(--muted); font-size:11px; letter-spacing:.1em; }.toc-head>view { display:none; }.toc-scroll { flex:1; min-height:0; }.toc-group { padding:9px 15px; }.toc-chapter { padding:9px 10px; font-size:13px; font-weight:650; }.toc-article,.toc-page { padding:10px 12px; border-radius:10px; color:var(--muted); font-size:12px; transition:background .2s ease,color .2s ease; }.toc-article { margin-left:12px; }.toc-page { margin:2px 15px; }.toc-article.current,.toc-page.current { background:var(--accent-soft); color:var(--accent); font-weight:650; }
.reader-content { height:100%; min-width:0; }.reader-top-anchor { height:1px; }.reader-loading,.reader-error { padding:80px 25px; text-align:center; color:var(--muted); font-size:14px; }.reader-error { color:var(--danger); }
.reading-sheet { width:min(100%,780px); min-height:100%; box-sizing:border-box; margin:0 auto; padding:52px clamp(25px,7vw,80px) 90px; background:var(--surface); }.chapter-kicker { color:var(--muted); font-size:13px; text-align:center; letter-spacing:.08em; }.section-title { margin:28px 0 42px; text-align:center; font-size:27px; font-weight:650; }.read-block { color:var(--text); font-family:var(--reading-font); font-size:var(--reading-size); line-height:1.9; }.read-block.paragraph { margin:0 0 12px; text-indent:2em; white-space:pre-wrap; overflow-wrap:anywhere; }.read-block.heading { margin:24px 0 16px; font-weight:700; }.read-block.image { margin:28px 0; text-align:center; }.read-block.image image { display:block; width:100%; max-width:100%; max-height:70vh; margin:auto; object-fit:contain; }.section-end { margin:65px 0 0; text-align:center; font-size:11px; color:var(--muted); }
.opening-cover { display:flex; align-items:center; justify-content:center; gap:24px; margin:0 0 55px; padding-bottom:45px; border-bottom:1px solid var(--line); }.opening-cover image { width:112px; height:155px; border-radius:8px; box-shadow:0 12px 25px var(--shadow); }.opening-cover>view { display:flex; flex-direction:column; gap:10px; }.opening-cover strong { font-size:22px; }.opening-cover text { color:var(--muted); font-size:12px; }
.pdf-stage { display:flex; flex-direction:column; align-items:center; padding:22px 18px 50px; }.pdf-page { display:block; width:min(100%,900px); background:#fff; box-shadow:0 12px 38px var(--shadow); }.page-label { margin:20px; color:var(--muted); font-size:12px; }.toc-backdrop { display:none; }
@media (max-width:760px) { .reader-header { padding:0 14px; gap:7px; }.back-action { min-width:28px; }.back-action text { display:none; }.header-actions { gap:2px; }.toc-button { padding:7px; }.toc-button text { display:none; }.reader-layout { display:block; }.reader-toc { position:fixed; z-index:12; left:0; top:var(--status-bar-height); bottom:0; width:min(330px,86vw); transform:translateX(-110%); box-shadow:14px 0 40px var(--shadow); transition:transform .28s cubic-bezier(.2,.8,.2,1); }.reader-toc.open { transform:translateX(0); }.toc-head>view { display:block; font-size:22px; }.toc-backdrop { display:block; position:fixed; z-index:11; inset:0; background:rgba(7,10,18,.43); }.reader-content { height:calc(100vh - var(--status-bar-height) - 64px); }.reading-sheet { padding:37px 24px 75px; }.opening-cover { flex-direction:column; text-align:center; } }
@media (prefers-reduced-motion:reduce) { .reader-toc,.toc-article,.toc-page,.page-control { transition:none; } }
</style>
