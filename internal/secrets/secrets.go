// Package secrets 封装 OS Keychain（Windows 凭据管理器 / macOS Keychain / Linux Secret Service）
// 中的敏感数据存取。Keychain 不可用时（部分 Linux 桌面），写操作返回错误，
// 由上层提示用户（后续可降级为本地 AES-GCM 加密文件）。
package secrets

import (
	"fmt"

	"github.com/zalando/go-keyring"
)

const service = "prom-editor"

// key 由配置 id 与用途派生，如 "prom-editor/<id>" 与 "prom-editor/<id>/passphrase"。
func account(id, purpose string) string {
	if purpose == "" {
		return id
	}
	return id + "/" + purpose
}

// Set 写入或覆盖一个机密值。
func Set(id, purpose, value string) error {
	if value == "" {
		return nil
	}
	return keyring.Set(service, account(id, purpose), value)
}

// Get 读取机密值；不存在时返回空串与 nil 错误。
func Get(id, purpose string) (string, error) {
	v, err := keyring.Get(service, account(id, purpose))
	if err == keyring.ErrNotFound {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("读取系统钥匙串失败: %w", err)
	}
	return v, nil
}

// Delete 删除机密值（不存在时静默成功）。
func Delete(id, purpose string) error {
	err := keyring.Delete(service, account(id, purpose))
	if err != nil && err != keyring.ErrNotFound {
		return fmt.Errorf("删除系统钥匙串条目失败: %w", err)
	}
	return nil
}
