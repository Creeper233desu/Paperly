<template>
  <view :id="hostId" class="document-input-host" :host-prop="hostId" :change:host-prop="editorRender.onHostChange" :prop="documentPayload" :change:prop="editorRender.onValueChange" :focus-prop="focusPayload" :change:focus-prop="editorRender.onFocusMode" :cursor-prop="cursorPayload" :change:cursor-prop="editorRender.onRequest" :active-prop="renderReady" :change:active-prop="editorRender.onActiveChange" :visual-prop="visualPayload" :change:visual-prop="editorRender.onVisualSettings" :style="{ '--cursor-color': cursorTrailColor }">
    <view v-show="renderReady" class="document-input" contenteditable="true" :style="{ fontFamily, fontSize: fontSize + 'px' }"></view>
    <textarea v-if="!renderReady" class="document-fallback" :value="value" :maxlength="-1" :auto-height="true" :focus="fallbackFocus" :selection-start="selectionStart" :selection-end="selectionEnd" :style="{ fontFamily, fontSize: fontSize + 'px' }" placeholder="从这里开始写…" @input="onFallbackInput" @focus="onFallbackFocus" @blur="onFallbackBlur" @tap="reportFallbackCursor" @longpress="onFallbackLongPress" />
    <view class="cursor-glow"></view>
    <view class="cursor-trail"></view>
    <view class="cursor-jelly-layer"></view>
    <view v-if="menu.open" class="selection-menu-shade" @tap="closeMenu"><view class="selection-menu" :class="{ closing: menu.closing }" :style="{ left: menu.left + 'px', top: menu.top + 'px' }" @tap.stop><view class="selection-action" @tap="runMenuAction('copy')">复制</view><view class="selection-action" @tap="runMenuAction('paste')">粘贴</view><view class="selection-action" @tap="runMenuAction('cut')">剪切</view><view class="selection-action" @tap="runMenuAction('all')">全选</view></view></view>
  </view>
</template>

