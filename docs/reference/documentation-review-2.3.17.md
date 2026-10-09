# v2.3.17 文档审查与仓库清理

审查日期：2026-10-09。软件正式版本仍为 **2.3.17**；本次只修改文档、配图、文档维护脚本和忽略规则，不是新软件发行，不部署 ECS。

[完整功能配图](../user-guide/features.md) · [仓库地图](../REPOSITORY_GUIDE.md) · [版本验证原始记录](../releases/v2.3.17-validation.md)

## 基线与依据

- 清理前本地/远端 main 基线：`e359a291`，差异计数为 0/0；GitHub 仓库保持私有。
- 软件源码、package 和最新正式 Release 为 `v2.3.17`，发行源码 `4516e0a2928e0a92f757bbeee8a61c66d032ebd6`；46 个正式发行附件。文档提交不会移动发行标签。
- 依据为现有架构记录、当前 Renderer/Preload/Main/Worker 操作入口、guest API、插件 schema、更新器源代码、真实安装包截图及已有验证记录。
- 原有 docs 索引和 v2.3.0 验证补充保持并审查其关联历史清单。私人交接及对话 HTML 在本地保留、加入精确忽略规则，不发布。

## 修正清单

| 类别 | 发现 | 当前处理 |
| --- | --- | --- |
| 首页 | README 版本与手册入口落后 | 对齐 2.3.17，首页前部突出全功能图文文档；中文/英文入口互通 |
| 操作手册 | 用户手册声明仍停在 2.2.8/2.3.2 | 当前说明核对 2.3.17，分离历史版本事实与现在的操作 |
| 资源库 | 切换位置与索引说明混杂 | 以左下角库卡片、索引和当前菜单为准；注明隔离模式最近记录为空 |
| 图标/提示 | 旧 Emoji 菜单名与双重 tooltip 说明 | 自定义图标按当前入口描述；统一右下角说明，不再保留双提示承诺 |
| 筛选 | 排除和资产反选含义不足 | 补维度内 OR、跨维度 AND、包含/排除、摘要移除和当前范围反选 |
| AI | 图注把属性/命名入口写成成功 AI 结果 | 不连接外部服务，不伪造结果；补全局开关和文件夹自动分析范围 |
| 媒体/外观 | OBJ 图注写 FBX；明暗/背景图不对应 | 真实打开七类媒体与图片/PDF 浮窗；分别截取明暗及展开背景 |
| 更新 | 手动点击启动仍被写成当前策略 | 安装完成短暂提示后自动启动并关闭；失败保留重试提示 |
| 部署参考 | 私钥路径、服务器管理细节和“本任务已授权”残留 | 删除不应继承的部署交接信息；保留公共客户端协议，要求新任务单独授权 |
| 脚本 | 旧 `super` 名称、文件后缀及返回投影错误 | 使用 `superApi`、`.superApi.js/.ts`；修正库/资产投影和 UI notify 约束 |
| 插件 | 保留词 `super` 被当成 JS 局部变量；漏 slider | 用 `context.super` 的 `superApi` 别名，补当前 slider 类型和版本约束 |
| 平台/下载 | 命名规范可能误读为平台发行承诺 | Windows x64 以实际附件为准；私有 GitHub 下载需权限；浏览器扩展未在本版附件中发行 |
| 许可证导航 | OpenImageIO 第三方许可指向缺失 LICENSE/RELICENSING | 补导航文件到既有许可和精确版本的上游页面，不改许可正文与锁定哈希 |
| 历史资料 | 计划/失败容易被当最新实施结论 | 保留日期、失败和未执行项；加当前入口，不回写成全量通过 |

## 发现的当前成品问题

**Console 脚本实际运行失败，未修复。**

在全新隔离 v2.3.17 成品中批准一次只读 `superApi.assets.search` 示例后，UtilityProcess 输出 `Cannot find module 'typescript'`，Main 记录 `automation.runtime.stderr`，Console 返回 `RUNTIME_PROCESS_EXITED`。正式包中的脚本 utility 仍引用该模块，而成品不能解析它。这与脚本语法、文件夹中文名或远端 API Key 无关。

本次清理没有修改依赖/打包/运行时代码，也没有把依赖注入成品后拍“成功图”。保留[真实错误截图](../assets/ui/live-2.3.17/28-script-runtime-error.png)，原始会话日志在本次被忽略的隔离捕获目录中。图文说明及脚本手册明确区分源码 API 与成品运行。

后续修复应核查 TypeScript 外置/打包分类、utility 入口依赖和包清单，再从最终包执行 JS 和 TS Console 两类真实测试；通过之前不要将脚本功能宣称成品已验证。该修复需独立进入软件开发/发行范围。

## 清理范围与恢复

