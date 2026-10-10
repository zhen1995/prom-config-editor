/**
 * 基于 Wails 生成绑定的真实实现。
 * 依赖 frontend/wailsjs（由 `wails build` / `wails dev` 自动生成）。
 * 仅在桌面应用（window.go.main.App 存在）环境下使用，浏览器开发时回退到 mock。
 */
import {
  DeleteProfile,
  FetchConfig,
  ListBackups,
  ListProfiles,
  Rollback,
  SaveProfile,
  SyncDeploy,
  TestConnection,
} from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'
import type {
  BackupInfo,
  DeployEvent,
  DeployEventCallback,
  FetchConfigResult,
  PromEditorApi,
  SaveProfileRequest,
  ServerProfile,
  TestConnectionResult,
} from './types'

const DEPLOY_EVENT = 'deploy:event'

/** EventsOn 返回取消函数；按回调记录以便精确注销 */
const unsubscribers = new Map<DeployEventCallback, () => void>()

export const wailsApi: PromEditorApi = {
  listProfiles(): Promise<ServerProfile[]> {
    return ListProfiles() as Promise<ServerProfile[]>
  },

  saveProfile(req: SaveProfileRequest): Promise<ServerProfile> {
    // 生成的模型类型与本目录 types 一致，仅在模块边界处做一次断言
    return SaveProfile(req as never) as Promise<ServerProfile>
  },

  deleteProfile(id: string): Promise<void> {
    return DeleteProfile(id)
  },

  testConnection(id: string): Promise<TestConnectionResult> {
    return TestConnection(id) as Promise<TestConnectionResult>
  },

  fetchConfig(profileId: string): Promise<FetchConfigResult> {
    return FetchConfig(profileId) as Promise<FetchConfigResult>
  },

  syncDeploy(profileId: string, content: string): Promise<void> {
    return SyncDeploy(profileId, content)
  },

  listBackups(profileId: string): Promise<BackupInfo[]> {
    return ListBackups(profileId) as Promise<BackupInfo[]>
  },

  rollback(profileId: string, backupName: string): Promise<void> {
    return Rollback(profileId, backupName)
  },

  onDeployEvent(cb: DeployEventCallback): void {
    const unsub = EventsOn(DEPLOY_EVENT, (event: DeployEvent) => cb(event))
    unsubscribers.set(cb, unsub)
  },

  offDeployEvent(cb: DeployEventCallback): void {
    const unsub = unsubscribers.get(cb)
    if (unsub) {
      unsub()
      unsubscribers.delete(cb)
    }
  },
}
