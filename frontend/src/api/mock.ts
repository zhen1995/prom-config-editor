import { i18n } from '../i18n'
import type {
  BackupInfo,
  DeployEvent,
  DeployEventCallback,
  DeployLogLevel,
  DeployStep,
  FetchConfigResult,
  PromEditorApi,
  SaveProfileRequest,
  ServerProfile,
  TestConnectionResult,
} from './types'

/** 一份有真实感的示例 prometheus.yml（mock 环境首次拉取时返回）。 */
const SAMPLE_PROMETHEUS_YML = `# 全局配置
global:
  scrape_interval: 15s        # 抓取间隔
  evaluation_interval: 15s    # 规则评估间隔
  scrape_timeout: 10s         # 单次抓取超时
  external_labels:
    cluster: 'prod-beijing'
    region: 'cn-north-1'

# 规则文件
rule_files:
  - "rules/node_alerts.yml"
  - "rules/service_alerts.yml"

# 告警管理
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["10.0.0.10:9093"]

# 抓取配置
scrape_configs:
  # Prometheus 自身
  - job_name: "prometheus"
    static_configs:
      - targets: ["localhost:9090"]

  # 节点 exporter
  - job_name: "node-exporter"
    scrape_interval: 30s
    static_configs:
      - targets:
          - "10.0.0.11:9100"
          - "10.0.0.12:9100"
          - "10.0.0.13:9100"
        labels:
          env: "production"
          team: "infra"

  # 应用服务（带 relabel 示例：重写 metrics 路径 + 丢弃多余标签）
  - job_name: "app-services"
    metrics_path: "/internal/metrics"
    scheme: "https"
    static_configs:
      - targets:
          - "10.0.1.21:8443"
          - "10.0.1.22:8443"
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        regex: "(.*):.*"
        replacement: "$1"
        action: replace
      - regex: "container_label_.*"
        action: labeldrop

  # 黑盒探测
  - job_name: "blackbox-http"
    metrics_path: "/probe"
    params:
      module: ["http_2xx"]
    static_configs:
      - targets:
          - "https://example.com"
          - "https://api.example.com"
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: "10.0.0.30:9115"

# 远程写入（示例：未知字段透传验证用）
remote_write:
  - url: "http://10.0.0.40:8428/api/v1/write"
    queue_config:
      max_shards: 10
`

const STORAGE_KEYS = {
  profiles: 'prom-editor.mock.profiles.v2',
  contents: 'prom-editor.mock.contents.v2',
  backups: 'prom-editor.mock.backups.v2',
}

interface StoredBackup extends BackupInfo {
  content: string
}

type BackupMap = Record<string, StoredBackup[]>

const now = (): string => new Date().toISOString()
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const byteSize = (s: string): number => new TextEncoder().encode(s).length

function loadJSON<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function seedProfiles(): ServerProfile[] {
  const t = now()
  return [
    {
      id: crypto.randomUUID(),
      name: '生产集群 · 北京',
      host: '192.168.10.21',
      port: 22,
      username: 'ops',
      authType: 'key',
      keyPath: 'C:\\Users\\ops\\.ssh\\id_ed25519',
      hasPassphrase: true,
      configPath: '/etc/prometheus/prometheus.yml',
      backupKeep: 10,
      restartScript: 'sudo systemctl restart prometheus',
      healthCheckUrl: 'http://192.168.10.21:9090/-/healthy',
      validateRemote: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: crypto.randomUUID(),
      name: '生产集群 · 上海',
      host: '192.168.20.21',
      port: 22,
      username: 'ops',
      authType: 'key',
      keyPath: 'C:\\Users\\ops\\.ssh\\id_ed25519',
      hasPassphrase: true,
      configPath: '/etc/prometheus/prometheus.yml',
      backupKeep: 10,
      restartScript: 'sudo systemctl restart prometheus',
      healthCheckUrl: 'http://192.168.20.21:9090/-/healthy',
      validateRemote: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: crypto.randomUUID(),
      name: '测试环境',
      host: '10.30.0.15',
      port: 22,
      username: 'dev',
      authType: 'password',
      configPath: '/opt/prometheus/prometheus.yml',
      backupKeep: 5,
      restartScript: 'sudo systemctl restart prometheus',
      healthCheckUrl: 'http://10.30.0.15:9090/-/healthy',
      validateRemote: false,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: crypto.randomUUID(),
      name: 'Docker 实验机',
      host: '10.30.0.99',
      port: 22,
      username: 'root',
      authType: 'password',
      configPath: '/root/prometheus/prometheus.yml',
      backupKeep: 3,
      restartScript: 'docker restart prometheus',
      healthCheckUrl: 'http://10.30.0.99:9090/-/healthy',
      validateRemote: false,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: crypto.randomUUID(),
      name: '故障演练环境',
      host: 'fail.demo.local',
      port: 2222,
      username: 'root',
      authType: 'password',
      configPath: '/opt/prometheus/prometheus.yml',
      backupKeep: 5,
      restartScript: 'sudo systemctl restart prometheus',
      healthCheckUrl: 'http://fail.demo.local:9090/-/healthy',
      validateRemote: false,
      createdAt: t,
      updatedAt: t,
    },
  ]
}

