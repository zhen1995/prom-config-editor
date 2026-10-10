// Package sshclient 封装 SSH/SFTP 连接、文件传输与远程命令执行。
package sshclient

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// Config 描述一次 SSH 连接所需的全部参数。
type Config struct {
	Host      string
	Port      int
	Username  string
	AuthType  string // password | key
	KeyPath   string
	Secret    string // 密码或密钥口令（来自 keyring 或本次输入）
	Timeout   time.Duration
}

// RunResult 是一次远程命令的执行结果。
type RunResult struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

// Client 是一个可复用的 SSH 连接。
type Client struct {
	ssh  *ssh.Client
	sftp *sftp.Client
}

// Dial 建立 SSH+SFTP 连接。
//
// 注意：MVP 阶段使用 InsecureIgnoreHostKey 跳过主机密钥校验，
// 后续应改为基于 known_hosts 的校验策略。
func Dial(ctx context.Context, cfg Config) (*Client, error) {
	if cfg.Timeout <= 0 {
		cfg.Timeout = 15 * time.Second
	}

	var auth ssh.AuthMethod
	switch cfg.AuthType {
	case "password":
		auth = ssh.Password(cfg.Secret)
	case "key":
		raw, err := os.ReadFile(cfg.KeyPath)
		if err != nil {
			return nil, fmt.Errorf("读取私钥文件失败: %w", err)
		}
		if cfg.Secret != "" {
			signer, err := ssh.ParsePrivateKeyWithPassphrase(raw, []byte(cfg.Secret))
			if err != nil {
				return nil, fmt.Errorf("解析私钥失败（口令可能错误）: %w", err)
			}
			auth = ssh.PublicKeys(signer)
		} else {
			signer, err := ssh.ParsePrivateKey(raw)
			if err != nil {
				return nil, fmt.Errorf("解析私钥失败: %w", err)
			}
			auth = ssh.PublicKeys(signer)
		}
	default:
		return nil, fmt.Errorf("未知认证方式: %s", cfg.AuthType)
	}

	sshCfg := &ssh.ClientConfig{
		User:            cfg.Username,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         cfg.Timeout,
	}

	addr := net.JoinHostPort(cfg.Host, fmt.Sprintf("%d", cfg.Port))
	d := net.Dialer{Timeout: cfg.Timeout}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("连接 %s 失败: %w", addr, err)
	}
	c, chans, reqs, err := ssh.NewClientConn(conn, addr, sshCfg)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("SSH 握手失败: %w", err)
	}
	sshClient := ssh.NewClient(c, chans, reqs)

	sftpClient, err := sftp.NewClient(sshClient)
	if err != nil {
		sshClient.Close()
		return nil, fmt.Errorf("建立 SFTP 通道失败: %w", err)
	}
	return &Client{ssh: sshClient, sftp: sftpClient}, nil
}

// Download 读取远端文件内容。
func (c *Client) Download(remotePath string) ([]byte, error) {
	f, err := c.sftp.Open(remotePath)
	if err != nil {
		return nil, fmt.Errorf("打开远端文件失败: %w", err)
	}
	defer f.Close()
	return io.ReadAll(f)
}

// UploadAtomic 先写 .tmp 再 mv，保证远端文件被原子替换。
func (c *Client) UploadAtomic(remotePath string, data []byte) error {
	tmp := remotePath + ".tmp"
	f, err := c.sftp.Create(tmp)
	if err != nil {
		return fmt.Errorf("创建临时文件失败: %w", err)
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return fmt.Errorf("写入临时文件失败: %w", err)
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("关闭临时文件失败: %w", err)
	}
	res, err := c.Run(fmt.Sprintf("mv %s %s", shellQuote(tmp), shellQuote(remotePath)))
	if err != nil {
		return err
	}
	if res.ExitCode != 0 {
		return fmt.Errorf("替换文件失败: %s", res.Stderr)
	}
	return nil
}

// ReadDir 列出远端目录内容（用于枚举备份文件）。
func (c *Client) ReadDir(dir string) ([]os.FileInfo, error) {
	return c.sftp.ReadDir(dir)
}

// Run 在远端执行命令并捕获 stdout/stderr 与退出码。
func (c *Client) Run(script string) (RunResult, error) {
	session, err := c.ssh.NewSession()
	if err != nil {
		return RunResult{}, fmt.Errorf("创建会话失败: %w", err)
	}
	defer session.Close()

	var stdout, stderr io.Writer
	outBuf := &limitedBuffer{}
	errBuf := &limitedBuffer{}
	stdout, stderr = outBuf, errBuf
	session.Stdout = stdout
	session.Stderr = stderr

	runErr := session.Run(script)
	res := RunResult{Stdout: outBuf.String(), Stderr: errBuf.String(), ExitCode: 0}
	if runErr != nil {
		if exitErr, ok := runErr.(*ssh.ExitError); ok {
			res.ExitCode = exitErr.ExitStatus()
		} else {
			return res, fmt.Errorf("执行命令失败: %w", runErr)
		}
	}
	return res, nil
}

// Close 关闭连接。
func (c *Client) Close() error {
	if c.sftp != nil {
		c.sftp.Close()
	}
	if c.ssh != nil {
		return c.ssh.Close()
	}
	return nil
}

// shellQuote 对路径做最小安全的 shell 转义。
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

// limitedBuffer 防止异常巨大的命令输出撑爆内存。
type limitedBuffer struct {
	buf []byte
	max int
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b.max == 0 {
		b.max = 1 << 20 // 1 MiB
	}
	if len(b.buf) < b.max {
		n := min(b.max-len(b.buf), len(p))
		b.buf = append(b.buf, p[:n]...)
	}
	return len(p), nil
}

func (b *limitedBuffer) String() string { return string(b.buf) }
