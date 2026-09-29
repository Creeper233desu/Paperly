<template><view class="reading-surface" :prop="enabled" :change:prop="gestures.setEnabled"><slot></slot></view></template>
<script>
export default { props: { enabled:Boolean }, emits:['pinch'], methods:{ pinch(ratio) { this.$emit('pinch', ratio) } } }
</script>
<script module="gestures" lang="renderjs">
import { touchDistance } from '../src/utils/font-scale.js'
export default {
  mounted() {
    this.start = event => { this.distance = touchDistance(event.touches) }
    this.move = event => {
      const distance = touchDistance(event.touches)
      if (!distance) return
      // Run in the Android view layer so two fingers never pan the WebView.
      event.preventDefault()
      if (!this.enabled) { this.distance = distance; return }
      const ratio = distance / (this.distance || distance)
      if (ratio > 1.055 || ratio < .945) { this.distance = distance; this.$ownerInstance.callMethod('pinch', ratio) }
    }
    this.end = () => { this.distance = 0 }
    this.$el.addEventListener('touchstart', this.start, { passive:true })
    this.$el.addEventListener('touchmove', this.move, { passive:false })
    this.$el.addEventListener('touchend', this.end)
    this.$el.addEventListener('touchcancel', this.end)
  },
  beforeUnmount() {
    this.$el.removeEventListener('touchstart', this.start); this.$el.removeEventListener('touchmove', this.move)
    this.$el.removeEventListener('touchend', this.end); this.$el.removeEventListener('touchcancel', this.end)
  },
  methods: { setEnabled(value) { this.enabled = !!value; this.distance = 0 } }
}
</script>
<style scoped>.reading-surface { width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; }</style>
