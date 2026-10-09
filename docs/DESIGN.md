# 设计文档：Prometheus 配置可视化编辑器（prom-editor）

- 版本：v1.0（草案）
- 日期：2026-10-09
- 状态：待评审
- 说明：本文档为纯设计文档，不包含实现代码。

## 1. 概述

一款基于 **Go + Wails v2** 的跨平台桌面 GUI 应用，用于：

1. 管理多台服务器的 SSH 连接配置（密码 / 私钥认证）；
2. 从服务器下载 Prometheus 配置文件（路径可配）；
3. 以**结构化表单 + 原始 YAML 双视图**可视化编辑配置，双视图互相同步；
4. 本地校验后将配置同步回服务器（自动备份旧文件）；
5. 通过用户自定义的 shell 脚本重启远程 Prometheus 服务，并做健康检查。

目标平台：Windows / macOS / Linux，最终打包为各系统安装包（NSIS / DMG / DEB）。

### 1.1 非功能性需求

- **安全性**：服务器凭据只存操作系统级安全存储，不落明文；同步过程可回滚。
- **可靠性**：同步闭环中任一步骤失败都必须给出明确状态，绝不允许"配置传了但不知道服务有没有起来"。
- **兼容性**：编辑器不得破坏配置中它不认识的字段（未知字段透传）。

## 2. 总体架构

Wails 应用 = Go 后端（业务逻辑、SSH、文件操作）+ Web 前端（Vue 3 + TypeScript + Vite），通过 Wails 自动生成的绑定（App 方法 + runtime 事件）通信。

```
┌─────────────────────────────────────────────┐
│  Vue 3 前端 (views / components / stores)    │
│  ─ 连接管理  ─ 配置编辑(表单/YAML)  ─ 同步部署 │
├─────────────────────────────────────────────┤
│  Wails 绑定层 (自动生成的 JS ↔ Go 桥)         │
├─────────────────────────────────────────────┤
│  Go 后端                                     │
│  ├─ App (Wails 入口, 暴露绑定方法)             │
│  ├─ profile 服务   连接配置的增删改查 + 密钥存取 │
│  ├─ ssh 客户端     连接池、文件上传下载、远程执行 │
│  ├─ promcfg 服务   YAML 解析/序列化/校验        │
│  ├─ sync 服务      备份 → 上传 → 重启 → 健康检查 │
│  └─ storage        OS Keychain 凭据存储         │
└─────────────────────────────────────────────┘
              │ SSH (x/crypto/ssh)
              ▼
        远程服务器 Prometheus
```

**数据流（编辑-同步闭环）：**

连接服务器 → SFTP 下载 `prometheus.yml` → 解析为结构化模型 → 前端表单/YAML 双视图编辑 → 本地 YAML 校验 → 可选：SSH 执行远程 `promtool check config` 二次校验 → SFTP 上传（先备份原文件为 `prometheus.yml.bak-<timestamp>`）→ SSH 执行用户配置的重启脚本 → 调用 `/-/healthy` 或进程健康检查确认生效。

## 3. 技术选型与关键决策

### 决策：SSH 客户端库

**选项：**

| 选项 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| `golang.org/x/crypto/ssh` + `pkg/sftp` | 官方生态、活跃维护、纯 Go 易交叉编译 | 需自己封装连接管理 | ✅ 采用 |
| `github.com/melbahja/goph` 等高层封装 | API 更顺手 | 维护活跃度与定制空间一般 | 备选 |

- 认证：密码、私钥文件（支持 passphrase 解密 `ssh.ParsePrivateKeyWithPassphrase`）。
- **不支持 ssh-agent**：Windows 上实现复杂，MVP 阶段性价比低，后续可作为增强项。

### 决策：Prometheus 配置解析

- 编辑模型使用**自定义 YAML struct**（`gopkg.in/yaml.v3`），字段对齐 prometheus.yml 的 global / scrape_configs / alerting / rule_files / remote_write 等段落。
- 校验分两层：
  1. 本地：YAML 语法 + 基本结构校验（自定义 struct unmarshal）。
  2. 远程（可选开关）：通过 SSH 执行 `promtool check config`（若服务器上有），作为提交前最终校验。
- **不引入 `github.com/prometheus/prometheus` 依赖包**：它会带入大量重型间接依赖；用 promtool 远程校验效果等同且更贴近目标环境。

### 决策：凭据存储

- 采用 `github.com/zalando/go-keyring`：Windows 凭据管理器 / macOS Keychain / Linux Secret Service，敏感数据不落盘。
- 连接配置（主机、端口、用户名、路径等非敏感字段）存本地 JSON 文件（OS UserConfigDir 下）；密码/passphrase 只存 Keychain。
- 降级策略：Keychain 不可用（部分 Linux 无 Secret Service）时，回退为本地 AES-GCM 加密文件（密钥派生自机器指纹 + 用户输入的主密码），需在用户界面明确提示。

