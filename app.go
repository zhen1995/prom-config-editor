package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"prom-editor/internal/profile"
	"prom-editor/internal/secrets"
	"prom-editor/internal/sshclient"
	"prom-editor/internal/syncer"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 是 Wails 应用主体，其导出方法自动生成为前端绑定。
type App struct {
	ctx    context.Context
	store  *profile.Store
	sshMu  sync.Mutex
	sshMap map[string]*sshclient.Client // profileID -> 复用连接
}

// NewApp 创建应用实例。
func NewApp() *App {
	store, err := profile.NewStore()
	if err != nil {
		// 存储初始化失败时以内存空存储降级，保证应用可启动
		fmt.Printf("警告: 初始化本地存储失败: %v\n", err)
		store = &profile.Store{}
	}
	return &App{store: store, sshMap: make(map[string]*sshclient.Client)}
}

// startup 在应用启动时调用（Wails 生命周期钩子）。
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// shutdown 退出时关闭所有 SSH 连接。
func (a *App) shutdown(ctx context.Context) {
	a.sshMu.Lock()
	defer a.sshMu.Unlock()
	for _, c := range a.sshMap {
		c.Close()
	}
	a.sshMap = make(map[string]*sshclient.Client)
}

// ---------- 连接配置管理 ----------

// ListProfiles 列出全部服务器连接配置。
func (a *App) ListProfiles() ([]profile.ServerProfile, error) {
	return a.store.List(), nil
}

// SaveProfile 新建/更新连接配置；密码、口令本次传入后写入系统钥匙串，之后不可回读。
func (a *App) SaveProfile(req profile.SaveProfileRequest) (profile.ServerProfile, error) {
	p, err := a.store.Save(req)
	if err != nil {
		return profile.ServerProfile{}, err
	}
	if req.AuthType == "password" && req.Password != nil && *req.Password != "" {
		if err := secrets.Set(p.ID, "", *req.Password); err != nil {
			return p, fmt.Errorf("保存密码到钥匙串失败: %w", err)
		}
	}
	if req.AuthType == "key" && req.Passphrase != nil && *req.Passphrase != "" {
		if err := secrets.Set(p.ID, "passphrase", *req.Passphrase); err != nil {
			return p, fmt.Errorf("保存密钥口令到钥匙串失败: %w", err)
		}
	}
	return p, nil
}

// DeleteProfile 删除连接配置及其钥匙串条目。
func (a *App) DeleteProfile(id string) error {
	a.closeSSH(id)
	if err := secrets.Delete(id, ""); err != nil {
		return err
	}
	if err := secrets.Delete(id, "passphrase"); err != nil {
		return err
	}
	return a.store.Delete(id)
}

