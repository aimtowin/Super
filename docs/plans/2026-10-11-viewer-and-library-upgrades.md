# 查看器与资源组织升级实施计划

> 使用可用的 brainstorming、writing-plans、Code 与 impeccable 技能；不依赖不存在的 superpowers 子技能，不委派，不自动发布或操作 ECS。

**Goal:** 实现 Markdown、ZIP 成员、自定义文件夹封面、缺失链接隐藏、统一选择器记忆、25% 视频封面、统一近边控件，并验证全屏切图和查看器删除/链接导入行为。

**Architecture:** 保持 Worker 对文件与 SQLite 的所有权；Renderer 只消费有上限的协议响应。保留原编辑、人工审核、代理、撤销和源保护。全屏属于稳定父宿主而非按资产重建的内容组件；设置默认近边显示，同时保留旧闲置模式。封面用库内资产身份，不引用任意远程地址。

**Tech Stack:** Electron、React、TypeScript、SQLite、Zod、Vitest、Playwright、yauzl、FFmpeg。

基线：2.3.18 / `bf9db0e`。用户确认近边显示为默认。G01–G07、V01、V02 已完成工作区实现与 Windows 隔离验收；尚未打包、发布或推送。当前真实图库与已安装软件不作为实验环境。

## 实施顺序及验收

每项遵循：补失败测试 → 运行确认失败 → 最小完整实现 → 专项回归 → 记录实际结果。新增入口需中文/英文、加载/失败/空状态及键盘操作。

1. **G05 选择器记忆**：`src/main/dialog-directory-memory.ts`、`src/main/native-dialogs.ts`、`src/main/index.ts`、`tests/unit/dialog-directory-memory.test.ts`。统一打开/导入/另存为；只有成功选择更新，取消不覆盖；文件名默认值保留，明确目录优先，已失效目录不阻断对话框，E2E 注入不污染真实偏好。
2. **G06 视频海报**：`src/worker/video-poster-seek.ts`、`src/worker/library-service.ts`、`tests/unit/video-poster-seek.test.ts` 及视频 Worker 回归。有限正时长在 25% 寻帧，短片/未知/空帧回退；代理与源文件不被改写，取消/资源错误不吞掉。
3. **V01 全屏切图**：`src/renderer/App.tsx`、`src/renderer/AssetPreviewModal.tsx`、`src/renderer/styles.css`、查看器 E2E。稳定宿主跨上一张/下一张存活；关闭/退出全屏明确清理；通知与后台刷新保持预览。
4. **G01 Markdown**：`src/renderer/MarkdownPreview.tsx`、`TextViewerControls.tsx`、`TextAssetPreviewTile.tsx`、相关卡片/Inspector。源码/渲染切换不丢草稿；支持嵌套列表、任务项、表格、代码和长文；禁止 HTML 执行、危险链接及隐式远程图片请求。卡片与 Inspector 使用同一安全渲染策略，读取维持已有上限。
5. **G02 ZIP**：`src/worker/zip-preview.ts`、`library-service.ts`、`src/shared/library-api.ts`、`src/shared/protocol/{requests,responses}.ts`、`src/{main,preload,worker}/index.ts`、`src/renderer/ZipViewerSurface.tsx`。懒枚举有条目/大小/比率预算；路径穿越、符号链接、加密、重复成员拒绝；按成员只读有界预览；不执行内容、不写回源、不解压到磁盘；源版本变化拒绝旧选择。
6. **G03 文件夹图片封面**：Worker 库内设置、共享协议、`FolderCoverDialog.tsx`、`App.tsx` 内文件夹卡片及操作入口。支持选择图片资产、重置、源丢失/删除后自动封面回退；不会复制图片字节或修改链接源；持久化与同步边界需明确验证。
7. **G04 缺失链接隐藏**：共享过滤协议、`src/worker/library-service.ts`、库查询与目录树、Renderer 设置。全局可逆显示偏好，托管缺失和真实删除/忽略不混淆；筛选发生在分页前，计数与结果一致；恢复可见后可定位/移除引用。
8. **G07 统一近边控件**：`src/renderer/viewer-preferences.ts`、`use-viewer-chrome-idle.ts`、`AppSettingsPages.tsx` 及查看器 CSS。图片/视频/GIF/模型/文本一致；按区域感知指针，焦点可达与键盘唤醒不被隐藏；减少动画偏好、主题和缩放不受损。
9. **V02 删除及链接导入**：App 查看器键盘与删除动作专项，真实隔离库回归。Delete 只作用于当前预览身份，Shift+Delete 保留危险确认和源保护；文本输入不触发删除；去重及序列显式确认不由磁盘对账自动改变。未通过运行验收不标完成。

