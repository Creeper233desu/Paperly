<template>
  <view :id="hostId" class="book-transition" :class="themeClass()" :host-prop="hostId" :change:host-prop="motion.attach" :prop="motionPayload" :change:prop="motion.receive">
    <view class="book-surface" @tap="reopen"><view class="book-background"></view></view>
    <view class="book-viewport"><view class="book-scroll"><scroll-view scroll-y class="book-scroller">
      <BookPanel ref="panel" :book-id="bookId" :cover-color="coverColor" motion="live" @cover-ready="detailCoverLoaded" @close="requestClose" @interact="reopen" />
    </scroll-view></view></view>
    <view v-if="book" class="shared-elements" aria-hidden="true">
      <BookCover class="shared-cover" :src="book.cover" :title="book.title" :color="coverColor" letter-class="shared-cover-letter" spine-class="shared-spine" @load="coverLoaded" @error="coverLoaded" />
      <view class="shared-title">{{ book.title }}</view><view class="shared-author">{{ book.author || $t('未设置作者') }}</view>
      <BookShelfDetails class="shared-shelf-details" :book="book" />
    </view>
  </view>
</template>

<script>
import BookPanel from './BookPanel.vue'
import BookCover from './BookCover.vue'
import BookShelfDetails from './BookShelfDetails.vue'
import { getBook } from '../src/store/library'
import { themeClass } from '../src/store/preferences'

export default {
  components:{ BookPanel, BookCover, BookShelfDetails },
  props:{ bookId:String, sourceId:String, coverColor:String, pageActive:{ type:Boolean, default:true } },
  emits:['handoff', 'phase', 'closed'],
  data() { return { hostId:`book-motion-${Date.now()}-${Math.random().toString(36).slice(2)}`, mode:'open', seq:1, bridgeEpoch:0, phase:'preparing', closed:false, loadedCover:'', loadedDetailCover:'' } },
  computed:{
    book() { return getBook(this.bookId) },
    motionPayload() { return JSON.stringify({ sourceId:this.sourceId, mode:this.mode, seq:this.seq, pageActive:this.pageActive, epoch:this.bridgeEpoch, coverReady:!this.book?.cover || (this.loadedCover === this.book.cover && this.loadedDetailCover === this.book.cover) }) }
  },
  methods:{
    themeClass,
    coverLoaded(src) { if (src === this.book?.cover) this.loadedCover = src },
    detailCoverLoaded(src) { if (src === this.book?.cover) this.loadedDetailCover = src },
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
    renderOutsideTap(packet) {
      if (packet.seq !== this.seq || this.closed || !this.pageActive || this.mode !== 'open' || this.phase !== 'opening') return
      this.requestClose()
    },
    renderClosed(packet) { if (packet.seq !== this.seq || this.closed) return; this.closed = true; this.$emit('closed') }
  }
}
</script>

<script module="motion" lang="renderjs">
import { createBookMorph } from '../src/utils/book-morph.js'
import { bindBookOutsideTap } from '../src/utils/book-outside-tap.js'

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
    this.disposeOutside?.()
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
      this.disposeOutside = bindBookOutsideTap({ host,
        isOpening:() => !this.disposed && this.packet?.mode === 'open' && this.packet?.pageActive !== false && this.controller.getState().phase === 'opening',
        onTap:() => this.notify('renderOutsideTap', { seq:this.packet?.seq })
      })
      if (this.packet && (this.packet.mode !== 'open' || this.packet.coverReady !== false)) this.controller.command(this.packet)
      this.notify('renderMounted', this.hostId)
    },
    receive(value) {
      let packet
      try { packet = typeof value === 'string' ? JSON.parse(value) : value } catch (_) { return }
      if (!packet || this.disposed || packet.seq < (this.packet?.seq ?? -1)) return
      this.packet = packet
      if (!this.mountedReady) return
      // Keep the source visible until both shared and detail covers decode.
      // Close/dismiss must still work while either image is loading.
      if (packet.mode === 'open' && packet.coverReady === false) return
      if (this.controller) this.controller.command(this.packet)
      else this.$nextTick(() => this.attach(this.hostId))
    }
  }
}
</script>

<style scoped>
.book-transition { position:fixed; z-index:40; inset:0; overflow:hidden; pointer-events:none; opacity:0; visibility:hidden; color:var(--text); isolation:isolate; }
.book-transition.book-navigation-dismiss :deep(*) { pointer-events:none !important; }
.book-surface,.book-viewport { position:absolute; inset:0; transform-origin:0 0; overflow:hidden; border-radius:22px; backface-visibility:hidden; pointer-events:none; }
/* Only the expanding card blocks input below it. Uncovered navigation stays
   usable; navigation dismissal disables this surface through the root class. */
.book-surface { pointer-events:auto; background:var(--surface); box-shadow:0 10px 35px var(--shadow); }.book-background { position:absolute; inset:0; background:var(--bg); opacity:0; }
.book-viewport { z-index:1; }.book-scroll { width:100%; height:100%; transform-origin:0 0; pointer-events:none; overscroll-behavior:contain; }
/* Transform a stationary wrapper, not the scrolling element: fixed dialogs
   keep the viewport as their containing block when the detail is scrolled. */
.book-scroller { width:100%; height:100%; overscroll-behavior:contain; }
.shared-elements { position:absolute; z-index:2; inset:0; pointer-events:none; overflow:hidden; }
.shared-cover,.shared-title,.shared-author { position:absolute; top:0; left:0; margin:0; opacity:0; transform-origin:0 0; backface-visibility:hidden; }
.shared-elements .shared-cover { position:absolute; }
.shared-title { overflow:hidden; color:var(--text); font-weight:700; line-height:1.25; word-break:break-all; }
.shared-author { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:var(--muted); font-size:13px; }
.shared-shelf-details :deep(.book-description),.shared-shelf-details :deep(.book-meta) { position:absolute; top:0; left:0; margin:0; opacity:0; backface-visibility:hidden; }
</style>
