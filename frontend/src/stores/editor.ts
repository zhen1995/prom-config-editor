import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { parseDocument, stringify } from 'yaml'

export type EditorViewMode = 'form' | 'yaml'

/** 表单视图可编辑的 prometheus.yml 结构（未知字段在整文档对象中原样保留） */
export interface StaticConfig {
  targets?: string[]
  labels?: Record<string, string>
}

export interface ScrapeJob {
  job_name?: string
  scrape_interval?: string
  scrape_timeout?: string
  metrics_path?: string
  scheme?: string
  static_configs?: StaticConfig[]
  [key: string]: unknown
}

export interface PromConfigModel {
  global?: {
    scrape_interval?: string
    evaluation_interval?: string
    scrape_timeout?: string
    external_labels?: Record<string, string>
    [key: string]: unknown
  }
  rule_files?: string[]
  scrape_configs?: ScrapeJob[]
  [key: string]: unknown
}

export interface ParseError {
  message: string
  line?: number
}

export const useEditorStore = defineStore('editor', () => {
  /** 单一数据源：YAML 文本 */
  const content = ref('')
  const dirty = ref(false)
  const viewMode = ref<EditorViewMode>('yaml')
  const loading = ref(false)
  /** 最近一次解析错误（进入表单视图前校验） */
  const parseError = ref<ParseError | null>(null)
  /** 表单视图持有的整文档对象（含未覆盖字段，序列化后透传） */
  const model = ref<PromConfigModel | null>(null)
  /** YAML 编辑器当前光标位置（字符偏移），用于目录高亮 */
  const cursorOffset = ref(0)

  const hasContent = computed(() => content.value.trim().length > 0)

  function setContent(next: string, markDirty = true): void {
    content.value = next
    parseError.value = null
    dirty.value = markDirty
  }

  /** 拉取远端内容后的装载：重置 dirty 并默认进入表单视图 */
  function loadRemote(next: string): void {
    content.value = next
    model.value = null
    parseError.value = null
    dirty.value = false
    enterFormView()
  }

  function markSaved(): void {
    dirty.value = false
  }

  /**
   * 进入表单视图：解析 YAML，失败则返回 false 并记录错误（含行号）。
   */
  function enterFormView(): boolean {
    try {
      const doc = parseDocument(content.value)
      if (doc.errors.length > 0) {
        const err = doc.errors[0]
        parseError.value = { message: err.message, line: err.linePos?.[0]?.line }
        return false
      }
      const value = doc.toJS() as PromConfigModel | null
      model.value = value ?? {}
      parseError.value = null
      viewMode.value = 'form'
      return true
    } catch (err) {
      parseError.value = { message: err instanceof Error ? err.message : String(err) }
      return false
    }
  }

  function enterYamlView(): void {
    viewMode.value = 'yaml'
  }

  /** 表单编辑后把整文档对象序列化回 YAML 文本（未覆盖字段原样保留） */
  function applyModel(next: PromConfigModel): void {
    model.value = next
    content.value = stringify(next)
    dirty.value = true
  }

  return {
    content,
    dirty,
    viewMode,
    loading,
    parseError,
    model,
    cursorOffset,
    hasContent,
    setContent,
    loadRemote,
    markSaved,
    enterFormView,
    enterYamlView,
    applyModel,
  }
})
