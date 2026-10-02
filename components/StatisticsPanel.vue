<template>
  <view class="screen statistics-screen" :class="[themeClass(), { 'stats-waiting': waiting, 'stats-entering': entering, 'stats-ready': ready }]">
    <view class="page-wrap">
      <view class="stats-heading"><view class="stats-heading-copy"><view class="stats-kicker entry-node">{{ $t('写作记录') }}</view><view class="page-title entry-node">{{ $t('每一个字，都有来处。') }}</view><view class="subtle entry-node">{{ $t('按实际净增减记录。导入文稿会增加，删去文字或书籍会减少。') }}</view></view><view class="today-net entry-node" :class="{ negative: todayNet < 0 }"><text>{{ $t('今日净变化') }}</text><strong><RollingNumber :value="todayNet" signed :active="active" :play="ready" /></strong><text>{{ $t('字') }}</text></view></view>
      <view class="stats-summary"><view class="summary-card entry-node"><text>{{ $t('最近 7 天') }}</text><strong><RollingNumber :value="recentNet" signed :active="active" :play="ready" /></strong><text>{{ $t('净字数') }}</text></view><view class="summary-card entry-node"><text>{{ $t('累计记录') }}</text><strong><RollingNumber :value="totalNet" signed :active="active" :play="ready" /></strong><text>{{ $t('净字数') }}</text></view><view class="summary-card entry-node"><text>{{ $t('有记录的日子') }}</text><strong><RollingNumber :value="activeDays" :active="active" :play="ready" /></strong><text>{{ $t('天') }}</text></view></view>
      <view class="heat-card card entry-node"><view class="heat-head"><view><view class="section-title">{{ $t('每日码字热力图') }}</view><view class="subtle">{{ $t('颜色深浅表示当天净变化的绝对值；暖色表示减少。') }}</view></view><view class="heat-legend"><text>{{ $t('少') }}</text><view class="heat-cell positive level-1"></view><view class="heat-cell positive level-2"></view><view class="heat-cell positive level-3"></view><view class="heat-cell positive level-4"></view><text>{{ $t('多') }}</text></view></view><scroll-view scroll-x class="heat-scroll" :scroll-left="heatScrollLeft"><view class="heat-layout"><view class="weekday-labels"><text>{{ $t('一') }}</text><text>{{ $t('三') }}</text><text>{{ $t('五') }}</text><text>{{ $t('日') }}</text></view><view class="weeks"><view v-for="(week, wi) in weeks" :key="wi" class="week"><view v-for="(day, di) in week" :key="day.key" class="heat-cell" :class="[heatClass(day.net), { selected: selectedDay === day.key, future: day.future, changed: changedDays.has(day.key) }]" :style="{ '--heat-delay': `${Math.min(26 - wi, 6) * 18 + di * 5}ms` }" @tap="!day.future && (selectedDay = day.key)"></view></view></view></view></scroll-view><view class="heat-foot"><text>{{ $t('过去约半年') }}</text><view><view class="heat-cell negative level-2"></view><text>{{ $t('净减少') }}</text></view></view></view>
      <view class="source-card card entry-node"><view class="source-title"><view><view class="section-title">{{ readableDay(selectedDay) }}</view><view class="subtle">{{ selectedDay === todayKey ? $t('今天') : $t('当天') }}{{ $t('净变化与书籍来源') }}</view></view><strong :class="{ negative: selectedNet < 0 }"><RollingNumber :value="selectedNet" signed :active="active" :play="ready" /> {{ $t('字') }}</strong></view><view v-if="!sources.length" class="no-source">{{ $t('这一天还没有字数变化。开始写作后，这里会按书籍显示来源。') }}</view><view v-for="source in sources" :key="source.id" class="source-row"><view class="source-marker">{{ source.title.slice(0, 1) }}</view><view class="source-info"><view>{{ source.title }}</view><text>{{ articleSummary(source) }}</text></view><strong :class="{ negative: source.net < 0 }"><RollingNumber :value="source.net" signed :active="active" :play="ready" /></strong></view></view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { displayDate, themeClass } from '../src/store/preferences'
import { dayBookSources, localDayKey, snapshotStatistics } from '../src/store/statistics'
import { usePanelEntrance } from '../src/composables/use-panel-entrance.js'
import RollingNumber from './RollingNumber.vue'
import { t } from '../src/i18n.js'