<script>
export default {
  props: {
    value: { type: String, default: '' },
    documentId: { type: String, default: '' },
    documentRevision: { type: Number, default: 0 },
    fontFamily: { type: String, default: '' },
    fontSize: { type: Number, default: 18 },
    focusMode: Boolean,
    animatedCursor: { type: Boolean, default: true },
    cursorStyle: { type: String, default: 'beam' },
    cursorTrailColor: { type: String, default: '#819bcb' },
    cursorTrailLength: { type: Number, default: 32 },
    cursorRequest: { type: Object, default: () => ({ seq: 0, start: 0, end: 0 }) }
  },
  emits: ['input', 'focus', 'blur', 'cursor'],
  data() { return { hostId: `paper-editor-${Date.now()}-${Math.random().toString(36).slice(2)}`, bridgeEpoch: 0, focusSnapshot: this.value, renderReady: false, fallbackFocus: false, selectionStart: -1, selectionEnd: -1, menu: { open: false, left: 0, top: 0, start: 0, end: 0 }, menuRequest: null, menuSeq: 0 } },
  computed: {
    documentPayload() { return JSON.stringify({ id: this.documentId, revision: this.documentRevision, value: this.value, epoch: this.bridgeEpoch }) },
    cursorPayload() { return JSON.stringify(this.menuRequest || this.cursorRequest) },
    focusPayload() { return JSON.stringify({ enabled: this.focusMode, ready: this.renderReady, documentId: this.documentId, revision: this.documentRevision, value: this.focusSnapshot, epoch: this.bridgeEpoch }) },
    visualPayload() { return JSON.stringify({ enabled: this.animatedCursor, style: this.cursorStyle, color: this.cursorTrailColor, length: this.cursorTrailLength, ready: this.renderReady, epoch: this.bridgeEpoch }) }
  },
  watch: {
    value(next) { if (!this.renderReady) this.focusSnapshot = next },
    documentId() { this.focusSnapshot = this.value },
    focusMode() { this.focusSnapshot = this.value },
    renderReady() { this.focusSnapshot = this.value },
    cursorRequest(request) {
      this.menuRequest = null
      if (this.renderReady || !request?.seq) return
      this.fallbackFocus = false
      this.selectionStart = -1; this.selectionEnd = -1
      this.$nextTick(() => { this.selectionStart = request.start; this.selectionEnd = request.end; this.fallbackFocus = true })
    }
  },
  methods: {
    onRenderMounted(id) { if (id === this.hostId) this.bridgeEpoch += 1 },
    onRenderReady() { this.renderReady = true },
    onChange(detail) { this.$emit('input', { detail }) },
    onCursor(position) { this.$emit('cursor', position) },
    onFocus() { this.$emit('focus') },
    onBlur() { this.$emit('blur') },
    onFallbackInput(event) { this.$emit('input', { detail: { ...event.detail, documentId: this.documentId, userEdit: true } }); if (Number.isFinite(event.detail?.cursor)) this.$emit('cursor', event.detail.cursor) },
    onFallbackFocus(event) { this.fallbackFocus = true; this.$emit('focus', event); this.reportFallbackCursor() },
    onFallbackBlur(event) { this.fallbackFocus = false; if (Number.isFinite(event.detail?.cursor)) this.$emit('cursor', event.detail.cursor); this.$emit('blur', event) },
    onFallbackLongPress(event) {
      const touch = event.touches?.[0] || event.changedTouches?.[0]
      const x = touch?.clientX ?? 150, y = touch?.clientY ?? 100
      if (typeof uni.getSelectedTextRange !== 'function') return
      uni.getSelectedTextRange({ success: result => this.onMenuOpen({ x, y, start: result.start || 0, end: result.end || result.start || 0 }) })
    },
    onMenuOpen(selection) {
      const info = uni.getSystemInfoSync()
      const width = info.windowWidth || 360
      const height = info.windowHeight || 720
      const menuWidth = Math.min(292, width - 24)
      const start = Math.max(0, Math.min(this.value.length, selection.start))
      const end = Math.max(start, Math.min(this.value.length, selection.end))
      clearTimeout(this.menuTimer)
      this.menu = { open: true, closing: false, start, end, left: Math.max(12, Math.min(selection.x - menuWidth / 2, width - menuWidth - 12)), top: Math.max(12, Math.min(selection.y > 70 ? selection.y - 68 : selection.y + 20, height - 72)) }
    },
    closeMenu() { if (!this.menu.open || this.menu.closing) return; this.menu.closing = true; this.menuTimer = setTimeout(() => { this.menu.open = false; this.menu.closing = false }, 150) },
    requestMenuSelection(start, end, value = this.value) {
      this.menuSeq = Math.max(this.menuSeq, this.cursorRequest.seq) + 1
      this.menuRequest = { seq: this.menuSeq, source: 'menu', documentId: this.documentId, start, end, value }
      if (!this.renderReady) { this.fallbackFocus = false; this.selectionStart = -1; this.selectionEnd = -1; this.$nextTick(() => { this.selectionStart = start; this.selectionEnd = end; this.fallbackFocus = true }) }
    },
    replaceMenuSelection(inserted, start = this.menu.start, end = this.menu.end) {
      inserted = String(inserted).replace(/\r\n?/g, '\n')
      const value = this.value.slice(0, start) + inserted + this.value.slice(end)
      const cursor = start + inserted.length
      this.$emit('input', { detail: { value, cursor, source: 'menu', documentId: this.documentId } })
      this.$emit('cursor', cursor)
      this.requestMenuSelection(cursor, cursor, value)
    },
    runMenuAction(action) {
      const { start, end } = this.menu
      const selected = this.value.slice(start, end)
      this.closeMenu()
      if (action === 'all') { this.requestMenuSelection(0, this.value.length); return }
      if (action === 'paste') { uni.getClipboardData({ success: result => this.replaceMenuSelection(result.data || '', start, end), fail: () => uni.showToast({ title: '无法读取剪贴板', icon: 'none' }) }); return }
      if (!selected) return
      uni.setClipboardData({ data: selected, showToast: false, success: () => { if (action === 'cut') this.replaceMenuSelection('', start, end) }, fail: () => uni.showToast({ title: '无法写入剪贴板', icon: 'none' }) })
    },
    reportFallbackCursor() {
      setTimeout(() => {
        if (!this.fallbackFocus || typeof uni.getSelectedTextRange !== 'function') return
        uni.getSelectedTextRange({ success: result => { if (Number.isFinite(result.start)) this.$emit('cursor', result.start) } })
      }, 40)
    }
  }
}
</script>

