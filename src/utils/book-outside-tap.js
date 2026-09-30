const independentControls = '.nav-shell,.sheet-mask,.dialog-backdrop,.menu-backdrop'
const TAP_DISTANCE_SQUARED = 8 * 8

function pointOf(touch) {
  if (!Number.isFinite(touch?.clientX) || !Number.isFinite(touch?.clientY)) return null
  return { x:touch.clientX, y:touch.clientY }
}

// Listen beside the App DOM: a transparent full-screen backdrop would swallow
// the still-visible navigation. Hit testing follows the actual moving card,
// including its rounded clip, and runs only on taps, never on animation frames.
export function bindBookOutsideTap({ host, isOpening, onTap, now = () => Date.now() }) {
  const document = host.ownerDocument
  let gesture = null, lastTouch = null, disposed = false

  function outside(point, event, pressedOutside) {
    if (disposed || !point || !isOpening()) return
    const hit = document.elementFromPoint(point.x, point.y)
    if (!hit || hit.closest?.(independentControls) || pressedOutside === false || (pressedOutside !== true && host.contains(hit))) return
    // The outside tap means close the book, not activate the shelf control
    // underneath. Capture also handles targets with their own stopped tap.
    event.preventDefault()
    event.stopImmediatePropagation()
    onTap()
  }
  function start(event) {
    const touch = event.touches?.length === 1 ? event.touches[0] : null
    const point = pointOf(touch)
    lastTouch = null
    gesture = null
    if (isOpening() && point) {
      const hit = document.elementFromPoint(point.x, point.y)
      // Preserve the press intent if the expanding card reaches the finger
      // before release. A touch that began inside must remain an inside tap.
      gesture = { ...point, id:touch.identifier, at:now(), outside:!!(hit && !host.contains(hit) && !hit.closest?.(independentControls)) }
    }
  }
  function move(event) {
    if (!gesture) return
    const touch = event.touches?.length === 1 ? event.touches[0] : null
    const point = pointOf(touch)
    if (!point || touch.identifier !== gesture.id || (point.x - gesture.x) ** 2 + (point.y - gesture.y) ** 2 > TAP_DISTANCE_SQUARED) gesture = null
  }
  function end(event) {
    // App maps @tap to the WebView's click. Touch events only qualify that
    // click, so scrolling, long-press and a late opening gesture cannot close.
    const started = gesture
    gesture = null
    const touch = event.changedTouches?.length === 1 && !event.touches?.length ? event.changedTouches[0] : null
    const point = pointOf(touch)
    lastTouch = { at:now(), used:false, outside:started?.outside, valid:!!(started && point && touch.identifier === started.id && now() - started.at < 350 && (point.x - started.x) ** 2 + (point.y - started.y) ** 2 <= TAP_DISTANCE_SQUARED) }
  }
  function cancel() { gesture = null; lastTouch = { at:now(), valid:false } }
  function click(event) {
    if (event.detail === 0 || event.button !== 0) return
    let pressedOutside
    if (lastTouch && now() - lastTouch.at < 700 && event.sourceCapabilities?.firesTouchEvents !== false) {
      if (!lastTouch.valid || lastTouch.used) return
      lastTouch.used = true
      pressedOutside = lastTouch.outside
    }
    outside(pointOf(event), event, pressedOutside)
  }
  const listeners = [
    ['touchstart', start, { capture:true, passive:true }],
    ['touchmove', move, { capture:true, passive:true }],
    ['touchend', end, { capture:true, passive:true }],
    ['touchcancel', cancel, { capture:true, passive:true }],
    ['click', click, true]
  ]
  for (const [name, listener, options] of listeners) document.addEventListener(name, listener, options)
  return () => {
    if (disposed) return
    disposed = true; gesture = null
    for (const [name, listener, options] of listeners) document.removeEventListener(name, listener, options)
  }
}
