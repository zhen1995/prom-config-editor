<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NFormItem, NGrid, NGridItem, NIcon, NInput, NSelect, NSpace, NText } from 'naive-ui'
import { AddOutline, TrashOutline } from '@vicons/ionicons5'
import { useEditorStore } from '../stores/editor'
import type { PromConfigModel, ScrapeJob, StaticConfig } from '../stores/editor'

const { t } = useI18n()
const editorStore = useEditorStore()

const model = computed<PromConfigModel>(() => editorStore.model ?? {})

const schemeOptions = [
  { label: 'http', value: 'http' },
  { label: 'https', value: 'https' },
]

/** 顶级已保留（不在表单中编辑）的段落提示 */
const passthroughSections = computed(() => {
  const known = ['global', 'rule_files', 'scrape_configs']
  return Object.keys(model.value).filter((k) => !known.includes(k))
})

function ensureGlobal(): NonNullable<PromConfigModel['global']> {
  if (!model.value.global) model.value.global = {}
  return model.value.global
}

function ensureJobs(): ScrapeJob[] {
  if (!model.value.scrape_configs) model.value.scrape_configs = []
  return model.value.scrape_configs as ScrapeJob[]
}

/** 任何表单修改统一走这里：序列化回 YAML 文本并标记 dirty */
function commit(): void {
  editorStore.applyModel(model.value)
}

// ---- global ----

function setGlobalField(key: string, value: string | undefined): void {
  const g = ensureGlobal()
  if (value === undefined || value === '') {
    delete g[key]
  } else {
    g[key] = value
  }
  commit()
}

function globalField(key: string): string | undefined {
  const v = model.value.global?.[key]
  return typeof v === 'string' ? v : undefined
}

function externalLabels(): [string, string][] {
  return Object.entries(model.value.global?.external_labels ?? {})
}

function setExternalLabel(index: number, key: string, value: string): void {
  const g = ensureGlobal()
  const entries = externalLabels()
  const oldKey = entries[index]?.[0]
  if (oldKey === undefined) return
  if (!g.external_labels) g.external_labels = {}
  if (oldKey !== key) delete g.external_labels[oldKey]
  g.external_labels[key] = value
  commit()
}

function addExternalLabel(): void {
  ensureGlobal().external_labels = { ...model.value.global?.external_labels, '': '' }
  commit()
}

function removeExternalLabel(key: string): void {
  const g = model.value.global
  if (g?.external_labels) {
    delete g.external_labels[key]
    commit()
  }
}

// ---- rule_files ----

function ruleFilesText(): string {
  return (model.value.rule_files ?? []).join('\n')
}

function setRuleFiles(text: string): void {
  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (lines.length > 0) {
    model.value.rule_files = lines
  } else {
    delete model.value.rule_files
  }
  commit()
}

// ---- scrape_configs ----

function addJob(): void {
  ensureJobs().push({ job_name: `new-job-${(model.value.scrape_configs?.length ?? 0) + 1}`, static_configs: [{ targets: [] }] })
  commit()
}

function removeJob(index: number): void {
  ensureJobs().splice(index, 1)
  commit()
}

function setJobField(job: ScrapeJob, key: string, value: unknown): void {
  if (value === undefined || value === '') {
    delete job[key]
  } else {
    job[key] = value
  }
  commit()
}

function jobField(job: ScrapeJob, key: string): string | undefined {
  const v = job[key]
  return typeof v === 'string' ? v : undefined
}

function ensureStatics(job: ScrapeJob): StaticConfig[] {
  if (!job.static_configs) job.static_configs = []
  return job.static_configs
}

function addStatic(job: ScrapeJob): void {
  ensureStatics(job).push({ targets: [] })
  commit()
}

function removeStatic(job: ScrapeJob, index: number): void {
  ensureStatics(job).splice(index, 1)
  commit()
}

function targetsText(sc: StaticConfig): string {
  return (sc.targets ?? []).join('\n')
}

function setTargets(sc: StaticConfig, text: string): void {
  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  sc.targets = lines
  commit()
}

