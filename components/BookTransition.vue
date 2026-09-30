<template>
  <view :id="hostId" class="book-transition" :class="themeClass()" :host-prop="hostId" :change:host-prop="motion.attach" :prop="motionPayload" :change:prop="motion.receive">
    <view class="book-surface" @tap="reopen"><view class="book-background"></view></view>
    <view class="book-viewport"><scroll-view scroll-y class="book-scroll">
      <BookPanel ref="panel" :book-id="bookId" :cover-color="coverColor" motion="live" @close="requestClose" @interact="reopen" />
    </scroll-view></view>
    <view v-if="book" class="shared-elements" aria-hidden="true">
      <view class="shared-cover" :style="{ background:coverColor }"><image v-if="book.cover" :src="book.cover" mode="aspectFill" /><view v-else class="shared-cover-letter">{{ book.title.slice(0, 1) }}</view><view class="shared-spine"></view></view>
      <view class="shared-title">{{ book.title }}</view><view class="shared-author">{{ book.author || $t('未设置作者') }}</view>
    </view>
  </view>
</template>

<script>
import BookPanel from './BookPanel.vue'
import { getBook } from '../src/store/library'
import { themeClass } from '../src/store/preferences'

export default {
  components:{ BookPanel },
  props:{ bookId:String, sourceId:String, coverColor:String, pageActive:{ type:Boolean, default:true } },
  emits:['handoff', 'phase', 'closed'],
  data() { return { hostId:`book-motion-${Date.now()}-${Math.random().toString(36).slice(2)}`, mode:'open', seq:1, bridgeEpoch:0, phase:'preparing', closed:false } },
  computed:{
    book() { return getBook(this.bookId) },
    motionPayload() { return JSON.stringify({ sourceId:this.sourceId, mode:this.mode, seq:this.seq, pageActive:this.pageActive, epoch:this.bridgeEpoch }) }
  },
  methods:{
    themeClass,
    requestClose() {
      if (this.closed) return
      if (this.$refs.panel?.dismissOverlay()) return
      if (this.mode === 'close' || this.mode === 'dismiss') return
      this.mode = 'close'; this.seq++; this.phase = 'closing'; this.$emit('phase', this.phase)
    },
    reopen() {
      if (this.closed || this.mode === 'open') return
      this.mode = 'open'; this.seq++; this.phase = 'opening'; this.$emit('phase', this.phase)
    },
    dismissForNavigation() {
      if (this.closed || this.mode === 'dismiss') return
      this.mode = 'dismiss'; this.seq++; this.phase = 'closing'; this.$emit('phase', this.phase)
    },
    renderMounted(id) { if (id === this.hostId && !this.closed) this.bridgeEpoch++ },
    renderPhase(packet) { if (packet.seq !== this.seq || this.closed) return; this.phase = packet.phase; this.$emit('phase', this.phase) },
    renderHandoff(packet) { if (packet.seq === this.seq && !this.closed) this.$emit('handoff') },
    renderClosed(packet) { if (packet.seq !== this.seq || this.closed) return; this.closed = true; this.$emit('closed') }
  }
}
</script>

<script module="motion" lang="renderjs">
import { createBookMorph } from '../src/utils/book-morph.js'

export default {
  mounted() {
    this.disposed = false
    this.mountedReady = true
    this.resize = () => this.controller?.refresh()
    window.addEventListener('resize', this.resize)
    this.$nextTick(() => this.attach(this.hostId))
  },
  beforeUnmount() {
    this.disposed = true
    this.mountedReady = false
    clearTimeout(this.retry)
    this.controller?.dispose()
    window.removeEventListener('resize', this.resize)
  },
  methods:{
    notify(name, packet) {
      if (this.disposed || !this.mountedReady || typeof this.$ownerInstance?.callMethod !== 'function') return
      // A bridge notification must never interrupt the view-layer animation.
      try { this.$ownerInstance.callMethod(name, packet) }
      catch (error) { console.error('[BookTransition] Owner notification failed', error) }
    },
    attach(id) {
      if (id) this.hostId = id
      // App's initial change handlers run before renderjs mounted hooks inject
      // $ownerInstance. Cache props until then, before creating/commanding the
      // controller: replaying a consumed sequence cannot restart its spring.
      if (!this.mountedReady || typeof this.$ownerInstance?.callMethod !== 'function' || !this.hostId || this.disposed || this.controller) return
      const host = document.getElementById(this.hostId)
      if (!host || !host.querySelector('.large-cover') && (this.attempts || 0) < 12) {
        clearTimeout(this.retry)
        if ((this.attempts || 0) < 12) { this.attempts = (this.attempts || 0) + 1; this.retry = setTimeout(() => this.attach(this.hostId), 24) }
        return
      }
      clearTimeout(this.retry)
      this.controller = createBookMorph({ host, sourceId:this.packet?.sourceId,
        onPhase:phase => this.notify('renderPhase', { phase, seq:this.packet?.seq }),
        onHandoff:() => this.notify('renderHandoff', { seq:this.packet?.seq }),
        onClosed:() => this.notify('renderClosed', { seq:this.packet?.seq })
      })
      if (this.packet) this.controller.command(this.packet)
      this.notify('renderMounted', this.hostId)
    },
    receive(value) {
      let packet
      try { packet = typeof value === 'string' ? JSON.parse(value) : value } catch (_) { return }
      if (!packet || this.disposed || packet.seq < (this.packet?.seq ?? -1)) return
      this.packet = packet
      if (!this.mountedReady) return
      if (this.controller) this.controller.command(this.packet)
      else this.$nextTick(() => this.attach(this.hostId))
    }
  }
}
</script>

<style scoped>
.book-transition { position:fixed; z-index:40; inset:0; overflow:hidden; pointer-events:none; opacity:0; color:var(--text); isolation:isolate; }
.book-transition.book-navigation-dismiss :deep(*) { pointer-events:none !important; }
.book-surface,.book-viewport { position:absolute; inset:0; transform-origin:0 0; overflow:hidden; border-radius:22px; backface-visibility:hidden; pointer-events:none; }
/* Only the expanding card blocks input below it. Uncovered navigation stays
   usable; navigation dismissal disables this surface through the root class. */
.book-surface { pointer-events:auto; background:var(--surface); box-shadow:0 10px 35px var(--shadow); }.book-background { position:absolute; inset:0; background:var(--bg); opacity:0; }
.book-viewport { z-index:1; }.book-scroll { width:100%; height:100%; transform-origin:0 0; pointer-events:none; overscroll-behavior:contain; }
.shared-elements { position:absolute; z-index:2; inset:0; pointer-events:none; overflow:hidden; }
.shared-cover,.shared-title,.shared-author { position:absolute; top:0; left:0; margin:0; opacity:0; transform-origin:0 0; backface-visibility:hidden; }
.shared-cover { display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:7px 16px 16px 7px; }
.shared-cover image { display:block; width:100%; height:100%; }.shared-cover-letter { font-family:serif; color:#fff; line-height:1; }
.shared-spine { position:absolute; top:0; bottom:0; left:0; background:rgba(0,0,0,.12); transform-origin:left center; }
.shared-title { overflow:hidden; color:var(--text); font-weight:700; line-height:1.25; word-break:break-all; }
.shared-author { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:var(--muted); font-size:13px; }
</style>