/** 为首个 profile 预置几份历史备份，让回滚功能开箱可演示 */
function seedBackups(profiles: ServerProfile[]): BackupMap {
  const map: BackupMap = {}
  const first = profiles[0]
  if (!first) return map
  const mk = (daysAgo: number, mutate: (lines: string[]) => string): StoredBackup => {
    const base = SAMPLE_PROMETHEUS_YML.split('\n')
    const content = mutate([...base])
    const created = new Date(Date.now() - daysAgo * 86400_000).toISOString()
    return {
      name: `prometheus.yml.bak-${created.replace(/[:.]/g, '-')}`,
      size: byteSize(content),
      createdAt: created,
      content,
    }
  }
  map[first.id] = [
    mk(1, (lines) => {
      const i = lines.findIndex((l) => l.includes('10.0.0.13:9100'))
      if (i >= 0) lines.splice(i, 1)
      return lines.join('\n')
    }),
    mk(3, (lines) =>
      lines
        .map((l) => (l.includes('scrape_interval: 15s') ? l.replace('15s', '30s') : l))
        .join('\n'),
    ),
    mk(7, (lines) => lines.join('\n')),
  ]
  return map
}

class MockApi implements PromEditorApi {
  private profiles: ServerProfile[]
  private contents: Record<string, string>
  private backups: BackupMap
  private listeners = new Set<DeployEventCallback>()

  constructor() {
    let profiles = loadJSON<ServerProfile[] | null>(STORAGE_KEYS.profiles, null)
    if (profiles === null) {
      profiles = seedProfiles()
      saveJSON(STORAGE_KEYS.profiles, profiles)
    }
    this.profiles = profiles
    this.contents = loadJSON<Record<string, string>>(STORAGE_KEYS.contents, {})
    this.backups = loadJSON<BackupMap>(STORAGE_KEYS.backups, {})
    if (Object.keys(this.backups).length === 0) {
      this.backups = seedBackups(this.profiles)
      saveJSON(STORAGE_KEYS.backups, this.backups)
    }
  }

  private persist(): void {
    saveJSON(STORAGE_KEYS.profiles, this.profiles)
    saveJSON(STORAGE_KEYS.contents, this.contents)
    saveJSON(STORAGE_KEYS.backups, this.backups)
  }

  private mustFind(id: string): ServerProfile {
    const p = this.profiles.find((item) => item.id === id)
    if (!p) throw new Error(`连接配置不存在: ${id}`)
    return p
  }

  private emit(event: DeployEvent): void {
    for (const cb of this.listeners) cb(event)
  }

  private emitLog(step: DeployStep, message: string, level: DeployLogLevel = 'info'): void {
    this.emit({ kind: 'log', step, level, message, time: now() })
  }

  onDeployEvent(cb: DeployEventCallback): void {
    this.listeners.add(cb)
  }

  offDeployEvent(cb: DeployEventCallback): void {
    this.listeners.delete(cb)
  }

  async listProfiles(): Promise<ServerProfile[]> {
    await delay(200)
    return this.profiles.map((p) => ({ ...p }))
  }