<script module="editorRender" lang="renderjs">
export default {
  mounted() {
    this.$nextTick(() => this.attachEditor())
  },
  methods: {
    onHostChange(id) {
      this.hostId = id
      this.$nextTick(() => this.attachEditor())
    },
    attachEditor() {
      const root = this.$el
      const host = this.hostId ? document.getElementById(this.hostId) : (root?.classList?.contains('document-input-host') ? root : root?.querySelector?.('.document-input-host'))
      if (!host || !host.classList?.contains('document-input-host')) {
        if ((this.attachAttempts || 0) < 5) { this.attachAttempts = (this.attachAttempts || 0) + 1; setTimeout(() => this.attachEditor(), 32) }
        return
      }
      if (this.editor && this.host === host) return
      this.host = host
      this.editor = host?.querySelector('.document-input')
      this.glow = host?.querySelector('.cursor-glow')
      this.trail = host?.querySelector('.cursor-trail')
      this.jellyLayer = host?.querySelector('.cursor-jelly-layer')
      if (!this.editor) {
        if ((this.attachAttempts || 0) < 5) { this.attachAttempts = (this.attachAttempts || 0) + 1; setTimeout(() => this.attachEditor(), 32) }
        return
      }
      this.attachAttempts = 0
      this.editor.setAttribute('contenteditable', 'true')
      this.editor.contentEditable = 'true'
      this.editor.setAttribute('spellcheck', 'false')
      this.editor.setAttribute('role', 'textbox')
      this.editor.setAttribute('aria-multiline', 'true')
      this.editor.addEventListener('beforeinput', event => { this.editingUntil = Date.now() + 160; this.navigationPending = false; this.beforeInput(event) })
      this.editor.addEventListener('paste', event => this.pasteText(event))
      this.editor.addEventListener('input', event => { if (event.isTrusted) this.reportInput() })
      this.editor.addEventListener('compositionstart', () => { this.composing = true; this.navigationPending = false; this.hideCaret() })
      this.editor.addEventListener('compositionend', () => { this.composing = false; this.editingUntil = Date.now() + 160; this.reportInput() })
      this.editor.addEventListener('focus', () => { this.$ownerInstance.callMethod('onFocus'); this.reportCursor() })
      this.editor.addEventListener('blur', () => { this.hideCaret(true); this.$ownerInstance.callMethod('onBlur') })
      this.editor.addEventListener('keydown', event => { this.navigationPending = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key); if (this.navigationPending) this.editingUntil = 0 })
      this.editor.addEventListener('mousedown', () => { this.navigationPending = true; this.editingUntil = 0 })
      this.editor.addEventListener('contextmenu', event => { event.preventDefault(); this.openMenu(event.clientX, event.clientY) })
      this.editor.addEventListener('touchstart', event => {
        const touch = event.touches[0]
        if (!touch) return
        this.navigationPending = true
        this.editingUntil = 0
        this.touchPoint = { x: touch.clientX, y: touch.clientY }
        clearTimeout(this.longPressTimer)
        this.longPressTimer = setTimeout(() => this.openMenu(this.touchPoint.x, this.touchPoint.y), 480)
      }, { passive: true })
      this.editor.addEventListener('touchmove', event => {
        const touch = event.touches[0]
        if (touch && this.touchPoint && Math.hypot(touch.clientX - this.touchPoint.x, touch.clientY - this.touchPoint.y) > 12) clearTimeout(this.longPressTimer)
      }, { passive: true })
      for (const name of ['touchend', 'touchcancel']) this.editor.addEventListener(name, () => clearTimeout(this.longPressTimer))
      this.editor.addEventListener('keyup', event => { this.reportCursor(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)); setTimeout(() => { this.navigationPending = false }, 120) })
      for (const name of ['click', 'touchend']) this.editor.addEventListener(name, () => { this.reportCursor(true); setTimeout(() => { this.navigationPending = false }, 120) })
      if (window.__paperEditorSelectionListener) document.removeEventListener('selectionchange', window.__paperEditorSelectionListener)
      window.__paperEditorSelectionListener = () => { if (document.activeElement === this.editor) this.reportCursor(!!this.navigationPending && Date.now() > (this.editingUntil || 0)) }
      document.addEventListener('selectionchange', window.__paperEditorSelectionListener)
      if (this.pendingFocusMode !== undefined) this.onFocusMode(this.pendingFocusMode)
      if (this.pendingVisual !== undefined) this.onVisualSettings(this.pendingVisual)
      if (this.pendingValue !== undefined) this.onValueChange(this.pendingValue)
      if (this.pendingRequest) this.onRequest(this.pendingRequest)
      this.$ownerInstance.callMethod('onRenderMounted', this.hostId || host.id)
    },
    blocks() { return Array.from(this.editor.children).filter(node => node.classList.contains('paragraph')) },
    readValue() { return this.blocks().map(node => node.textContent).join('\n') },
    renderValue(value) {
      const paragraphs = String(value).replace(/\r\n?/g, '\n').split('\n')
      const blocks = this.blocks()
      paragraphs.forEach((text, index) => {
        let block = blocks[index]
        if (!block) {
          block = document.createElement('div')
          block.className = 'paragraph'
          this.editor.appendChild(block)
        }
        if (block.textContent !== text || (!text && !block.querySelector('br'))) {
          while (block.firstChild) block.removeChild(block.firstChild)
          if (text) block.textContent = text
          else block.appendChild(document.createElement('br'))
        }
      })
      blocks.slice(paragraphs.length).forEach(block => block.remove())
      Array.from(this.editor.children).filter(node => !node.classList.contains('paragraph')).forEach(node => node.remove())
    },
    onValueChange(payload) {
      let packet = payload
      if (typeof packet === 'string') {
        try { packet = JSON.parse(packet) } catch (_) { packet = { id: this.documentId || '', value: payload } }
      }
      if (!packet || typeof packet.value !== 'string') return
      const value = packet.value, id = packet.id || ''
      const revision = Number(packet.revision) || 0
      if (revision < (this.documentRevision || 0)) return
      this.pendingValue = payload
      this.documentRevision = revision
      const changedDocument = this.documentId !== id
      if (changedDocument) {
        this.documentId = id
        this.lastFocusOffset = 0
        this.recentInputs = []
        this.awaitingEcho = false
        this.localValue = value
      }
      if (!this.editor) return
      const pending = this.recentInputs?.indexOf(value) ?? -1
      if (!changedDocument && pending >= 0) {
        this.recentInputs.splice(0, pending + 1)
        this.lastPropValue = value
        if (value !== this.localValue) {
          if (!this.composing && this.readValue() !== this.localValue) this.renderValue(this.localValue)
          return
        }
        this.awaitingEcho = false
      } else if (!changedDocument && this.awaitingEcho && value === this.lastPropValue) {
        if (!this.composing && this.readValue() !== this.localValue) this.renderValue(this.localValue)
        return
      } else {
        this.localValue = value
        this.awaitingEcho = false
        this.recentInputs = []
      }
      this.lastPropValue = value
      if (!this.composing && (!this.blocks().length || this.readValue() !== value)) {
        const scrollRoot = document.scrollingElement || document.documentElement
        const scrollTop = scrollRoot?.scrollTop || 0
        const requestedOffset = this.pendingRequest?.documentId === id && this.pendingRequest?.value === value ? this.pendingRequest.start : null
        const offset = changedDocument ? (requestedOffset ?? 0) : (requestedOffset ?? this.getOffsets()?.start ?? this.lastFocusOffset ?? 0)
        this.lastFocusOffset = offset
        this.renderValue(value)
        if (!changedDocument && document.activeElement === this.editor) this.setSelection(offset, offset)
        if (scrollRoot) { scrollRoot.scrollTop = scrollTop; requestAnimationFrame(() => { scrollRoot.scrollTop = scrollTop }) }
      }
      this.updateFocus()
      this.scheduleCaret()
      if (changedDocument && this.pendingRequest?.documentId === id) this.onRequest(this.pendingRequest)
      if (!this.ready && this.blocks().length && this.readValue() === value) {
        this.ready = true
        this.$ownerInstance.callMethod('onRenderReady')
      }
    },
    onFocusMode(enabled) {
      this.pendingFocusMode = enabled
      if (typeof enabled === 'string') { try { enabled = JSON.parse(enabled) } catch (_) { /* older boolean payload */ } }
      this.focusMode = typeof enabled === 'object' ? !!enabled?.enabled : !!enabled
      const snapshot = typeof enabled === 'object' && (!enabled.documentId || enabled.documentId === this.documentId) && (enabled.revision == null || enabled.revision === this.documentRevision) ? enabled.value : undefined
      const restoreValue = this.awaitingEcho ? this.localValue : (snapshot ?? this.localValue)
      if (this.editor && !this.composing && document.activeElement !== this.editor && restoreValue && !this.readValue()) {
        const scrollRoot = document.scrollingElement || document.documentElement
        const scrollTop = scrollRoot?.scrollTop || 0
        this.localValue = restoreValue
        this.renderValue(restoreValue)
        if (scrollRoot) scrollRoot.scrollTop = scrollTop
      }
      this.updateFocus()
    },
    onActiveChange(active) {
      this.active = !!active
      if (this.active && this.pendingRequest) this.onRequest(this.pendingRequest)
      if (this.active) requestAnimationFrame(() => requestAnimationFrame(() => { this.updateFocus(); this.scheduleCaret() }))
      else this.hideCaret()
    },
    onVisualSettings(payload) {
      this.pendingVisual = payload
      if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch (_) { return } }
      this.animatedCursor = payload?.enabled !== false
      this.cursorStyle = payload?.style === 'neovim' ? 'neovim' : 'beam'
      this.trailColor = /^#[0-9a-f]{6}$/i.test(payload?.color) ? payload.color : '#819bcb'
      this.trailLength = Math.min(96, Math.max(0, Number(payload?.length) || 0))
      if (this.glow) { this.glow.style.background = this.trailColor; this.glow.style.boxShadow = `0 0 10px ${this.trailColor}`; this.glow.classList.toggle('neovim', this.cursorStyle === 'neovim') }
      if (this.jellyPath) { this.jellyPath.setAttribute('fill', this.trailColor); this.jellyPath.style.filter = `drop-shadow(0 0 7px ${this.trailColor})` }
      if (!this.trailLength && this.trail) this.trail.style.opacity = '0'
      if (!this.animatedCursor) this.hideCaret()
      else this.scheduleCaret()
    },
    onRequest(request) {
      if (typeof request === 'string') {
        try { request = JSON.parse(request) } catch (_) { return }
      }
      this.pendingRequest = request
      if (!this.editor || !this.active || !request || !request.seq || (request.seq === this.appliedSeq && request.source === this.appliedSource) || (request.documentId && request.documentId !== this.documentId)) return
      if (Number.isFinite(request.start)) this.lastFocusOffset = request.start
      this.appliedSeq = request.seq
      this.appliedSource = request.source
      this.$nextTick(() => {
        if (request.documentId && request.documentId !== this.documentId) return
        const scrollRoot = document.scrollingElement || document.documentElement
        const scrollTop = scrollRoot?.scrollTop || 0
        if (request.value != null && this.readValue() !== request.value) this.renderValue(request.value)
        if (request.focus !== false) {
          try { this.editor.focus({ preventScroll: true }) } catch (_) { this.editor.focus() }
        }
        if (request.animate) { this.navigationPending = true; this.editingUntil = 0; setTimeout(() => { this.navigationPending = false }, 250) }
        this.setSelection(request.start, request.end, !!request.animate)
        this.reportCursor(!!request.animate)
        if (request.reveal) this.revealCaret()
        else if (request.preserveScroll !== false && scrollRoot) {
          scrollRoot.scrollTop = scrollTop
          requestAnimationFrame(() => { scrollRoot.scrollTop = scrollTop; requestAnimationFrame(() => { scrollRoot.scrollTop = scrollTop }) })
        }
      })
    },
    revealCaret() {
      const selection = window.getSelection()
      if (!selection?.rangeCount) return
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      const viewport = window.innerHeight || document.documentElement.clientHeight
      if (rect.top < 100 || rect.bottom > viewport - 125) {
        const delta = rect.top < 100 ? rect.top - 155 : rect.bottom - viewport + 185
        const root = document.scrollingElement || document.documentElement
        window.scrollTo({ top: Math.max(0, (root?.scrollTop || 0) + delta), behavior: 'smooth' })
      }
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
    setSelection(start, end, animate = false) {
      const first = this.pointForOffset(start), last = this.pointForOffset(end)
      const range = document.createRange()
      range.setStart(first.node, first.offset)
      range.setEnd(last.node, last.offset)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      this.lastFocusOffset = start
      this.updateFocus()
      this.scheduleCaret(animate)
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
      this.editingUntil = Date.now() + 160
      this.navigationPending = false
      if (!this.blocks().length) { this.renderValue(''); this.setSelection(0, 0) }
      const value = this.readValue()
      if (!value && this.localValue && Date.now() > (this.editingUntil || 0)) { this.renderValue(this.localValue); this.updateFocus(); return }
      this.localValue = value
      this.awaitingEcho = true
      const cursor = this.getOffsets()?.start ?? value.length
      if (!this.recentInputs) this.recentInputs = []
      this.recentInputs.push(value)
      if (this.recentInputs.length > 20) this.recentInputs.shift()
      this.$ownerInstance.callMethod('onChange', { value, cursor, documentId: this.documentId, userEdit: true })
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
    openMenu(x, y) {
      clearTimeout(this.longPressTimer)
      if (!this.active || Date.now() - (this.lastMenuAt || 0) < 450) return
      this.lastMenuAt = Date.now()
      const selection = this.getOffsets()
      if (!selection || selection.start === selection.end) this.selectWordAt(x, y)
      const offsets = this.getOffsets() || { start: 0, end: 0 }
      this.$ownerInstance.callMethod('onMenuOpen', { x: Number.isFinite(x) ? x : 60, y: Number.isFinite(y) ? y : 90, start: offsets.start, end: offsets.end })
    },
    selectWordAt(x, y) {
      let range = document.caretRangeFromPoint?.(x, y)
      if (!range && document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y)
        if (position) {
          range = document.createRange()
          range.setStart(position.offsetNode, position.offset)
          range.collapse(true)
        }
      }
      if (!range || range.startContainer.nodeType !== 3) return
      const node = range.startContainer, text = node.textContent
      if (!text) return
      let start = Math.min(range.startOffset, text.length - 1), end = start + 1
      if (/\s/.test(text[start]) && start > 0) { start -= 1; end = start + 1 }
      if (/[A-Za-z0-9_]/.test(text[start])) {
        while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start--
        while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end++
      }
      this.setSelection(this.offsetForPoint(node, start), this.offsetForPoint(node, end))
    },
    reportCursor(animate = false) {
      const offsets = this.getOffsets()
      if (!offsets) return
      this.lastFocusOffset = offsets.start
      this.$ownerInstance.callMethod('onCursor', { offset: offsets.start, documentId: this.documentId })
      this.updateFocus()
      this.scheduleCaret(animate)
    },
    updateFocus() {
      if (!this.editor) return
      const offsets = this.getOffsets()
      const offset = offsets?.start ?? this.lastFocusOffset ?? this.pendingRequest?.start ?? 0
      if (offsets) this.lastFocusOffset = offset
      const active = this.readValue().slice(0, Math.max(0, offset)).split('\n').length - 1
      this.blocks().forEach((block, index) => block.classList.toggle('dimmed', this.focusMode && active >= 0 && index !== active))
    },
    scheduleCaret(animate = false) {
      if (this.frame) cancelAnimationFrame(this.frame)
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.positionCaret(animate) })
    },
    hideCaret(keepPoint = false) {
      if (this.glow) this.glow.style.opacity = '0'
      if (this.trail) this.trail.style.opacity = '0'
      this.hideJelly(!keepPoint)
      if (this.editor) this.editor.style.caretColor = ''
      if (!keepPoint) this.previousPoint = null
    },
    ensureJelly() {
      if (this.jellyPath) return true
      if (!this.jellyLayer || !document.createElementNS) return false
      const namespace = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(namespace, 'svg')
      const path = document.createElementNS(namespace, 'path')
      svg.setAttribute('class', 'cursor-jelly-svg')
      svg.setAttribute('aria-hidden', 'true')
      path.setAttribute('fill', this.trailColor || '#819bcb')
      path.style.filter = `drop-shadow(0 0 7px ${this.trailColor || '#819bcb'})`
      svg.appendChild(path)
      this.jellyLayer.appendChild(svg)
      this.jellySvg = svg
      this.jellyPath = path
      return true
    },
    jellyDestinations(target) {
      const { x, y, width, height } = target
      return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]
    },
    drawJelly() {
      if (!this.jellyPath || !this.jellyCorners) return
      const corners = this.jellyCorners
      const points = corners.map(corner => `${corner.x.toFixed(2)} ${corner.y.toFixed(2)}`)
      this.jellyPath.setAttribute('d', `M ${points[0]} L ${points[1]} L ${points[2]} L ${points[3]} Z`)
    },
    hideJelly(reset = true) {
      if (this.jellyFrame) cancelAnimationFrame(this.jellyFrame)
      this.jellyFrame = 0
      if (this.jellySvg) this.jellySvg.style.opacity = '0'
      if (reset) { this.jellyCorners = null; this.jellyTarget = null }
    },
    setJellyTarget(x, y, width, height, animate) {
      if (!this.ensureJelly()) return false
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) animate = false
      const target = { x, y, width, height }
      const destinations = this.jellyDestinations(target)
      const previous = this.jellyTarget
      this.jellyTarget = target
      this.jellySvg.style.opacity = '1'
      const dx = previous ? x - previous.x : 0
      const dy = previous ? y - previous.y : 0
      if (animate && this.jellyCorners && Math.hypot(dx, dy) < 1 && previous.width === width && previous.height === height) return true
      if (!animate || !this.jellyCorners || Math.hypot(dx, dy) < 1) {
        if (this.jellyFrame) cancelAnimationFrame(this.jellyFrame)
        this.jellyFrame = 0
        this.jellyCorners = destinations.map(point => ({ ...point, vx: 0, vy: 0, omega: 36 }))
        this.drawJelly()
        return true
      }
      const distance = Math.hypot(dx, dy)
      const shortJump = Math.abs(dx) <= width * 2.1 && Math.abs(dy) < 2
      const baseSpeed = shortJump ? 46 : 30
      const lag = .35 + (this.trailLength || 0) / 96 * .55
      this.jellyCorners.forEach((corner, index) => {
        const horizontal = index === 0 || index === 3 ? -1 : 1
        const vertical = index < 2 ? -1 : 1
        const alignment = (horizontal * dx + vertical * dy) / (Math.SQRT2 * distance)
        corner.omega = baseSpeed * (1 - lag * (1 - alignment) * .35)
      })
      if (!this.jellyFrame) {
        this.jellyLastTime = performance.now()
        this.jellyFrame = requestAnimationFrame(time => this.stepJelly(time))
      }
      return true
    },
    stepJelly(time) {
      this.jellyFrame = 0
      if (!this.jellyCorners || !this.jellyTarget || !this.jellySvg || this.jellySvg.style.opacity === '0') return
      const dt = Math.min(.032, Math.max(.001, (time - (this.jellyLastTime || time - 16)) / 1000))
      this.jellyLastTime = time
      const destinations = this.jellyDestinations(this.jellyTarget)
      let moving = false
      this.jellyCorners.forEach((corner, index) => {
        const target = destinations[index]
        const omega = corner.omega || 36
        for (const [axis, velocity] of [['x', 'vx'], ['y', 'vy']]) {
          const error = corner[axis] - target[axis]
          const b = corner[velocity] + omega * error
          const decay = Math.exp(-omega * dt)
          corner[axis] = target[axis] + (error + b * dt) * decay
          corner[velocity] = (corner[velocity] - omega * b * dt) * decay
          if (Math.abs(corner[axis] - target[axis]) > .25 || Math.abs(corner[velocity]) > 2) moving = true
        }
      })
      if (!moving) this.jellyCorners.forEach((corner, index) => Object.assign(corner, destinations[index], { vx: 0, vy: 0 }))
      this.drawJelly()
      if (moving) this.jellyFrame = requestAnimationFrame(next => this.stepJelly(next))
    },
    positionCaret(animate = false) {
      if (!this.editor || !this.glow || !this.active || this.animatedCursor === false || this.composing) { this.hideCaret(); return }
      if (document.activeElement !== this.editor) { this.hideCaret(true); return }
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
      const host = this.host.getBoundingClientRect()
      const size = parseFloat(window.getComputedStyle(this.editor).fontSize) || 18
      const x = point.left - host.left + (empty ? size * 2 : 0)
      const y = point.top - host.top + 2
      const height = Math.max(17, point.height || size * 1.42)
      let cursorWidth = 5
      if (this.cursorStyle === 'neovim') {
        cursorWidth = size * .95
        if (range.startContainer.nodeType === 3 && range.startOffset < range.startContainer.length) {
          const glyph = range.cloneRange()
          glyph.setEnd(range.startContainer, range.startOffset + 1)
          const glyphWidth = glyph.getBoundingClientRect().width
          if (glyphWidth > 0) cursorWidth = glyphWidth
        }
        cursorWidth = Math.max(size * .5, Math.min(size * 1.2, cursorWidth))
      }
      const previous = this.previousPoint
      const moving = animate && !!previous
      const jelly = this.cursorStyle === 'neovim' && this.setJellyTarget(x, y, cursorWidth, height, moving)
      if (jelly) this.glow.style.opacity = '0'
      else {
        this.hideJelly()
        this.glow.style.transition = moving ? '' : 'none'
        this.glow.style.width = cursorWidth + 'px'
        this.glow.style.height = height + 'px'
        this.glow.style.transform = `translate3d(${x}px, ${y}px, 0)`
        this.glow.style.opacity = this.cursorStyle === 'neovim' ? '.5' : '1'
        if (!moving) { clearTimeout(this.caretTransitionTimer); this.caretTransitionTimer = setTimeout(() => { if (this.glow) this.glow.style.transition = '' }, 24) }
      }
      this.previousPoint = { x, y }
      if (!moving && this.trail) this.trail.style.opacity = '0'
      if (this.trail && moving && previous && this.trailLength > 0) {
        const dx = x - previous.x, dy = y - previous.y, distance = Math.hypot(dx, dy)
        if (distance > 2) {
          const length = this.trailLength
          const angle = Math.atan2(dy, dx)
          this.trail.style.width = length + 'px'
          this.trail.style.height = cursorWidth + 'px'
          this.trail.style.left = (x - length) + 'px'
          this.trail.style.top = (y + height / 2 - cursorWidth / 2) + 'px'
          this.trail.style.transform = `rotate(${angle}rad)`
          this.trail.style.background = this.trailColor || '#819bcb'
          this.trail.style.opacity = '.8'
          clearTimeout(this.trailTimer)
          this.trailTimer = setTimeout(() => { if (this.trail) this.trail.style.opacity = '0' }, 220)
        }
      }
      this.editor.style.caretColor = 'transparent'
    }
  }
}
</script>

