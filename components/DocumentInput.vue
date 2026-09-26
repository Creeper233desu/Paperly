<template>
  <view class="document-input-host" :class="{ 'is-focus-mode': focusMode }" :prop="value" :change:prop="cursorRender.onValueChange">
    <textarea class="document-input" :value="value" placeholder="从这里开始写…" :auto-height="true" :maxlength="-1" :focus="focus" :selection-start="selectionStart" :selection-end="selectionEnd" :style="{ fontFamily, fontSize: fontSize + 'px' }" @focus="$emit('focus', $event)" @blur="$emit('blur', $event)" @input="$emit('input', $event)" />
    <view class="cursor-glow"></view>
  </view>
</template>

<script>
export default {
  props: {
    value: { type: String, default: '' },
    fontFamily: { type: String, default: '' },
    fontSize: { type: Number, default: 18 },
    focus: Boolean,
    focusMode: Boolean,
    selectionStart: { type: Number, default: -1 },
    selectionEnd: { type: Number, default: -1 }
  },
  emits: ['input', 'focus', 'blur', 'cursor'],
  methods: {
    onVisualCursor(position) { this.$emit('cursor', position) }
  }
}
</script>

<script module="cursorRender" lang="renderjs">
export default {
  mounted() {
    this.$nextTick(() => {
      const host = this.$el
      const textarea = host && host.querySelector('textarea')
      const glow = host && host.querySelector('.cursor-glow')
      if (!textarea || !glow) return
      this.inputElement = textarea
      this.glowElement = glow
      this.mirrorElement = document.createElement('div')
      this.mirrorElement.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;box-sizing:border-box;'
      host.appendChild(this.mirrorElement)
      const schedule = () => this.scheduleCaret()
      const report = () => { this.scheduleCaret(); this.$ownerInstance.callMethod('onVisualCursor', textarea.selectionStart) }
      for (const name of ['input', 'focus', 'scroll']) textarea.addEventListener(name, schedule)
      for (const name of ['click', 'touchend', 'keyup']) textarea.addEventListener(name, report)
      textarea.addEventListener('blur', () => { glow.style.opacity = '0'; textarea.style.caretColor = '' })
      textarea.addEventListener('compositionstart', () => { this.composing = true; glow.style.opacity = '0'; textarea.style.caretColor = '' })
      textarea.addEventListener('compositionend', () => { this.composing = false; this.scheduleCaret() })
      this.scheduleCaret()
    })
  },
  methods: {
    onValueChange() { this.scheduleCaret() },
    scheduleCaret() {
      if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame)
      this.pendingFrame = requestAnimationFrame(() => { this.pendingFrame = 0; this.positionCaret() })
    },
    positionCaret() {
      const textarea = this.inputElement, glow = this.glowElement, mirror = this.mirrorElement
      if (!textarea || !glow || !mirror || this.composing || document.activeElement !== textarea || textarea.selectionStart !== textarea.selectionEnd) {
        if (glow) glow.style.opacity = '0'
        if (textarea) textarea.style.caretColor = ''
        return
      }
      const style = window.getComputedStyle(textarea)
      const rootRect = this.$el.getBoundingClientRect()
      const textRect = textarea.getBoundingClientRect()
      for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textIndent', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'textAlign']) mirror.style[key] = style[key]
      mirror.style.width = textRect.width + 'px'
      mirror.style.left = textRect.left - rootRect.left + 'px'
      mirror.textContent = ''
      const before = textarea.value.slice(0, textarea.selectionStart)
      mirror.appendChild(document.createTextNode(before))
      const marker = document.createElement('span')
      marker.textContent = '\u200b'
      mirror.appendChild(marker)
      mirror.appendChild(document.createTextNode(textarea.value.slice(textarea.selectionStart)))
      const point = marker.getBoundingClientRect()
      if (!Number.isFinite(point.left) || !Number.isFinite(point.top)) {
        textarea.style.caretColor = ''
        glow.style.opacity = '0'
        return
      }
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.85
      glow.style.height = Math.max(17, lineHeight * .77) + 'px'
      glow.style.transform = `translate3d(${point.left - rootRect.left - textarea.scrollLeft}px, ${point.top - rootRect.top - textarea.scrollTop + lineHeight * .11}px, 0)`
      glow.style.opacity = '1'
      textarea.style.caretColor = 'transparent'
    }
  }
}
</script>

<style scoped>
.document-input-host { position: relative; width: 100%; min-height: 38vh; }
.document-input { display: block; width: 100%; min-height: 38vh; padding: 0 2px; border: 0; background: transparent; color: var(--writer-text); line-height: 1.85; letter-spacing: .025em; text-indent: 2em; overflow-wrap: break-word; word-break: break-word; white-space: pre-wrap; caret-color: var(--accent); resize: none; outline: none; }
.document-input::placeholder { color: var(--muted); opacity: .8; }
.is-focus-mode .document-input { color: transparent; -webkit-text-fill-color: transparent; }
.is-focus-mode .document-input::placeholder { -webkit-text-fill-color: var(--muted); }
.cursor-glow { position: absolute; z-index: 3; top: 0; left: 0; width: 2px; height: 27px; border-radius: 2px; background: var(--accent); box-shadow: 0 0 9px 2px var(--accent-soft); opacity: 0; pointer-events: none; transition: transform .12s cubic-bezier(.2,.7,.2,1), opacity .12s ease; }
@media (prefers-reduced-motion: reduce) { .cursor-glow { transition: none; } }
</style>
