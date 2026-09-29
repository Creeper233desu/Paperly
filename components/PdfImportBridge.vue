<template><view class="pdf-import-bridge" :prop="packet" :change:prop="pdfRender.receive"></view></template>
<script>
import { readPdfBase64 } from '../src/services/android-pdf-picker.js'
export default {
  emits: ['progress'],
  data() { return { packet: '', serial: 0 } },
  beforeUnmount() { this.cancel() },
  methods: {
    async parse(file) {
      if (this.pending) throw new Error('正在导入另一份 PDF')
      const id = ++this.serial
      return new Promise((resolve, reject) => {
        this.pending = { id, resolve, reject, offset: 0, encoded: '' }
        this.keepAlive()
        readPdfBase64(file.path).then(encoded => {
          if (this.pending?.id !== id) return
          this.pending.encoded = encoded
          this.packet = JSON.stringify({ id, step: 'start' })
        }, error => this.finish({ id, error: error.message }))
      })
    },
    keepAlive() { clearTimeout(this.timeout); this.timeout = setTimeout(() => this.cancel('PDF 解析超时，请重试或选择较小的文件'), 120000) },
    nextChunk({ id }) {
      const job = this.pending
      if (!job || job.id !== id) return
      this.keepAlive()
      const offset = job.offset
      const chunk = job.encoded.slice(offset, offset + 131072)
      job.offset += chunk.length
      this.packet = JSON.stringify({ id, step: chunk ? 'chunk' : 'parse', offset, chunk })
      if (!chunk) job.encoded = ''
    },
    progress(data) { if (data.id === this.pending?.id) { this.keepAlive(); this.$emit('progress', data) } },
    finish(data) {
      const job = this.pending
      if (!job || job.id !== data.id) return
      this.pending = null; clearTimeout(this.timeout)
      if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result)
    },
    cancel(message = '已取消导入') {
      if (!this.pending) return
      const id = this.pending.id
      this.packet = JSON.stringify({ id, step: 'cancel' })
      this.finish({ id, error: message })
    }
  }
}
</script>
<script module="pdfRender" lang="renderjs">
import { extractPdfDocument } from '../src/services/pdf-import.js'
let enginePromise
function script(name) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = `./static/pdfjs/${name}`
    el.onload = resolve
    el.onerror = () => { el.remove(); reject(new Error('PDF 组件加载失败，请确认云打包包含 static/pdfjs 资源')) }
    document.head.appendChild(el)
  })
}
async function engine() {
  if (!enginePromise) enginePromise = (async () => {
    if (!window.pdfjsLib) await script('pdf.js')
    if (!window.pdfjsWorker) await script('pdf.worker.js')
    if (!window.paperPdfCMaps) await script('cmaps.js')
    return window.pdfjsLib
  })().catch(error => { enginePromise = null; throw error })
  return enginePromise
}
class OfflineCMaps {
  async fetch({ name }) {
    const encoded = window.paperPdfCMaps[name]
    if (!encoded) throw new Error(`无法识别 PDF 字符映射：${name}`)
    const binary = atob(encoded)
    return { cMapData: Uint8Array.from(binary, char => char.charCodeAt(0)), isCompressed: true }
  }
}
export default {
  methods: {
    async receive(raw) {
      if (!raw) return
      const packet = JSON.parse(raw)
      if (packet.step === 'cancel') { this.activeId = null; this.chunks = []; return }
      if (packet.step === 'start') { this.activeId = packet.id; this.chunks = []; this.$ownerInstance.callMethod('nextChunk', { id: packet.id }); return }
      if (packet.id !== this.activeId) return
      if (packet.step === 'chunk') { this.chunks.push(packet.chunk); this.$ownerInstance.callMethod('nextChunk', { id: packet.id }); return }
      if (packet.step !== 'parse') return
      try {
        const pdfjs = await engine()
        if (packet.id !== this.activeId) return
        const encoded = this.chunks.join(''); this.chunks = []
        const binary = atob(encoded)
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
        const result = await extractPdfDocument(pdfjs, bytes, { cMapReaderFactory: OfflineCMaps,
          onPage: () => { if (packet.id !== this.activeId) throw new Error('已取消导入') },
          onProgress: progress => this.$ownerInstance.callMethod('progress', { id: packet.id, ...progress }) })
        if (packet.id === this.activeId) this.$ownerInstance.callMethod('finish', { id: packet.id, result })
      } catch (error) {
        if (packet.id === this.activeId) this.$ownerInstance.callMethod('finish', { id: packet.id, error: error.message || 'PDF 解析失败' })
      }
    }
  }
}
</script>
<style scoped>.pdf-import-bridge { position:absolute; width:1px; height:1px; overflow:hidden; pointer-events:none; opacity:0; }</style>
