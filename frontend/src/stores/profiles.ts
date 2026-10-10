import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api'
import type { ServerProfile, TestConnectionResult } from '../api'

export type ConnectionState = 'unknown' | 'testing' | 'connected' | 'failed'

export const useProfilesStore = defineStore('profiles', () => {
  const profiles = ref<ServerProfile[]>([])
  const loading = ref(false)
  /** 当前选中的连接配置 id（编辑器页使用） */
  const currentId = ref<string | null>(null)
  /** 各配置的连接状态 */
  const connectionStates = ref<Record<string, ConnectionState>>({})

  const currentProfile = computed<ServerProfile | null>(
    () => profiles.value.find((p) => p.id === currentId.value) ?? null,
  )

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      profiles.value = await api.listProfiles()
      if (currentId.value && !profiles.value.some((p) => p.id === currentId.value)) {
        currentId.value = null
      }
    } finally {
      loading.value = false
    }
  }

  async function remove(id: string): Promise<void> {
    await api.deleteProfile(id)
    await refresh()
  }

  async function testConnection(id: string): Promise<TestConnectionResult> {
    connectionStates.value[id] = 'testing'
    try {
      const result = await api.testConnection(id)
      connectionStates.value[id] = result.ok ? 'connected' : 'failed'
      return result
    } catch (err) {
      connectionStates.value[id] = 'failed'
      return { ok: false, message: `连接异常：${err instanceof Error ? err.message : String(err)}` }
    }
  }

  return { profiles, loading, currentId, currentProfile, connectionStates, refresh, remove, testConnection }
})