<style scoped>
.document-input-host { position: relative; width: 100%; min-height: 38vh; }
.document-input, .document-fallback { display: block; width: 100%; min-height: 38vh; padding: 0 2px; border: 0; background: transparent; color: var(--writer-text); -webkit-text-fill-color: var(--writer-text); line-height: 1.85; letter-spacing: .025em; overflow-wrap: anywhere; white-space: pre-wrap; caret-color: var(--cursor-color); outline: none; }
.document-input { -webkit-touch-callout: none; user-select: text; -webkit-user-select: text; }
.document-fallback { resize: none; -webkit-touch-callout:none; }
.document-fallback::placeholder { color: var(--muted); -webkit-text-fill-color: var(--muted); }
.document-input :deep(.paragraph) { min-height: 1.85em; text-indent: 2em; transition: opacity .22s ease; }
.document-input :deep(.paragraph.dimmed) { opacity: .23; }
.cursor-glow { position: absolute; z-index: 3; top: 0; left: 0; width: 5px; height: 27px; border-radius: 2px; background: var(--cursor-color); box-shadow: 0 0 10px var(--cursor-color); opacity: 0; pointer-events: none; transition: transform .2s cubic-bezier(.22,.7,.25,1), width .18s ease, height .18s ease, opacity .12s ease; }
.cursor-glow.neovim { border-radius:3px; box-shadow:0 0 11px var(--cursor-color), inset 0 0 0 1px rgba(255,255,255,.35); }
.cursor-trail { position:absolute; z-index:2; width:0; height:5px; border-radius:5px; opacity:0; pointer-events:none; transform-origin: right center; transition:opacity .22s ease; box-shadow:0 0 8px var(--cursor-color); }
.cursor-jelly-layer { position:absolute; inset:0; z-index:3; overflow:visible; pointer-events:none; }
.cursor-jelly-layer :deep(svg) { display:block; width:100%; height:100%; overflow:visible; opacity:0; pointer-events:none; }
.cursor-jelly-layer :deep(path) { fill-opacity:.58; }
.selection-menu-shade { position:fixed; z-index:35; inset:0; background:transparent; }
.selection-menu { position:fixed; z-index:36; width:min(292px, calc(100vw - 24px)); height:48px; padding:4px; display:flex; align-items:center; border:1px solid var(--line); border-radius:15px; background:var(--surface); color:var(--text); box-shadow:0 16px 42px var(--shadow); animation:selection-menu-in .18s cubic-bezier(.2,.78,.25,1) both; }
.selection-menu.closing { animation:selection-menu-out .15s ease both; }
.selection-action { flex:1; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:650; color:var(--text); transition:background .15s ease, transform .15s ease; }.selection-action:active { background:var(--accent-soft); color:var(--accent); transform:scale(.94); }
@keyframes selection-menu-in { from { opacity:0; transform:translateY(8px) scale(.96); } }
@keyframes selection-menu-out { to { opacity:0; transform:translateY(5px) scale(.97); } }
@media (prefers-reduced-motion: reduce) { .cursor-glow, .cursor-trail, .document-input :deep(.paragraph), .selection-action { transition: none; }.selection-menu,.selection-menu.closing { animation:none; } }
</style>