## 最终验证与文档

运行新增单元/Worker 测试、`npm run typecheck`、相关 ESLint、隔离查看器 E2E 和既有安全回归。使用真实进程检查新增界面；不将源码/单测通过写成已安装成品验收。

截图中的历史差距表应移除，并以 Super 自身升级结果及实际待验收事项替代。来源与许可仍只在既有集中记录与 LICENSE 保留，不新增其他品牌对照入口；必要原版权不删。计划状态与测试结果记录在本计划收尾部分，失败保留。

本轮未获打包发布授权，不自动提升版本、创建 Release、推送或更新服务器。

## 实际交付与使用入口

| 项目 | 状态 | 使用方式与边界 |
| --- | --- | --- |
| G01 | 源码完成，单元及真实窗口通过 | 双击 `.md` / `.markdown`，在「源码／渲染」间切换；卡片与右侧检查器共用渲染策略。保留原文本保存、草稿与冲突检查；HTML 禁用，图片只显示替代文本，外部 HTTP(S) 链接需确认，卡片不嵌套可点击链接。 |
| G02 | 源码完成，安全及真实窗口通过 | 双击 ZIP，筛选或选择成员，只读查看 Markdown、文本与 PNG/JPEG/WebP/GIF。最多 5000 成员、8 GiB 原归档及累计声明内容、压缩比 100（超过 1 MiB 才检查）、文本 1 MiB、图片 8 MiB、总解码像素 16777216（含动画页）、10 秒读取预算。超限／不支持／损坏显示失败，不提供可执行成员或磁盘解压。 |
| G03 | 源码完成，迁移、持久化及真实窗口通过 | 文件夹右键「设置文件夹图片封面」，选择库内图片或恢复默认。可搜索，不仅限于首批 100 图片；缺失、删除、未生成或已失效缩略图回退自动封面。记录资产 ID，完整库数据库备份会保留；不属于资产级 WebDAV 元数据同步。 |
| G04 | 源码完成，协议、查询及真实窗口通过 | 「设置 → 浏览」切换「隐藏缺失的链接资产与文件夹」，默认关闭。查询、分页、布局、选择及当前视图刷新统一执行；离线链接恢复显示可逆，托管缺失与回收站不受影响。真正删除／忽略不会因关闭显示开关而复活。 |
| G05 | 源码完成，纯逻辑与原生包装集成测试通过 | 原生打开／导入／另存为共享成功选择的目录；取消不更改，明确路径优先。目录失效或偏好写入失败可继续选择。Windows 原生选择器用模拟 Electron 返回值验证，未宣称人工跨平台验收。 |
| G06 | 源码完成，真实解码及回退测试通过 | 新生成视频封面优先取 25% 时长。短片、未知时长、空输出、进程退出／异常最多一次回退；取消和内存不足不热重试。视频、代理及旧封面不自动重写。组件修复后的历史失败任务通过「刷新磁盘变化」重试，不在打开库时全量扫描。 |
| G07 | 源码完成，几何逻辑及真实窗口通过 | 「设置 → 浏览」选「靠近边缘显示」（默认，工具栏附近同样触发）、「闲置后隐藏」或「始终显示」。图片、视频、GIF、模型、文本和 PDF 共用，键盘唤醒／焦点仍可达；视频隐藏主控件时显示细进度线。 |
| V01 | 源码完成，真实全屏及后台刷新通过 | 全屏宿主在上一张／下一张切换时保持；按资产重建内容组件，防止草稿或播放器状态串资产。覆盖全部资产、筛选、智能合集及草稿智能合集四种通知／刷新场景。 |
| V02 | 源码完成，快捷键、Worker 与真实窗口通过 | 查看器 Delete 仅处理当前资产，忽略文本输入与重复键；托管 Shift+Delete 保留既有危险确认，链接源永久删除键禁用。删除前保存草稿并释放预览。链接去重、序列识别和源变化安全检查继续走既有流程。 |

## 本轮发现并一起修复的问题

