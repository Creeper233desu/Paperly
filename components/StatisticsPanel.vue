<template>
  <view class="screen statistics-screen" :class="themeClass()">
    <view class="page-wrap">
      <view class="stats-heading"><view><view class="stats-kicker">{{ $t('写作记录') }}</view><view class="page-title">{{ $t('每一个字，都有来处。') }}</view><view class="subtle">{{ $t('按实际净增减记录。删去文字或书籍，数字也会减少。') }}</view></view><view class="today-net" :class="{ negative: todayNet < 0 }"><text>{{ $t('今日净变化') }}</text><strong>{{ signed(todayNet) }}</strong><text>{{ $t('字') }}</text></view></view>
      <view class="stats-summary"><view class="summary-card"><text>{{ $t('最近 7 天') }}</text><strong>{{ signed(recentNet) }}</strong><text>{{ $t('净字数') }}</text></view><view class="summary-card"><text>{{ $t('累计记录') }}</text><strong>{{ signed(totalNet) }}</strong><text>{{ $t('净字数') }}</text></view><view class="summary-card"><text>{{ $t('有记录的日子') }}</text><strong>{{ activeDays }}</strong><text>{{ $t('天') }}</text></view></view>
      <view class="heat-card card"><view class="heat-head"><view><view class="section-title">{{ $t('每日码字热力图') }}</view><view class="subtle">{{ $t('颜色深浅表示当天净变化的绝对值；暖色表示减少。') }}</view></view><view class="heat-legend"><text>{{ $t('少') }}</text><view class="heat-cell positive level-1"></view><view class="heat-cell positive level-2"></view><view class="heat-cell positive level-3"></view><view class="heat-cell positive level-4"></view><text>{{ $t('多') }}</text></view></view><scroll-view scroll-x class="heat-scroll" :scroll-left="heatScrollLeft"><view class="heat-layout"><view class="weekday-labels"><text>{{ $t('一') }}</text><text>{{ $t('三') }}</text><text>{{ $t('五') }}</text><text>{{ $t('日') }}</text></view><view class="weeks"><view v-for="(week, wi) in weeks" :key="wi" class="week"><view v-for="day in week" :key="day.key" class="heat-cell" :class="[heatClass(day.net), { selected: selectedDay === day.key, future: day.future }]" @tap="!day.future && (selectedDay = day.key)"></view></view></view></view></scroll-view><view class="heat-foot"><text>{{ $t('过去约半年') }}</text><view><view class="heat-cell negative level-2"></view><text>{{ $t('净减少') }}</text></view></view></view>
      <view class="source-card card"><view class="source-title"><view><view class="section-title">{{ readableDay(selectedDay) }}</view><view class="subtle">{{ selectedDay === todayKey ? $t('今天') : $t('当天') }}{{ $t('净变化与书籍来源') }}</view></view><strong :class="{ negative: selectedNet < 0 }">{{ signed(selectedNet) }} {{ $t('字') }}</strong></view><view v-if="!sources.length" class="no-source">{{ $t('这一天还没有字数变化。开始写作后，这里会按书籍显示来源。') }}</view><view v-for="source in sources" :key="source.id" class="source-row"><view class="source-marker">{{ source.title.slice(0, 1) }}</view><view class="source-info"><view>{{ source.title }}</view><text>{{ articleSummary(source) }}</text></view><strong :class="{ negative: source.net < 0 }">{{ signed(source.net) }}</strong></view></view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { displayDate, themeClass } from '../src/store/preferences'
import { dayBookSources, localDayKey, useStatistics } from '../src/store/statistics'
import { t } from '../src/i18n.js'

const statistics = useStatistics()
const props = defineProps({ active: { type:Boolean, default:true } })
const heatScrollLeft = ref(0)
let scrollRevision = 0
function showLatest() { nextTick(() => { heatScrollLeft.value = 1000000 + ++scrollRevision }) }
onMounted(showLatest)
watch(() => props.active, active => { if (active) showLatest() })
const today = new Date()
today.setHours(0, 0, 0, 0)
const todayKey = localDayKey(today)
const selectedDay = ref(todayKey)
const signed = value => value > 0 ? `+${value}` : String(value || 0)
const readableDay = key => displayDate(key)
const todayNet = computed(() => statistics.days[todayKey]?.net || 0)
const selectedNet = computed(() => statistics.days[selectedDay.value]?.net || 0)
const totalNet = computed(() => Object.values(statistics.days).reduce((sum, day) => sum + day.net, 0))
const activeDays = computed(() => Object.values(statistics.days).filter(day => Object.keys(day.books || {}).length).length)
const recentNet = computed(() => Array.from({ length: 7 }, (_, i) => { const date = new Date(today); date.setDate(today.getDate() - i); return statistics.days[localDayKey(date)]?.net || 0 }).reduce((sum, value) => sum + value, 0))
const sources = computed(() => dayBookSources(statistics.days[selectedDay.value]))
const articleSummary = source => Object.values(source.articles || {}).filter(item => item.net !== 0).map(item => `${item.title} ${signed(item.net)}`).join(' · ') || t('增减相抵')
const heatClass = net => {
  if (!net) return ''
  const absolute = Math.abs(net)
  return `${net < 0 ? 'negative' : 'positive'} level-${absolute < 30 ? 1 : absolute < 100 ? 2 : absolute < 300 ? 3 : 4}`
}
const weeks = computed(() => {
  const start = new Date(today)
  start.setDate(today.getDate() - 181)
  start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  return Array.from({ length: 27 }, (_, wi) => Array.from({ length: 7 }, (_, di) => {
    const date = new Date(start)
    date.setDate(start.getDate() + wi * 7 + di)
    const key = localDayKey(date)
    return { key, net: statistics.days[key]?.net || 0, future: date > today }
  }))
})
</script>

