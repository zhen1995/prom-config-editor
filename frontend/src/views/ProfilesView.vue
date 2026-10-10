<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  NButton,
  NEmpty,
  NGrid,
  NGridItem,
  NIcon,
  NSpin,
  useDialog,
  useMessage,
} from 'naive-ui'
import {
  AddOutline,
  CloudDoneOutline,
  CloudOfflineOutline,
  CreateOutline,
  ServerOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { useProfilesStore } from '../stores/profiles'
import ProfileFormModal from '../components/ProfileFormModal.vue'
import type { ServerProfile } from '../api'

const { t } = useI18n()
const router = useRouter()
const dialog = useDialog()
const message = useMessage()
const store = useProfilesStore()

const showModal = ref(false)
const editing = ref<ServerProfile | null>(null)
const testingId = ref<string | null>(null)

onMounted(() => {
  store.refresh()
})

function openCreate(): void {
  editing.value = null
  showModal.value = true
}

function openEdit(p: ServerProfile): void {
  editing.value = p
  showModal.value = true
}

function confirmDelete(p: ServerProfile): void {
  dialog.warning({
    title: t('profiles.deleteTitle'),
    content: t('profiles.deleteContent', { name: p.name }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await store.remove(p.id)
        message.success(t('profiles.deleted'))
      } catch (err) {
        message.error(t('profiles.deleteFailed', { msg: err instanceof Error ? err.message : String(err) }))
      }
    },
  })
}

async function test(p: ServerProfile): Promise<void> {
  testingId.value = p.id
  const result = await store.testConnection(p.id)
  testingId.value = null
  if (result.ok) {
    message.success(
      result.latencyMs !== undefined ? `${result.message}（${result.latencyMs}ms）` : result.message,
    )
  } else {
    message.error(result.message)
  }
}

function openEditor(p: ServerProfile): void {
  store.currentId = p.id
  router.push('/editor')
}

/** 连接状态徽标 */
function stateOf(p: ServerProfile): { label: string; color: string } {
  const s = store.connectionStates[p.id]
  if (s === 'connected') return { label: t('profiles.stateConnected'), color: 'var(--success)' }
  if (s === 'failed') return { label: t('profiles.stateFailed'), color: 'var(--danger)' }
  if (s === 'testing') return { label: t('profiles.stateTesting'), color: 'var(--warning)' }
  return {
    label: p.authType === 'key' ? t('profiles.authKey') : t('profiles.authPassword'),
    color: 'var(--text-faint)',
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ t('profiles.title') }}</h2>
        <p class="page-subtitle">{{ t('profiles.subtitle', { count: store.profiles.length }) }}</p>
      </div>
      <n-button type="primary" @click="openCreate">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        {{ t('profiles.newConnection') }}
      </n-button>
    </div>

    <n-spin :show="store.loading">
      <n-empty
        v-if="!store.loading && store.profiles.length === 0"
        :description="t('profiles.empty')"
      >
        <template #extra>
          <n-button type="primary" @click="openCreate">{{ t('profiles.newConnection') }}</n-button>
        </template>
      </n-empty>

      <n-grid :cols="3" :x-gap="18" :y-gap="18" item-responsive>
        <n-grid-item v-for="p in store.profiles" :key="p.id" span="3 m:2 l:1">
          <div class="soft-card hoverable profile-card" @dblclick="openEditor(p)">
            <div class="profile-card-head">
              <span class="profile-icon">
                <n-icon><ServerOutline /></n-icon>
              </span>
              <div class="profile-title">
                <div class="profile-name">{{ p.name }}</div>
                <div class="profile-host mono">{{ p.username }}@{{ p.host }}:{{ p.port }}</div>
              </div>
              <span class="state-dot" :style="{ background: stateOf(p).color }" />
            </div>

            <div class="profile-meta">
              <div class="meta-row">
                <span class="meta-label">{{ t('profiles.configPath') }}</span>
                <span class="mono">{{ p.configPath }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">{{ t('profiles.restartScript') }}</span>
                <span class="mono">{{ p.restartScript }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">{{ t('profiles.authType') }}</span>
                <span>{{ p.authType === 'key' ? t('profiles.authKey') : t('profiles.authPassword') }}</span>
                <span v-if="p.hasPassphrase" class="text-faint">{{ t('profiles.withPassphrase') }}</span>
              </div>
            </div>

            <div class="profile-actions">
              <n-button size="small" type="primary" @click="openEditor(p)">{{ t('profiles.openEditor') }}</n-button>
              <n-button size="small" :loading="testingId === p.id" @click="test(p)">
                <template #icon>
                  <n-icon>
                    <CloudDoneOutline v-if="store.connectionStates[p.id] === 'connected'" />
                    <CloudOfflineOutline v-else />
                  </n-icon>
                </template>
                {{ t('profiles.test') }}
              </n-button>
              <n-button size="small" quaternary @click="openEdit(p)">
                <template #icon><n-icon><CreateOutline /></n-icon></template>
              </n-button>
              <n-button size="small" quaternary type="error" @click="confirmDelete(p)">
                <template #icon><n-icon><TrashOutline /></n-icon></template>
              </n-button>
            </div>
          </div>
        </n-grid-item>
      </n-grid>
    </n-spin>

    <ProfileFormModal v-model:show="showModal" :profile="editing" @saved="store.refresh" />
  </div>
</template>

<style scoped>
.profile-card {
  padding: 18px;
  cursor: default;
}

.profile-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.profile-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  flex-shrink: 0;
}

.profile-title {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-host {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.profile-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.meta-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
  color: var(--text-secondary);
  min-width: 0;
}

.meta-row > span:last-child,
.meta-row > span:nth-child(2):not(.meta-label) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-label {
  color: var(--text-faint);
  flex-shrink: 0;
  width: 56px;
}

.profile-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
</style>
