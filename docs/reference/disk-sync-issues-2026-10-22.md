# 磁盘变化同步：本轮发现的问题（2026-10-22）

> 版本：2.4.1（功能同 2.4.0）　平台：Windows x64
> 状态：第 2 条已修复并推送；第 1 条的“无提示”部分已修复，“相互阻塞”仍未修复，等实机复现。
> 本轮**没有**打包新版本、没有发版。

## 1. 长时间最小化后恢复：自动同步缺少状态提示（部分修复）

### 现象

窗口长时间最小化后恢复，主进程把 Library Worker 从 background 模式切回 active，Worker 立即重放这段隐藏期间积压的 watcher 变更。此时界面上没有任何“正在同步”的状态或弹窗；如果用户这时点其它目录或在多个文件夹间频繁切换，**自动同步与资产加载会一起卡住**。

### 已修复部分

- 提示链路：隐藏 **≥60 秒** 后恢复时，先弹常驻状态提示“正在同步磁盘变化…”（带旋转图标、不可手动关闭、不自动过期）；同步完成后由原有的“已自动同步 N 项磁盘变化”替换；若 20 秒内没有完成通知则自动撤除。
- 实现：`src/renderer/App.tsx` 的 visibilitychange 监听 + `toast-notifications.ts` 新增 `progress` 条目类型（单实例替换、无自动消失）。
- 提交：`02280d0 feat(update-sync): show a syncing status toast for manual and resume disk scans`。

### 未修复部分：同步与浏览互相阻塞

**根因分析（未能实机复现，以下为代码层结论）**

1. 恢复后 Main 有 1.5 s 前台宽限（`BACKGROUND_WORK_RESUME_GRACE_MS`），随后 `setBackgroundMode('active')`。
2. Worker 的 `startWatchedRefreshDrain` 立刻开始 `refreshManagedAssetsOnOpen`：磁盘遍历 + SQLite 批量写入。
3. 该对账只在 `yieldReconciliation` 让出，而让出条件依赖 `interactiveIdleUntilByLibrary`；目前**只有媒体/查看器请求**会延长这个交互窗口（`src/worker/index.ts` 的 `noteInteractiveMediaRequest` → `noteInteractiveActivity`）。
4. **浏览/搜索请求（`asset.search`）不会延长窗口**，因此“恢复后马上切目录”时扫描不为浏览让路，两者争用同一 Worker 线程与 SQLite 连接，表现为一起卡住。

**建议改法（尚未实施）**

- 在 Worker 的 `asset.search` 处理入口调用 `libraryService.noteInteractiveActivity(libraryId, 2_000)`，让磁盘维护在浏览期间停在让出点。
- 改动约 2 行，但会改变开库对账时序；必须连同 `tests/worker/library-watcher.test.ts`、`tests/e2e/tray-watcher-recovery.test.ts` 一起验证。
- 若改后仍有卡顿，下一轮需要进程内埋点（watch 重放开始/结束、search 排队耗时）再定位，不能继续靠推断改并发。

## 2. 手动点击“刷新磁盘变化”无反馈（已修复）

### 现象

点刷新按钮后没有任何明显反馈，后台静默扫描，直到全部完成才弹“已自动同步 N 项磁盘变化”。

### 修复

- `refreshAssets()` 进入时立即显示常驻提示“正在同步磁盘变化…”，扫描与界面刷新完成后再换成原有结果提示（有变化 → “已同步 N 项外部变化”；无变化 → 已是最新）。
- 失败路径不变：错误提示 + 状态提示撤销。
- 同一套 `progress` 提示被第 1 条的恢复场景复用；用 owner 标记区分手动/恢复两条流程，避免过期计时器误清另一条提示。

## 3. 验证与边界

| 项目 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| `npx eslint`（改动文件） | 通过 |
| `tests/unit` 全量 | 449 文件 / 3600 通过 / 5 跳过 / 0 失败 |
| 实机复现卡死 | **未做**（本轮无安装版验证） |
| e2e（tray-watcher-recovery 等） | 未跑 |
| 打包/发版 | 未做（用户明确暂不打包新版本） |

## 4. 待办

- [ ] 按第 1 条建议改法给 browse/search 请求补交互窗口标记，并跑 watch/e2e 回归。
- [ ] 实机验证：恢复后立即连续切换目录，确认不再卡住。
- [ ] 若仍卡，补埋点：watcher 重放开始/结束时间、search 排队耗时。
- [ ] 需要时打包 2.4.2 供用户实机验证（用户当前明确暂缓）。
