# SuperLib Local Upgrades Implementation Plan

> 使用当前可用的 brainstorming / writing-plans / Code / executing-plans 流程；不调用不存在的 superpowers 子技能，不擅自委派、提交或部署。

**Goal:** 继续补齐 F01–F14，先修复用户新报的图标选择与直接父项拖拽；功能及性能说明仅使用对应版本源码和实测证据。

**Architecture:** 保留 Worker 文件/SQLite 所有权及共享协议；外观借鉴分类、图形和颜色，但兼容 Super 既有 Emoji 存储，不整体替换既有迁移历史。拖拽将“落点”和“实际目标父项”分开，保持资源卡片拖放语义。

**Tech Stack:** Electron / React / TypeScript / Vitest / Playwright / sharp / bundled FFmpeg。

## 用户范围（2026-10-10）

用户明确仅补软件本体。F15 官方目录/账号服务/ECS 继续暂停。不改版本、不安装、不打包、不推送、不宣称发布。保留上一轮所有未提交修复和用户 README 署名。

## 首批：三个可独立验收的任务

### Task 1：完整的侧栏图标选择体验

Files: `src/renderer/SidebarEmojiDialog.tsx`、`sidebar-emoji-preferences.ts`、`use-sidebar-emoji.ts`、`NavigationSidebar.tsx`、`sidebar-emoji.css`、新增 `sidebar-appearance.tsx` / `sidebar-appearance-catalog.ts`；双语目录；`tests/unit/sidebar-emoji-preferences.test.ts`、新增外观测试、`tests/e2e/sidebar-emoji.test.ts`。

1. 按已归档的图标分类资料完善选择器，保留来源版权与自身存储兼容性。
2. 补分类表情、图形/颜色、搜索/空结果、复合 Emoji 与旧偏好迁移测试，运行红灯。
3. 以独立 v2 外观偏好兼容 v1 Emoji，限制图标/颜色白名单；不将任意 SVG/HTML/URL 落到 UI。
4. 分类/搜索/选择/清除/预览/保存均支持键盘、焦点返回、暗亮主题、窗口缩放。链接状态徽章不能被自定义图标覆盖。
5. 跑 unit 和独占临时库 E2E，截取并检查新界面；记录哪些测试/截图真实执行。

### Task 2：直接父项拖拽提升层级

Files: `src/renderer/folder-drag-drop.ts`、`use-folder-drag-drop-handlers.ts`、`NavigationSidebar.tsx`、合集拖拽解析模块、`App.tsx`；`tests/unit/folder-drag-drop.test.ts`、合集解析测试、隔离 E2E。

1. 补失败断言：孩子落到直接父项→父项的 parent/null；自己/后代拒绝；多选/未知/循环事实安全失败。
2. 只在侧栏树启用提升一级，资源卡片落到文件夹依旧进入该文件夹。
3. 合集和托管文件夹都应用同一语义，提供根级落点；资产加入合集不混为合集重排。
4. Worker 既有移动/冲突/撤销管线保持；验证真实库文件路径和集合 parent 变化。

### Task 3：F01 媒体格式与交付证据

Files: `src/shared/media-formats.ts`、媒体 MIME/代理策略、相关 Worker 分支/预设、真实媒体格式测试、README 功能说明、阶段结果文档。

1. 补 JFIF/AVIF/FLV 注册/MIME/代理红灯与真实格式夹具。
2. JFIF 复用 JPEG，AVIF 用真实 sharp 解码路径；FLV 走 FFmpeg 代理，不宣称 Chromium 原播。
3. 验证导入→类型→缩略图→预览链，不仅扩展名列表。
4. README 按当前交付能力介绍软件；历史 HTML 只作为决策来源，性能百分比必须有同口径基准，没有则写“未实测”。未完成 F02–F14 保持明确待办，不写已补齐。

## 后续批次（继承完整清单，不计为已实施）

F02–F05：任意颜色/相似度、音频封面/偏好、GIF/速度/旋转/缩放、文本折行和明确编码保存。

F06–F11：字体、目录 Inspector、完整外观/排序/侧栏过滤、独立工作区、AI 生成/历史/多标签、忽略/批量目录。

F12–F14：元数据同步/自动同步、明确图像写回、大内容分块/队列预算。须单独保护同步身份、人工 AI 元数据、旧库/旧 RPC 和崩溃恢复。

每批先实现再验收，设置检查点。不得因任务多或测试绿灯而把尚未实施的能力计为完成。

## 验证命令

`node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts <本批用例>`；`npm run typecheck`；修改文件 ESLint；隔离 `node scripts/run-e2e.mjs <本批 E2E>`。本机根 `.vite` 经 read-only 检查确认为可再生构建目录，启动测试只使用独占 user-data 与临时库，不操作运行版。

历史阶段结果保持原证据；新批次写新日期的结果及限制，文档引用测试与 README 末尾 MIT 署名一并检查。

## 首批检查点（2026-10-10）

Task 1、Task 2 和 Task 3 已实施并通过专项验证；相关合集撤销缺陷一并修正。F01 完成，F08 部分完成，不将其余计划记为完成。当前结果、真实截图、初轮失败与改正、剩余项见[实施结果](../reference/local-upgrades-results-2026-10-10.md)。F15 仍暂停；未发布。