- 新封面迁移改为幂等建表／触发器，避免迁移分叉重放时「表已存在」；既有迁移校验和不修改。
- 封面配置首次读取失败时禁止误覆盖；选择器改用共享图片格式注册表，兼容已有 JFIF、PSD、RAW 等图片资产入口。
- 开关恢复显示时立即重新查询当前范围；内部可见性过滤独占一个预算槽，保留原 16 项用户筛选上限。
- ZIP 校验 CRC、中央目录攻击、真实栅格格式与动画总像素预算，迟到流与超时均关闭。
- 视频回退异常只重试一次，避免二次回退循环；旧音频波形路径保留。
- 序列滑块在零帧按 Home 即时暂停；浏览器不触发 change 时也不会被队列中的播放 tick 推进一帧。
- 查看器通知移到下部，避免遮住文本／PDF 工具栏；窄工作区顶部工具栏可换行，避免伸入检查器造成点击被拦截。

## 证据与尚未执行的范围

最终测试汇总见下方记录。截图由真实隔离 Electron 进程生成到 `test-results/`（不入库），包含 `markdown-rendered.png`、`zip-readonly.png`、`folder-cover.png`、`fullscreen-viewer.png` 和 `sequence-viewer-transforms.png`；不是设计稿。所有测试库和用户配置均使用临时目录，未改动真实图库或已安装版本。已逐张检查 Markdown、ZIP、封面选择和全屏截图。

初始窗口测试失败也保留结论：序列测试使用了过期控件选择器，并暴露 Home 零帧未暂停的真实竞态；后者已改源码。视频重启测试旧期待与此前的有界调度策略不符，日志确认历史任务为 `FFMPEG_REQUIRED`，正常打开不做全库重试；修订测试明确点击真实刷新按钮后成功解码，没有偷偷恢复打开库时的全量扫描。

未执行：macOS 实机、签名安装包、GitHub/ECS 发布、同机同库竞品性能基准。既有成品已知问题仍保留，不以本次功能升级宣称全面消除；不宣称全面性能超越。

### 最终测试记录（2026-10-11）

| 验证 | 实际结果 |
| --- | --- |
| `npm run typecheck` | 通过：应用与扩展 TypeScript 检查均退出 0 |
| 对全部已改及新建 `.ts` / `.tsx` 运行 ESLint | 通过，0 错误／警告；大文件 Babel 提示不是诊断错误 |
| `node scripts/run-vitest-with-electron.mjs run tests/unit --maxWorkers=2` | 443 文件通过，3534 测试通过，5 项跳过（保留既有平台／条件门控） |
| Worker 专项 13 文件，加 `folder-browse-entries.test.ts` | 分别 295、4 项通过，共 299 项；包含真实 FFmpeg 25% 解码、回退、源复制稳定性、链接／序列、迁移兼容、只读数据库、派生物修复与写租约 |
| `node scripts/run-vitest-with-electron.mjs run --config vitest.history-audit.config.ts --maxWorkers=2` | 10 项通过：既有历史操作安全专项 |
| 隔离 Electron E2E：`viewer-library-upgrades`、`preview-background-refresh`、`media-preview`、`image-sequence-viewer` | 10 项全部通过，0 跳过；显式配置真实 `SUPER_REAL_FFMPEG_PATH=resources/ffmpeg/win32-x64/ffmpeg.exe` |
| 文档实体／锚点审查（包含新计划） | 157 份 Markdown、930 个本地引用、77 张引用图片，0 断链；新计划尚未加入 Git 索引，未声称已通过发布索引门禁 |
| `git diff --check` | 通过，无空白错误 |

Worker 专项文件：`bounded-write-command`、`viewer-library-upgrades`、`video-poster-upgrades`、`video-exr`、`linked-folders`、`image-sequence`、`import-source-stability`、`library-schema-readonly`、`schema-lenient-read`、`schema-compatibility`、`schema-downgrade-chain`、`migration-discipline`、`derived-artifact-repair`，以及单独运行的 `folder-browse-entries`（均为 `tests/worker/*.test.ts`）。

真实进程最终运行前已通过 `scripts/run-e2e-isolated.mjs` 重建生产式 `.vite` 文件入口，再用相同入口执行最终 Playwright 回归。该入口不是已签名安装包。

许可与独立品牌边界：未改动 README 底部唯一来源入口或 LICENSE 必要版权；新增 Markdown 组件 MIT 署名加入 `THIRD_PARTY_NOTICES.md`。未进行 Git 提交、推送、版本号变更、Release 或 ECS 操作。
