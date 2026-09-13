# Super Lib 自动更新模块迁移参考

> 适用对象：需要把 Super Lib 当前的 Windows 自动更新能力迁移到另一个 Electron/Node.js 应用的开发者或 AI 智能体。
>
> 当前实现版本：Super Lib `v2.2.3`。本文以当前源码为准；不要把历史计划文档当作运行时配置。

## 1. 模块目标与边界

该模块实现的是 **用户确认下载、校验后更新、显式启动新版本** 的 Windows 更新闭环：

```text
启动后的自动检查（仅提示）
  -> 用户确认下载
  -> 可取消、可断点续传的 ZIP 下载
  -> SHA-256 校验
  -> 解出 SuperSetup.exe 到稳定的用户缓存目录
  -> 写入“待安装”记录
  -> 用户点击“重启并完成更新”
  -> 当前应用隐藏并退出
  -> Inno Setup 前台更新器替换文件，展示进度
  -> 用户点击“启动 Super Lib”
  -> 新版本启动并消费“更新完成”记录
```

关键设计取舍：

- 更新源只信任一个固定 HTTPS 域名和下载路径前缀，**不信任服务端返回的任意 URL**。
- 完整包永远存在；增量包只是优化。增量包下载、校验、解压或安装失败时，自动回退完整包。
- 下载成功不等于安装：安装器先持久化到用户目录，用户再决定何时重启安装。
- 更新 UI 属于 Inno Setup 进程而不是 Electron 进程，因此应用退出后仍能持续显示真实安装进度。
- 发布时先上传到服务器 staging 目录；只有所有文件上传成功后才原子替换 `latest.json`，防止客户端看到半成品版本。

当前仅完整支持 Windows x64 的“已安装发行版”增量更新；macOS/便携版可沿用完整包路径，但没有 Windows 的 Inno 安装交接和 delta 支持。

## 2. 源码地图：迁移时必须带走的文件

| 职责 | Super Lib 源文件 | 迁移说明 |
| --- | --- | --- |
| 更新发现、下载、校验、断点续传、解压、delta 回退 | `src/main/app-update-service.ts` | 核心服务，必须整体迁移并改名/改配置 |
| 主进程创建服务、自动检查、IPC、退出交接 | `src/main/index.ts` | 参考更新相关区块；不要整文件复制 |
| IPC 常量 | `src/shared/protocol/channels.ts` | 替换应用命名空间 |
| 共享 Zod 类型/API | `src/shared/app-update.ts` | 主进程、preload、渲染层共同契约 |
| contextBridge/preload API | `src/preload/index.ts` | 只暴露白名单方法 |
| 渲染层状态与交互 | `src/renderer/App.tsx` | 可按新应用 UI 重写，保留状态机 |
| 完整 Inno 安装器 | `assets/inno/supersetup.iss` | 修改应用 ID、名称、exe、安装目录、图标 |
| Inno 前台更新界面与 relay | `assets/inno/silent-update-ui.iss` | 建议整体复制后统一品牌替换 |
| 完整包构建 | `scripts/inno-build.mjs` | 生成 `SuperSetup.exe` 与承载它的 ZIP |
| 打包文件基线 | `scripts/release/package-file-manifest.mjs` | 每个发行版打包后保存至 `release/baselines/` |
| 增量 Inno 包构建 | `scripts/release/build-inno-delta.mjs` | 依赖“非 ASAR 文件树”布局 |
| 保留增量构建 | `scripts/release/build-retained-deltas.mjs` | 从最近 20 个有效基线生成直达当前版的 delta |
| ECS 安全发布 | `scripts/release/publish-ecs-update.mjs` | 通过 staging + 原子发布 |
| 更新器 UI 预览/验证 | `scripts/release/preview-update-ui.iss`、`scripts/release/verify-update-native-ui.ps1` | 可选，但强烈建议保留 |
| 核心测试 | `tests/unit/app-update-service.test.ts`、`tests/e2e/packaged-startup.test.ts` | 改品牌后继续执行 |

## 3. 首先替换的应用配置

下面是当前 Super Lib 的实际非机密配置。迁移时将其抽成新应用的常量或构建变量；不要继续使用 `Super` / `Super Lib` 的文件名与标识。

