<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton,
  NCollapseTransition,
  NEmpty,
  NIcon,
  NPopselect,
  NSpace,
  NSpin,
  useMessage,
} from 'naive-ui'
import { ChevronDownOutline, ChevronUpOutline, RefreshOutline } from '@vicons/ionicons5'
import { api } from '../api'
import type { BackupInfo } from '../api'
import { STEP_ORDER, useDeployStore } from '../stores/deploy'
import { useProfilesStore } from '../stores/profiles'

const { t } = useI18n()
const deployStore = useDeployStore()
const profilesStore = useProfilesStore()
const message = useMessage()

const collapsed = ref(false)
const logContainer = ref<HTMLDivElement | null>(null)
const backups = ref<BackupInfo[]>([])
const loadingBackups = ref(false)
const rollingBack = ref(false)

const stepList = computed(() =>
  STEP_ORDER.map((step) => ({
    step,
    label: t(`deploy.steps.${step}`),
    state: deployStore.steps[step],
  })),
)

const canRollback = computed(
  () => deployStore.lastResult === false && !deployStore.running && !rollingBack.value,
)

watch(
  () => deployStore.logs.length,
  async () => {
    await nextTick()
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  },
)

async function loadBackups(): Promise<void> {
  const profileId = profilesStore.currentId
  if (!profileId) return
  loadingBackups.value = true
  try {
    backups.value = await api.listBackups(profileId)
  } catch (err) {
    message.error(t('deploy.loadBackupsFailed', { msg: err instanceof Error ? err.message : String(err) }))
  } finally {
    loadingBackups.value = false
  }
}

async function rollback(backupName: string): Promise<void> {
  const profileId = profilesStore.currentId
  if (!profileId) return
  rollingBack.value = true
  try {
    await api.rollback(profileId, backupName)
    message.success(t('deploy.rollbackOk', { name: backupName }))
    // 通知编辑器刷新内容
    window.dispatchEvent(new CustomEvent('prom-editor:reload'))
  } catch (err) {
    message.error(t('deploy.rollbackFailed', { msg: err instanceof Error ? err.message : String(err) }))
  } finally {
    rollingBack.value = false
  }
}
</script>

<template>
  <div class="deploy-panel">
    <div class="deploy-head" @click="collapsed = !collapsed">
      <n-icon size="15" class="text-faint">
        <ChevronDownOutline v-if="collapsed" />
        <ChevronUpOutline v-else />
      </n-icon>
      <span class="deploy-title">{{ t('deploy.title') }}</span>
      <n-space size="small" :wrap="false">
        <span v-for="s in stepList" :key="s.step" class="step-chip" :class="`is-${s.state.status}`">
          {{ s.label }}
        </span>
      </n-space>
      <n-popselect
        v-if="canRollback"
        :options="backups.map((b) => ({ label: `${b.name}（${(b.size / 1024).toFixed(1)} KB）`, value: b.name }))"
        :loading="loadingBackups"
        trigger="click"
        @update:show="(show: boolean) => show && loadBackups()"
        @update:value="rollback"
      >
        <n-button size="tiny" type="error" secondary :loading="rollingBack" @click.stop>
          <template #icon><n-icon><RefreshOutline /></n-icon></template>
          {{ t('deploy.rollback') }}
        </n-button>
      </n-popselect>
    </div>
    <n-collapse-transition :show="!collapsed">
      <div ref="logContainer" class="deploy-log">
        <n-empty v-if="deployStore.logs.length === 0" :description="t('deploy.empty')" size="small" style="margin-top: 36px" />
        <div v-for="(log, idx) in deployStore.logs" :key="idx" class="log-line">
          <span class="log-time">{{ new Date(log.time).toLocaleTimeString() }}</span>
          <span class="log-step">{{ t(`deploy.steps.${log.step}`) }}</span>
          <span class="log-msg" :class="{ err: log.level === 'error', ok: log.level === 'success' }">{{ log.message }}</span>
        </div>
        <n-spin v-if="deployStore.running" size="small" style="margin-top: 6px" />
      </div>
    </n-collapse-transition>
  </div>
</template>

<style scoped>
.deploy-panel {
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
}

.deploy-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
}

.deploy-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-right: 4px;
}

.step-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
  color: var(--text-faint);
  background: var(--bg-elevated);
}

.step-chip.is-running {
  color: var(--warning);
  background: rgba(240, 169, 75, 0.12);
}

.step-chip.is-success {
  color: var(--success);
  background: rgba(62, 207, 142, 0.12);
}

.step-chip.is-failed {
  color: var(--danger);
  background: rgba(240, 100, 95, 0.12);
}

.step-chip.is-skipped {
  color: var(--text-faint);
}

.deploy-log {
  height: 190px;
  overflow-y: auto;
  padding: 10px 16px 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-base);
  border-top: 1px solid var(--border);
}

.log-line {
  display: flex;
  gap: 10px;
  line-height: 1.9;
  align-items: baseline;
}

.log-time {
  color: var(--text-faint);
  flex-shrink: 0;
}

.log-step {
  flex-shrink: 0;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 4px;
  padding: 0 6px;
  font-size: 11px;
}

.log-msg {
  color: var(--text-secondary);
  word-break: break-all;
}

.log-msg.err {
  color: var(--danger);
}

.log-msg.ok {
  color: var(--success);
}
</style>
