// Package syncer 实现「编辑-同步闭环」编排（设计文档 4.4）：
// 备份 → 远程校验(可选) → 上传 → 重启 → 健康检查，全程通过 EventEmitter 向前端推送事件。
package syncer

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"time"

	"prom-editor/internal/profile"
	"prom-editor/internal/sshclient"
)

// Event 对应前端 DeployEvent（kind: step | log | finished）。
type Event struct {
	Kind    string `json:"kind"`
	Step    string `json:"step,omitempty"`
	Status  string `json:"status,omitempty"`
	Level   string `json:"level,omitempty"`
	Message string `json:"message,omitempty"`
	Success *bool  `json:"success,omitempty"`
	Time    string `json:"time"`
}

// BackupInfo 对应前端 BackupInfo。
type BackupInfo struct {
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	CreatedAt string `json:"createdAt"`
}

// Emitter 推送部署事件（Wails 层实现为 runtime.EventsEmit）。
type Emitter func(event Event)

// Deps 是 syncer 的外部依赖，便于测试替换。
type Deps struct {
	Dial    func(ctx context.Context, cfg sshclient.Config) (*sshclient.Client, error)
	Emit    Emitter
	HTTPGet func(url string) (int, error)
}

func boolPtr(b bool) *bool { return &b }

func newEvent(kind, step, status, level, message string, success *bool) Event {
	return Event{
		Kind:    kind,
		Step:    step,
		Status:  status,
		Level:   level,
		Message: message,
		Success: success,
		Time:    time.Now().UTC().Format(time.RFC3339),
	}
}

// Sync 执行完整同步闭环。任一步骤失败会推送相应事件并返回错误。
func Sync(ctx context.Context, p profile.ServerProfile, content []byte, secret string, deps Deps) error {
	emit := deps.Emit
	if emit == nil {
		emit = func(Event) {}
	}
	dial := deps.Dial
	if dial == nil {
		dial = sshclient.Dial
	}

	cfg := sshclient.Config{
		Host:     p.Host,
		Port:     p.Port,
		Username: p.Username,
		AuthType: p.AuthType,
		KeyPath:  p.KeyPath,
		Secret:   secret,
		Timeout:  15 * time.Second,
	}
	client, err := dial(ctx, cfg)
	if err != nil {
		return err
	}
	defer client.Close()

	emitStep := func(step, status, message string) {
		emit(newEvent("step", step, status, "", message, nil))
	}
	emitLog := func(step, level, message string) {
		emit(newEvent("log", step, "", level, message, nil))
	}
	emitFinished := func(success bool, message string) {
		emit(newEvent("finished", "", "", "", message, boolPtr(success)))
	}

	configPath := p.ConfigPath
	dir, base := path.Split(configPath)

	// 1. 备份
	emitStep("backup", "running", "")
	backupName := fmt.Sprintf("%s.bak-%s", base, time.Now().UTC().Format("2006-01-02T15-04-05Z"))
	backupPath := path.Join(dir, backupName)
	res, err := client.Run(fmt.Sprintf("cp %s %s", shellQuote(configPath), shellQuote(backupPath)))
	if err != nil {
		emitStep("backup", "failed", err.Error())
		return fmt.Errorf("备份失败: %w", err)
	}
	if res.ExitCode != 0 {
		emitStep("backup", "failed", res.Stderr)
		return fmt.Errorf("备份失败: %s", res.Stderr)
	}
	emitLog("backup", "info", fmt.Sprintf("$ cp %s %s", configPath, backupPath))
	keep := p.BackupKeep
	if keep <= 0 {
		keep = 10
	}
	emitLog("backup", "info", fmt.Sprintf("backed up (keeping last %d)", keep))
	pruneOldBackups(client, dir, base, keep)
	emitStep("backup", "success", "")

	// 2. 远程校验（可选）：上传临时文件后 promtool check config
	if p.ValidateRemote {
		emitStep("validate", "running", "")
		tmpValidate := fmt.Sprintf("/tmp/prom-editor-validate-%s.yml", p.ID[:8])
		if err := client.UploadAtomic(tmpValidate, content); err != nil {
			emitStep("validate", "failed", err.Error())
			return fmt.Errorf("上传校验文件失败: %w", err)
		}
		emitLog("validate", "info", "$ promtool check config "+tmpValidate)
		res, err := client.Run("command -v promtool >/dev/null 2>&1 && promtool check config " + shellQuote(tmpValidate) + " || echo 'promtool not found, skipped'")
		if err != nil {
			emitStep("validate", "failed", err.Error())
			return fmt.Errorf("远程校验执行失败: %w", err)
		}
		if res.ExitCode != 0 {
			emitStep("validate", "failed", res.Stderr)
			emitFinished(false, "remote validation failed; original file untouched")
			return fmt.Errorf("promtool 校验失败: %s", firstLine(res.Stderr))
		}
		emitLog("validate", "success", firstLine(res.Stdout))
		emitStep("validate", "success", "")
	} else {
		emitStep("validate", "skipped", "remote validation disabled")
	}

	// 3. 上传（原子替换）
	emitStep("upload", "running", "")
	if err := client.UploadAtomic(configPath, content); err != nil {
		emitStep("upload", "failed", err.Error())
		return fmt.Errorf("上传失败: %w", err)
	}
	emitLog("upload", "info", fmt.Sprintf("wrote %d bytes to %s (atomic)", len(content), configPath))
	emitStep("upload", "success", "")

	// 4. 重启
	emitStep("restart", "running", "")
	emitLog("restart", "info", "$ "+p.RestartScript)
	res, err = client.Run(p.RestartScript)
	if err != nil {
		emitStep("restart", "failed", err.Error())
		emitFinished(false, "config uploaded but service failed to restart; roll back to a backup")
		return fmt.Errorf("重启脚本执行失败: %w", err)
	}
	emitLog("restart", "info", fmt.Sprintf("exit status %d", res.ExitCode))
	if res.ExitCode != 0 {
		msg := strings.TrimSpace(res.Stderr)
		if msg == "" {
			msg = "restart script exited non-zero"
		}
		emitStep("restart", "failed", msg)
		emitFinished(false, "config uploaded but service failed to restart; roll back to a backup")
		return fmt.Errorf("重启失败: %s", msg)
	}
	emitStep("restart", "success", "")

	// 5. 健康检查
	emitStep("healthcheck", "running", "")
	healthURL := p.HealthCheckURL
	if healthURL == "" {
		healthURL = fmt.Sprintf("http://%s:9090/-/healthy", p.Host)
	}
	emitLog("healthcheck", "info", "GET "+healthURL)
	httpGet := deps.HTTPGet
	if httpGet == nil {
		httpGet = defaultHTTPGet
	}
	code, err := httpGet(healthURL)
	if err != nil || code != 200 {
		emitStep("healthcheck", "failed", fmt.Sprintf("HTTP %d", code))
		emitFinished(false, "service restarted but health check failed")
		if err != nil {
			return fmt.Errorf("健康检查失败: %w", err)
		}
		return fmt.Errorf("健康检查失败: HTTP %d", code)
	}
	emitLog("healthcheck", "success", fmt.Sprintf("HTTP %d OK", code))
	emitStep("healthcheck", "success", "")

	emitFinished(true, "config synced and applied")
	return nil
}

