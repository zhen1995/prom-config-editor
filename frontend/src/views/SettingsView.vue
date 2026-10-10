<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NFormItem, NInputNumber, NSelect, NText } from 'naive-ui'
import { SUPPORTED_LOCALES, setLocale, type Locale } from '../i18n'
import { useThemeStore } from '../stores/theme'

const { t, locale } = useI18n()
const themeStore = useThemeStore()

// 占位：应用级默认值，接入后端后持久化到本地配置
const defaultBackupKeep = ref(10)
const saved = ref(false)

function onLocaleChange(value: Locale): void {
  setLocale(value)
}

function save(): void {
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}
</script>

<template>
  <div class="page-container" style="max-width: 720px">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ t('settings.title') }}</h2>
        <p class="page-subtitle">{{ t('settings.subtitle') }}</p>
      </div>
    </div>

    <section class="soft-card settings-card">
      <h3 class="settings-title">{{ t('settings.appearance') }}</h3>
      <n-form-item :label="t('settings.language')">
        <n-select
          :value="locale"
          :options="SUPPORTED_LOCALES"
          style="width: 200px"
          @update:value="onLocaleChange"
        />
      </n-form-item>
      <n-form-item :label="t('settings.theme')">
        <n-button size="small" @click="themeStore.toggle()">
          {{ t('settings.switchTo', { mode: themeStore.theme === 'dark' ? t('settings.light') : t('settings.dark') }) }}
        </n-button>
      </n-form-item>
    </section>

    <section class="soft-card settings-card">
      <h3 class="settings-title">{{ t('settings.defaults') }}</h3>
      <n-form-item :label="t('settings.defaultBackupKeep')">
        <n-input-number v-model:value="defaultBackupKeep" :min="1" :max="100" style="width: 160px" />
      </n-form-item>
      <n-form-item :label="t('settings.defaultConfigPath')">
        <n-text depth="3" class="mono">/etc/prometheus/prometheus.yml</n-text>
      </n-form-item>
      <n-button type="primary" size="small" :disabled="saved" @click="save">
        {{ saved ? t('common.saved') : t('settings.save') }}
      </n-button>
    </section>
  </div>
</template>

<style scoped>
.settings-card {
  padding: 18px 20px;
  margin-bottom: 16px;
}

.settings-title {
  margin: 0 0 14px;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
