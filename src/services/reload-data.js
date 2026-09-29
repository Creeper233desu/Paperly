import { reloadLibrary } from '../store/library.js'
import { reloadStatistics } from '../store/statistics.js'
import { reloadPreferences } from '../store/preferences.js'
import { reloadAiProfiles } from '../store/ai-profiles.js'
import { reloadAssistantSessions } from '../store/assistant-sessions.js'

export function reloadAppData() {
  reloadLibrary()
  reloadStatistics()
  reloadPreferences()
  reloadAiProfiles()
  reloadAssistantSessions()
}