### 决策：前端技术栈

- Vue 3 + TypeScript + Vite + Pinia（状态管理）+ Vue Router。
- UI 组件库倾向 **Naive UI**（轻量、TS 类型友好）；Element Plus 为备选，实现期确认。
- YAML 视图用 CodeMirror 6 + `@codemirror/lang-yaml`（语法高亮、错误行定位）。

### 决策：同步安全性

- 上传前强制备份：`cp prometheus.yml prometheus.yml.bak-<RFC3339>`；保留最近 N 份可配。
- 提供"回滚"能力：从服务器上选定 `.bak` 文件恢复。
- 重启失败或健康检查失败时前端明确提示"配置已上传但服务未恢复"，并给出备份路径，支持一键回滚。

## 4. Go 后端模块设计

### 4.1 profile 服务（连接配置管理）

**职责：** 服务器连接配置的增删改查；敏感字段读写 Keychain。

**数据结构：**

```go
type ServerProfile struct {
    ID             string    `json:"id"`            // uuid
    Name           string    `json:"name"`          // 展示名, 如 "生产 Prometheus"
    Host           string    `json:"host"`
    Port           int       `json:"port"`          // 默认 22
    Username       string    `json:"username"`
    AuthType       string    `json:"authType"`      // "password" | "key"
    KeyPath        string    `json:"keyPath,omitempty"`    // AuthType=key 时私钥文件路径
    HasPassphrase  bool      `json:"hasPassphrase,omitempty"` // 密钥是否有口令(仅标记, 不存值)
    ConfigPath     string    `json:"configPath"`    // 远端 prometheus.yml 路径, 默认 /etc/prometheus/prometheus.yml
    BackupKeep     int       `json:"backupKeep"`    // 保留备份份数, 默认 10
    RestartScript  string    `json:"restartScript"` // 重启命令/脚本, 如 "systemctl restart prometheus"
    HealthCheckURL string    `json:"healthCheckUrl,omitempty"` // 默认 http://<host>:9090/-/healthy
    ValidateRemote bool      `json:"validateRemote"` // 是否用 promtool 远程校验
    CreatedAt      time.Time `json:"createdAt"`
    UpdatedAt      time.Time `json:"updatedAt"`
    // 敏感字段（密码 / passphrase）只存 OS Keychain，键为 "prom-editor/<id>"，不出现在 JSON 落盘
}
```

**Wails 绑定方法：** `ListProfiles` / `SaveProfile`（密码仅在新建/修改时传入，之后不可回读）/ `DeleteProfile` / `TestConnection(id)`。

### 4.2 ssh 服务

**职责：** 建立/复用 SSH 连接；封装 SFTP 上传下载、远程命令执行并捕获输出。

**接口：**

```go
type SSHClient interface {
    Connect(ctx context.Context, p ServerProfile, secret string) error
    Download(ctx context.Context, remotePath string) ([]byte, error)
    Upload(ctx context.Context, remotePath string, data []byte, perm os.FileMode) error
    Run(ctx context.Context, script string) (stdout string, stderr string, exitCode int, err error)
    Close() error
}
```

- 连接按 profile 缓存（短期复用，支持手动"断开"）。
- 所有方法带 ctx 超时；前端长操作（下载/重启）走异步：Go 端执行 + `runtime.EventsEmit` 推送进度/日志。

### 4.3 promcfg 服务

**职责：** YAML ↔ 结构化模型互转；编辑前后的一致性保障。

- `Parse(data []byte) (*PromConfig, error)` / `Render(cfg *PromConfig) ([]byte, error)`。
- 结构化模型覆盖 prometheus.yml 主要段落：`global`、`scrape_configs`（含 static_configs / file_sd_configs / relabel_configs 等常用子段）、`alerting`、`rule_files`、`remote_write/read`。
- **关键设计**：未覆盖字段保留在 `Extra yaml.Node` 中原样透传，编辑器绝不丢失或篡改用户配置中的未知内容。

### 4.4 sync 服务（编辑-同步闭环编排）

**职责：** 串联 备份 → 上传 → 校验 → 重启 → 健康检查，逐步骤向前端推送事件。

| 步骤 | 动作 | 失败处理 |
|------|------|----------|
| 1. 备份 | 远程 `cp` 原文件为 `.bak-<timestamp>` | 中止同步 |
| 2. 远程校验（可选） | 上传临时文件后执行 `promtool check config` | 中止，保留原文件，展示 stderr |
| 3. 上传 | 先写 `.tmp` 再 `mv`，保证原子性 | 已备份，提示重试 |
| 4. 重启 | 执行 RestartScript，捕获 stdout/stderr/exitCode | 展示输出，标记"配置已上传但服务未重启" |
| 5. 健康检查 | 优先 HTTP `/-/healthy`，可配超时 | 同上，提示可能配置导致服务未起来 |