// TestConnection 测试 SSH 连接，返回结果与延迟。
func (a *App) TestConnection(id string) (TestConnectionResult, error) {
	p, ok := a.store.Get(id)
	if !ok {
		return TestConnectionResult{}, fmt.Errorf("连接配置不存在: %s", id)
	}
	secret, err := a.secretOf(p)
	if err != nil {
		return TestConnectionResult{}, err
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(a.ctx, 20*time.Second)
	defer cancel()
	client, err := sshclient.Dial(ctx, dialConfig(p, secret))
	if err != nil {
		return TestConnectionResult{Ok: false, Message: err.Error()}, nil
	}
	client.Close()
	return TestConnectionResult{
		Ok:        true,
		Message:   fmt.Sprintf("connected as %s@%s:%d", p.Username, p.Host, p.Port),
		LatencyMs: time.Since(start).Milliseconds(),
	}, nil
}

// ---------- 配置拉取 / 同步 ----------

// FetchConfig 从服务器下载 prometheus.yml 内容。
func (a *App) FetchConfig(profileID string) (FetchConfigResult, error) {
	p, ok := a.store.Get(profileID)
	if !ok {
		return FetchConfigResult{}, fmt.Errorf("连接配置不存在: %s", profileID)
	}
	client, err := a.ssh(profileID, p)
	if err != nil {
		return FetchConfigResult{}, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 60*time.Second)
	defer cancel()
	type result struct {
		data []byte
		err  error
	}
	ch := make(chan result, 1)
	go func() {
		data, err := client.Download(p.ConfigPath)
		ch <- result{data, err}
	}()
	select {
	case r := <-ch:
		if r.err != nil {
			return FetchConfigResult{}, fmt.Errorf("下载配置失败: %w", r.err)
		}
		return FetchConfigResult{Content: string(r.data)}, nil
	case <-ctx.Done():
		return FetchConfigResult{}, fmt.Errorf("下载配置超时")
	}
}

// SyncDeploy 执行完整同步闭环，进度通过 deploy:event 事件推送。
func (a *App) SyncDeploy(profileID string, content string) error {
	p, ok := a.store.Get(profileID)
	if !ok {
		return fmt.Errorf("连接配置不存在: %s", profileID)
	}
	secret, err := a.secretOf(p)
	if err != nil {
		return err
	}
	a.closeSSH(profileID) // 强制重建连接，避免复用失效连接
	emit := func(ev syncer.Event) {
		runtime.EventsEmit(a.ctx, "deploy:event", ev)
	}
	return syncer.Sync(a.ctx, p, []byte(content), secret, syncer.Deps{Emit: emit})
}

// ListBackups 列出服务器上的备份文件。
func (a *App) ListBackups(profileID string) ([]syncer.BackupInfo, error) {
	p, ok := a.store.Get(profileID)
	if !ok {
		return nil, fmt.Errorf("连接配置不存在: %s", profileID)
	}
	client, err := a.ssh(profileID, p)
	if err != nil {
		return nil, err
	}
	return syncer.ListBackups(client, p.ConfigPath)
}

// Rollback 从指定备份恢复配置（仅恢复文件，不自动重启服务）。
func (a *App) Rollback(profileID string, backupName string) error {
	p, ok := a.store.Get(profileID)
	if !ok {
		return fmt.Errorf("连接配置不存在: %s", profileID)
	}
	client, err := a.ssh(profileID, p)
	if err != nil {
		return err
	}
	return syncer.Rollback(client, p.ConfigPath, backupName)
}

// ---------- 内部辅助 ----------

// secretOf 按认证方式从钥匙串取回机密值。
func (a *App) secretOf(p profile.ServerProfile) (string, error) {
	if p.AuthType == "password" {
		v, err := secrets.Get(p.ID, "")
		if err != nil {
			return "", err
		}
		if v == "" {
			return "", fmt.Errorf("该连接的密码未保存，请重新编辑连接并填写密码")
		}
		return v, nil
	}
	if p.HasPassphrase {
		v, err := secrets.Get(p.ID, "passphrase")
		if err != nil {
			return "", err
		}
		return v, nil // 无口令时为空串即可
	}
	return "", nil
}

func dialConfig(p profile.ServerProfile, secret string) sshclient.Config {
	return sshclient.Config{
		Host:     p.Host,
		Port:     p.Port,
		Username: p.Username,
		AuthType: p.AuthType,
		KeyPath:  p.KeyPath,
		Secret:   secret,
		Timeout:  15 * time.Second,
	}
}

// ssh 返回该配置的复用连接（不存在或已关闭时重建）。
func (a *App) ssh(id string, p profile.ServerProfile) (*sshclient.Client, error) {
	a.sshMu.Lock()
	if c, ok := a.sshMap[id]; ok {
		a.sshMu.Unlock()
		return c, nil
	}
	a.sshMu.Unlock()

	secret, err := a.secretOf(p)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 20*time.Second)
	defer cancel()
	client, err := sshclient.Dial(ctx, dialConfig(p, secret))
	if err != nil {
		return nil, err
	}
	a.sshMu.Lock()
	if old, ok := a.sshMap[id]; ok {
		a.sshMu.Unlock()
		client.Close()
		return old, nil
	}
	a.sshMap[id] = client
	a.sshMu.Unlock()
	return client, nil
}

func (a *App) closeSSH(id string) {
	a.sshMu.Lock()
	defer a.sshMu.Unlock()
	if c, ok := a.sshMap[id]; ok {
		c.Close()
		delete(a.sshMap, id)
	}
}

// ---------- DTO（与前端 types.ts 对应） ----------

// TestConnectionResult 对应前端 TestConnectionResult。
type TestConnectionResult struct {
	Ok        bool   `json:"ok"`
	Message   string `json:"message"`
	LatencyMs int64  `json:"latencyMs,omitempty"`
}

// FetchConfigResult 对应前端 FetchConfigResult。
type FetchConfigResult struct {
	Content string `json:"content"`
}
