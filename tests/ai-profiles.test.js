import test from 'node:test'
import assert from 'node:assert/strict'
import { activeAiProfile, aiProfiles, loadAiProfiles, removeAiProfile, saveAiProfile, selectAiProfile } from '../src/store/ai-profiles.js'

test('old single-key config migrates and multiple provider profiles persist independently', () => {
  const storage = new Map([['paperwriter.preferences.v1', JSON.stringify({ aiApiKey: 'old-key', aiModel: 'old-model' })]])
  globalThis.uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) }
  loadAiProfiles()
  assert.equal(activeAiProfile().provider, 'deepseek')
  assert.equal(activeAiProfile().apiKey, 'old-key')
  const second = saveAiProfile({ provider: 'anthropic', name: 'Claude 写作', apiKey: 'second-key', model: 'live-model', models: ['live-model'] })
  selectAiProfile(second.id)
  assert.equal(activeAiProfile().apiKey, 'second-key')
  assert.equal(aiProfiles.profiles.length, 2)
  assert.ok(storage.get('paperwriter.aiProfiles.v1').includes('live-model'))
  removeAiProfile(second.id)
  assert.equal(activeAiProfile().apiKey, 'old-key')
})