  async saveProfile(req: SaveProfileRequest): Promise<ServerProfile> {
    await delay(400)
    const t = now()
    if (req.id) {
      const idx = this.profiles.findIndex((p) => p.id === req.id)
      if (idx === -1) throw new Error(`连接配置不存在: ${req.id}`)
      const prev = this.profiles[idx] as ServerProfile
      const updated: ServerProfile = {
        ...prev,
        name: req.name,
        host: req.host,
        port: req.port,
        username: req.username,
        authType: req.authType,
        keyPath: req.keyPath,
        hasPassphrase:
          req.authType === 'key' ? req.passphrase !== undefined && req.passphrase !== '' : false,
        configPath: req.configPath,
        backupKeep: req.backupKeep,
        restartScript: req.restartScript,
        healthCheckUrl: req.healthCheckUrl,
        validateRemote: req.validateRemote,
        updatedAt: t,
      }
      this.profiles[idx] = updated
      this.persist()
      return { ...updated }
    }
    const created: ServerProfile = {
      id: crypto.randomUUID(),
      name: req.name,
      host: req.host,
      port: req.port,
      username: req.username,
      authType: req.authType,
      keyPath: req.authType === 'key' ? req.keyPath : undefined,
      hasPassphrase:
        req.authType === 'key' ? req.passphrase !== undefined && req.passphrase !== '' : false,
      configPath: req.configPath,
      backupKeep: req.backupKeep,
      restartScript: req.restartScript,
      healthCheckUrl: req.healthCheckUrl,
      validateRemote: req.validateRemote,
      createdAt: t,
      updatedAt: t,
    }
    this.profiles.push(created)
    this.persist()
    return { ...created }
  }

  async deleteProfile(id: string): Promise<void> {
    await delay(300)
    const idx = this.profiles.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error(`连接配置不存在: ${id}`)
    this.profiles.splice(idx, 1)
    delete this.contents[id]
    delete this.backups[id]
    this.persist()
  }

  async testConnection(id: string): Promise<TestConnectionResult> {
    const profile = this.mustFind(id)
    await delay(800)
    if (profile.host.includes('fail')) {
      return {
        ok: false,
        message: i18n.global.t('profiles.testFailed', {
          host: profile.host,
          port: profile.port,
        }),
      }
    }
    return {
      ok: true,
      message: i18n.global.t('profiles.testOk', {
        user: profile.username,
        host: profile.host,
        port: profile.port,
      }),
      latencyMs: Math.round(20 + Math.random() * 100),
    }
  }

  async fetchConfig(profileId: string): Promise<FetchConfigResult> {
    const profile = this.mustFind(profileId)
    await delay(600)
    const content = this.contents[profileId] ?? SAMPLE_PROMETHEUS_YML
    this.emitLog(
      'backup',
      i18n.global.t('mock.pulling', {
        user: profile.username,
        host: profile.host,
        path: profile.configPath,
      }),
    )
    return { content }
  }

  async listBackups(profileId: string): Promise<BackupInfo[]> {
    this.mustFind(profileId)
    await delay(300)
    return (this.backups[profileId] ?? []).map(({ name, size, createdAt }) => ({
      name,
      size,
      createdAt,
    }))
  }

  async rollback(profileId: string, backupName: string): Promise<void> {
    this.mustFind(profileId)
    await delay(600)
    const list = this.backups[profileId] ?? []
    const backup = list.find((b) => b.name === backupName)
    if (!backup) throw new Error(`备份不存在: ${backupName}`)
    this.contents[profileId] = backup.content
    this.persist()
  }

