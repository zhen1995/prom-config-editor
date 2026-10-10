# Prom Config Editor

[中文文档](README.zh-CN.md)

A cross-platform desktop GUI for visually editing remote Prometheus configuration files over SSH — pull, edit in form or YAML view with a navigable outline, validate, sync back with automatic backups, restart the service, and roll back if anything goes wrong.

Built with **Go + Wails v2** (backend) and **Vue 3 + TypeScript** (frontend). Runs on Windows, macOS and Linux.

## Features

- **Server connection management** — SSH access via password or private key (passphrase supported); credentials are stored in the OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service) and are never readable after saving
- **Dual editing views** — a structured form editor for `global` / `rule_files` / `scrape_configs` (job, targets, labels), and a full YAML editor (CodeMirror 6) with syntax highlighting, formatting and search; unknown fields are always preserved untouched
- **Navigable outline** — a left-hand table of contents in both views: form view scrolls to sections, YAML view jumps to the exact line of each section and job; highlights follow the cursor
- **Safe sync pipeline** — backup → optional remote `promtool check config` → atomic upload (`.tmp` + `mv`) → restart via your custom script → HTTP health check, with live step-by-step deploy logs
- **Rollback** — every sync keeps timestamped backups on the server (configurable retention); one click restores the previous config
- **Internationalization** — English and Chinese UI, switchable at runtime
- **Dev-friendly** — the same frontend runs in a browser against a built-in mock backend (`npm run dev`), no Go required

## Quick Start

Prerequisites: Go 1.24+, Node.js 22+, [Wails CLI](https://wails.io) (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

```bash
# Run the desktop app with hot reload (Go + frontend)
wails dev

# Or: frontend only in a browser, with mock data
cd frontend && npm install && npm run dev

# Run backend tests
go test ./...
```

Then create a server connection, pull `prometheus.yml`, edit it, and hit **Save & Sync**.

## Building & Releases

See [docs/BUILD.md](docs/BUILD.md). In short:

```bash
wails build                         # Windows exe / native binary
wails build -nsis                   # Windows NSIS installer (requires NSIS)
wails build -platform darwin/universal   # macOS universal app (on macOS)
```

Pushing a `v*` tag builds Windows + macOS artifacts automatically via GitHub Actions (see `.github/workflows/release.yml`).

## Project Structure

```
├── main.go / app.go         # Wails entry & bound API methods
├── internal/
│   ├── profile/             # connection config storage (JSON)
│   ├── secrets/             # OS keychain access
│   ├── sshclient/           # SSH/SFTP client (x/crypto/ssh + pkg/sftp)
│   └── syncer/              # backup → validate → upload → restart → health check
├── frontend/                # Vue 3 + TS + Pinia + Naive UI + CodeMirror 6
│   └── src/api/             # API abstraction: wails bindings ⇄ mock, auto-detected
├── docs/
│   ├── DESIGN.md            # design document
│   └── BUILD.md             # build & release guide
└── scripts/generate_icon.py # app icon generator
```

## Security Notes

- Passwords and key passphrases live only in the OS keychain; the API never returns them
- Uploads are atomic and every overwrite is preceded by a timestamped backup
- ⚠️ MVP: SSH host key verification is currently skipped (`InsecureIgnoreHostKey`) — harden before pointing this at production servers (tracked as a roadmap item)

## Roadmap

- [ ] SSH host key verification via `known_hosts`
- [ ] Encrypted-file credential fallback for keychain-less Linux desktops
- [ ] Integration tests against an in-memory SSH server ([gliderlabs/ssh](https://github.com/gliderlabs/ssh))
- [ ] Linux packages (deb/AppImage) and code signing

## License

[Apache-2.0](LICENSE)
