<template><view class="reading-surface" :prop="gesturePayload" :change:prop="gestures.setEnabled"><slot></slot></view></template>
<script>
export default {
  props: { enabled:Boolean }, emits:['pinch'],
  data() { return { bridgeEpoch:0 } },
  computed: { gesturePayload() { return JSON.stringify({ enabled:this.enabled, epoch:this.bridgeEpoch }) } },
  methods: {
    pinch(ratio) { this.$emit('pinch', ratio) },
    renderReady() { this.bridgeEpoch++ }
  }
}
</script>
<script module="gestures" lang="renderjs">
import { touchDistance } from '../src/utils/font-scale.js'
export default {
  mounted() {
    this.enabled = false
    this.start = event => { this.distance = touchDistance(event.touches || event.originalEvent?.touches) }
    this.move = event => {
      const distance = touchDistance(event.touches || event.originalEvent?.touches)
      if (!distance) return
      // Run in the Android view layer so two fingers never pan the WebView.
      event.preventDefault()
      if (!this.enabled) { this.distance = distance; return }
      const ratio = distance / (this.distance || distance)
      if (ratio > 1.055 || ratio < .945) { this.distance = distance; this.$ownerInstance.callMethod('pinch', ratio) }
    }
    this.end = () => { this.distance = 0 }
    this.$el.addEventListener('touchstart', this.start, { capture:true, passive:true })
    this.$el.addEventListener('touchmove', this.move, { capture:true, passive:false })
    this.$el.addEventListener('touchend', this.end)
    this.$el.addEventListener('touchcancel', this.end)
    this.$ownerInstance.callMethod('renderReady')
  },
  beforeUnmount() {
    this.$el.removeEventListener('touchstart', this.start); this.$el.removeEventListener('touchmove', this.move)
    this.$el.removeEventListener('touchend', this.end); this.$el.removeEventListener('touchcancel', this.end)
  },
  methods: { setEnabled(value) {
    let payload = value
    try { if (typeof value === 'string') payload = JSON.parse(value) } catch (_) { payload = { enabled:false } }
    this.enabled = !!payload?.enabled
    this.distance = 0
  } }
}
</script>
<style scoped>.reading-surface { width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; touch-action:pan-y; }</style>
