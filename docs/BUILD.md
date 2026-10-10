# 构建与发布指南

## 前置依赖

- Go 1.24+
- Node.js 22+
- Wails CLI：`go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- Windows 安装包需要 NSIS：`choco install nsis`
- macOS 镜像需要：`brew install create-dmg`

## 日常开发

```bash
# 后端测试
go test ./...

# 桌面应用热重载开发（自动重建 Go + 前端）
wails dev

# 仅浏览器开发前端（走 Mock 数据，无需 Go）
cd frontend && npm run dev
```

## Windows 发布

```bash
# 纯可执行文件（build/bin/prom-config-editor.exe）
wails build -ldflags "-s -w"

# NSIS 安装包（build/bin/prom-config-editor-amd64-installer.exe）
wails build -nsis -ldflags "-s -w"
```

分发 `prom-config-editor-amd64-installer.exe` 即可，安装包自带 WebView2 引导。

## macOS 发布

**必须在 macOS 上构建**（依赖 CGO 与系统 WebKit，无法从 Windows/Linux 交叉编译）。

```bash
# 通用二进制（Intel + Apple Silicon）
wails build -platform darwin/universal -ldflags "-s -w"

# 生成 DMG
create-dmg \
  --volname "Prom Config Editor" \
  --window-pos 200 120 --window-size 800 400 --icon-size 100 \
  --app-drop-link 600 185 \
  build/bin/prom-config-editor.dmg \
  build/bin/prom-config-editor.app
```

没有 Mac 时：推 `v*` 标签由 GitHub Actions 的 macOS 运行器自动构建（见 `.github/workflows/release.yml`）。

## CI 自动发布

```bash
git tag v0.1.0
git push origin v0.1.0
```

Actions 自动产出：Windows NSIS 安装包 + macOS 通用 `.app`/`.dmg`，作为 Release 产物下载。

## 代码签名（可选增强）

- Windows：`-ldflags "-H windowsgui"` 之外，用 `signtool sign /fd sha256 /a <exe>` 签名
- macOS：`codesign --deep --sign "Developer ID Application: <名字>" prom-config-editor.app`，公证用 `xcrun notarytool`