| 配置项 | Super Lib 当前值 | 新应用应替换为 |
| --- | --- | --- |
| 应用展示名 | `Super Lib` | 新产品名 |
| 可执行文件 | `Super.exe` | 新应用的 `.exe` |
| 发行包名基准 | `Super-win-x86-64-<version>-setup.zip` | `<Product>-win-x64-<version>-setup.zip` |
| 完整包服务端名 | `Super-win-x86-64-<version>-full-setup.zip` | 新产品一致命名 |
| delta 包名 | `Super-win-x86-64-<from>-to-<to>-delta.zip` | 新产品一致命名 |
| App ID | `{F3A7C2E1-9B5D-4E8A-8C3F-1D6B2A9E4C71}` | **新生成的稳定 GUID；绝不能复用** |
| Windows AppUserModelID | `com.superApi.app` | 新应用的反向域名 ID |
| 已安装标记 | `.super-installed` | 建议改为 `.<product>-installed` |
| 用户缓存目录 | `%APPDATA%\\Super\\updates` | `%APPDATA%\\<Product>\\updates` |
| relay 临时文件 | `%LOCALAPPDATA%\\Temp\\SuperLib-update-relay.exe` | 唯一的新产品 relay 文件名 |
| 公共更新域名 | `https://liuyangyang.me` | 新应用独有的 HTTPS 域名 |
| 静态 manifest | `/downloads/super/latest.json` | `/downloads/<product>/latest.json` |
| 旧 API fallback | `/api/super/updates/latest` | `/api/<product>/updates/latest`，或删除 fallback |
| 允许下载前缀 | `/downloads/super/` | `/downloads/<product>/` |
| ECS 持久化目录 | `/www/wwwroot/resource/data/super-updates` | 新产品专属绝对目录 |

不要把 PEM 私钥、SSH 密码、云主机登录信息写进源码、`package.json`、发布说明或本文档。发布脚本只从环境变量读取私钥文件路径。

### 3.1 Super Lib 当前 ECS 部署交接信息

以下是截至 `v2.2.3` 已由运行环境核验的 Super Lib 更新发布配置。它用于维护 Super Lib；迁移到另一款产品时，建议创建独立下载前缀和独立持久化目录，而不是与 Super 共用发布入口。

| 项目 | 当前值 | 备注 |
| --- | --- | --- |
| ECS/SSH 首选域名 | `liuyangyang.me` | 使用域名，不要在客户端硬编码 IP；HTTPS 证书也绑定此域名 |
| SSH 用户 | `root` | 仅供已获授权的发布自动化使用 |
| SSH 端口 | `22` | 已核验 `sshd` 监听 `0.0.0.0:22` |
| 本机私钥文件 | `E:\\LoveLife\\DOCX\\geeee.pem` | 只传递**文件路径**；禁止读取、粘贴、提交或上传私钥内容 |
| 更新 HTTPS origin | `https://liuyangyang.me` | 客户端固定信任边界 |
| 原生 manifest | `https://liuyangyang.me/downloads/super/latest.json` | 当前优先入口 |
| legacy fallback | `https://liuyangyang.me/api/super/updates/latest` | 兼容入口 |
| 下载 URL 前缀 | `https://liuyangyang.me/downloads/super/` | 所有更新包必须位于其下 |
| 服务器持久化目录 | `/www/wwwroot/resource/data/super-updates` | `latest.json` 与 `releases/<version>/` 均在此处 |
| Web 服务器 | 宝塔管理的 Nginx `1.18.0 (Ubuntu)` | 不是 Caddy |
| Nginx vhost | `/www/server/panel/vhost/nginx/blog.liuyangyang.me.conf` | `server_name liuyangyang.me www.liuyangyang.me`，监听 80/443 |
| Nginx 上游 | `http://127.0.0.1:3000` | 根路径反代到 Docker 容器 `my-app` |

当前任务已经获得对上述 Super Lib 更新目录进行发布和核验的授权。若把本文件交给新的独立 AI 智能体，仍应在该新任务中明确授权它：只可通过该 PEM 路径和 SSH 发布/核验 Super Lib 更新目录；不得修改无关 Nginx、Docker、证书、网站内容或服务器账户。

## 4. 服务端协议

### 4.1 原生 manifest（推荐且当前优先）

客户端先请求：

```text
GET https://<UPDATE_ORIGIN>/downloads/<product>/latest.json
Accept: application/json
User-Agent: <Product>/<currentVersion>
```

