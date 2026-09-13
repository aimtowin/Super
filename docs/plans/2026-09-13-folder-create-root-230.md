# Folder Creation Root Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 点击左侧“文件夹”标题将后续新建父级切回根目录，不改变当前目录、素材预览或鼠标操作前的键盘焦点，并发布 v2.3.0。

**Architecture:** 保留 `assetScope` 与 `sidebarFolderScope` 的分离；标题使用独立原生按钮，仅调用 `setSidebarFolderScope("root")`，不调用导航或加载函数。移除标题栏双击处理和旧辅助函数。标题按钮与隐藏、新建、链接按钮为兄弟元素，避免事件串联。

**Tech Stack:** React、TypeScript、CSS 主题变量、Vitest/happy-dom、Playwright/Electron、Inno Setup、现有 ECS 发布脚本与 GitHub CLI。

---

## 设计边界

用户已明确选择标题行点击方案，不采用双击标题栏或新增弹窗。点击文字及其后空白生效；右侧三枚图标行为不变；无库时禁用；鼠标按下阻止按钮抢焦点，键盘 Tab/Enter/Space 仍使用原生按钮语义。使用现有 `--hover`、`--active`、`--accent` 变量，兼容深浅主题和字体档位，不更换视觉体系。

## Task 1: 先写回归测试

- 修改 `tests/unit/navigation-sidebar.test.ts`，检查标题独立回调、按下保留焦点、选中状态、无库禁用，以及右侧按钮不触发重置。
- 新增 `tests/e2e/folder-create-root.test.ts`：在隔离库创建父/子目录并导入测试图片；打开预览后点击标题，验证预览、面包屑、焦点与新建父级。标题栏双击不改变新建父级。
- 运行 `npm run test:unit -- tests/unit/navigation-sidebar.test.ts` 或直接定向 Vitest；修改前应失败，修改后通过。

## Task 2: 最小实现

- `src/renderer/NavigationSidebar.tsx`：Section 增加可选标题动作、选中与禁用属性；Folders 绑定新的 `onResetFolderCreateParent`。
- `src/renderer/App.tsx`：删除 header 双击业务处理，新增 `onResetFolderCreateParent={() => setSidebarFolderScope("root")}`，不重置预览或加载列表。
- `src/renderer/styles.css`：标题按钮覆盖标题区域的可用宽度；主题变量驱动悬停、按下、选中和键盘焦点状态。
- `src/renderer/i18n/catalogs/{zh-CN,en}.ts`：增加悬停解释，明确只改变新建目标。
- 删除不再使用的 `src/renderer/toolbar-root-scope.ts` 和 `tests/unit/toolbar-root-scope.test.ts`。

## Task 3: 验证与文档

- 运行相关单测、类型检查、ESLint、完整测试与既有发行预检；运行新增 E2E 与导航、文件夹相关回归。
- 对隔离测试实例截图核对悬停/选中样式和预览不变，不向用户正式库写入测试数据。
- 更新中英文基本使用和入门提示，撤销当前教程中的标题栏双击说明；历史记录只补充版本注释，不改写过去事实。

## Task 4: v2.3.0 打包与发布

- 同步 package.json/package-lock.json 版本，撰写发行说明。
- 使用已验证媒体运行时打包、检查包结构、执行 packaged E2E、生成 Inno 完整包。
- 执行 `release:deltas` 从保留的 2.2.3–2.2.8 基线生成直达 2.3.0 的增量包，再生成 2.3.0 基线与 SHA-256。
- ECS 发布前 dry-run 并检查远端目标目录。沿用完整发行目录最多 5 个、增量来源最多 20 个、增量超过完整包 60% 时跳过的规则。
- ECS 原子提升清单后验证 HTTPS 清单、Range/206 与服务端文件哈希；GitHub 发布相同安装包、更新包、增量包、校验和及清单。
- 核对 main、v2.3.0 标签、GitHub Release 和 ECS 版本一致，提供本地安装包链接。
