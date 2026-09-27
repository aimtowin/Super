# Sidebar Emoji Icons Implementation Plan

**Goal:** 为普通文件夹、链接文件夹（含子目录）、合集和智能合集提供自定义 Emoji 图标。

**Architecture:** 复用侧栏行、现有右键菜单及 DialogShell。按资源库 ID、条目类型和稳定 ID 保存本机偏好，不修改资产数据库。用浏览器原生 Emoji 字体显示，不联网、不新增依赖。链接状态用小徽标保留；删除自定义值即恢复默认。

**Tech Stack:** React 19、TypeScript、localStorage、Vitest/happy-dom、Playwright。

用户于 2026-09-27 确认方案。本次不发布、不推送、不操作 ECS，保留工作区原有文档改动。依照 Code、writing-plans 流程执行；使用当前工作区，避免移动已有改动。引用的 superpowers 执行工具不在本会话中，使用现有文件工具及测试命令完成。

## 1. 持久化与校验

- 新增 `src/renderer/sidebar-emoji-preferences.ts` 和 `tests/unit/sidebar-emoji-preferences.test.ts`。
- 先写测试：单 Emoji、组合表情、旗帜、数字键帽、无效字符串；库及类型隔离；恢复默认；损坏存储和写入失败。
- 使用运行时 Unicode RGI Emoji 校验，首尾空白可去除，多个 Emoji 不接受。
- 运行 `npx vitest run tests/unit/sidebar-emoji-preferences.test.ts`，先确认缺失实现失败，再实现并通过。

## 2. UI 与接入

- 新增 `src/renderer/SidebarEmojiDialog.tsx`、`src/renderer/sidebar-emoji.css`、`src/renderer/use-sidebar-emoji.ts`。
- 修改 `NavigationSidebar.tsx`、`context-menu.tsx`、`AssetContextMenu.tsx` 及中英文 catalog。
- 右键菜单新增设置入口；面板约 360px，限制视口高度，可滚动，沿用现有主题变量。常用表情选择后预览，保存才提交；支持粘贴、取消、恢复默认。
- 使用 portal 避免侧栏裁剪；复用 focus trap；Escape 关闭；存储失败留在面板并提示。切库时不能把旧面板的值写入新库。
- 链接子目录使用自身虚拟 ID，不能覆盖链接根目录图标。

## 3. 验证

- 扩展 `tests/unit/navigation-sidebar.test.ts`，验证四种节点入口、保存、重挂载保留、恢复、库隔离、链接状态、取消与错误处理。
- 运行相关 Vitest、`npm run typecheck`、`npm run lint`。
- 尽可能用隔离测试页面检查实际渲染截图及键盘交互；不使用用户真实资源库。
- 记录实际结果，不声称历史全套测试通过。

## 完成记录（2026-09-27）

- 四类条目右键入口、32 个常用 Emoji、输入/粘贴、保存、取消、恢复默认已实现。链接根与子目录分别保存，保留链接/离线徽标。
- 面板宽度 360px，限制视口高度，深浅主题复用现有样式；使用本机 Emoji 字体，无新增依赖。
- 保存范围为本机当前应用配置，按资源库与条目 ID 隔离，不随资源库导出到其他电脑。
- `npm run typecheck`、`npm run lint` 通过（Lint 仅原有大文件 Babel 提示）。
- 核心 4 组单元测试 84 项通过；加入 i18n 与插件菜单回归后共 6 组、108 项通过。
- `node scripts/run-e2e.mjs tests/e2e/sidebar-emoji.test.ts`：真实 Electron 回归 1 项通过，覆盖菜单入口、非法输入、组合表情、Tab/Enter/Escape、完全退出后重新打开资源库保持、恢复默认。已人工查看深浅主题截图。
- 端到端测试只使用临时测试库。原有工作区文档未改动，本次未改版本、未打包发行、未提交或推送、未访问 ECS。
