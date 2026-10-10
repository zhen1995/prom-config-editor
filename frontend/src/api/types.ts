/**
 * 与 Go 后端（Wails 绑定）完全对应的类型定义。
 * 前端只依赖这里的类型与 src/api/index.ts 暴露的 api 对象，
 * 将来切换到 Wails 生成的真实绑定时，前端业务代码零改动。
 */

/** 认证方式：密码 | 私钥 */
export type AuthType = 'password' | 'key'

/** 服务器连接配置（对应设计文档 4.1）。敏感字段不出现在该结构中。 */
export interface ServerProfile {
  id: string
  name: string
  host: string
  /** 默认 22 */
  port: number
  username: string
  authType: AuthType
  /** AuthType=key 时私钥文件路径 */
  keyPath?: string
  /** 密钥是否有口令（仅标记，不存值） */
  hasPassphrase?: boolean
  /** 远端 prometheus.yml 路径 */
  configPath: string
  /** 保留备份份数，默认 10 */
  backupKeep: number
  /** 重启命令/脚本，如 "systemctl restart prometheus" */
  restartScript: string
  /** 默认 http://<host>:9090/-/healthy */
  healthCheckUrl?: string
  /** 是否用 promtool 远程校验 */
  validateRemote: boolean
  createdAt: string
  updatedAt: string
}

/**
 * 保存连接配置的请求体。
 * password / passphrase 仅在保存时传入，之后不可回读；
 * 编辑时留空表示不修改。
 */
export interface SaveProfileRequest {
  id?: string
  name: string
  host: string
  port: number
  username: string
  authType: AuthType
  keyPath?: string
  hasPassphrase?: boolean
  configPath: string
  backupKeep: number
  restartScript: string
  healthCheckUrl?: string
  validateRemote: boolean
  password?: string
  passphrase?: string
}

export interface TestConnectionResult {
  ok: boolean
  message: string
  latencyMs?: number
}

export interface FetchConfigResult {
  content: string
}

export interface BackupInfo {
  name: string
  size: number
  createdAt: string
}

/** 同步部署步骤（对应设计文档 4.4 步骤表） */
export type DeployStep = 'backup' | 'validate' | 'upload' | 'restart' | 'healthcheck'

export type DeployStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export type DeployLogLevel = 'info' | 'success' | 'error'

export interface DeployLogEntry {
  time: string
  step: DeployStep
  level: DeployLogLevel
  message: string
}

/**
 * 部署过程事件流（将来对应 Wails runtime.EventsEmit 推送的事件）。
 * - step：某步骤状态变化
 * - log：某步骤输出一行日志
 * - finished：整个部署流程结束
 */
export type DeployEvent =
  | {
      kind: 'step'
      step: DeployStep
      status: DeployStepStatus
      time: string
      message?: string
    }
  | {
      kind: 'log'
      step: DeployStep
      level: DeployLogLevel
      message: string
      time: string
    }
  | {
      kind: 'finished'
      success: boolean
      time: string
      message?: string
    }

export type DeployEventCallback = (event: DeployEvent) => void

/** 与 Go 后端 Wails 绑定的 api 接口一一对应。 */
export interface PromEditorApi {
  /** 列出全部服务器连接配置 */
  listProfiles(): Promise<ServerProfile[]>
  /** 新建/更新连接配置（密码、passphrase 仅在本次传入） */
  saveProfile(req: SaveProfileRequest): Promise<ServerProfile>
  deleteProfile(id: string): Promise<void>
  /** 测试 SSH 连接 */
  testConnection(id: string): Promise<TestConnectionResult>
  /** 从服务器拉取 prometheus.yml 内容 */
  fetchConfig(profileId: string): Promise<FetchConfigResult>
  /**
   * 同步部署：备份 → 远程校验(可选) → 上传 → 重启 → 健康检查。
   * 进度通过 onDeployEvent 订阅的事件流推送。
   */
  syncDeploy(profileId: string, content: string): Promise<void>
  /** 列出服务器上的备份文件 */
  listBackups(profileId: string): Promise<BackupInfo[]>
  /** 从指定备份回滚配置 */
  rollback(profileId: string, backupName: string): Promise<void>

  onDeployEvent(cb: DeployEventCallback): void
  offDeployEvent(cb: DeployEventCallback): void
}
