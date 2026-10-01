<template>
  <view class="book-shelf-details">
    <view class="book-description">{{ book.description || $t(book.readOnly ? '旧版导入文件，可转换为可编辑书籍。' : '打开这本书，继续写下去。') }}</view>
    <view class="book-meta"><text>{{ metadata }}</text><text>{{ displayDate(book.updatedAt) || $t('今天') }}</text></view>
  </view>
</template>
<script setup>
import { computed } from 'vue'
import { displayDate } from '../src/store/preferences'
import { t } from '../src/i18n.js'
const props = defineProps({ book:{ type:Object, required:true } })
const metadata = computed(() => props.book.readOnly
  ? t('{format} · 只读', { format:props.book.readOnly.format.toUpperCase() })
  : t('{chapters} 章 · {articles} 篇', { chapters:props.book.chapters.length, articles:props.book.chapters.reduce((n, chapter) => n + chapter.articles.length, 0) }))
</script>
<style scoped>
.book-shelf-details { display:contents; }
.book-description { min-width:0; word-break:break-all; overflow-wrap:anywhere; color:var(--muted); font-size:12px; line-height:1.55; margin-top:15px; overflow:hidden; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
.book-meta { min-width:0; display:flex; justify-content:space-between; gap:8px; margin-top:auto; color:var(--muted); font-size:11px; flex-wrap:wrap; row-gap:4px; }
.book-meta text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.book-meta text:last-child { white-space:normal; overflow:visible; overflow-wrap:anywhere; }
</style>
