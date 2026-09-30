export function providerIcon(provider, dark) {
  // The supplied “light” artwork is white; use it on dark surfaces.
  if (provider === 'openai') return `/static/providers/openai-${dark ? 'light' : 'dark'}.png`
  if (provider === 'anthropic') return `/static/providers/anthropic-${dark ? 'dark' : 'light'}.png`
  if (provider === 'deepseek') return '/static/providers/deepseek-color.png'
  if (provider === 'kimi') return '/static/providers/kimi.png'
  return ''
}