  async syncDeploy(profileId: string, content: string): Promise<void> {
    const profile = this.mustFind(profileId)
    const previous = this.contents[profileId] ?? SAMPLE_PROMETHEUS_YML
    const configPath = profile.configPath

    const stepMs = 600
    const lineMs = 180

    const runStep = async (
      step: DeployStep,
      lines: string[],
    ): Promise<'ok' | 'skipped'> => {
      this.emit({ kind: 'step', step, status: 'running', time: now() })
      for (const line of lines) {
        await delay(lineMs)
        this.emitLog(step, line)
      }
      await delay(stepMs - lines.length * lineMs)
      this.emit({ kind: 'step', step, status: 'success', time: now() })
      return 'ok'
    }

    await delay(300)

    // 1. 备份
    const backupName = `prometheus.yml.bak-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}`
    this.emit({ kind: 'step', step: 'backup', status: 'running', time: now() })
    await delay(lineMs)
    this.emitLog('backup', `$ cp ${configPath} ${configPath}.${backupName.replace('prometheus.yml.', '')}`)
    await delay(lineMs)
    this.emitLog('backup', i18n.global.t('mock.backedUp', { n: profile.backupKeep }))
    await delay(stepMs - 2 * lineMs)
    const backupList = this.backups[profileId] ?? []
    backupList.unshift({
      name: backupName,
      size: byteSize(previous),
      createdAt: now(),
      content: previous,
    })
    this.backups[profileId] = backupList.slice(0, Math.max(1, profile.backupKeep))
    this.persist()
    this.emit({ kind: 'step', step: 'backup', status: 'success', time: now() })

    // 2. 远程校验（可选）
    const tmpValidate = `/tmp/prom-editor-validate-${profileId.slice(0, 8)}.yml`
    if (profile.validateRemote) {
      this.emit({ kind: 'step', step: 'validate', status: 'running', time: now() })
      await delay(lineMs)
      this.emitLog('validate', i18n.global.t('mock.validateUploadTmp', { path: tmpValidate }))
      await delay(lineMs)
      this.emitLog('validate', i18n.global.t('mock.validateRun', { path: tmpValidate }))
      await delay(lineMs)
      this.emitLog('validate', i18n.global.t('mock.validateChecking', { path: tmpValidate }), 'success')
      this.emitLog('validate', i18n.global.t('mock.validateOk', { n: 4 }), 'success')
      await delay(stepMs - 3 * lineMs)
      this.emit({ kind: 'step', step: 'validate', status: 'success', time: now() })
    } else {
      this.emit({
        kind: 'step',
        step: 'validate',
        status: 'skipped',
        time: now(),
        message: i18n.global.t('mock.skippedValidate'),
      })
    }

    // 3. 上传（先写 .tmp 再 mv，保证原子性）
    await runStep('upload', [
      i18n.global.t('mock.uploadTmp', { path: `${configPath}.tmp`, size: byteSize(content) }),
      i18n.global.t('mock.uploadMv', { src: `${configPath}.tmp`, dst: configPath }),
      i18n.global.t('mock.uploadDone'),
    ])

    // 4. 重启
    this.emit({ kind: 'step', step: 'restart', status: 'running', time: now() })
    await delay(lineMs)
    this.emitLog('restart', i18n.global.t('mock.restartRun', { script: profile.restartScript }))
    await delay(lineMs + 200)
    if (profile.restartScript.includes('fail')) {
      this.emitLog('restart', i18n.global.t('mock.restartFailMsg'), 'error')
      this.emitLog('restart', i18n.global.t('mock.restartExit1'), 'error')
      await delay(200)
      this.emit({ kind: 'step', step: 'restart', status: 'failed', time: now() })
      this.emit({
        kind: 'finished',
        success: false,
        time: now(),
        message: i18n.global.t('mock.finishErr'),
      })
      throw new Error('restart script exited non-zero (mock)')
    }
    this.emitLog('restart', i18n.global.t('mock.restartExit0'), 'success')
    await delay(stepMs - 2 * lineMs - 200)
    this.emit({ kind: 'step', step: 'restart', status: 'success', time: now() })

    // 5. 健康检查
    this.emit({ kind: 'step', step: 'healthcheck', status: 'running', time: now() })
    await delay(lineMs)
    const healthUrl = profile.healthCheckUrl ?? `http://${profile.host}:9090/-/healthy`
    this.emitLog('healthcheck', i18n.global.t('mock.healthGet', { url: healthUrl }))
    await delay(lineMs + 150)
    this.emitLog('healthcheck', i18n.global.t('mock.healthOk'), 'success')
    await delay(stepMs - 2 * lineMs - 150)
    this.emit({ kind: 'step', step: 'healthcheck', status: 'success', time: now() })

    this.contents[profileId] = content
    this.persist()
    this.emit({ kind: 'finished', success: true, time: now(), message: i18n.global.t('mock.finishOk') })
  }
}

export const mockApi: PromEditorApi = new MockApi()