// ListBackups 列出配置目录下以 "<base>.bak-" 开头的备份文件。
func ListBackups(client *sshclient.Client, configPath string) ([]BackupInfo, error) {
	dir, base := path.Split(configPath)
	entries, err := client.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	prefix := base + ".bak-"
	var out []BackupInfo
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), prefix) {
			out = append(out, BackupInfo{
				Name:      e.Name(),
				Size:      e.Size(),
				CreatedAt: e.ModTime().UTC().Format(time.RFC3339),
			})
		}
	}
	// 新的在前
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

// Rollback 将指定备份恢复到配置路径。
func Rollback(client *sshclient.Client, configPath, backupName string) error {
	dir, _ := path.Split(configPath)
	backupPath := path.Join(dir, backupName)
	res, err := client.Run(fmt.Sprintf("cp %s %s", shellQuote(backupPath), shellQuote(configPath)))
	if err != nil {
		return err
	}
	if res.ExitCode != 0 {
		return fmt.Errorf("回滚失败: %s", res.Stderr)
	}
	return nil
}

// pruneOldBackups 仅保留最近 keep 份备份。
func pruneOldBackups(client *sshclient.Client, dir, base string, keep int) {
	backups, err := ListBackups(client, path.Join(dir, base))
	if err != nil || len(backups) <= keep {
		return
	}
	for _, b := range backups[keep:] {
		client.Run("rm -f " + shellQuote(path.Join(dir, b.Name)))
	}
}

func defaultHTTPGet(url string) (int, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	return resp.StatusCode, nil
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	if s == "" {
		return "(no output)"
	}
	return s
}

func shellQuote(s string) string {
	out := "'"
	for _, r := range s {
		if r == '\'' {
			out += `'\''`
		} else {
			out += string(r)
		}
	}
	return out + "'"
}
