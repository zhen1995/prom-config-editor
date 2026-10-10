<script setup lang="ts">
import { computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton,
  NConfigProvider,
  NDialogProvider,
  NIcon,
  NLayout,
  NLayoutContent,
  NMessageProvider,
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  zhCN,
  type GlobalThemeOverrides,
} from 'naive-ui'
import { CloudOutline, SettingsOutline, SpeedometerOutline } from '@vicons/ionicons5'
import { useRoute } from 'vue-router'
import { useThemeStore } from './stores/theme'

const { t, locale } = useI18n()
const themeStore = useThemeStore()
const route = useRoute()

const activeKey = computed(() => {
  if (route.path.startsWith('/editor')) return '/editor'
  if (route.path.startsWith('/settings')) return '/settings'
  return '/profiles'
})

const menuOptions = computed(() => [
  { label: t('nav.profiles'), key: '/profiles', icon: renderIcon(CloudOutline) },
  { label: t('nav.editor'), key: '/editor', icon: renderIcon(SpeedometerOutline) },
  { label: t('nav.settings'), key: '/settings', icon: renderIcon(SettingsOutline) },
])

function renderIcon(icon: typeof CloudOutline) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

/** naive-ui 组件语言随 i18n 语言切换 */
const naiveLocale = computed(() => (locale.value === 'zh' ? zhCN : enUS))
const naiveDateLocale = computed(() => (locale.value === 'zh' ? dateZhCN : dateEnUS))

const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: '#7c6cff',
    primaryColorHover: '#9487ff',
    primaryColorPressed: '#6a5ce0',
    primaryColorSuppl: '#7c6cff',
    successColor: '#3ecf8e',
    warningColor: '#f0a94b',
    errorColor: '#f0645f',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontSize: '13px',
  },
  Card: {
    borderColor: 'rgba(128,128,128,0.14)',
    borderRadius: '14px',
  },
  Button: {
    textColorPrimary: '#ffffff',
  },
}))
</script>

<template>
  <n-config-provider
    :theme="themeStore.theme === 'dark' ? darkTheme : null"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    :theme-overrides="themeOverrides"
  >
    <n-message-provider>
      <n-dialog-provider>
        <div class="app-shell">
          <aside class="sidebar">
            <div class="sidebar-logo">
              {{ t('app.name') }}
            </div>
            <nav class="sidebar-nav">
              <div
                v-for="item in menuOptions"
                :key="item.key"
                class="nav-item"
                :class="{ active: activeKey === item.key }"
                @click="$router.push(item.key)"
              >
                <n-icon><component :is="item.icon()" /></n-icon>
                <span>{{ item.label }}</span>
              </div>
            </nav>
            <div class="sidebar-footer">
              <span class="text-faint" style="font-size: 12px">v0.1.0</span>
              <n-button size="tiny" quaternary @click="themeStore.toggle()">
                {{ themeStore.theme === 'dark' ? t('theme.toLight') : t('theme.toDark') }}
              </n-button>
            </div>
          </aside>

          <main class="main-area">
            <n-layout style="height: 100%; background: transparent">
              <n-layout-content style="height: 100%; overflow: hidden">
                <router-view />
              </n-layout-content>
            </n-layout>
          </main>
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
