import { defineStore } from 'pinia'
import { onScopeDispose, ref } from 'vue'
import { api } from '../api'
import type { DeployEvent, DeployLogEntry, DeployStep, DeployStepStatus } from '../api'

export const STEP_ORDER: DeployStep[] = ['backup', 'validate', 'upload', 'restart', 'healthcheck']

interface DeployState {
  status: DeployStepStatus
  message?: string
}

export const useDeployStore = defineStore('deploy', () => {
  const running = ref(false)
  /** 最近一次部署是否成功（null 表示尚未部署） */
  const lastResult = ref<boolean | null>(null)
  const steps = ref<Record<DeployStep, DeployState>>({
    backup: { status: 'pending' },
    validate: { status: 'pending' },
    upload: { status: 'pending' },
    restart: { status: 'pending' },
    healthcheck: { status: 'pending' },
  })
  const logs = ref<DeployLogEntry[]>([])

  let handler: ((event: DeployEvent) => void) | null = null

  /** 组件作用域内调用，自动取消订阅 */
  function subscribe(): void {
    handler = (event: DeployEvent) => {
      if (event.kind === 'step') {
        steps.value[event.step] = { status: event.status, message: event.message }
      } else if (event.kind === 'log') {
        logs.value.push({ time: event.time, step: event.step, level: event.level, message: event.message })
      } else {
        running.value = false
        lastResult.value = event.success
        if (event.message) {
          logs.value.push({ time: event.time, step: 'upload', level: event.success ? 'success' : 'error', message: event.message })
        }
      }
    }
    api.onDeployEvent(handler)
    onScopeDispose(() => {
      if (handler) api.offDeployEvent(handler)
    })
  }

  function reset(): void {
    for (const step of STEP_ORDER) {
      steps.value[step] = { status: 'pending' }
    }
    logs.value = []
    lastResult.value = null
  }

  async function start(profileId: string, content: string): Promise<void> {
    reset()
    running.value = true
    try {
      await api.syncDeploy(profileId, content)
    } catch {
      // 失败细节已由事件流（step failed / finished）呈现
    }
  }

  return { running, lastResult, steps, logs, subscribe, reset, start }
})