服务端必须返回 JSON，最小格式如下。`path` 是相对路径，不是 URL：

```json
{
  "version": "2.2.3",
  "notes": "本次修复说明。",
  "full": {
    "name": "Product-win-x64-2.2.3-setup.zip",
    "path": "releases/2.2.3/Product-win-x64-2.2.3-full-setup.zip",
    "size": 240327459,
    "sha256": "2cca8132e7a8216b3469a6029bbe86ce29f2de4adf5590b78c2ed8fd013952db"
  },
  "deltas": [
    {
      "fromVersion": "2.2.2",
      "asset": {
        "name": "Product-win-x64-2.2.2-to-2.2.3-delta.zip",
        "path": "releases/2.2.3/Product-win-x64-2.2.2-to-2.2.3-delta.zip",
        "size": 3442709,
        "sha256": "2e748e0f64c57ce1209fb14cdf32a9d735b05f7a1835f32400687ce9f54ace78"
      }
    }
  ]
}
```

必需安全约束（客户端和服务端都应实施）：

- `version` 与 `fromVersion` 为 semver；当前实现允许 `x.y.z` 及合法 pre-release/build metadata。
- `name` 只允许 `[A-Za-z0-9][A-Za-z0-9._-]{0,254}`。
- `path` 不能是绝对路径，不能含 `\\`、`?`、`#`、空段、`.` 或 `..`。
- `size` 必须为 `1..2 GiB` 的安全整数；客户端硬上限是 `2 * 1024 * 1024 * 1024`。
- `sha256` 必须为 64 位十六进制；客户端会再对下载完成文件计算 SHA-256。
- `notes` 最长 12,000 个字符。
- `deltas` 可省略；若存在，仅当 `fromVersion` **完全等于**当前版本时才可选择该包。

客户端把 `path` 拼接到固定的 `<UPDATE_ORIGIN>/downloads/<product>/`；即便服务器 JSON 被篡改，外部域名 URL 也会被拒绝。

### 4.2 兼容旧 API（可选）

Super Lib 还会回退请求一个 GitHub Release 风格 JSON：

```json
{
  "tag_name": "v2.2.3",
  "html_url": "https://<UPDATE_ORIGIN>/downloads/<product>/",
  "draft": false,
  "prerelease": false,
  "body": "发布说明",
  "assets": [
    {
      "name": "Product-win-x64-2.2.3-setup.zip",
      "browser_download_url": "https://<UPDATE_ORIGIN>/downloads/<product>/releases/2.2.3/Product-win-x64-2.2.3-full-setup.zip",
      "size": 240327459,
      "digest": "sha256:<64位摘要>"
    }
  ]
}
```

新项目没有旧客户端兼容压力时，只实现原生 `latest.json` 并删除 legacy fallback，代码和攻击面都会更小。

### 4.3 HTTP/CDN 要求

```text
GET/HEAD /downloads/<product>/latest.json
GET/HEAD /downloads/<product>/releases/<version>/<artifact>
```

- 全站 HTTPS；发布物必须在固定同源 HTTPS 路径下。
- 版本目录发布后不可修改（immutable）。`latest.json` 可以短缓存或 `no-cache`；更新包应允许长缓存。
- 必须支持 `Range: bytes=<offset>-`，并在续传时正确返回 `206` 和 `Content-Range: bytes <start>-<end>/<total>`。
- 建议提供 `ETag` 或 `Last-Modified`。客户端把它写入 partial metadata，并用 `If-Range` 避免接续到已替换文件。
- `HEAD` 应返回准确 `Content-Length`；下载返回附件即可。
- 不要让 CDN 对不同版本路径重写到同一个可变文件。

## 5. 客户端更新服务：必须保持的状态机

### 5.1 发行版识别与适配目标

`detectAppDistribution()` 的规则：

1. `SUPER_DISTRIBUTION=portable|installed|development` 可强制覆盖，主要供调试与测试。
2. 未打包开发态默认按 `installed` 运行，以方便测试更新 UI；需要关闭时显式设为 `development`。
3. Windows：可执行文件旁存在安装标记或 `unins*.exe` 才是 `installed`；否则是 `portable`。
4. 支持目标：Windows x64、macOS arm64。其他平台/架构返回“不支持”，不下载。

