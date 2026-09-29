<script>
import { initStore } from './src/store/library'
import { applyTheme } from './src/store/preferences'
import { flushActiveStreams } from './src/services/ai-providers'
import { flushDirectorySync, initDataDirectory, queueDirectorySync } from './src/services/data-directory'
import { flushAssistantSessions } from './src/store/assistant-sessions'

export default {
  onLaunch() {
    initStore()
    initDataDirectory()
    applyTheme()
    if (typeof uni.onThemeChange === 'function') uni.onThemeChange(applyTheme)
  },
  onShow() {
    initDataDirectory()
    applyTheme()
    flushActiveStreams()
    queueDirectorySync()
  },
  onHide() {
    flushAssistantSessions()
    flushDirectorySync().catch(() => {})
  }
}
</script>

<style>
html, body, page { color-scheme: only light; }
page { background: #f5f6f8; color: #242936; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
view, text, input, textarea, button, image { box-sizing: border-box; }
button::after { border: 0; }
.theme-light { color-scheme: only light; --bg: #f5f6f8; --surface: #fff; --surface-alt: #edf0f4; --text: #242936; --muted: #828a99; --line: #e3e7ed; --accent: #536787; --accent-soft: #e9edf5; --on-accent:#fff; --danger: #bf6269; --shadow: rgba(32, 41, 57, .09); }
.theme-dark { color-scheme: dark; --bg: #111318; --surface: #1c2028; --surface-alt: #282d37; --text: #edf0f4; --muted: #929aa9; --line: #343945; --accent: #b6c6e1; --accent-soft: #30394b; --on-accent:#17202b; --danger: #e38c92; --shadow: rgba(0, 0, 0, .28); }
.theme-light.accent-jade { --accent:#3f806f; --accent-soft:#e3f1eb; }
.theme-light.accent-plum { --accent:#8266a1; --accent-soft:#efe8f5; }
.theme-light.accent-coral { --accent:#ac665c; --accent-soft:#f7e9e5; }
.theme-light.accent-amber { --accent:#996e32; --accent-soft:#f5eddf; }
.theme-dark.accent-jade { --accent:#8fceb5; --accent-soft:#263e39; }
.theme-dark.accent-plum { --accent:#c5acd8; --accent-soft:#3b3147; }
.theme-dark.accent-coral { --accent:#e3aaa0; --accent-soft:#443430; }
.theme-dark.accent-amber { --accent:#e2be80; --accent-soft:#443b2b; }
.screen { min-height: 100vh; background: var(--bg); color: var(--text); padding: calc(var(--status-bar-height) + 12px) 22px 110px; transition: background .28s ease, color .28s ease; }
.page-wrap { width: 100%; max-width: 1220px; margin: 0 auto; }
.topbar { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 15px; }
.back, .top-action { color: var(--accent); font-size: 14px; padding: 12px 0; }
.page-title { font-size: clamp(31px, 4vw, 46px); font-weight: 730; letter-spacing: -.04em; line-height: 1.18; margin: 26px 0 9px; }
.subtle { color: var(--muted); font-size: 14px; line-height: 1.6; }
.section-title { font-size: 18px; font-weight: 700; margin: 34px 0 17px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 22px; box-shadow: 0 10px 35px var(--shadow); }
.primary-button { background: var(--accent); color: var(--on-accent); border-radius: 14px; font-size: 14px; font-weight: 650; padding: 13px 20px; }
.ghost-button { background: var(--accent-soft); color: var(--accent); border-radius: 14px; font-size: 14px; padding: 12px 18px; }
.field { background: var(--surface-alt); color: var(--text); border: 1px solid transparent; border-radius: 12px; height: 46px; width: 100%; padding: 0 14px; font-size: 14px; outline: none; margin: 8px 0; }
.field:focus { border-color: var(--accent); }
.empty { color: var(--muted); font-size: 14px; line-height: 1.65; text-align: center; padding: 55px 25px; }
.home-shell { position: relative; width: 100%; height: 100vh; overflow: hidden; background: var(--bg); }
.home-panel { position: absolute; inset: 0; }
.home-panel .screen { height: 100vh; min-height: 0; overflow-y: auto; transform: translate3d(var(--panel-shift), 0, 0); transition: transform .38s cubic-bezier(.22,.82,.22,1); }
@media (prefers-reduced-motion: reduce) { .home-panel .screen { transition: none; } }
@media (min-width: 700px) { .screen { padding: calc(var(--status-bar-height) + 26px) 36px 115px; } }
@media (prefers-reduced-motion: reduce) { .screen { transition: none; } }
</style>
