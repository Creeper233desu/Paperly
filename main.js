import App from './App.vue'
import { createSSRApp } from 'vue'
import { t, localizeMessage } from './src/i18n'

export function createApp() {
  const app = createSSRApp(App)
  app.config.globalProperties.$t = t
  app.config.globalProperties.$m = localizeMessage
  return { app }
}
