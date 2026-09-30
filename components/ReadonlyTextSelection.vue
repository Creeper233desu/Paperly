<template>
  <view :id="hostId" class="readonly-source" :capture="captureRevision" :change:capture="selectionRender.capture" :host="hostId" :change:host="selectionRender.bind">
    <text class="readonly-copy" selectable user-select>{{ value }}</text>
  </view>
</template>
<script>
export default {
  props: { value: { type:String, default:'' } }, emits:['selection'],
  data() { return { hostId:`export-source-${Date.now()}-${Math.random().toString(36).slice(2)}`, captureRevision:0 } },
  methods: { captureSelection() { this.captureRevision++ }, onSelection(range) { this.$emit('selection', range) } }
}
</script>
<script module="selectionRender" lang="renderjs">
export default {
  mounted() { this.bind(this.$el?.id) },
  beforeUnmount() { document.removeEventListener('selectionchange', this.selectionListener) },
  methods: {
    bind(id, old, owner) {
      this.owner = owner || this.$ownerInstance
      this.hostId = id
      if (!this.selectionListener) { this.selectionListener = () => this.capture(); document.addEventListener('selectionchange', this.selectionListener) }
    },
    capture() {
      const host = document.getElementById(this.hostId)
      const selection = window.getSelection()
      if (!host || !selection?.rangeCount || selection.isCollapsed) return
      const selected = selection.getRangeAt(0)
      if (!host.contains(selected.startContainer) || !host.contains(selected.endContainer)) return
      const before = document.createRange()
      before.selectNodeContents(host); before.setEnd(selected.startContainer, selected.startOffset)
      const start = before.toString().length
      this.owner?.callMethod('onSelection', { start, end:start + selected.toString().length })
    }
  }
}
</script>
<style scoped>
.readonly-source { height:190px; overflow:auto; padding:14px; margin-top:12px; box-sizing:border-box; background:var(--surface-alt); border:1px solid var(--line); border-radius:12px; color:var(--text); font-size:13px; line-height:1.8; white-space:pre-wrap; overflow-wrap:anywhere; }
.readonly-source,.readonly-copy { user-select:text; -webkit-user-select:text; }.readonly-copy { display:block; } .readonly-source ::selection { background:var(--accent-soft); }
</style>
