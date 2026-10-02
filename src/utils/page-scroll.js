export function resetPrimaryScroll(host, index) {
  if (!host || !Number.isInteger(index)) return false
  const panels = Array.from(host.children).filter(node => node.classList.contains('home-panel'))
  const screen = panels[index]?.querySelector('.screen')
  if (!screen) return false
  // Reset the arriving page before its existing entrance animation reveals it.
  // Nested controls such as the heatmap retain their own horizontal position.
  screen.scrollTop = 0
  screen.scrollLeft = 0
  return true
}
