import { createI18n } from 'vue-i18n'
import { en, type MessageSchema } from './locales/en'
import { zh } from './locales/zh'

export const LOCALE_STORAGE_KEY = 'prom-editor.locale'
export type Locale = 'en' | 'zh'

export const SUPPORTED_LOCALES: { label: string; value: Locale }[] = [
  { label: 'English', value: 'en' },
  { label: '中文', value: 'zh' },
]

function initialLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  return saved === 'zh' ? 'zh' : 'en'
}

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en,
    zh,
  },
})

/** 切换语言并持久化 */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
}

/** 当前语言（非组件环境使用，如 mock 层） */
export function currentLocale(): Locale {
  return i18n.global.locale.value as Locale
}
