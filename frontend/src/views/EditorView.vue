<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import {
  NButton,
  NEmpty,
  NIcon,
  NSelect,
  NSpace,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import {
  CloudDownloadOutline,
  CloudUploadOutline,
  CodeSlashOutline,
  CodeWorkingOutline,
  ListOutline,
  SearchOutline,
  ShieldCheckmarkOutline,
} from '@vicons/ionicons5'
import { api } from '../api'
import { useDeployStore } from '../stores/deploy'
import { useEditorStore } from '../stores/editor'
import { useProfilesStore } from '../stores/profiles'
import ConfigFormView from '../components/ConfigFormView.vue'
import DeployPanel from '../components/DeployPanel.vue'
import FormOutline from '../components/FormOutline.vue'
import YamlEditorView from '../components/YamlEditorView.vue'
import YamlOutline from '../components/YamlOutline.vue'

const { t } = useI18n()
const router = useRouter()
const dialog = useDialog()
const message = useMessage()

const profilesStore = useProfilesStore()
const editorStore = useEditorStore()
const deployStore = useDeployStore()
deployStore.subscribe()

const pulling = ref(false)
const syncing = ref(false)
const formatting = ref(false)
const yamlEditor = ref<InstanceType<typeof YamlEditorView> | null>(null)

const profileOptions = computed(() =>
  profilesStore.profiles.map((p) => ({ label: p.name, value: p.id })),
)

onMounted(async () => {
  await profilesStore.refresh()
  if (!profilesStore.currentId && profilesStore.profiles.length > 0) {
    profilesStore.currentId = profilesStore.profiles[0].id
    await pull()
  }
  window.addEventListener('prom-editor:reload', pull)
})

onBeforeUnmount(() => {
  window.removeEventListener('prom-editor:reload', pull)
})

async function pull(): Promise<void> {
  const profileId = profilesStore.currentId
  if (!profileId) return
  if (editorStore.dirty) {
    const leave = await confirmDiscard()
    if (!leave) return
  }
  pulling.value = true
  try {
    const { content } = await api.fetchConfig(profileId)
    editorStore.loadRemote(content)
  } catch (err) {
    message.error(t('editor.pullFailed', { msg: err instanceof Error ? err.message : String(err) }))
  } finally {
    pulling.value = false
  }
}

function confirmDiscard(): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.warning({
      title: t('editor.discardTitle'),
      content: t('editor.discardContent'),
      positiveText: t('editor.discardConfirm'),
      negativeText: t('common.cancel'),
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
    })
  })
}

/** 本地校验：YAML 语法 + 结构解析 */
function validate(): void {
  if (editorStore.enterFormView()) {
    editorStore.enterYamlView()
    message.success(t('editor.validateOk'))
  } else {
    const err = editorStore.parseError
    message.error(
      err?.line !== undefined
        ? t('editor.validateErr', { line: err.line, msg: err.message })
        : t('editor.validateErrNoLine', { msg: err?.message ?? 'unknown' }),
    )
  }
}

function switchView(mode: 'form' | 'yaml'): void {
  if (mode === editorStore.viewMode) return
  if (mode === 'form') {
    if (!editorStore.enterFormView()) {
      const err = editorStore.parseError
      message.error(
        err?.line !== undefined
          ? t('editor.yamlParseErr', { line: err.line, msg: err.message })
          : t('editor.yamlParseErrNoLine', { msg: err?.message ?? 'unknown' }),
      )
    }
  } else {
    editorStore.enterYamlView()
  }
}

async function sync(): Promise<void> {
  const profileId = profilesStore.currentId
  if (!profileId) return
  if (!editorStore.content.trim()) {
    message.warning(t('editor.contentEmpty'))
    return
  }
  if (!editorStore.enterFormView()) {
    message.error(t('editor.yamlParseErrNoLine', { msg: editorStore.parseError?.message ?? 'unknown' }))
    return
  }
  dialog.warning({
    title: t('editor.syncConfirmTitle'),
    content: t('editor.syncConfirmContent'),
    positiveText: t('editor.sync'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      syncing.value = true
      try {
        await deployStore.start(profileId, editorStore.content)
        if (deployStore.lastResult) {
          editorStore.markSaved()
          message.success(t('editor.syncSuccess'))
        } else {
          message.error(t('editor.syncIncomplete'))
        }
      } finally {
        syncing.value = false
      }
    },
  })
}

// 未保存修改的路由离开拦截
onBeforeRouteLeave(async () => {
  if (!editorStore.dirty) return true
  return confirmDiscard()
})

async function onProfileChange(): Promise<void> {
  await pull()
}

