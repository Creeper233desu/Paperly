import { createBookSpring } from './book-spring.js'

const sharedSelectors = { cover:'.large-cover', title:'.sidebar-title', author:'.sidebar-author' }
const sourceSelectors = { cover:'.book-art', title:'.book-title', author:'.book-author' }
const controlSelectors = '.topbar,.sidebar-export,.new-chapter,.search-box,.resume-card,.chapter-heading,.article-row,.add-article,.primary-button'
const mix = (a, b, p) => a + (b - a) * p
const clamp = value => Math.max(0, Math.min(1, value))
const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x) }
const rectOf = node => {
  const value = node?.getBoundingClientRect()
  return value && ['left', 'top', 'width', 'height'].every(key => Number.isFinite(value[key])) && value.width > 0 && value.height > 0 ? value : null
}

// All geometry and frames live beside the rendered DOM. Vue receives only
// handoff / phase / completion events, never a reactive update for every frame.
export function createBookMorph(options) {
  const { host } = options
  const document = host.ownerDocument
  const view = document.defaultView
  const requestFrame = options.requestFrame || (callback => view.requestAnimationFrame(callback))
  const cancelFrame = options.cancelFrame || (id => view.cancelAnimationFrame(id))
  const now = options.now || (() => view.performance.now())
  const readStyle = options.readStyle || (node => view.getComputedStyle(node))
  const reducedMotion = options.reducedMotion ?? !!view.matchMedia?.('(prefers-reduced-motion:reduce)').matches
  const surface = host.querySelector('.book-surface'), background = host.querySelector('.book-background')
  const viewport = host.querySelector('.book-viewport'), scroll = host.querySelector('.book-scroll')
  const ghosts = Object.fromEntries(Object.keys(sharedSelectors).map(key => [key, host.querySelector(`.shared-${key}`)]))
  const letter = host.querySelector('.shared-cover-letter'), spine = host.querySelector('.shared-spine')
  const targets = Object.fromEntries(Object.entries(sharedSelectors).map(([key, selector]) => [key, host.querySelector(selector)]))
  let rest = [...host.querySelectorAll('.book-rest')]
  let controls = [...host.querySelectorAll(controlSelectors)]
  let sourceId = options.sourceId, geometry = null, source = null
  let seq = -1, mode = '', phase = 'preparing', active = true, disposed = false, dismissing = false
  let fadeFrame = null, fadeStart = 0, fadeElapsed = 0, fadeStamp = 0, rootOpacity = 1, interactive = null

  function setPhase(value) {
    if (phase === value) return
    phase = value
    options.onPhase?.(value)
  }
  function interaction(enabled, settled = false) {
    const state = enabled ? settled ? 'settled' : 'moving' : 'none'
    if (interactive === state) return
    interactive = state
    // The transparent portion of the clipped layer never traps shelf taps.
    // Visible controls can be used before the spring finishes.
    if (viewport) viewport.style.pointerEvents = settled && enabled ? 'auto' : 'none'
    if (scroll) scroll.style.pointerEvents = settled && enabled ? 'auto' : 'none'
    for (const node of controls) node.style.pointerEvents = enabled ? 'auto' : 'none'
  }
  function showTargets(visible) { for (const node of Object.values(targets)) if (node) node.style.visibility = visible ? '' : 'hidden' }
  function promote(moving) {
    for (const node of [surface, viewport, scroll, ...Object.values(ghosts)]) if (node) node.style.willChange = moving ? 'transform,opacity' : ''
  }
  function measureSnapshot() {
    rest = [...host.querySelectorAll('.book-rest')]
    controls = [...host.querySelectorAll(controlSelectors)]
    interactive = null
    source = document.getElementById(sourceId)
    const frame = rectOf(host), card = rectOf(source)
    if (!frame || !card || !surface || !viewport || !scroll || !background) return null
    const shared = {}
    for (const key of Object.keys(sharedSelectors)) {
      const fromNode = source.querySelector(sourceSelectors[key]), targetNode = targets[key], ghost = ghosts[key]
      const from = rectOf(fromNode), to = rectOf(targetNode)
      if (!from || !to || !ghost) return null
      const fromStyle = readStyle(fromNode), toStyle = readStyle(targetNode)
      shared[key] = { from, to, scale:(parseFloat(fromStyle.fontSize) || 13) / (parseFloat(toStyle.fontSize) || 13) }
      // Fixed final layout: no width, height or font writes occur in RAF.
      ghost.style.width = `${to.width}px`; ghost.style.height = `${to.height}px`
      ghost.style.fontSize = toStyle.fontSize; ghost.style.fontWeight = toStyle.fontWeight
      ghost.style.lineHeight = toStyle.lineHeight; ghost.style.color = toStyle.color
    }
    const targetLetter = host.querySelector('.large-letter'), sourceLetter = source.querySelector('.cover-letter')
    if (letter && targetLetter && sourceLetter) {
      const font = readStyle(targetLetter).fontSize
      letter.style.fontSize = font
      shared.cover.letterScale = (parseFloat(readStyle(sourceLetter).fontSize) || 64) / (parseFloat(font) || 86)
    }
    const targetSpine = rectOf(host.querySelector('.large-spine')), sourceSpine = rectOf(source.querySelector('.book-spine'))
    if (spine && targetSpine && sourceSpine) {
      spine.style.width = `${targetSpine.width}px`
      shared.cover.spineScale = sourceSpine.width / targetSpine.width
    }
    return { frame, card, shared }
  }
  function snapshot() {
    try { return measureSnapshot() } catch (_) { return null }
  }
  function draw(progress) {
    if (disposed || !geometry) return
    const p = clamp(progress), { frame, card, shared } = geometry
    const sx = mix(card.width / frame.width, 1, p), sy = mix(card.height / frame.height, 1, p)
    const x = (card.left - frame.left) * (1 - p), y = (card.top - frame.top) * (1 - p)
    const transform = `translate3d(${x}px,${y}px,0) scale(${sx},${sy})`
    surface.style.transform = transform; viewport.style.transform = transform
    // Counter-transform the fixed-size content. Only the visible rectangle
    // expands; typography and hit targets retain their natural layout.
    scroll.style.transform = `translate3d(${-x / sx}px,${-y / sy}px,0) scale(${1 / sx},${1 / sy})`
    background.style.opacity = smooth(p)
    const content = smooth((p - .08) / .44)
    for (const node of rest) { node.style.opacity = content; node.style.transform = `translate3d(0,${(1 - content) * 12}px,0)` }
    if (!dismissing) interaction(content > .025)
    for (const key of Object.keys(shared)) {
      const { from, to, scale } = shared[key]
      const left = mix(from.left, to.left, p) - frame.left, top = mix(from.top, to.top, p) - frame.top
      const xScale = key === 'cover' ? mix(from.width / to.width, 1, p) : mix(scale, 1, p)
      const yScale = key === 'cover' ? mix(from.height / to.height, 1, p) : xScale
      ghosts[key].style.transform = `translate3d(${left}px,${top}px,0) scale(${xScale},${yScale})`
      ghosts[key].style.opacity = 1
      if (key === 'cover') {
        if (letter && shared.cover.letterScale) {
          const scale = mix(shared.cover.letterScale, 1, p)
          letter.style.transform = `scale(${scale / xScale},${scale / yScale})`
        }
        if (spine && shared.cover.spineScale) spine.style.transform = `scaleX(${mix(shared.cover.spineScale, 1, p) / xScale})`
      }
    }
  }
  function completeClose() {
    interaction(false)
    if (source) source.style.opacity = ''
    promote(false); setPhase('closed'); options.onClosed?.()
  }
  function finish(target) {
    if (disposed || dismissing) return
    if (target === 0) { completeClose(); return }
    for (const node of [surface, viewport, scroll]) if (node) node.style.transform = 'none'
    for (const node of [surface, viewport]) if (node) node.style.borderRadius = '0px'
    for (const ghost of Object.values(ghosts)) if (ghost) ghost.style.opacity = 0
    for (const node of rest) { node.style.opacity = 1; node.style.transform = 'none' }
    showTargets(true); interaction(true, true); promote(false); setPhase('ready')
  }
  const spring = createBookSpring({ requestFrame, cancelFrame, now, onUpdate:draw, onRest:finish })

  function fallback() {
    host.style.opacity = 1
    for (const node of [surface, viewport, scroll]) if (node) node.style.transform = 'none'
    if (background) background.style.opacity = 1
    for (const node of rest) { node.style.opacity = 1; node.style.transform = 'none' }
    for (const ghost of Object.values(ghosts)) if (ghost) ghost.style.opacity = 0
    showTargets(true); interaction(true, true); spring.snap(1)
  }
  function cancelFade() {
    if (fadeFrame !== null) cancelFrame(fadeFrame)
    fadeFrame = null; fadeStamp++
  }
  function scheduleFade() {
    if (disposed || !active || !dismissing || fadeFrame !== null) return
    const stamp = fadeStamp, start = now()
    fadeFrame = requestFrame(time => {
      if (disposed || !active || !dismissing || stamp !== fadeStamp) return
      fadeFrame = null
      fadeElapsed += Math.max(0, Math.min(64, time - start))
      rootOpacity = fadeStart * (1 - smooth(fadeElapsed / 150))
      host.style.opacity = rootOpacity
      if (fadeElapsed >= 150) { dismissing = false; completeClose() }
      else scheduleFade()
    })
  }
  const api = {
    command(packet) {
      if (disposed || !packet || packet.seq < seq) return
      if (packet.sourceId) sourceId = packet.sourceId
      const nextActive = packet.pageActive !== false
      if (active !== nextActive) {
        active = nextActive
        if (!active) { spring.pause(); cancelFade() }
        else if (dismissing) scheduleFade()
        else spring.resume()
      }
      // Epoch replays and lifecycle packets change activity, not trajectory.
      if (packet.seq <= seq) return
      seq = packet.seq; mode = packet.mode
      if (mode === 'dismiss') {
        if (dismissing) return
        if (phase === 'preparing') { completeClose(); return }
        dismissing = true; spring.pause(); interaction(false); setPhase('closing')
        host.classList.add('book-navigation-dismiss')
        if (source) source.style.opacity = '1'
        fadeStart = rootOpacity; fadeElapsed = 0
        if (reducedMotion) { dismissing = false; completeClose() }
        else scheduleFade()
        return
      }
      cancelFade(); dismissing = false; rootOpacity = 1
      host.classList.remove('book-navigation-dismiss')
      const state = spring.getState()
      if (mode === 'close' && !geometry && (phase === 'preparing' || phase === 'ready')) {
        completeClose(); return
      }
      if (!geometry || phase === 'ready') geometry = snapshot()
      if (!geometry) {
        if (mode === 'close') completeClose()
        else { fallback(); options.onHandoff?.() }
        return
      }
      host.style.opacity = 1
      for (const node of [surface, viewport]) node.style.borderRadius = '22px'
      showTargets(false); promote(true)
      draw(state.progress)
      if (source) source.style.opacity = '0'
      options.onHandoff?.()
      setPhase(mode === 'open' ? 'opening' : 'closing')
      if (active) spring.resume()
      // Preserve progress AND velocity when a tap reverses the animation.
      spring.setTarget(mode === 'open' ? 1 : 0)
      if (reducedMotion) spring.snap(mode === 'open' ? 1 : 0)
      else if (!spring.getState().running) finish(mode === 'open' ? 1 : 0)
    },
    refresh() {
      if (disposed || dismissing || phase === 'closed' || phase === 'preparing') return
      // Resize is infrequent. Remove only our transforms before measuring so
      // rectangles aren't accidentally measured inside a scaled viewport.
      for (const node of [surface, viewport, scroll]) if (node) node.style.transform = 'none'
      for (const node of rest) node.style.transform = 'none'
      geometry = snapshot()
      if (phase === 'ready') finish(1)
      else if (geometry) draw(spring.getState().progress)
      else if (mode === 'close') spring.snap(0)
      else fallback()
    },
    getState() { return { ...spring.getState(), phase, mode, dismissing, disposed } },
    dispose() {
      if (disposed) return
      disposed = true; spring.dispose(); cancelFade()
      if (source) source.style.opacity = ''
      showTargets(true); promote(false)
    }
  }
  return api
}
