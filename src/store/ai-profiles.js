import { reactive } from 'vue'
import { providerInfo } from '../services/ai-providers.js'
import { queueDirectorySync } from '../services/data-directory.js'

const KEY = 'paperwriter.aiProfiles.v1'
const OLD_KEY = 'paperwriter.preferences.v1'
export const aiProfiles = reactive({ profiles: [], activeId: '' })
let loaded = false
const makeId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

function persist() { uni.setStorageSync(KEY, JSON.stringify({ profiles: aiProfiles.profiles, activeId: aiProfiles.activeId })); queueDirectorySync() }
export function reloadAiProfiles() { loaded = false; aiProfiles.profiles = []; aiProfiles.activeId = ''; loadAiProfiles() }
export function loadAiProfiles() {
  if (loaded) return aiProfiles
  loaded = true
  let hasSavedProfiles = false
  try {
    const raw = uni.getStorageSync(KEY)
    hasSavedProfiles = !!raw
    const saved = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
    if (Array.isArray(saved.profiles)) aiProfiles.profiles = saved.profiles
    aiProfiles.activeId = saved.activeId || ''
  } catch (_) { /* new installation */ }
  if (!hasSavedProfiles && !aiProfiles.profiles.length) {
    try {
      const legacy = JSON.parse(uni.getStorageSync(OLD_KEY) || '{}')
      if (legacy.aiApiKey) {
        const profile = { id: makeId(), provider: 'deepseek', name: 'DeepSeek', apiKey: legacy.aiApiKey, baseUrl: providerInfo('deepseek').baseUrl, model: legacy.aiModel || '', models: [], effort: 'auto' }
        aiProfiles.profiles.push(profile); aiProfiles.activeId = profile.id; persist()
      }
    } catch (_) { /* no legacy profile */ }
  }
  if (!aiProfiles.profiles.some(profile => profile.id === aiProfiles.activeId)) aiProfiles.activeId = aiProfiles.profiles[0]?.id || ''
  return aiProfiles
}
export function activeAiProfile() { loadAiProfiles(); return aiProfiles.profiles.find(profile => profile.id === aiProfiles.activeId) || null }
export function saveAiProfile(input) {
  loadAiProfiles()
  const profile = { id: input.id || makeId(), provider: input.provider || 'openai', name: input.name?.trim() || providerInfo(input.provider).name, apiKey: input.apiKey?.trim() || '', baseUrl: input.baseUrl?.trim() || providerInfo(input.provider).baseUrl, model: input.model || '', models: Array.isArray(input.models) ? input.models : [], effort: input.effort || 'auto', contextWindow: Math.max(0, Math.min(2000000, Number(input.contextWindow) || 0)) }
  const index = aiProfiles.profiles.findIndex(item => item.id === profile.id)
  if (index < 0) aiProfiles.profiles.push(profile)
  else aiProfiles.profiles.splice(index, 1, profile)
  if (!aiProfiles.activeId) aiProfiles.activeId = profile.id
  persist()
  return profile
}
export function selectAiProfile(id) { loadAiProfiles(); if (aiProfiles.profiles.some(profile => profile.id === id)) { aiProfiles.activeId = id; persist() } }
export function removeAiProfile(id) { loadAiProfiles(); aiProfiles.profiles = aiProfiles.profiles.filter(profile => profile.id !== id); if (aiProfiles.activeId === id) aiProfiles.activeId = aiProfiles.profiles[0]?.id || ''; persist() }
