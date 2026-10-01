import { createBookSpring } from './book-spring.js'

const sharedSelectors = { cover:'.large-cover', title:'.sidebar-title', author:'.sidebar-author' }
const sourceSelectors = { cover:'.book-art', title:'.book-title', author:'.book-author' }
const shelfSelectors = { description:'.book-description', meta:'.book-meta' }
const controlSelectors = '.topbar,.sidebar-export,.new-chapter,.search-box,.resume-card,.chapter-heading,.article-row,.add-article,.primary-button'
const mix = (a, b, p) => a + (b - a) * p
const clamp = value => Math.max(0, Math.min(1, value))
const smooth = value => { const x = clamp(value); return x * x * (3 - 2 * x) }
const identityTransform = 'translate3d(0px,0px,0) scale(1,1)'
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
  const now = options.now || (() => typeof view.performance?.now === 'function' ? view.performance.now() : Date.now())
  const readStyle = options.readStyle || (node => view.getComputedStyle(node))
  const reducedMotion = options.reducedMotion ?? !!view.matchMedia?.('(prefers-reduced-motion:reduce)').matches
  const surface = host.querySelector('.book-surface'), background = host.querySelector('.book-background')
  const viewport = host.querySelector('.book-viewport'), scroll = host.querySelector('.book-scroll')
  const ghosts = Object.fromEntries(Object.keys(sharedSelectors).map(key => [key, host.querySelector(`.shared-${key}`)]))
  const targets = Object.fromEntries(Object.entries(sharedSelectors).map(([key, selector]) => [key, host.querySelector(selector)]))
  const shelfGhosts = Object.fromEntries(Object.entries(shelfSelectors).map(([key, selector]) => [key, host.querySelector(`.shared-shelf-details ${selector}`)]))
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
    for (const node of [surface, viewport, scroll, ...Object.values(ghosts), ...Object.values(shelfGhosts)]) if (node) node.style.willChange = moving ? 'transform,opacity' : ''
  }
  function measureSnapshot() {
    rest = [...host.querySelectorAll('.book-rest')]
    controls = [...host.querySelectorAll(controlSelectors)]
    interactive = null
    source = document.getElementById(sourceId)
    const frame = rectOf(host), card = rectOf(source)
    if (!frame || !card || !surface || !viewport || !scroll || !background) return null
    const cardStyle = readStyle(source)
    const corners = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(key => {
      const values = String(cardStyle[key] || cardStyle.borderRadius || '22px').trim().split(/\s+/)
      const radius = (value, length) => value.endsWith('%') ? parseFloat(value) * length / 100 : parseFloat(value)
      return [radius(values[0], card.width) || 0, radius(values[1] || values[0], card.height) || 0]
    })
    const shared = {}
    for (const key of Object.keys(sharedSelectors)) {
      const fromNode = source.querySelector(sourceSelectors[key]), targetNode = targets[key], ghost = ghosts[key]
      const from = rectOf(fromNode), to = rectOf(targetNode)
      if (!from || !to || !ghost) return null
      const fromStyle = readStyle(fromNode), toStyle = readStyle(targetNode)
      shared[key] = { from, to, scale:(parseFloat(fromStyle.fontSize) || 13) / (parseFloat(toStyle.fontSize) || 13) }
      // Fixed final layout: no width, height or font writes occur in RAF.
      ghost.style.width = `${to.width}px`; ghost.style.height = `${to.height}px`
      if (key === 'cover') ghost.style.setProperty('--cover-width', `${to.width}px`)
      ghost.style.fontSize = toStyle.fontSize; ghost.style.fontWeight = toStyle.fontWeight
      ghost.style.lineHeight = toStyle.lineHeight; ghost.style.color = toStyle.color
    }
    const shelf = {}
    for (const [key, selector] of Object.entries(shelfSelectors)) {
      const node = source.querySelector(selector), ghost = shelfGhosts[key], from = rectOf(node)
      if (!from || !ghost) continue
      const style = readStyle(node)
      shelf[key] = from
      ghost.style.width = `${from.width}px`; ghost.style.height = `${from.height}px`
      for (const property of ['fontSize', 'fontWeight', 'lineHeight', 'color']) ghost.style[property] = style[property]
    }
    return { frame, card, shared, corners, shelf }
  }
  function snapshot() {
    try { return measureSnapshot() } catch (_) { return null }
  }
  function roundCard(sx = 1, sy = 1) {
    // FLIP scales the card differently on each axis. Counter-scale its corner
    // radii so the visible corners remain the source card's circular shape,
    // including the fully opened and reversed states.
    const corners = geometry?.corners || Array.from({ length:4 }, () => [22, 22])
    const radius = `${corners.map(([x]) => `${x / sx}px`).join(' ')} / ${corners.map(([, y]) => `${y / sy}px`).join(' ')}`
    for (const node of [surface, viewport]) if (node) node.style.borderRadius = radius
  }
  function draw(progress) {
    if (disposed || !geometry) return
    const p = clamp(progress), { frame, card, shared, shelf } = geometry
    const sx = mix(card.width / frame.width, 1, p), sy = mix(card.height / frame.height, 1, p)
    const x = (card.left - frame.left) * (1 - p), y = (card.top - frame.top) * (1 - p)
    const transform = `translate3d(${x}px,${y}px,0) scale(${sx},${sy})`
    surface.style.transform = transform; viewport.style.transform = transform
    roundCard(sx, sy)
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
      // All three covers use one aspect ratio and crop; a uniform transform
      // preserves the same image, letter, spine, shadow and rounded corners.
      ghosts[key].style.transform = `translate3d(${left}px,${top}px,0) scale(${xScale},${xScale})`
      ghosts[key].style.opacity = 1
    }
    // The missing shelf text slides into the shrinking card before the
    // source takes over. Using spring progress keeps reversals continuous.
    for (const [key, from] of Object.entries(shelf)) {
      const reveal = smooth(((key === 'description' ? .44 : .37) - p) / (key === 'description' ? .44 : .37))
      const left = x + from.left - card.left
      const top = y + from.top - card.top + (1 - reveal) * (key === 'description' ? 32 : 42)
      shelfGhosts[key].style.transform = `translate3d(${left}px,${top}px,0)`
      shelfGhosts[key].style.opacity = reveal
    }
  }
  function completeClose() {
    interaction(false)
    // Source visibility is owned here, not by a delayed Vue class update.
    // Restore it in the same view-thread frame that hides the motion layer.
    if (source) source.style.opacity = ''
    host.style.visibility = 'hidden'
    promote(false); setPhase('closed'); options.onClosed?.()
  }
  function finish(target) {
    if (disposed || dismissing) return
    if (target === 0) { completeClose(); return }
    // Keep the last identity 3D transforms and visible composition layers.
    // Dropping all three at rest can force the Android scroll viewport to be
    // recomposited in the same frame as the shared-element handoff.
    roundCard()
    showTargets(true)
    for (const ghost of [...Object.values(ghosts), ...Object.values(shelfGhosts)]) if (ghost) ghost.style.opacity = 0
    interaction(true, true); setPhase('ready')
  }
  const spring = createBookSpring({ requestFrame, cancelFrame, now, onUpdate:draw, onRest:finish })

  function fallback() {
    host.style.opacity = 1
    host.style.visibility = 'visible'
    roundCard()
    for (const node of [surface, viewport, scroll]) if (node) node.style.transform = identityTransform
    if (background) background.style.opacity = 1
    for (const node of rest) { node.style.opacity = 1; node.style.transform = 'translate3d(0,0px,0)' }
    for (const ghost of [...Object.values(ghosts), ...Object.values(shelfGhosts)]) if (ghost) ghost.style.opacity = 0
    promote(true); showTargets(true); interaction(true); spring.snap(1)
  }
  function cancelFade() {
    if (fadeFrame !== null) cancelFrame(fadeFrame)
    fadeFrame = null; fadeStamp++
  }
  function scheduleFade() {
    if (disposed || !active || !dismissing || fadeFrame !== null) return
    const stamp = fadeStamp, start = now()
    fadeFrame = requestFrame(() => {
      if (disposed || !active || !dismissing || stamp !== fadeStamp) return
      fadeFrame = null
      // Keep fade timing on the spring's clock as well; a RAF timestamp may
      // be absent, repeated or relative to another runtime's time origin.
      fadeElapsed += Math.max(0, Math.min(64, now() - start))
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
      host.style.visibility = 'visible'
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
      // Normalize the motion transforms before measuring without dropping
      // the compositor layers or measuring inside a scaled viewport.
      for (const node of [surface, viewport, scroll]) if (node) node.style.transform = identityTransform
      for (const node of rest) node.style.transform = 'translate3d(0,0px,0)'
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
