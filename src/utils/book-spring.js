// Keep this driver independent of Vue and DOM so renderjs can move the shared
// book elements entirely in the view layer, without a bridge call per frame.
const MAX_FRAME_MS = 64
const POSITION_EPSILON = 0.0015
const VELOCITY_EPSILON = 0.025

function unit(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new TypeError('Book spring progress must be finite')
  return Math.max(0, Math.min(1, number))
}

export function createBookSpring(options = {}) {
  const now = options.now || (() => typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now())
  const requestFrame = options.requestFrame || (callback => requestAnimationFrame(callback))
  const cancelFrame = options.cancelFrame || (id => cancelAnimationFrame(id))
  const onUpdate = options.onUpdate || (() => {})
  const onRest = options.onRest || (() => {})
  const frequency = Math.max(1, Number(options.frequency) || 18)
  let progress = unit(options.initial ?? 0)
  let target = progress
  let velocity = 0
  let frameId = null
  let lastTime = null
  let revision = 0
  let running = false
  let paused = false
  let disposed = false

  function cancelPending() {
    revision++
    if (frameId !== null) cancelFrame(frameId)
    frameId = null
    lastTime = null
  }

  function schedule() {
    if (disposed || paused || !running || frameId !== null) return
    if (lastTime === null) lastTime = now()
    const current = revision
    frameId = requestFrame(() => {
      if (disposed || paused || current !== revision) return
      frameId = null
      // Some Android frame adapters pass a repeated zero timestamp. Sample
      // the same clock used to start/resume instead of mixing RAF time bases.
      const time = now()
      // Long frames retain motion instead of jumping straight to its endpoint.
      // Pausing clears lastTime, so returning from the background consumes none
      // of the time spent away.
      const dt = Math.max(0, Math.min(MAX_FRAME_MS, time - lastTime)) / 1000
      lastTime = time

      // Exact solution for a critically damped spring. Unlike Euler stepping,
      // this remains stable and frame-rate independent for irregular frames.
      const displacement = progress - target
      const slope = velocity + frequency * displacement
      const decay = Math.exp(-frequency * dt)
      progress = target + (displacement + slope * dt) * decay
      velocity = (velocity - frequency * slope * dt) * decay

      if (Math.abs(progress - target) <= POSITION_EPSILON && Math.abs(velocity) <= VELOCITY_EPSILON) {
        const reached = target
        progress = reached
        velocity = 0
        running = false
        lastTime = null
        onUpdate(progress, velocity)
        // An update handler can retarget or dispose; do not emit stale rest.
        if (!disposed && !running && target === reached) onRest(reached)
      } else {
        onUpdate(progress, velocity)
      }
      schedule()
    })
  }

  const api = {
    snap(value) {
      if (disposed) return api
      const reached = unit(value)
      cancelPending()
      progress = target = reached
      velocity = 0
      running = false
      onUpdate(progress, velocity)
      if (!disposed && !running && target === reached) onRest(reached)
      return api
    },
    setTarget(value) {
      if (disposed) return api
      target = unit(value)
      // Preserve both coordinates when reversing an in-flight motion.
      running = Math.abs(progress - target) > POSITION_EPSILON || Math.abs(velocity) > VELOCITY_EPSILON
      if (running) schedule()
      else cancelPending()
      return api
    },
    pause() {
      if (disposed || paused) return api
      paused = true
      cancelPending()
      return api
    },
    resume() {
      if (disposed || !paused) return api
      paused = false
      schedule()
      return api
    },
    dispose() {
      if (disposed) return
      disposed = true
      running = false
      cancelPending()
    },
    getState() {
      return { progress, velocity, target, running, paused, disposed }
    }
  }
  api.setTarget(options.target ?? progress)
  return api
}
