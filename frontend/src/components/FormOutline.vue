<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NIcon } from 'naive-ui'
import { DocumentOutline, GlobeOutline, ListOutline, PulseOutline } from '@vicons/ionicons5'
import { useEditorStore } from '../stores/editor'

const { t } = useI18n()
const editorStore = useEditorStore()

interface OutlineGroup {
  key: string
  anchor: string
  label: string
  tag?: string
  icon: 'global' | 'rules' | 'jobs'
  children?: { anchor: string; label: string }[]
}

const groups = computed<OutlineGroup[]>(() => {
  const model = editorStore.model
  if (!model) return []
  const list: OutlineGroup[] = [
    { key: 'global', anchor: 'global', label: t('form.global'), tag: 'global', icon: 'global' },
    { key: 'rule-files', anchor: 'rule-files', label: t('form.ruleFiles'), tag: 'rule_files', icon: 'rules' },
  ]
  const jobs = Array.isArray(model.scrape_configs) ? model.scrape_configs : []
  if (jobs.length > 0) {
    list.push({
      key: 'scrape-configs',
      anchor: 'scrape-configs',
      label: t('form.scrapeConfigs'),
      tag: 'scrape_configs',
      icon: 'jobs',
      children: jobs.map((job, idx) => ({
        anchor: `job-${idx}`,
        label: typeof job.job_name === 'string' && job.job_name ? job.job_name : `${t('form.job')} ${idx + 1}`,
      })),
    })
  }
  return list
})

const activeAnchor = ref<string>('global')

/** 滚动监听：表单内容滚动时高亮当前所在区块 */
let observer: IntersectionObserver | null = null

function observeSections(): void {
  observer?.disconnect()
  const root = document.querySelector('.editor-body')
  if (!root) return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const anchor = (entry.target as HTMLElement).dataset.outlineAnchor
          if (anchor) activeAnchor.value = anchor
        }
      }
    },
    { root, rootMargin: '-20% 0px -65% 0px', threshold: 0 },
  )
  for (const el of root.querySelectorAll<HTMLElement>('[data-outline-anchor]')) {
    observer.observe(el)
  }
}

onMounted(observeSections)

// 新增/删除抓取任务后重新挂载观察
watch(
  () => groups.value.reduce((n, g) => n + (g.children?.length ?? 0), 0),
  () => setTimeout(observeSections, 0),
)

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

function scrollTo(anchor: string): void {
  activeAnchor.value = anchor
  document
    .getElementById(`pf-${anchor}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function iconOf(icon: OutlineGroup['icon']) {
  return icon === 'global' ? GlobeOutline : icon === 'rules' ? DocumentOutline : PulseOutline
}
</script>

<template>
  <nav class="form-outline">
    <div class="outline-title">
      <n-icon><ListOutline /></n-icon>
      {{ t('outline.title') }}
    </div>
    <template v-for="group in groups" :key="group.key">
      <div
        class="outline-item"
        :class="{ active: activeAnchor === group.anchor }"
        @click="scrollTo(group.anchor)"
      >
        <n-icon class="outline-icon"><component :is="iconOf(group.icon)" /></n-icon>
        <span class="outline-label">{{ group.label }}</span>
        <span v-if="group.tag" class="outline-tag">{{ group.tag }}</span>
      </div>
      <div
        v-for="child in group.children"
        :key="child.anchor"
        class="outline-item outline-child"
        :class="{ active: activeAnchor === child.anchor }"
        @click="scrollTo(child.anchor)"
      >
        <span class="outline-label mono">{{ child.label }}</span>
      </div>
    </template>
    <div v-if="groups.length === 0" class="outline-empty">{{ t('outline.empty') }}</div>
  </nav>
</template>

<style scoped>
.form-outline {
  width: 208px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  align-self: flex-start;
  max-height: 100%;
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
  border-left: 2px solid transparent;
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

.outline-child {
  padding-left: 32px;
  font-size: 12.5px;
}

.outline-empty {
  padding: 12px 10px;
  font-size: 12px;
  color: var(--text-faint);
}
</style>
