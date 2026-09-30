// Unknown capability fields stay null. Do not infer token limits or effort
// support from a model ID: gateways can expose aliases with different limits.
export const EFFORT_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const positive = (...values) => values.map(Number).find(value => Number.isFinite(value) && value > 0) || 0
const supported = value => typeof value === 'boolean' ? value : typeof value?.supported === 'boolean' ? value.supported : null

export function normalizeModelInfo(raw) {
  const capabilities = raw.capabilities || {}
  const effort = raw.effort ?? capabilities.effort ?? capabilities.reasoning?.effort ?? raw.reasoning
  let levels = raw.supported_reasoning_efforts ?? raw.reasoning_effort_levels ?? effort?.supported_levels ?? effort?.levels
  if (!Array.isArray(levels) && effort && typeof effort === 'object') {
    const declared = EFFORT_LEVELS.filter(level => Object.prototype.hasOwnProperty.call(effort, level))
    if (declared.length || supported(effort) === false) levels = declared.filter(level => supported(effort[level]) === true)
  }
  if (Array.isArray(levels)) levels = [...new Set(levels.filter(level => EFFORT_LEVELS.includes(level)))]
  else levels = null
  const thinking = capabilities.thinking ?? raw.thinking
  const types = thinking?.types
  const thinkingModes = types ? Object.keys(types).filter(key => supported(types[key]) === true) : supported(thinking) === false ? [] : null
  return {
    id: raw.id, name: raw.display_name || raw.name || raw.id,
    contextWindow: positive(raw.context_window, raw.max_input_tokens, raw.context_length, raw.max_context_length, raw.max_context_tokens, raw.limits?.context_window, raw.limits?.max_input_tokens),
    maxOutput: positive(raw.max_output_tokens, raw.max_tokens),
    effortLevels: levels, thinkingModes,
    reasoningSupported: levels?.length ? true : supported(thinking) ?? (levels !== null ? false : supported(capabilities.reasoning)),
    fetchedAt: Date.now()
  }
}

export function modelInfo(profile) { return profile?.modelDetails?.[profile.model] || null }
export function effortOptions(profile) {
  const info = modelInfo(profile), levels = info?.effortLevels
  // When the API omits support information, these are manual choices, never
  // claimed to be server-discovered capabilities.
  return ['auto', ...(levels ?? (info?.reasoningSupported === false ? [] : EFFORT_LEVELS))]
}
export function selectedEffort(profile) { return effortOptions(profile).includes(profile?.effort) ? profile.effort : 'auto' }
export function contextWindowFor(profile) {
  return modelInfo(profile)?.contextWindow || positive(profile?.contextWindows?.[profile?.model], Object.keys(profile?.contextWindows || {}).length ? 0 : profile?.contextWindow)
}
export function hasReasoning(profile) {
  if (!profile?.model) return false
  const info = modelInfo(profile)
  return info?.reasoningSupported ?? (selectedEffort(profile) !== 'auto')
}

export function profileForModel(profile, model) {
  const contextWindows = { ...(profile.contextWindows || {}) }
  if (!Object.keys(contextWindows).length && profile.contextWindow) contextWindows[profile.model] = Number(profile.contextWindow)
  const next = { ...profile, model, contextWindows, contextWindow:contextWindows[model] || 0 }
  next.effort = selectedEffort(next)
  return next
}