const props = defineProps({ active: { type:Boolean, default:true } })
const { waiting, entering, ready } = usePanelEntrance(() => props.active)
const visibleDays = shallowRef({}), heatDays = shallowRef({}), changedDays = shallowRef(new Set())
const heatScrollLeft = ref(0)
let scrollRevision = 0
function showLatest() { nextTick(() => { if (props.active) heatScrollLeft.value = 1000000 + ++scrollRevision }) }
const today = ref(new Date())
const todayKey = computed(() => localDayKey(today.value))
const selectedDay = ref(todayKey.value)
const signed = value => value > 0 ? `+${value}` : String(value || 0)
const readableDay = key => displayDate(key)
const todayNet = computed(() => visibleDays.value[todayKey.value]?.net || 0)
const selectedNet = computed(() => visibleDays.value[selectedDay.value]?.net || 0)
const totalNet = computed(() => Object.values(visibleDays.value).reduce((sum, day) => sum + day.net, 0))
const activeDays = computed(() => Object.values(visibleDays.value).filter(day => Object.keys(day.books || {}).length).length)
const recentNet = computed(() => Array.from({ length: 7 }, (_, i) => { const date = new Date(today.value); date.setDate(today.value.getDate() - i); return visibleDays.value[localDayKey(date)]?.net || 0 }).reduce((sum, value) => sum + value, 0))
const sources = computed(() => dayBookSources(visibleDays.value[selectedDay.value]))
const articleSummary = source => Object.values(source.articles || {}).filter(item => item.net !== 0).map(item => `${item.title} ${signed(item.net)}`).join(' · ') || t('增减相抵')
const heatClass = net => {
  if (!net) return ''
  const absolute = Math.abs(net)
  return `${net < 0 ? 'negative' : 'positive'} level-${absolute < 30 ? 1 : absolute < 100 ? 2 : absolute < 300 ? 3 : 4}`
}
const weeks = computed(() => {
  const start = new Date(today.value)
  start.setDate(today.value.getDate() - 181)
  start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  return Array.from({ length: 27 }, (_, wi) => Array.from({ length: 7 }, (_, di) => {
    const date = new Date(start)
    date.setDate(start.getDate() + wi * 7 + di)
    const key = localDayKey(date)
    return { key, net: heatDays.value[key]?.net || 0, future: date > today.value }
  }))
})
function refresh() {
  const previousToday = todayKey.value
  const now = new Date(); now.setHours(0, 0, 0, 0); today.value = now
  if (selectedDay.value === previousToday) selectedDay.value = todayKey.value
  const next = snapshotStatistics(), previous = heatDays.value
  changedDays.value = new Set([...new Set([...Object.keys(previous), ...Object.keys(next)])].filter(key => (previous[key]?.net || 0) !== (next[key]?.net || 0)))
  visibleDays.value = next
  showLatest()
}
watch(() => props.active, active => { if (active) refresh() }, { immediate:true, flush:'sync' })
watch(ready, show => { if (show && props.active) heatDays.value = visibleDays.value }, { flush:'sync' })
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
.entry-node { opacity:1; transform:translate3d(0px,0px,0); backface-visibility:hidden; transition:transform .74s cubic-bezier(.18,.78,.24,1),opacity .5s ease; transition-delay:var(--entry-delay,0ms); }
.stats-waiting .entry-node { opacity:0; transform:translate3d(var(--entry-x,0px),var(--entry-y,0px),0); transition:none; }
.stats-kicker { --entry-x:-42px; }
.stats-heading-copy .page-title { --entry-y:-36px; --entry-delay:60ms; }
.stats-heading-copy .subtle { --entry-x:-28px; --entry-delay:120ms; }
.today-net { --entry-y:48px; --entry-delay:100ms; }
.summary-card { --entry-y:56px; --entry-delay:120ms; }
.summary-card:nth-child(2) { --entry-delay:150ms; }.summary-card:nth-child(3) { --entry-delay:180ms; }
.heat-card { --entry-y:72px; --entry-delay:160ms; }.source-card { --entry-y:72px; --entry-delay:220ms; }
.heat-cell { transition:background-color .62s cubic-bezier(.18,.8,.22,1),transform .18s ease,box-shadow .18s ease; transition-delay:var(--heat-delay,0ms),0ms,0ms; }
.heat-cell { position:relative; }.heat-cell::after { content:''; position:absolute; inset:0; border-radius:inherit; background:rgba(255,255,255,.32); opacity:0; pointer-events:none; }
.stats-ready .heat-cell.changed::after { animation:heat-renew .9s ease var(--heat-delay,0ms) both; }
.source-title strong,.source-row strong,.summary-card strong,.today-net strong { transition:color .4s ease; }
@keyframes heat-renew { 0% { opacity:0; } 28% { opacity:1; } 100% { opacity:0; } }
@media(prefers-reduced-motion:reduce) { .stats-waiting .entry-node { opacity:1; transform:translate3d(0px,0px,0); }.entry-node,.heat-cell,.source-title strong,.source-row strong,.summary-card strong,.today-net strong { transition:none; }.stats-ready .heat-cell.changed::after { animation:none; } }
</style>