/** YAML 格式化：解析后重排版，语法错误时提示行号 */
function formatYaml(): void {
  if (!yamlEditor.value) return
  formatting.value = true
  try {
    const err = yamlEditor.value.format()
    if (err) {
      message.error(t('editor.formatFailed', { msg: err }))
    } else {
      message.success(t('editor.formatted'))
    }
  } finally {
    formatting.value = false
  }
}
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%; background: var(--bg-base)">
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <n-select
        v-model:value="profilesStore.currentId"
        :options="profileOptions"
        :placeholder="t('editor.selectServer')"
        style="width: 220px"
        :disabled="deployStore.running"
        @update:value="onProfileChange"
      />
      <template v-if="profilesStore.currentProfile">
        <n-tag size="small" :bordered="false" class="path-tag mono">
          {{ profilesStore.currentProfile.configPath }}
        </n-tag>
        <n-tag v-if="editorStore.dirty" size="small" type="warning" :bordered="false">{{ t('editor.unsaved') }}</n-tag>
      </template>

      <div class="view-switch">
        <button
          class="view-switch-item"
          :class="{ active: editorStore.viewMode === 'form' }"
          @click="switchView('form')"
        >
          <n-icon><ListOutline /></n-icon> {{ t('editor.formView') }}
        </button>
        <button
          class="view-switch-item"
          :class="{ active: editorStore.viewMode === 'yaml' }"
          @click="switchView('yaml')"
        >
          <n-icon><CodeSlashOutline /></n-icon> {{ t('editor.yamlView') }}
        </button>
      </div>

      <n-space style="margin-left: auto">
        <n-button size="small" :loading="pulling" :disabled="deployStore.running" @click="pull">
          <template #icon><n-icon><CloudDownloadOutline /></n-icon></template>
          {{ t('editor.pull') }}
        </n-button>
        <n-button size="small" @click="validate">
          <template #icon><n-icon><ShieldCheckmarkOutline /></n-icon></template>
          {{ t('editor.validate') }}
        </n-button>
        <n-button
          size="small"
          type="primary"
          :loading="syncing"
          :disabled="deployStore.running"
          @click="sync"
        >
          <template #icon><n-icon><CloudUploadOutline /></n-icon></template>
          {{ t('editor.sync') }}
        </n-button>
      </n-space>
    </div>

    <div v-if="!profilesStore.currentId" class="editor-empty">
      <n-empty :description="t('editor.noProfile')">
        <template #extra>
          <n-button type="primary" @click="router.push('/profiles')">{{ t('editor.goCreate') }}</n-button>
        </template>
      </n-empty>
    </div>

    <template v-else>
      <div v-show="editorStore.viewMode === 'form'" class="editor-body form-body">
        <template v-if="editorStore.model">
          <FormOutline />
          <div class="form-content">
            <ConfigFormView />
          </div>
        </template>
        <div v-else class="editor-empty">
          <n-empty :description="t('editor.noContent')">
            <template #extra>
              <n-button type="primary" :loading="pulling" @click="pull">{{ t('editor.pull') }}</n-button>
            </template>
          </n-empty>
        </div>
      </div>
      <div v-show="editorStore.viewMode === 'yaml'" class="editor-body yaml-body">
        <template v-if="editorStore.hasContent">
          <YamlOutline @navigate="yamlEditor?.revealPosition($event)" />
          <div class="yaml-main">
            <div class="yaml-toolbar">
              <n-button size="small" quaternary :disabled="formatting" @click="formatYaml">
                <template #icon><n-icon><CodeWorkingOutline /></n-icon></template>
                {{ t('editor.format') }}
              </n-button>
              <n-button size="small" quaternary @click="yamlEditor?.openSearch()">
                <template #icon><n-icon><SearchOutline /></n-icon></template>
                {{ t('editor.search') }}
              </n-button>
            </div>
            <div class="yaml-editor-wrap">
              <YamlEditorView ref="yamlEditor" />
            </div>
          </div>
        </template>
        <div v-else class="editor-empty">
          <n-empty :description="t('editor.noContent')">
            <template #extra>
              <n-button type="primary" :loading="pulling" @click="pull">{{ t('editor.pull') }}</n-button>
            </template>
          </n-empty>
        </div>
      </div>
      <DeployPanel />
    </template>
  </div>
</template>

<style scoped>
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
  flex-wrap: wrap;
}

.path-tag {
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.view-switch {
  display: flex;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.view-switch-item {
  display: flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.view-switch-item:hover {
  color: var(--text-primary);
}

.view-switch-item.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.editor-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
}

.form-body {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.form-content {
  flex: 1;
  min-width: 0;
  max-width: 960px;
}

.yaml-body {
  overflow: hidden;
  padding: 10px;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 8px;
}

.yaml-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.yaml-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.yaml-editor-wrap {
  flex: 1;
  min-height: 0;
}

.editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
