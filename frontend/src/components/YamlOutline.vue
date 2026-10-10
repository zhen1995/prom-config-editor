<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NIcon } from 'naive-ui'
import { CodeSlashOutline, ListOutline } from '@vicons/ionicons5'
import { isMap, isPair, isSeq, parseDocument } from 'yaml'
import type { Node } from 'yaml'
import { useEditorStore } from '../stores/editor'

const { t } = useI18n()
const editorStore = useEditorStore()

const emit = defineEmits<{
  (e: 'navigate', offset: number): void
}>()

interface YamlOutlineItem {
  /** 顶级键名 */
  key: string
  /** 字符偏移（跳转目标） */
  offset: number
  children?: { label: string; offset: number }[]
}

function nodeOffset(node: Node | null | undefined): number {
  return node?.range?.[0] ?? 0
}

/** 解析 YAML 文本，生成目录树；解析失败返回空 */
const items = computed<YamlOutlineItem[]>(() => {
  const text = editorStore.content
  if (!text.trim()) return []
  try {
    const doc = parseDocument(text)
    if (doc.errors.length > 0 || !isMap(doc.contents)) return []
    const out: YamlOutlineItem[] = []
    for (const pair of doc.contents.items) {
      if (!isPair(pair)) continue
      const key = String(pair.key)
      const item: YamlOutlineItem = { key, offset: nodeOffset(pair.key) }

      // scrape_configs 的子项：每个 job 的 job_name 行
      if (key === 'scrape_configs' && isSeq(pair.value)) {
        const children: { label: string; offset: number }[] = []
        for (const job of pair.value.items) {
          if (isMap(job)) {
            const jn = job.items.find((p) => isPair(p) && String(p.key) === 'job_name')
            children.push({
              label: jn ? String(jn.value) : t('form.job'),
              offset: nodeOffset(jn?.key ?? job),
            })
          } else if (job) {
            children.push({ label: t('form.job'), offset: nodeOffset(job) })
          }
        }
        item.children = children
      }
      out.push(item)
    }
    return out
  } catch {
    return []
  }
})

/** 根据光标位置计算当前应高亮的目录项 key（取最后一个 offset <= 光标的项） */
const activeKey = computed(() => {
  const cursor = editorStore.cursorOffset
  let active: string | null = null
  for (const item of items.value) {
    if (item.offset <= cursor) active = item.key
    else break
  }
  return active
})

const activeChild = computed(() => {
  const cursor = editorStore.cursorOffset
  const parent = items.value.find((i) => i.key === 'scrape_configs')
  if (!parent?.children) return null
  let active: string | null = null
  for (const c of parent.children) {
    if (c.offset <= cursor) active = c.label
    else break
  }
  return active
})

function navigate(offset: number): void {
  emit('navigate', offset)
}
</script>

<template>
  <nav class="yaml-outline">
    <div class="outline-title">
      <n-icon><ListOutline /></n-icon>
      {{ t('outline.title') }}
    </div>
    <template v-for="item in items" :key="item.key">
      <div
        v-if="!item.children"
        class="outline-item"
        :class="{ active: activeKey === item.key }"
        @click="navigate(item.offset)"
      >
        <n-icon class="outline-icon"><CodeSlashOutline /></n-icon>
        <span class="outline-label mono">{{ item.key }}</span>
      </div>
      <template v-else>
        <div
          class="outline-item outline-parent"
          :class="{ active: activeKey === item.key && !activeChild }"
          @click="navigate(item.offset)"
        >
          <n-icon class="outline-icon"><CodeSlashOutline /></n-icon>
          <span class="outline-label">{{ item.key }}</span>
          <span class="outline-tag">{{ item.children.length }}</span>
        </div>
        <div
          v-for="child in item.children"
          :key="child.offset"
          class="outline-item outline-child"
          :class="{ active: activeKey === item.key && activeChild === child.label }"
          @click="navigate(child.offset)"
        >
          <span class="outline-label mono">{{ child.label }}</span>
        </div>
      </template>
    </template>
  </nav>
</template>

<style scoped>
.yaml-outline {
  width: 208px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 8px 10px 16px 4px;
}

.outline-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-faint);
  letter-spacing: 1px;
  padding: 4px 10px 10px;
  text-transform: uppercase;
}

.outline-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.outline-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.outline-item.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.outline-icon {
  font-size: 14px;
  display: flex;
  flex-shrink: 0;
  opacity: 0.8;
}

.outline-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.outline-tag {
  font-size: 10.5px;
  color: var(--text-faint);
  background: var(--bg-elevated);
  border-radius: 4px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.outline-item.active .outline-tag {
  color: var(--accent);
  background: transparent;
}

.outline-parent {
  font-weight: 600;
}

.outline-child {
  padding-left: 32px;
  font-size: 12.5px;
}
</style>