清理仅选择当前 Markdown/HTML 图像引用和源码/脚本中均未使用的旧 UI 图片。产品 Logo、架构图、源码、测试夹具、媒体二进制与许可证、数据库迁移和 `release/baselines/` 均保留。忽略的 `out/`、大型临时库和用户资料不做盲目删除。

旧图先移动到仓库外、桌面上的任务专属备份目录，再提交对应 Git 删除；历史图仍可从清理前提交 `e359a291` 恢复。完整候选和实际数量见下方清理清单。文件不是不可恢复删除。私人 HTML 与交接原文件未移动、未提交。

## 文档与截图检查

- 全新实际安装包捕获：62 张桌面/浮窗图；原生更新源码安全预览 2 张，合计 **64 张**。捕获过程完成不等于已知产品问题已修复。
- 功能文档为 12 大类、逐项操作说明，引用全部 64 张图。外部服务、原生预览、索引隔离状态和实际 Console 错误均有明确限制。
- 本地链接/锚点、HTML 图片、截图解码、尺寸/哈希及全图覆盖由 `scripts/docs/audit-docs.mjs` 检查，回归用 `node --test scripts/docs/audit-docs.test.mjs`。
- 每张图片以概览联系图检查，重点设置、媒体和原生窗口另看原尺寸；原件不靠压缩裁切掩盖结果。
- 历史验证记录保留，例如旧全量 Worker/UI 失败；本次不运行或宣称整套软件回归通过。

提交前检查结果：**138 个 Markdown 文档、422 个本地引用、0 个失效链接/锚点**；64 张新截图全部被功能指南引用，解码/尺寸/SHA-256 错误为 0。文档审查脚本 5 项测试 PASS，ESLint（新增维护脚本）、媒体运行时完整性校验、diff whitespace check 均通过。Git 索引发布检查还发现并修正 2 处“本地能打开、GitHub 不存在”的链接：私人交接文件和忽略目录中的 probe manifest；改成明确的本机历史证据说明，不公开内容。

移出 **34 张旧图，36,561,568 bytes（34.87 MiB）**，SHA-256 移动前后均一致；备份目录名为桌面的 `Super-repository-cleanup-backup-20261009-a4076e5f`。备份内保留原相对路径及恢复说明。这减少当前工作树/以后克隆签出的过期文件，但不改写 Git 历史，也不声称历史对象已从服务器回收空间。

GitHub 同步仅提交/推送所列文档范围，不强推、不改仓库可见性、版本标签或现有 Release。最终同步证据为本提交在远端 main 的相同 SHA；不是修改本报告的发行版本号。

### 移出的旧图清单

- `docs/assets/ui/3D-inspector.png`
- `docs/assets/ui/AI-analyze-menu.png`
- `docs/assets/ui/AI-analyze.png`
- `docs/assets/ui/AI-config.png`
- `docs/assets/ui/MCP-settings.png`
- `docs/assets/ui/asset-filter.png`
- `docs/assets/ui/extension.png`
- `docs/assets/ui/filter-panel.png`
- `docs/assets/ui/import-sequence.png`
- `docs/assets/ui/library-sync.png`
- `docs/assets/ui/live-2.2.8/ai-analysis-result.png`
- `docs/assets/ui/live-2.2.8/ai-context-menu.png`
- `docs/assets/ui/live-2.2.8/ai-search.png`
- `docs/assets/ui/live-2.2.8/ai-settings.png`
- `docs/assets/ui/live-2.2.8/appearance-dark.png`
- `docs/assets/ui/live-2.2.8/appearance-light.png`
- `docs/assets/ui/live-2.2.8/automation-scripts.png`
- `docs/assets/ui/live-2.2.8/background-settings.png`
- `docs/assets/ui/live-2.2.8/color-filter.png`
- `docs/assets/ui/live-2.2.8/create-library.png`
- `docs/assets/ui/live-2.2.8/import-menu.png`
- `docs/assets/ui/live-2.2.8/library-sync.png`
- `docs/assets/ui/live-2.2.8/mcp-settings.png`
- `docs/assets/ui/live-2.2.8/model-viewer.png`
- `docs/assets/ui/live-2.2.8/open-external-library.png`
- `docs/assets/ui/live-2.2.8/open-sync-library.png`
- `docs/assets/ui/live-2.2.8/plugin-settings.png`
- `docs/assets/ui/live-2.2.8/smart-collection.png`
- `docs/assets/ui/live-2.2.8/sync-settings.png`
- `docs/assets/ui/open-external-library.png`
- `docs/assets/ui/open-sync-library.png`
- `docs/assets/ui/super-Preview.png`
- `docs/assets/ui/super-workspace-2.2.8.png`
- `docs/assets/ui/sync-settings.png`
