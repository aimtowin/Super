# v2.3.17 实际界面截图

拍摄日期：2026-10-09。完整功能与操作见[图文介绍](../../../user-guide/features.md)，清理与文档发现见[审查报告](../../../reference/documentation-review-2.3.17.md)。

## 来源

- 启动真实 `out/Super-win32-x64/Super.exe`，确认 `app.isPackaged`、版本 `2.3.17` 及独立 user-data 路径；未改用户正在运行的实例。
- 发行源码标签为 `v2.3.17`，提交 `4516e0a2928e0a92f757bbeee8a61c66d032ebd6`。EXE SHA-256、截图尺寸/哈希记录于[manifest.json](manifest.json)。
- 素材为本次生成的插画、WAV、WebM、PDF、文本/HTML，以及仓库自有模型夹具；素材不是用户作品或外部下载。所有库、删除、链接、重复导入测试均发生于临时目录。
- Playwright 控制实际 Electron UI；仅在所属进程中替代原生路径选择器以选中已知临时目录。只读 Console 示例的原生运行确认亦限定在此进程中批准，不改变正式程序的权限设计。
- 62 张桌面/浮窗截图，加 2 张当前 Inno 源码编译的原生更新安全预览，共 64 张。没有模拟 CSS 界面或 AI 生成产品截图。

## 验证边界

- 全新演示库的完整截取流程已执行，62 个截图输出、捕获任务失败 0；这不是全部功能测试通过。
- Console 实际运行失败，UtilityProcess 缺少 `typescript`，错误 `RUNTIME_PROCESS_EXITED`。截图和 manifest 将其记录为已知产品问题，不伪造成功输出。
- AI、WebDAV、MCP 和第三方插件只拍摄配置/入口，没有输入密钥、生成 MCP 凭据、连接服务或安装第三方代码。
- 资源库索引为空是隔离 E2E 模式不保存最近记录，不描述普通用户的历史库。
- 图像、视频、音频、模型、PDF、文本和 HTML 查看器打开了实际自有文件；不能推断所有编码、色彩空间、外部模型依赖均兼容。
- `updater-progress.png` 固定预览进度；`updater-completed.png` 暂停自动消失以便截图。预览不含安装文件/注册表操作，不启动或关闭正式应用，不代表真实生产升级已经测试。

## 重拍与审查

从仓库根目录执行，要求 Node 24、项目依赖、正确的本地 v2.3.17 成品和 Windows 桌面：

```powershell
node scripts/docs/capture-features.mjs
pwsh -NoProfile -File scripts/docs/capture-updater.ps1
node scripts/docs/register-updater-shots.mjs
node scripts/docs/preview-screenshots.mjs
node --test scripts/docs/audit-docs.test.mjs
node scripts/docs/audit-docs.mjs --json
```

原生预览使用 **PowerShell 7 (`pwsh`)**，默认编译器为本机 SuperTools 下的 Inno `ISCC.exe`，也可显式传 `-Compiler`。不要用 Windows PowerShell 5.1 误读无 BOM UTF-8 脚本。若另有预览进程运行，脚本拒绝接管；先自行结束那一预览，不要批量杀进程。

截取脚本的 `--reuse=tmp/docs-capture-…` 与 `--only=…` 仅用于补拍所属临时库。复用库有状态（如已回收的资产），不能当全新导入/删除验证。正式检查使用全新目录完整运行，再登记原生图。

审查脚本核对全部当前/历史 Markdown 的本地链接、图片和锚点，并解码 manifest 图片、匹配尺寸与 SHA-256、核对每张图在功能目录中的引用。概览联系图保存在被忽略的 `tmp/docs-audit/`，不修改原始截图。