应用向 `AppUpdateService` 传入的关键路径：

```ts
createAppUpdateService({
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  platform: process.platform,
  arch: process.arch,
  executablePath: app.getPath('exe'),
  tempDirectory: app.getPath('temp'),
  downloadsDirectory: app.getPath('downloads'),
  preparedUpdateDirectory: path.join(app.getPath('userData'), 'updates'),
  environment: process.env,
  onDownloadProgress: (progress) => mainWindow?.webContents.send(UPDATE_PROGRESS_CHANNEL, progress),
  launchInstaller: /* 见第 7 节 */,
});
```

### 5.2 选择规则

```text
latestVersion <= currentVersion       -> up-to-date
Windows x64 + installed + 精确 delta  -> delta-installer
否则有匹配完整包                   -> installer / portable
没有受信且有 SHA-256 的匹配包       -> asset-missing
```

`delta-installer` 失败后，服务只自动回退一次完整安装包；取消下载不触发回退。这保证增量包永远不会阻断升级。

### 5.3 断点续传、验证与缓存

下载 partial 的位置：

```text
<preparedUpdateDirectory>/partials/update-<sha256(url + digest + size)>.part
<preparedUpdateDirectory>/partials/update-<sha256(url + digest + size)>.json
```

metadata 固定为：

```json
{
  "schemaVersion": 1,
  "assetUrl": "https://…",
  "assetName": "…zip",
  "version": "2.2.3",
  "expectedSha256": "…",
  "totalBytes": 3442709,
  "validator": "可选 ETag 或 Last-Modified"
}
```

流程如下：

1. metadata、URL、版本、摘要、大小与 `.part` 大小有一项不匹配，即删除 partial 和 metadata。
2. 如果 partial 已等于目标大小，先计算 SHA-256；正确则直接复用。
3. 未完成时发送 `Range: bytes=<已下载字节>-`，有 validator 则同时发送 `If-Range`。
4. 仅接受匹配 offset 和 total 的 `206 + Content-Range`；服务器回 `200` 代表不支持/不允许续传，客户端删除旧 partial 后从零开始。
5. `416` 删除坏 partial；网络取消保留有效 partial，供下次恢复。
6. 流式写入时报告 `downloading` 进度，并限制总字节不超过 2 GiB。
7. 完成后再次算 SHA-256；不匹配即删除所有 partial，返回 `verification-failed`。

Windows 安装包 ZIP 必须只解出名为 `SuperSetup.exe`（迁移后改成新名）的安全条目。解压路径必须阻止 `..`、绝对路径和任意文件名，避免 ZIP Slip。

## 6. Electron IPC 与渲染层最小契约

建议保持四个用户动作与四类通知：

| 方向 | 方法/频道 | 作用 |
| --- | --- | --- |
| Renderer -> Main | `checkForUpdates()` | 查找更新 |
| Renderer -> Main | `downloadUpdate()` | 用户批准后下载、校验、解压、暂存 |
| Renderer -> Main | `installPreparedUpdate()` | 用户批准退出并启动安装器 |
| Renderer -> Main | `cancelDownload()` | AbortController 取消下载 |
| Main -> Renderer | `onDownloadProgress()` | `downloading/verifying/extracting/launching` |
| Main -> Renderer | `onUpdateAvailable()` | 启动后自动检查只发通知，不自动下载 |
| Main -> Renderer | `onPreparedUpdate()` | 安装器已验证并可重启 |
| Main -> Renderer | `consumeCompletedUpdate()` | 新版本启动后展示完成提示 |

在主进程 IPC handler 中必须确认 `event.sender === mainWindow.webContents`；不要让任意 WebContents 调用下载或安装。preload 只通过 `contextBridge` 暴露上述白名单 API，并用 Zod 验证每个返回 payload。

自动检查只在以下条件下执行：Windows、打包发行版、未设置 `SUPER_DISABLE_AUTOMATIC_UPDATES=1`。当前延迟为窗口可用后的 12 秒；发现更新后只提示，绝不自动下载或自动退出。

## 7. Windows 安装交接与前台更新器

### 7.1 Electron 侧

用户点击“重启并完成更新”时的正确顺序：

