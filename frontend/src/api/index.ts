import { mockApi } from './mock'
import { wailsApi } from './wails'
import type { PromEditorApi } from './types'

export * from './types'

/**
 * 运行环境自适应：
 * - 桌面应用（Wails 注入 window.go.main.App）→ 真实 Go 后端绑定
 * - 浏览器开发（npm run dev）→ Mock 实现
 */
function detectApi(): PromEditorApi {
  const w = window as { go?: { main?: { App?: unknown } } }
  return w.go?.main?.App ? wailsApi : mockApi
}

export const api: PromEditorApi = detectApi()
