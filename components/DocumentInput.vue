<template>
  <view class="document-input-host">
    <textarea
      class="document-input"
      :value="value"
      :maxlength="-1"
      :auto-height="true"
      :focus="focused"
      :cursor="selectionStart < 0 ? undefined : selectionStart"
      :selection-start="selectionStart"
      :selection-end="selectionEnd"
      :style="{ fontFamily, fontSize: fontSize + 'px' }"
      placeholder="从这里开始写…"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @tap="reportSelection"
    />
  </view>
</template>

<script>
export default {
  props: {
    value: { type: String, default: '' },
    fontFamily: { type: String, default: '' },
    fontSize: { type: Number, default: 18 },
    focusMode: Boolean,
    cursorRequest: { type: Object, default: () => ({ seq: 0, start: 0, end: 0 }) }
  },
  emits: ['input', 'focus', 'blur', 'cursor'],
  data() {
    return { focused: false, selectionStart: -1, selectionEnd: -1, lastRequest: 0 }
  },
  watch: {
    cursorRequest: {
      handler(request) {
        if (!request?.seq || request.seq === this.lastRequest) return
        this.lastRequest = request.seq
        this.focused = false
        this.selectionStart = -1
        this.selectionEnd = -1
        this.$nextTick(() => {
          this.selectionStart = request.start
          this.selectionEnd = request.end
          this.focused = true
        })
      },
      deep: false
    }
  },
  methods: {
    onInput(event) {
      this.$emit('input', event)
      if (Number.isFinite(event.detail?.cursor) && event.detail.cursor >= 0) this.$emit('cursor', event.detail.cursor)
    },
    onFocus(event) {
      this.focused = true
      this.$emit('focus', event)
      this.reportSelection()
    },
    onBlur(event) {
      this.focused = false
      if (Number.isFinite(event.detail?.cursor) && event.detail.cursor >= 0) this.$emit('cursor', event.detail.cursor)
      this.$emit('blur', event)
    },
    reportSelection() {
      setTimeout(() => {
        if (!this.focused || typeof uni.getSelectedTextRange !== 'function') return
        uni.getSelectedTextRange({ success: result => {
          if (Number.isFinite(result.start) && result.start >= 0) this.$emit('cursor', result.start)
        } })
      }, 40)
    }
  }
}
</script>

<style scoped>
.document-input-host { width: 100%; min-height: 38vh; }
.document-input { display: block; width: 100%; min-height: 38vh; padding: 0 2px; border: 0; background: transparent; color: var(--writer-text); -webkit-text-fill-color: var(--writer-text); line-height: 1.85; letter-spacing: .025em; white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word; caret-color: var(--accent); resize: none; outline: none; }
.document-input::placeholder { color: var(--muted); -webkit-text-fill-color: var(--muted); opacity: .8; }
</style>