1. 将已校验解出的安装器路径、清理目录、版本、说明写入持久化 pending store。
2. 预先写入 completion record，便于新版本启动后确认升级完成。
3. 先 `mainWindow.hide()`，再用 detached 子进程启动安装器，且 `windowsHide: false`。
4. 启动成功才销毁窗口并 `app.quit()`；启动失败要清除 completion、重新显示窗口。

当前 Inno 静默启动参数：

```ts
['/SP-', '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS']
```

其中 `/VERYSILENT` 仅隐藏 Inno 原生向导，**不能**隐藏子进程窗口；自定义前台更新器由 Inno 脚本显示。把 `windowsHide` 设为 `true` 会导致用户看不到更新页。

待安装记录应保存在稳定用户目录（例如 `%APPDATA%\\<Product>\\updates`），不得放在 Inno `{tmp}` 或随机系统临时目录，因为原应用退出后它们可能被清理。新应用启动时应：

- 读取并校验 pending record 路径仍在该缓存根目录；
- 处理意外中断的已批准更新；
- 清理过期缓存；
- 读取并消费“版本匹配”的 completion record，向 UI 提示更新成功。

### 7.2 Inno Setup 侧

`silent-update-ui.iss` 解决了静默 Inno 的两个常见问题：

1. 某些 `VERYSILENT` 情况下自定义窗体没有可用消息循环；脚本先把自身拷贝到稳定的 `%LOCALAPPDATA%\\Temp\\<Product>-update-relay.exe`，然后由 relay 使用 `/SILENT /<PRODUCT>-FOREGROUND-UPDATE` 启动真正前台实例。
2. Inno 原生 "Ready to Install" 向导会在 relay 期间重新出现；脚本在初始化、页面变化和 120ms 定时器内持续隐藏它。

自定义窗体的关键要求：

- 在 `CurInstallProgressChanged(CurProgress, MaxProgress)` 传给 `UpdateSilentUpdateProgress`，展示真实文件应用进度；`MaxProgress <= 0` 使用不确定性动画。
- `CurStepChanged(ssInstall)` 调 `ShowSilentUpdateProgress()`；`ssPostInstall` 才调 `ShowSilentUpdateCompletion()`。
- 完成页必须由用户点击“启动”才用 `ExecAsOriginalUser('{app}\\<Product>.exe', '--updated', …)` 打开应用；不自动启动。
- 原生对话框已显示时不能直接 `ShowModal`，要先 `Hide` 再 `ShowModal`，否则会出现 `Cannot make a visible window modal`。
- 对 Inno 大计数使用浮点数算进度百分比，避免 32 位整数乘法溢出。
- 需要保留键盘可达性；Super 的按钮仅通过 `WM_UPDATEUISTATE` 隐藏原生白色虚线焦点框，不移除 `TabStop`。

完整安装器和 delta 安装器必须 include 同一个更新 UI 文件。完整安装器还应写入自己的 installed marker；从旧 ASAR 版本升级时删除遗留 `app.asar` / `app.asar.unpacked`，否则 Electron 可能继续加载旧程序。

## 8. 发行流程

### 8.1 前置条件

- Node.js 与本项目 `package.json#engines` 匹配；当前 Super 使用 Node 24。
- 已安装 Electron Forge、Inno Setup 7；默认 Inno 路径是 `%LOCALAPPDATA%\\SuperTools\\inno\\tools\\ISCC.exe`，也可通过 `SUPER_INNO_TOOLS` 指定目录。
- 打包输出使用“文件树”布局而非单一 `app.asar`；否则小改动也会让 delta 近似完整包。
- 打包前仍有已发布版本的 `release/baselines/<fromVersion>.json`，不能覆盖或丢失。
- 发布主机能通过 SSH/SCP 访问 ECS；私钥只保存在受控本机或密钥管理系统。

### 8.2 每次发行命令（PowerShell 示例）

以下以 `2.2.3 -> 2.2.4` 为例。先只修改新项目自己的 `package.json` 和 lockfile 版本；不要从 Super 的版本号直接照搬。

```powershell
# 1. 打包、校验，生成 out/<Product>-win32-x64
npm run release:package

# 2. 真实打包应用 smoke test
npm run release:e2e:packaged

# 3. 生成完整安装器、最近 20 个基线直达当前版的 delta，并保存当前基线
npm run release:make

# 可选：只查看下一版会使用哪些历史基线，不生成文件
npm run release:deltas -- --dry-run

# 4. 为完整包、安装器和发布物生成 SHA-256 sidecar
npm run release:checksums

# 5. 只生成 manifest，不上传：发布前必做
node scripts/release/publish-ecs-update.mjs --dry-run
```