function staticLabels(sc: StaticConfig): [string, string][] {
  return Object.entries(sc.labels ?? {})
}

function setStaticLabel(sc: StaticConfig, index: number, key: string, value: string): void {
  const entries = staticLabels(sc)
  const oldKey = entries[index]?.[0]
  if (oldKey === undefined) return
  if (!sc.labels) sc.labels = {}
  if (oldKey !== key) delete sc.labels[oldKey]
  sc.labels[key] = value
  commit()
}

function addStaticLabel(sc: StaticConfig): void {
  sc.labels = { ...sc.labels, '': '' }
  commit()
}

function removeStaticLabel(sc: StaticConfig, key: string): void {
  if (sc.labels) {
    delete sc.labels[key]
    commit()
  }
}
</script>

<template>
  <div class="form-root">
    <!-- 全局配置 -->
    <section id="pf-global" data-outline-anchor="global" class="soft-card form-section">
      <h3 class="section-title">{{ t('form.global') }} <span class="section-tag mono">global</span></h3>
      <n-grid :cols="2" :x-gap="16">
        <n-grid-item>
          <n-form-item :label="t('form.scrapeInterval')">
            <n-input :value="globalField('scrape_interval')" placeholder="15s" @update:value="(v: string) => setGlobalField('scrape_interval', v)" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item :label="t('form.evaluationInterval')">
            <n-input :value="globalField('evaluation_interval')" placeholder="15s" @update:value="(v: string) => setGlobalField('evaluation_interval', v)" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item :label="t('form.scrapeTimeout')">
            <n-input :value="globalField('scrape_timeout')" placeholder="10s" @update:value="(v: string) => setGlobalField('scrape_timeout', v)" />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <div class="sub-divider">{{ t('form.externalLabels') }} <span class="mono text-faint">external_labels</span></div>
      <n-space vertical size="small">
        <div v-for="([key, value], idx) in externalLabels()" :key="idx" class="kv-row">
          <n-input :value="key" :placeholder="t('form.labelName')" style="width: 200px" @update:value="(v: string) => setExternalLabel(idx, v, value)" />
          <span class="text-faint">=</span>
          <n-input :value="value" :placeholder="t('form.labelValue')" style="width: 240px" @update:value="(v: string) => setExternalLabel(idx, key, v)" />
          <n-button size="small" quaternary type="error" @click="removeExternalLabel(key)">
            <n-icon><TrashOutline /></n-icon>
          </n-button>
        </div>
        <n-button size="small" dashed @click="addExternalLabel">
          <n-icon><AddOutline /></n-icon> {{ t('form.addLabel') }}
        </n-button>
      </n-space>
    </section>

    <!-- 规则文件 -->
    <section id="pf-rule-files" data-outline-anchor="rule-files" class="soft-card form-section">
      <h3 class="section-title">{{ t('form.ruleFiles') }} <span class="section-tag mono">rule_files</span></h3>
      <n-input
        type="textarea"
        :value="ruleFilesText()"
        :rows="2"
        :placeholder="t('form.ruleFilesPlaceholder')"
        @update:value="setRuleFiles"
      />
    </section>

    <!-- 抓取任务 -->
    <div id="pf-scrape-configs" data-outline-anchor="scrape-configs" class="jobs-header">
      <h3 class="section-title" style="margin: 0">{{ t('form.scrapeConfigs') }} <span class="section-tag mono">scrape_configs</span></h3>
      <n-button size="small" type="primary" dashed @click="addJob">
        <n-icon><AddOutline /></n-icon> {{ t('form.addJob') }}
      </n-button>
    </div>

    <section
      v-for="(job, jobIdx) in model.scrape_configs ?? []"
      :id="`pf-job-${jobIdx}`"
      :data-outline-anchor="`job-${jobIdx}`"
      :key="jobIdx"
      class="soft-card job-card"
    >
      <div class="job-card-head">
        <span class="job-index mono">{{ jobIdx + 1 }}</span>
        <span class="job-name">{{ job.job_name || `${t('form.job')} ${jobIdx + 1}` }}</span>
        <n-button size="small" quaternary type="error" @click="removeJob(jobIdx)">
          <n-icon><TrashOutline /></n-icon> {{ t('form.deleteJob') }}
        </n-button>
      </div>

      <n-grid :cols="3" :x-gap="16">
        <n-grid-item>
          <n-form-item :label="t('form.jobName')">
            <n-input :value="jobField(job, 'job_name')" @update:value="(v: string) => setJobField(job, 'job_name', v)" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item :label="t('form.scrapeIntervalJob')">
            <n-input :value="jobField(job, 'scrape_interval')" :placeholder="t('form.inheritGlobal')" @update:value="(v: string) => setJobField(job, 'scrape_interval', v)" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item :label="t('form.scheme')">
            <n-select :value="jobField(job, 'scheme') ?? 'http'" :options="schemeOptions" @update:value="(v: string) => setJobField(job, 'scheme', v)" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item span="2">
          <n-form-item :label="t('form.metricsPath')">
            <n-input :value="jobField(job, 'metrics_path')" :placeholder="t('form.metricsPathPlaceholder')" @update:value="(v: string) => setJobField(job, 'metrics_path', v)" />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <div class="sub-divider">{{ t('form.targets') }} <span class="mono text-faint">static_configs</span></div>
      <div v-for="(sc, scIdx) in job.static_configs ?? []" :key="scIdx" class="static-group">
        <div class="static-group-head">
          <span class="text-faint" style="font-size: 12px">{{ t('form.targetGroup', { n: scIdx + 1 }) }}</span>
          <n-button size="tiny" quaternary type="error" @click="removeStatic(job, scIdx)">{{ t('form.remove') }}</n-button>
        </div>
        <n-form-item :label="t('form.targetsLabel')">
          <n-input type="textarea" :rows="3" :value="targetsText(sc)" :placeholder="t('form.targetsPlaceholder')" @update:value="(v: string) => setTargets(sc, v)" />
        </n-form-item>
        <div v-for="([k, v], labelIdx) in staticLabels(sc)" :key="labelIdx" class="kv-row">
          <n-input :value="k" :placeholder="t('form.labelName')" style="width: 180px" @update:value="(nv: string) => setStaticLabel(sc, labelIdx, nv, v)" />
          <span class="text-faint">=</span>
          <n-input :value="v" :placeholder="t('form.labelValue')" style="width: 220px" @update:value="(nv: string) => setStaticLabel(sc, labelIdx, k, nv)" />
          <n-button size="tiny" quaternary type="error" @click="removeStaticLabel(sc, k)">
            <n-icon><TrashOutline /></n-icon>
          </n-button>
        </div>
        <n-button size="tiny" dashed @click="addStaticLabel(sc)">{{ t('form.addLabel') }}</n-button>
      </div>
      <n-button size="small" dashed @click="addStatic(job)">{{ t('form.addTargetGroup') }}</n-button>

      <n-text v-if="job.relabel_configs" depth="3" style="font-size: 12px; display: block; margin-top: 10px">
        {{ t('form.relabelNote') }}
      </n-text>
    </section>

    <div v-if="passthroughSections.length > 0" class="passthrough-note">
      {{ t('form.passthroughNote', { sections: '' }) }}
      <span class="mono">{{ passthroughSections.join('、') }}</span>
    </div>
  </div>
</template>

<style scoped>
.form-root {
  max-width: 960px;
  margin: 0 auto;
  padding-bottom: 24px;
}

.form-section {
  padding: 18px 20px;
  margin-bottom: 16px;
}

.section-title {
  margin: 0 0 14px;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-tag {
  font-size: 11px;
  font-weight: 400;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 8px;
  border-radius: 6px;
}

.sub-divider {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 14px 0 10px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}

.kv-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.jobs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 22px 0 14px;
}

.job-card {
  padding: 16px 20px;
  margin-bottom: 14px;
}

.job-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.job-index {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.job-name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.static-group {
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 10px;
}

.static-group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.passthrough-note {
  font-size: 12px;
  color: var(--text-faint);
  margin-top: 8px;
}
</style>
