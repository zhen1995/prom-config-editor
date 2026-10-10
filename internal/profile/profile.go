// Package profile 管理服务器连接配置的本地存储（JSON 文件）。
// 敏感字段（密码 / 密钥口令）不进入该文件，只存 OS Keychain。
package profile

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// ServerProfile 对应前端 ServerProfile 类型（设计文档 4.1）。
type ServerProfile struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Host           string    `json:"host"`
	Port           int       `json:"port"`
	Username       string    `json:"username"`
	AuthType       string    `json:"authType"` // password | key
	KeyPath        string    `json:"keyPath,omitempty"`
	HasPassphrase  bool      `json:"hasPassphrase,omitempty"`
	ConfigPath     string    `json:"configPath"`
	BackupKeep     int       `json:"backupKeep"`
	RestartScript  string    `json:"restartScript"`
	HealthCheckURL string    `json:"healthCheckUrl,omitempty"`
	ValidateRemote bool      `json:"validateRemote"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// SaveProfileRequest 对应前端 SaveProfileRequest；Password/Passphrase 仅本次传入。
type SaveProfileRequest struct {
	ID             string  `json:"id,omitempty"`
	Name           string  `json:"name"`
	Host           string  `json:"host"`
	Port           int     `json:"port"`
	Username       string  `json:"username"`
	AuthType       string  `json:"authType"`
	KeyPath        string  `json:"keyPath,omitempty"`
	ConfigPath     string  `json:"configPath"`
	BackupKeep     int     `json:"backupKeep"`
	RestartScript  string  `json:"restartScript"`
	HealthCheckURL string  `json:"healthCheckUrl,omitempty"`
	ValidateRemote bool    `json:"validateRemote"`
	Password       *string `json:"password,omitempty"`
	Passphrase     *string `json:"passphrase,omitempty"`
}

// Store 是 ServerProfile 的 JSON 文件存储。
type Store struct {
	mu       sync.Mutex
	path     string
	profiles []ServerProfile
}

func configDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "prom-editor"), nil
}

// NewStore 加载（或初始化）本地配置存储。
func NewStore() (*Store, error) {
	dir, err := configDir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return NewStoreAt(filepath.Join(dir, "profiles.json"))
}

// NewStoreAt 从指定文件路径创建存储（测试用）。
func NewStoreAt(path string) (*Store, error) {
	s := &Store{path: path}
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &s.profiles); err != nil {
			return nil, fmt.Errorf("解析 profiles.json 失败: %w", err)
		}
	}
	return s, nil
}

func (s *Store) persistLocked() error {
	raw, err := json.MarshalIndent(s.profiles, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// List 返回全部连接配置的副本。
func (s *Store) List() []ServerProfile {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]ServerProfile, len(s.profiles))
	copy(out, s.profiles)
	return out
}

// Get 按 id 查找。
func (s *Store) Get(id string) (ServerProfile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.profiles {
		if p.ID == id {
			return p, true
		}
	}
	return ServerProfile{}, false
}

// Save 新建或更新；req 中的敏感字段是否提供由调用方处理后写入 keyring。
func (s *Store) Save(req SaveProfileRequest) (ServerProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	if req.ID != "" {
		for i := range s.profiles {
			if s.profiles[i].ID == req.ID {
				p := &s.profiles[i]
				p.Name = req.Name
				p.Host = req.Host
				if req.Port > 0 {
					p.Port = req.Port
				}
				p.Username = req.Username
				p.AuthType = req.AuthType
				p.KeyPath = req.KeyPath
				if req.AuthType == "key" && req.Passphrase != nil && *req.Passphrase != "" {
					p.HasPassphrase = true
				}
				if req.AuthType == "password" {
					p.HasPassphrase = false
				}
				p.ConfigPath = req.ConfigPath
				if req.BackupKeep > 0 {
					p.BackupKeep = req.BackupKeep
				}
				p.RestartScript = req.RestartScript
				p.HealthCheckURL = req.HealthCheckURL
				p.ValidateRemote = req.ValidateRemote
				p.UpdatedAt = now
				if err := s.persistLocked(); err != nil {
					return ServerProfile{}, err
				}
				return *p, nil
			}
		}
		return ServerProfile{}, fmt.Errorf("连接配置不存在: %s", req.ID)
	}
	p := ServerProfile{
		ID:             uuid.NewString(),
		Name:           req.Name,
		Host:           req.Host,
		Port:           req.Port,
		Username:       req.Username,
		AuthType:       req.AuthType,
		KeyPath:        req.KeyPath,
		HasPassphrase:  req.AuthType == "key" && req.Passphrase != nil && *req.Passphrase != "",
		ConfigPath:     req.ConfigPath,
		BackupKeep:     req.BackupKeep,
		RestartScript:  req.RestartScript,
		HealthCheckURL: req.HealthCheckURL,
		ValidateRemote: req.ValidateRemote,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	s.profiles = append(s.profiles, p)
	if err := s.persistLocked(); err != nil {
		return ServerProfile{}, err
	}
	return p, nil
}

// Delete 删除连接配置。
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.profiles {
		if s.profiles[i].ID == id {
			s.profiles = append(s.profiles[:i], s.profiles[i+1:]...)
			return s.persistLocked()
		}
	}
	return fmt.Errorf("连接配置不存在: %s", id)
}