发布所需环境变量：

| 变量 | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `SUPER_UPDATE_SSH_HOST` | 是 | 无 | ECS 主机/IP |
| `SUPER_UPDATE_SSH_USER` | 否 | `root` | SSH 用户 |
| `SUPER_UPDATE_SSH_PORT` | 否 | `22` | 1–65535 |
| `SUPER_UPDATE_SSH_IDENTITY_FILE` | 否但推荐 | SSH 默认行为 | PEM/私钥文件绝对路径；不得打印内容 |
| `SUPER_UPDATE_REMOTE_DIR` | 否 | `/www/wwwroot/resource/data/super-updates` | ECS 持久卷绝对路径 |
| `SUPER_UPDATE_RETAIN_RELEASES` | 否 | `5` | 仅保留最近 1–5 个完整发行目录；不能提高到 5 以上 |
| `SUPER_UPDATE_NOTES` | 否 | `Super <version>` | 最长 12,000 字符 |

```powershell
$env:SUPER_UPDATE_SSH_HOST = '<ecs-host>'
$env:SUPER_UPDATE_SSH_IDENTITY_FILE = 'D:\\secure\\<product>.pem'
$env:SUPER_UPDATE_NOTES = '2.2.4：修复……'
node scripts/release/publish-ecs-update.mjs
```

发布器的原子顺序不可改：

```text
本地校验 ZIP、EXE、.sha256
  -> SSH 创建 /remote/.staging-<version>-<uuid>
  -> SCP 上传完整包、安装器、sidecar、manifest、全部 delta
  -> mv 到 /remote/releases/<version>/
  -> 最后 mv manifest 为 /remote/latest.json
  -> 清理 staging；按保留策略删除旧 release 目录
```

完整包与 delta 的保留策略独立：服务器只保留最新 5 个完整发行目录；每个最新 manifest 最多列出 20 个“旧版本直接升级到当前版本”的 delta。生成该 20 个 delta 依赖 `release/baselines/` 中的长期基线清单，不能依赖可能被清理的 `out/`。版本不在最近 20 个有效基线内，或 delta 超过完整包 60% 时，客户端安全地改用完整包。

## 9. ECS/静态站点部署约定

持久化目录结构：

```text
<REMOTE_DIR>/
  latest.json                          # 唯一可变入口，最后原子替换
  releases/
    2.2.3/
      Product-win-x64-2.2.3-full-setup.zip
      Product-win-x64-2.2.3-setup.zip.sha256
      ProductSetup.exe                 # 手动下载入口，可选但当前发布器上传
      ProductSetup.exe.sha256
      Product-win-x64-2.2.2-to-2.2.3-delta.zip
```

站点路由应将：

- `/downloads/<product>/latest.json` 映射到 `<REMOTE_DIR>/latest.json`；
- `/downloads/<product>/releases/:version/:file` 映射到对应静态文件；
- （可选）`/api/<product>/updates/latest` 将 native manifest 映射/转换成 legacy JSON。

Web 服务进程需要对该目录有只读权限，发布 SSH 用户需要读写权限。不要把 staging 路径暴露成可下载路由，也不要允许用户请求任意绝对文件路径。

## 10. 验收清单

### 本地构建与安全

- [ ] `npm run typecheck` 通过。
- [ ] `npx vitest run tests/unit/app-update-service.test.ts` 通过：源校验、semver、delta 选择、失败回退、SHA、Range、取消、缓存恢复。
- [ ] `npm run release:package` 与 `npm run release:e2e:packaged` 通过。
- [ ] 完整包与 delta 包的 Inno 编译通过，安装器 `ProductVersion` 等于 `package.json.version`。
- [ ] delta 清单包含所有变更文件和删除文件；从旧基线应用后应重建新包清单。
- [ ] 使用 UI preview 测试完成、键盘启动、关闭，以及不确定/大进度计数状态。

### 发布后公网验证

