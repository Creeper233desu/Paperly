export function hsvToHex(hue, saturation, value) {
  const h = ((Number(hue) % 360) + 360) % 360
  const s = Math.min(100, Math.max(0, Number(saturation))) / 100
  const v = Math.min(100, Math.max(0, Number(value))) / 100
  const chroma = v * s
  const secondary = chroma * (1 - Math.abs((h / 60) % 2 - 1))
  const base = v - chroma
  const sectors = [[chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary], [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary]]
  return '#' + sectors[Math.floor(h / 60)].map(channel => Math.round((channel + base) * 255).toString(16).padStart(2, '0')).join('')
}

export function hexToHsv(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return { hue: 0, saturation: 0, value: 100 }
  const [red, green, blue] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
  const high = Math.max(red, green, blue), low = Math.min(red, green, blue), delta = high - low
  let hue = 0
  if (delta) {
    if (high === red) hue = ((green - blue) / delta) % 6
    else if (high === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue = (hue * 60 + 360) % 360
  }
  return { hue: Math.round(hue), saturation: high ? Math.round(delta / high * 100) : 0, value: Math.round(high * 100) }
}