<style scoped>
.statistics-screen { padding-bottom: 125px; }
.stats-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin: 37px 0 27px; }
.stats-kicker { font-size: 12px; color: var(--accent); letter-spacing: .08em; }
.stats-heading .page-title { margin: 10px 0 11px; }
.today-net { min-width: 180px; padding: 16px 20px; border-radius: 18px; background: var(--accent-soft); color: var(--accent); display: flex; flex-direction: column; gap: 1px; }
.today-net text { font-size: 11px; }.today-net strong { font-size: 35px; line-height: 1.15; font-weight: 700; }.today-net.negative { color: var(--danger); }
.stats-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 13px; margin-bottom: 22px; }.summary-card { background: var(--surface); border: 1px solid var(--line); border-radius: 17px; padding: 21px; display: flex; flex-direction: column; gap: 7px; }.summary-card text { color: var(--muted); font-size: 11px; }.summary-card strong { font-size: 25px; font-weight: 650; }
.heat-card, .source-card { padding: 24px 27px; margin-bottom: 20px; }.heat-head, .source-title { display: flex; align-items: start; justify-content: space-between; gap: 18px; }.heat-head .section-title, .source-title .section-title { margin: 0 0 8px; }.heat-legend, .heat-foot, .heat-foot > view { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }.heat-scroll { width: 100%; margin: 18px 0 7px; }.heat-layout { display: flex; width: max-content; align-items: stretch; gap: 10px; padding: 6px; }.weekday-labels { display: flex; flex-direction: column; justify-content: space-between; padding: 0 0 1px; color: var(--muted); font-size: 10px; }.weeks { display: flex; gap: 5px; }.week { display: flex; flex-direction: column; gap: 5px; }.heat-cell { flex: 0 0 14px; width: 14px; height: 14px; background: var(--surface-alt); border-radius: 4px; transition: transform .18s ease, box-shadow .18s ease; }.heat-cell:active { transform: scale(1.25); }.heat-cell.selected { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }.heat-cell.future { opacity: .2; }.heat-cell.positive.level-1 { background: #b3c8d1; }.heat-cell.positive.level-2 { background: #7b9fab; }.heat-cell.positive.level-3 { background: #507d8c; }.heat-cell.positive.level-4 { background: #295a69; }.heat-cell.negative.level-1 { background: #e7c7c1; }.heat-cell.negative.level-2 { background: #dba59e; }.heat-cell.negative.level-3 { background: #c87970; }.heat-cell.negative.level-4 { background: #ae544d; }.heat-foot { justify-content: space-between; }
.source-title strong { color: var(--accent); font-size: 25px; white-space: nowrap; }.source-title strong.negative, .source-row strong.negative { color: var(--danger); }.no-source { padding: 44px 10px 24px; color: var(--muted); font-size: 13px; text-align: center; line-height: 1.7; }.source-row { display: flex; align-items: center; gap: 14px; padding: 16px 0; border-top: 1px solid var(--line); }.source-row:first-of-type { margin-top: 18px; }.source-marker { width: 37px; height: 43px; border-radius: 4px 9px 9px 4px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-family: serif; font-size: 18px; }.source-info { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; }.source-info text { display: block; color: var(--muted); font-size: 11px; font-weight: 400; margin-top: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }.source-row strong { color: var(--accent); font-size: 17px; }
@media (max-width: 600px) { .stats-heading { display: block; margin-top: 14px; }.today-net { margin-top: 22px; width: 100%; flex-direction: row; align-items: baseline; gap: 9px; }.today-net strong { margin-left: auto; font-size: 30px; }.stats-summary { gap: 7px; }.summary-card { padding: 13px; }.summary-card strong { font-size: 20px; }.heat-card, .source-card { padding: 21px 18px; }.heat-legend { display: none; }.heat-cell { flex-basis: 12px; width: 12px; height: 12px; }.weeks, .week { gap: 4px; } }
@media (prefers-reduced-motion: reduce) { .heat-cell { transition: none; } }
</style>
