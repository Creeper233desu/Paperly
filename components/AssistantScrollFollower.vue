<template>
  <view class="assistant-scroll-follower" :follow-prop="tick" :change:follow-prop="followRender.onFollow"></view>
</template>

<script>
export default { props: { tick: { type: Number, default: 0 } } }
</script>

<script module="followRender" lang="renderjs">
export default {
  mounted() { this.$nextTick(() => this.onFollow()) },
  methods: {
    onFollow() {
      const host = this.$el?.closest?.('.assistant-messages') || document.querySelector('.assistant-messages')
      if (!host) return
      const scroller = host.querySelector('.uni-scroll-view') || host
      requestAnimationFrame(() => {
        scroller.scrollTop = scroller.scrollHeight
        requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight })
      })
    }
  }
}
</script>

<style scoped>
.assistant-scroll-follower { height:1px; }
</style>
