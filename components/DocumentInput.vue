<template>
  <view class="document-input-host" :prop="renderState" :change:prop="editorRender.onState" :cursor-request="cursorRequest" :change:cursor-request="editorRender.onRequest">
    <view class="document-input" :style="{ fontFamily, fontSize: fontSize + 'px' }"></view>
    <view class="cursor-glow"></view>
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
  computed: { renderState() { return { value: this.value, focusMode: this.focusMode, fontFamily: this.fontFamily, fontSize: this.fontSize } } },
  methods: {
    onChange(detail) { this.$emit('input', { detail }) },
    onCursor(position) { this.$emit('cursor', position) },
    onFocus() { this.$emit('focus') },
    onBlur() { this.$emit('blur') }
  }
}
</script>

<script module="editorRender" lang="renderjs">
export default {
  mounted() {
    this.$nextTick(() => {
      this.editor = this.$el.querySelector('.document-input')
      this.glow = this.$el.querySelector('.cursor-glow')
      if (!this.editor || !this.glow) return
      this.editor.setAttribute('contenteditable', 'true')
      this.editor.setAttribute('spellcheck', 'false')
      this.editor.setAttribute('role', 'textbox')
      this.editor.setAttribute('aria-multiline', 'true')
      this.editor.addEventListener('beforeinput', event => this.beforeInput(event))
      this.editor.addEventListener('paste', event => this.pasteText(event))
      this.editor.addEventListener('input', () => this.reportInput())
      this.editor.addEventListener('compositionstart', () => { this.composing = true; this.hideCaret() })
      this.editor.addEventListener('compositionend', () => { this.composing = false; this.reportInput() })
      this.editor.addEventListener('focus', () => { this.$ownerInstance.callMethod('onFocus'); this.reportCursor() })
      this.editor.addEventListener('blur', () => { this.hideCaret(); this.$ownerInstance.callMethod('onBlur') })
      for (const name of ['keyup', 'click', 'touchend']) this.editor.addEventListener(name, () => this.reportCursor())
      document.addEventListener('selectionchange', () => { if (document.activeElement === this.editor) this.reportCursor() })
      this.onState(this.pendingState || { value: '', focusMode: false })
      if (this.pendingRequest) this.onRequest(this.pendingRequest)
    })
  },
  methods: {
    blocks() { return Array.from(this.editor.children).filter(node => node.classList.contains('paragraph')) },
    readValue() { return this.blocks().map(node => node.textContent).join('\n') },
    renderValue(value) {
      const fragment = document.createDocumentFragment()
      String(value).replace(/\r\n?/g, '\n').split('\n').forEach(text => {
        const block = document.createElement('div')
        block.className = 'paragraph'
        if (text) block.textContent = text
        else block.appendChild(document.createElement('br'))
        fragment.appendChild(block)
      })
      this.editor.replaceChildren(fragment)
      this.updateFocus()
    },
    onState(state) {
      this.pendingState = state
      if (!this.editor || !state) return
      this.focusMode = !!state.focusMode
      const pending = this.recentInputs?.indexOf(state.value) ?? -1
      if (pending >= 0) {
        this.recentInputs.splice(0, pending + 1)
        if (this.readValue() !== state.value) { this.updateFocus(); return }
      }
      if (!this.composing && this.readValue() !== state.value) {
        const offset = this.getOffsets()?.start ?? 0
        this.renderValue(state.value)
        if (document.activeElement === this.editor) this.setSelection(offset, offset)
      }
      this.updateFocus()
      this.scheduleCaret()
    },
    onRequest(request) {
      this.pendingRequest = request
      if (!this.editor || !request || !request.seq || request.seq === this.appliedSeq) return
      this.appliedSeq = request.seq
      this.$nextTick(() => {
        if (request.value != null && this.readValue() !== request.value) this.renderValue(request.value)
        this.editor.focus()
        this.setSelection(request.start, request.end)
        this.reportCursor()
      })
    },
    pointForOffset(position) {
      const blocks = this.blocks()
      let left = Math.max(0, position)
      for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index], length = block.textContent.length
        if (left <= length || index === blocks.length - 1) {
          const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
          let node
          while ((node = walker.nextNode())) {
            if (left <= node.length) return { node, offset: left }
            left -= node.length
          }
          return { node: block, offset: 0 }
        }
        left -= length + 1
      }
      return { node: this.editor, offset: 0 }
    },
    setSelection(start, end) {
      const first = this.pointForOffset(start), last = this.pointForOffset(end)
      const range = document.createRange()
      range.setStart(first.node, first.offset)
      range.setEnd(last.node, last.offset)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      this.updateFocus()
      this.scheduleCaret()
    },
    offsetForPoint(node, offset) {
      const blocks = this.blocks()
      if (node === this.editor) return Math.min(this.readValue().length, blocks.slice(0, offset).reduce((sum, block) => sum + block.textContent.length + 1, 0))
      const element = node.nodeType === 1 ? node : node.parentElement
      const block = element?.closest('.paragraph'), index = blocks.indexOf(block)
      if (index < 0) return 0
      const prefix = blocks.slice(0, index).reduce((sum, item) => sum + item.textContent.length + 1, 0)
      const range = document.createRange()
      range.setStart(block, 0)
      range.setEnd(node, offset)
      return prefix + range.toString().length
    },
    getOffsets() {
      const selection = window.getSelection()
      if (!selection || !selection.rangeCount || !this.editor.contains(selection.anchorNode)) return null
      const range = selection.getRangeAt(0)
      return { start: this.offsetForPoint(range.startContainer, range.startOffset), end: this.offsetForPoint(range.endContainer, range.endOffset) }
    },
    reportInput() {
      if (this.composing) return
      if (!this.blocks().length) { this.renderValue(''); this.setSelection(0, 0) }
      const value = this.readValue()
      const cursor = this.getOffsets()?.start ?? value.length
      if (!this.recentInputs) this.recentInputs = []
      this.recentInputs.push(value)
      if (this.recentInputs.length > 20) this.recentInputs.shift()
      this.$ownerInstance.callMethod('onChange', { value, cursor })
      this.reportCursor()
    },
    beforeInput(event) {
      if (this.composing || !['insertParagraph', 'insertLineBreak', 'deleteContentBackward'].includes(event.inputType)) return
      const offsets = this.getOffsets()
      if (!offsets) return
      const value = this.readValue()
      if (event.inputType === 'deleteContentBackward') {
        if (offsets.start !== offsets.end || offsets.start === 0 || value[offsets.start - 1] !== '\n') return
        event.preventDefault()
        this.renderValue(value.slice(0, offsets.start - 1) + value.slice(offsets.start))
        this.setSelection(offsets.start - 1, offsets.start - 1)
        this.reportInput()
        return
      }
      event.preventDefault()
      const next = value.slice(0, offsets.start) + '\n' + value.slice(offsets.end)
      this.renderValue(next)
      this.setSelection(offsets.start + 1, offsets.start + 1)
      this.reportInput()
    },
    pasteText(event) {
      const value = event.clipboardData?.getData('text/plain')
      const offsets = this.getOffsets()
      if (value == null || !offsets) return
      event.preventDefault()
      const previous = this.readValue()
      const inserted = value.replace(/\r\n?/g, '\n')
      this.renderValue(previous.slice(0, offsets.start) + inserted + previous.slice(offsets.end))
      this.setSelection(offsets.start + inserted.length, offsets.start + inserted.length)
      this.reportInput()
    },
    reportCursor() {
      const offsets = this.getOffsets()
      if (!offsets) return
      this.$ownerInstance.callMethod('onCursor', offsets.start)
      this.updateFocus()
      this.scheduleCaret()
    },
    updateFocus() {
      if (!this.editor) return
      const offsets = this.getOffsets()
      const active = offsets ? this.readValue().slice(0, offsets.start).split('\n').length - 1 : -1
      this.blocks().forEach((block, index) => block.classList.toggle('dimmed', this.focusMode && active >= 0 && index !== active))
    },
    scheduleCaret() {
      if (this.frame) cancelAnimationFrame(this.frame)
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.positionCaret() })
    },
    hideCaret() { if (this.glow) this.glow.style.opacity = '0'; if (this.editor) this.editor.style.caretColor = '' },
    positionCaret() {
      if (!this.editor || !this.glow || this.composing || document.activeElement !== this.editor) { this.hideCaret(); return }
      const selection = window.getSelection()
      if (!selection || !selection.rangeCount || !selection.isCollapsed) { this.hideCaret(); return }
      const range = selection.getRangeAt(0)
      let point = range.getClientRects()[0]
      let empty = !point || !point.height
      if (empty && range.startContainer.nodeType === 3 && range.startContainer.length) {
        const sample = range.cloneRange()
        const offset = range.startOffset
        sample.setStart(range.startContainer, Math.max(0, offset - 1))
        sample.setEnd(range.startContainer, Math.min(range.startContainer.length, Math.max(1, offset)))
        const rect = sample.getClientRects()[0]
        if (rect) { point = { left: offset ? rect.right : rect.left, top: rect.top, height: rect.height }; empty = false }
      }
      if (empty) {
        const element = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement
        point = element?.closest('.paragraph')?.getBoundingClientRect()
        if (!point) { this.hideCaret(); return }
      }
      const host = this.$el.getBoundingClientRect()
      const size = parseFloat(window.getComputedStyle(this.editor).fontSize) || 18
      this.glow.style.height = Math.max(17, size * 1.42) + 'px'
      this.glow.style.transform = `translate3d(${point.left - host.left + (empty ? size * 2 : 0)}px, ${point.top - host.top + 2}px, 0)`
      this.glow.style.opacity = '1'
      this.editor.style.caretColor = 'transparent'
    }
  }
}
</script>

<style scoped>
.document-input-host { position: relative; width: 100%; min-height: 38vh; }
.document-input { display: block; width: 100%; min-height: 38vh; padding: 0 2px; border: 0; background: transparent; color: var(--writer-text); line-height: 1.85; letter-spacing: .025em; overflow-wrap: anywhere; white-space: pre-wrap; caret-color: var(--accent); outline: none; }
.document-input :deep(.paragraph) { min-height: 1.85em; text-indent: 2em; transition: opacity .22s ease; }
.document-input :deep(.paragraph.dimmed) { opacity: .23; }
.cursor-glow { position: absolute; z-index: 3; top: 0; left: 0; width: 2px; height: 27px; border-radius: 2px; background: var(--accent); box-shadow: 0 0 9px 2px var(--accent-soft); opacity: 0; pointer-events: none; transition: transform .2s cubic-bezier(.22,.7,.25,1), opacity .12s ease; }
@media (prefers-reduced-motion: reduce) { .cursor-glow, .document-input :deep(.paragraph) { transition: none; } }
</style>