全程日志经 Wails 事件流推给前端"部署日志"面板；任一步骤失败均提供一键回滚入口。

## 5. 前端设计（Vue 3）

**页面/视图：**

- **连接管理页**：服务器列表卡片（名称/Host/认证方式/配置路径），新建/编辑弹窗（含"测试连接"按钮）、删除。
- **编辑器页（核心）**：
  - 顶部工具栏：连接状态、配置文件路径、「从服务器拉取」「保存并同步」「校验」「回滚」。
  - 双视图切换：`表单视图`（global 表单 + scrape_configs 列表卡片化编辑 job、targets、标签、relabel 规则）⇄ `YAML 视图`（CodeMirror，语法高亮）。切换时做模型↔文本同步；YAML 解析失败时禁止切换表单并提示错误行。
  - 「部署日志」面板：实时展示 sync 各步骤输出。
  - 未保存离开拦截（dirty 检查）。
- **设置页**：备份保留份数、默认路径、主题等。

**状态管理（Pinia stores）：** `profiles`、`connection`（当前 SSH 会话状态）、`editor`（结构化模型 + 原文 + dirty 标记 + 视图模式）、`deploy`（步骤状态与日志）。

## 6. 错误处理

| 场景 | 检测点 | 处理策略 |
|------|--------|----------|
| SSH 连接失败 | TestConnection / 操作前 | 明确提示网络/认证/主机错误原因 |
| 下载失败（文件不存在/无权限） | SFTP | 提示检查配置路径 |
| YAML 解析失败 | 本地解析 | 定位行号，禁止进入表单视图 |
| promtool 校验失败 | 远程执行 | 展示 stderr，中止同步 |
| 上传失败 | SFTP | 已备份，提示重试 |
| 重启脚本非零退出 | Run exitCode | 配置已上传但服务未重启，展示输出，提供回滚 |
| 健康检查超时 | HTTP/进程 | 同上，提示可能配置导致服务未起来 |
| Keychain 不可用 | 凭据读写 | 提示降级为加密文件存储 |

## 7. 安全设计

- 敏感数据（密码、passphrase）只存 OS Keychain，不落 JSON、不进日志、不出现在 Wails 绑定返回值中（前端保存 profile 后凭据即不可回读，只能重置）。
- SSH 密钥文件路径由用户指定，读取遵循运行用户文件权限。
- 日志脱敏：任何输出中遇到 secret 值做掩码。

## 8. 打包与分发

- Wails 构建三平台：`wails build` 产出 Windows（NSIS 安装包）、macOS（app + DMG，amd64/arm64）、Linux（deb，可选 AppImage）。
- CI（GitHub Actions）矩阵构建三平台产物 + tag 发布 Release。
- 代码签名为后续增强项，MVP 不强制。

## 9. 测试策略

- **Go 单元测试**：promcfg 解析/序列化（用真实样例 prometheus.yml，含未覆盖字段透传用例）、profile 序列化、备份命名逻辑。
- **SSH 集成测试**：用 `github.com/gliderlabs/ssh` 起本地内存 SSH/SFTP 服务模拟服务器，覆盖下载→编辑→上传→重启脚本全链路，无需真实服务器。
- **前端测试**：表单↔YAML 同步逻辑的关键组件测试（Vitest）。
- **手工验收**：三平台各跑通一次完整闭环（拉取→编辑→校验→同步→重启→健康检查）。

## 10. 目录结构（规划）

```
prom-editor/
├── main.go                  # Wails 入口
├── go.mod
├── internal/
│   ├── profile/             # 连接配置 + Keychain
│   ├── ssh/                 # SSH/SFTP 客户端
│   ├── promcfg/             # YAML 模型与解析
│   ├── sync/                # 同步部署编排
│   └── keyring/             # 凭据存取与降级
├── frontend/                # Vue 3 + Vite (Wails 模板生成)
│   ├── src/views/           # 连接管理 / 编辑器 / 设置
│   ├── src/stores/
│   └── src/components/
├── build/                   # Wails 打包资源 (icon, installer)
└── docs/DESIGN.md           # 本文档
```

## 11. 里程碑

1. **M1**：Wails 脚手架 + 连接管理（增删改查 + 测试连接）。
2. **M2**：SSH 下载/上传 + YAML 编辑器（仅原文视图）。
3. **M3**：结构化表单视图 + 双视图同步。
4. **M4**：同步闭环（备份/promtool 校验/重启脚本/健康检查/回滚）+ 部署日志面板。
5. **M5**：三平台打包 + CI Release。
