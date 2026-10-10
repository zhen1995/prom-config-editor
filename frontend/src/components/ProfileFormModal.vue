<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NForm, NFormItem, NInput, NInputNumber, NModal, NRadioButton, NRadioGroup, NSpace, NSwitch, useMessage } from 'naive-ui'
import { api } from '../api'
import type { SaveProfileRequest, ServerProfile } from '../api'

const { t } = useI18n()

const props = defineProps<{
  show: boolean
  /** null 表示新建 */
  profile: ServerProfile | null
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'saved'): void
}>()

const message = useMessage()

interface FormModel {
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  keyPath: string
  configPath: string
  backupKeep: number
  restartScript: string
  healthCheckUrl: string
  validateRemote: boolean
  password: string
  passphrase: string
}

function emptyForm(): FormModel {
  return {
    name: '',
    host: '',
    port: 22,
    username: '',
    authType: 'password',
    keyPath: '',
    configPath: '/etc/prometheus/prometheus.yml',
    backupKeep: 10,
    restartScript: 'sudo systemctl restart prometheus',
    healthCheckUrl: '',
    validateRemote: true,
    password: '',
    passphrase: '',
  }
}

const form = ref<FormModel>(emptyForm())
const saving = ref(false)

const isEdit = computed(() => props.profile !== null)
const title = computed(() => (isEdit.value ? t('profileForm.edit') : t('profileForm.create')))

watch(
  () => [props.show, props.profile] as const,
  () => {
    if (!props.show) return
    if (props.profile) {
      const p = props.profile
      form.value = {
        name: p.name,
        host: p.host,
        port: p.port,
        username: p.username,
        authType: p.authType,
        keyPath: p.keyPath ?? '',
        configPath: p.configPath,
        backupKeep: p.backupKeep,
        restartScript: p.restartScript,
        healthCheckUrl: p.healthCheckUrl ?? '',
        validateRemote: p.validateRemote,
        // 敏感字段不回读，编辑时留空表示不修改
        password: '',
        passphrase: '',
      }
    } else {
      form.value = emptyForm()
    }
  },
  { immediate: true },
)

function close(): void {
  emit('update:show', false)
}

async function save(): Promise<void> {
  if (!form.value.name || !form.value.host || !form.value.username) {
    message.warning(t('profileForm.fillRequired'))
    return
  }
  saving.value = true
  try {
    const req: SaveProfileRequest = {
      ...(isEdit.value ? { id: props.profile?.id } : {}),
      name: form.value.name,
      host: form.value.host,
      port: form.value.port || 22,
      username: form.value.username,
      authType: form.value.authType,
      keyPath: form.value.authType === 'key' ? form.value.keyPath : undefined,
      configPath: form.value.configPath || '/etc/prometheus/prometheus.yml',
      backupKeep: form.value.backupKeep || 10,
      restartScript: form.value.restartScript,
      healthCheckUrl: form.value.healthCheckUrl || undefined,
      validateRemote: form.value.validateRemote,
      password: form.value.password || undefined,
      passphrase: form.value.passphrase || undefined,
    }
    await api.saveProfile(req)
    message.success(t('common.saved'))
    emit('saved')
    close()
  } catch (err) {
    message.error(t('profileForm.saveFailed', { msg: err instanceof Error ? err.message : String(err) }))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-modal :show="show" :title="title" style="width: 640px" preset="card" @update:show="close">
    <n-form label-placement="left" label-width="110">
      <n-form-item :label="t('profileForm.name')" required>
        <n-input v-model:value="form.name" :placeholder="t('profileForm.namePlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('profileForm.host')" required>
        <n-input v-model:value="form.host" :placeholder="t('profileForm.hostPlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('profileForm.port')">
        <n-input-number v-model:value="form.port" :min="1" :max="65535" style="width: 160px" />
      </n-form-item>
      <n-form-item :label="t('profileForm.username')" required>
        <n-input v-model:value="form.username" :placeholder="t('profileForm.usernamePlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('profileForm.authType')">
        <n-radio-group v-model:value="form.authType">
          <n-radio-button value="password">{{ t('profileForm.authPassword') }}</n-radio-button>
          <n-radio-button value="key">{{ t('profileForm.authKey') }}</n-radio-button>
        </n-radio-group>
      </n-form-item>
      <n-form-item v-if="form.authType === 'password'" :label="t('profileForm.authPassword')">
        <n-input
          v-model:value="form.password"
          type="password"
          show-password-on="click"
          :placeholder="isEdit ? t('profileForm.passwordPlaceholderEdit') : t('profileForm.passwordPlaceholderNew')"
        />
      </n-form-item>
      <template v-else>
        <n-form-item :label="t('profileForm.keyPath')">
          <n-input v-model:value="form.keyPath" :placeholder="t('profileForm.keyPathPlaceholder')" />
        </n-form-item>
        <n-form-item :label="t('profileForm.passphrase')">
          <n-input
            v-model:value="form.passphrase"
            type="password"
            show-password-on="click"
            :placeholder="isEdit ? t('profileForm.passphrasePlaceholderEdit') : t('profileForm.passphrasePlaceholderNew')"
          />
        </n-form-item>
      </template>
      <n-form-item :label="t('profileForm.configPath')">
        <n-input v-model:value="form.configPath" :placeholder="t('profileForm.configPathPlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('profileForm.restartScript')">
        <n-input v-model:value="form.restartScript" :placeholder="t('profileForm.restartScriptPlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('profileForm.healthCheckUrl')">
        <n-input v-model:value="form.healthCheckUrl" :placeholder="t('profileForm.healthCheckUrlPlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('profileForm.validateRemote')">
        <n-switch v-model:value="form.validateRemote" />
        <span style="margin-left: 8px; color: gray; font-size: 12px">{{ t('profileForm.validateRemoteHint') }}</span>
      </n-form-item>
      <n-form-item :label="t('profileForm.backupKeep')">
        <n-input-number v-model:value="form.backupKeep" :min="1" :max="100" style="width: 160px" />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="close">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</n-button>
      </n-space>
    </template>
  </n-modal>
</template>