- [ ] `latest.json` 的版本、大小、SHA-256 与本地 `out/make/super-update-manifest.json` 完全一致。
- [ ] 完整包和每个 delta 均可 `HEAD 200`，且 `Content-Length` 与 manifest 一致。
- [ ] 下载完整 delta 后计算 SHA-256 与 manifest 一致。
- [ ] `Range: bytes=1024-2047` 返回 `206`，且返回 1024 字节及正确 `Content-Range`。
- [ ] 从上一版真实安装的应用更新：只下载 delta、安装页可见、安装完不自动启动、点击启动后版本正确。
- [ ] 故意让 delta 校验失败：客户端改下完整包且成功安装。
- [ ] 中断下载再恢复：服务器记录到 Range 请求，客户端最终摘要正确。

## 11. 常见失败与禁止项

| 现象 | 原因 | 修复 |
| --- | --- | --- |
| 小改动仍下载数百 MB | 打包为单一 ASAR 或 Electron 运行时被纳入 delta | 改成文件树打包；runtime 未变时复用 EXE |
| 更新器提示找不到 EXE | 从 Inno `{tmp}` relay，进程结束时临时目录被删 | relay 放在稳定 `%LOCALAPPDATA%\\Temp`，先复制后启动 |
| 只弹一下后没有更新页 | 启动器窗口被 `windowsHide` 隐藏，或应用没先退出 | `windowsHide:false`；先 hide app，再启动并成功后退出 |
| 出现 Inno 原生 Ready to Install | relay 重启后原生 Wizard 重新显示 | 持续隐藏 `WizardForm`，并用 `/SP- /SILENT` 启动 relay |
| `Cannot make a visible window modal` | 已显示 custom form 上直接 `ShowModal` | 完成时 `Hide()` 后再 `ShowModal()` |
| 下载无法续传 | CDN 不支持 Range 或 `Content-Range` 错误 | 正确实现 206、Content-Range、ETag/Last-Modified |
| 更新到了未知第三方文件 | 直接信任 manifest 内 `browser_download_url` | 只接受固定 origin + 固定路径前缀；native manifest 只接受相对 path |
| 新版启动仍跑旧代码 | 旧 `app.asar` 遗留且 Electron 优先加载它 | 安装过程删除 `resources/app.asar` 与 unpacked 目录 |
| 自动检查直接下载/退出 | 自动检查与用户批准混在一起 | 自动检查只发 available；下载、安装必须二次明确操作 |

## 12. 给新 AI 智能体的执行指令

1. 先复制第 2 节的完整模块，再做品牌替换；不要只摘取 `app-update-service.ts`。
2. 将所有产品常量集中到一个新配置层，至少包括名称、exe、App ID、安装标记、更新 origin、下载前缀、缓存目录、产物命名。
3. 先实现并测试原生 `latest.json` 完整包更新；确认安全与安装交接后再开启 delta。
4. 任何 manifest、URL、ZIP entry、IPC 输入都以不可信数据处理；保留当前的长度、路径、摘要和来源限制。
5. 不要将自动检查变成静默自动更新；Super Lib 的设计要求用户先确认下载，再确认重启。
6. 不要删除完整包和失败回退逻辑；delta 只是一种带宽优化。
7. 发布前必须做 dry run 与公网 SHA/Range 验证；成功上传不等于客户端一定能更新。
8. 替换 `Super` 字符串时优先审查：Inno `[Setup]`、`[Files]`、`[Run]`、silent UI relay、产物命名、更新 URL、installed marker、AppUserModelID、preload IPC 前缀和 UI 文案。

## 13. 代码定位索引

- 信任边界和 manifest 解析：`src/main/app-update-service.ts` 的 `SUPER_UPDATE_*`、`parseEcsUpdateRelease()`、`isSafeSuperUpdateUrl()`。
- delta 选择与完整包回退：同文件的 `selectUpdateAsset()`、`prepareUpdate()`。
- Range 续传与 SHA 校验：同文件的 `loadPartialDownload()`、`responseResumesAt()`、`prepareUpdateOnce()`。
- 主进程的可靠退出交接：`src/main/index.ts` 的 `APP_UPDATE_INSTALL_CHANNEL` 与 `APP_UPDATE_RESTART_CHANNEL` handlers。
- 前台 Inno 更新器与 relay：`assets/inno/silent-update-ui.iss`。
- 完整/增量安装器的接线：`assets/inno/supersetup.iss`、`scripts/release/build-inno-delta.mjs`。
- 原子 ECS 发布：`scripts/release/publish-ecs-update.mjs`。
