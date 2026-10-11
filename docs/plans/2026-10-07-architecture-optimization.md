# Super Lib 架构与可靠性增量优化 Implementation Plan

> **For Codex:** 先在计划模式读取本文件、架构报告和仓库 AGENTS.md，重新核对当前源码，再向用户呈现可执行计划；确认后使用可用的 @executing-plans 工作流逐任务验证。本文是实施提案，不是已经执行的修复；不依赖未安装的 superpowers 插件。

**Goal:** 在保留当前良好体验、资产数据安全与兼容契约的前提下，修复有证据的请求/资源所有权缺口，固化回归和发行门禁，再做可测量局部优化与渐进模块化。

**Architecture:** 保持 Renderer → Preload → Main → Library UtilityProcess 及受管插件/脚本运行时。保留 LibraryService façade、typed IPC、schema 49和既有文件恢复。把 owner、session、settle/dispose、gate/artifact manifest 变成显式边界，避免全量重写或新数据库写者。

**Tech Stack:** Electron 43.1.0、React 19.2.7、TypeScript 6.0.3、better-sqlite3 12.11.1、Zod、Vite/Forge、Vitest/Playwright、Inno Setup。

---

## 0. 范围与执行约束

审查版本2.3.16，HEAD `67298c17d792070b09adc05d5a3af3cac722ff4f`，发行源码 `ac4c244edd3074b2fc643ddeedf19ab4714fbe65`。所有路径相对 **C:/Users/Administrator/Desktop/Super-main**；用户环境曾指向失效的 旧工作区目录，不复用旧cwd。

必读：

- `AGENTS.md`、`docs/plans/2026-09-22-development-pause-and-ecs-handoff.md`。
- `docs/architecture/2026-10-07-review/architecture-review.md`、`adr-proposals.md`、`verification.md`、`inventory.json`。
- `docs/plans/2026-10-07-performance-first-pass.md`、filter/updater当前实施与v2.3.15/v2.3.16验证记录。

本计划**不包含** ECS/账号/MUTAI/服务器部署、版本提升、打包发布、Git push、依赖大版本升级、历史 migration重写、真实用户库实验。保留既有 dirty documents。复用当前安全checkout；不要因模板习惯自动新建worktree。用户确认后可为实施独立worktree另作选择，不强制。

每任务细分为可独立操作的2–5分钟步骤：阅读 → red test →确认正确失败 →最小实现 → green test →验收记录/检查点。不可承诺每整个任务只需2–5分钟。复现与修复各自保留证据；不能靠强制点击、放宽timeout、skip或刷新快照伪绿。

提交只在用户已授权的实施工作流内做，按任务选择文件；否则保留待审diff。即使允许本地commit，仍不自动push/publish。数据安全路径要求fresh临时库或备份副本。

### 阶段和依赖

```text
A0 重新确认基线与复现策略
 ├─ A1 固化 gate manifest / 当前版 artifact manifest
 ├─ A2 导入 TTL fault containment
 ├─ A3 插件下载 byte/cancel budget
 ├─ A4 分页 generation ownership
 ├─ A5 多选 metadata session/有界去重
 ├─ A6 watcher 领域事件与 toast 分离 → A7 AI共享失效入口
 ├─ A8 render RPC settle-once
 ├─ A9 extension staging ownership
 └─ A10 延期更新 installer receipt
              ↓ A阶段回归检查点
B1 bounded日志 + debug I/O → B2 scoped watcher SQL / session cache
              ↓ baseline / 差分 / 收益门槛
B3 geometry prefix index（二分，条件实施）
              ↓ 稳定与测量通过
C1 纯schema/value提取 → C2 小型 session/refresh/host composition切片
              ↓ 最终交付（不自动发布）
```

A任务除A6→A7外可独立，但多人/多agent不要同时编辑App.tsx/main/index.ts/library-service.ts；分工可用于read-only复核、独立测试或不重叠模块。不得并发运行build/perf/native UI互相污染。阶段B/C不作为A修复的隐含必做范围；计划模式先确认本次实施到哪个检查点，默认建议先完成A。

## A0：冻结审查基线与新增问题的确定性复现

**Files:** Read `AGENTS.md`, `package.json`, current git status/log and architecture report；Create实施记录 `docs/plans/2026-10-07-architecture-optimization-execution.md`；本步骤不改业务。

1. `git status --short`、`git rev-parse HEAD`、`git diff --stat`；若源码已变，重新定位报告行号与hash，不按旧行号盲改。
2. 确认原有未提交 `docs/README.md`、`docs/releases/v2.3.0-validation.md`、handoff/follow-up文件，及本次新增报告；不覆盖/顺手提交。
3. 在record列每项“代码缺口/复现/测试缺口/已修复/待测”，依issue ID R01–R16；用户选择A检查点及B/C是否延后。
4. 运行现有16个相关文件作为基线（verification.md完整命令）；预期162通过仅适用于审查SHA，未来数量增加不以162硬编码。
5. 记录平台/Node/Electron、真实/模拟媒体、测试夹具根目录。建立临时库写入守卫，路径不接受HOME/userData/真实图库根。

**Stop/rollback:** 当前dirty业务覆盖目标或无法确认fixture所有权时停下说明；本步骤只生成新记录，无生产回滚。

## A1：回归门禁与发行附件从同一份清单产生（R10/R11）

**Files:** Create `scripts/release/gate-manifest.mjs`, `scripts/release/run-gates.mjs`, `scripts/release/artifact-manifest.mjs`, `scripts/release/build-provenance.mjs`, `tests/unit/release-gate-manifest.test.ts`, `tests/unit/release-artifact-manifest.test.ts`, `tests/unit/build-provenance.test.ts`；Modify `scripts/verify-mainline.mjs`, `scripts/release/pipeline.mjs`, `scripts/release/lib.mjs`, `forge.config.ts`, `scripts/inno-build.mjs`, `scripts/release/package-file-manifest.mjs`, `scripts/release/build-retained-deltas.mjs`, `package.json`。Read `scripts/release/verify-update-native-ui.ps1`, preview `.iss` 和 `docs/plans/2026-10-07-updater-auto-open.md`。

1. Red tests：关键filter/preview/import确认/任务polling/tray专项清单可达且不重复；typed required/capability-dependent状态；缺Inno/desktop是BLOCKED/NOT_RUN而不是PASS；所有runner消费同一manifest，保留旧npm命令alias。
2. Red artifact/provenance tests：fresh tmp里放当前版/旧full、旧target delta、异平台、无关ZIP和缺文件；加入package.json已新但通用SuperSetup.exe/packaged output仍旧、receipt缺失/被替换/source snapshot不符。只选择当前platform+targetVersion+明确installer；metadata/source/字节hash不符报错，不能收集时写当前HEAD来替旧包补凭据。
3. Run `npx vitest run tests/unit/release-gate-manifest.test.ts tests/unit/release-artifact-manifest.test.ts tests/unit/build-provenance.test.ts`；确认测试因缺实现而非fixture/import错误失败。
4. Implement manifest条目：id、stage、platform/capability、required、command+argv、isolated/preconditions、expected evidence。不要glob全部E2E（其中含真实NAS/benchmark/native脚本），不要自动排除历史失败。
5. Native gate增加隔离preview和生产分支probe的**编译+验证入口**，路径/owned processes限定tmp；单独验证9场景，不执行已安装应用更新。缺编译工具要给明确可操作错误。
6. 将provenance receipt接入Forge的prePackage/postPackage：构建前锁定HEAD及源码快照/dirty指纹，构建后验证源码未漂移并记录实际packaged version/platform/files hash；preMake复验输入receipt，Inno/delta记录其衍生关系。不能仅在收集附件时声明source SHA；receipt是本地构建关联证据，不是数字签名或防同用户恶意篡改的承诺。
7. Artifact manifest以已验证receipt、make/delta metadata、不可变baseline为来源，列source SHA+snapshot/semver/platform、binary path/kind/from/to/bytes/hash；sidecar+sum从同集合生成，hash采用stream。不删除旧out/make、不重写旧baseline。历史包缺凭据时BLOCKED/UNVERIFIED，未来另获打包授权后重新生成，禁止追认成可信。
8. Green unit；`npm run lint`、`npm run typecheck`；runner dry-run输出完整命令与能力状态，无网络publish/SSH/安装。在本机历史out里确认不再把265二进制混为本版。receipt逻辑以fresh mock package测试；本任务不实际重新打包。
9. 调用相关真实gates只在所需fixture/工具齐全时，记录精确结果。lavfi历史失败可建立fixed真实媒体夹具专项任务，不能为造数扩大正式媒体包或本步改成skip。

**Accept:** 自动计划能列出所有关键专项；缺测不能冒充全绿；artifact选择唯一、无历史错版。**Rollback:** 工具变更独立回退，旧alias继续可用；不动源包格式/资产库。Gate manifest本身不是GitHub发布授权。

## A2：pending import TTL 清理失败隔离（R01）

**Files:** Modify `src/worker/library-service.ts`（scheduleImportExpiry/removeOperation/diagnose），`tests/worker/pending-import-lifecycle.test.ts`；Read `src/worker/windows-fs-retry.ts`。

1. Red：注入importClock/受控cleanup错误模拟EPERM、ENOTEMPTY、安全路径被替换。TTL回调不throw、token按时失效、诊断有operation/library关联、另一个正常请求仍成功。锁/权限恢复后的安全残留可由重开恢复接续；符号链接/祖先替换必须拒绝unsafe target并保护外部路径，不能强行恢复。
2. Run `node scripts/run-vitest-with-electron.mjs run tests/worker/pending-import-lifecycle.test.ts`，记录当前未catch异常的确定失败。
3. Minimal fix：TTL callback仅捕获cleanup失效，诊断失败也不throw；不吞文件操作主错误、不放松安全路径assert、不递归删除其他owned目录。rolled_back行与恢复流程保持一致。
4. Green并运行 `tests/worker/import-confirmation.test.ts`, `import-source-stability.test.ts`, `database-recovery.test.ts`。
5. 加隔离Worker/ParentPort用例（必要时新建 `tests/worker/import-expiry-fault-containment.test.ts`），证明不是仅测试Promise模型；闭库/过期/resolve竞态不双consume。

**Accept:** timer failure局部化、token单次、commit不回滚；测试不实际锁用户文件。**Rollback:** 单一fault-containment切片，无migration。

## A3：插件下载实际字节预算与取消链（R02）

**Files:** Modify `src/main/plugin-github-client.ts`, `plugin-package-manager-types.ts`, `plugin-package-manager.ts`, `plugin-install-operation.ts`, `tests/unit/plugin-github-client.test.ts`；Create `tests/unit/plugin-download-budget.test.ts`。

1. Red streams：未知/虚假Content-Length、实收超限、巨量小chunk、reader.read挂起、API/commit并行、pause时取消、fallback response无reader；确认超限前不会完整buffer、reader cancel被调用、状态终结一次。
2. Run `npx vitest run tests/unit/plugin-github-client.test.ts tests/unit/plugin-download-budget.test.ts`。
3. 从现有PackageManager默认256MiB预算注入每条downloadOptions；每chunk累加前检验，不仅信Content-Length。公开自定义client合同须兼容，但宿主最终包校验不可移除。
4. 合并父AbortSignal/API request/download/read/pause取消；终态移listener/timer/cancel reader。header及active idle超时默认30秒可配置，pause期间不消耗idle；**不引入任意总时长限制杀掉仍有效的慢传输**。timeout类别与retry文案明确。
5. 首轮仍返回Uint8Array，只承诺实际archive字节≤既有预算；chunks+合并的瞬时内存至少可到两倍归档大小，须记录与验证峰值，不承诺RSS等于256MiB预算。流式落盘须测量后另立任务，不同批改为流式解包或变信任流程。无reader超大响应禁止无界arrayBuffer，明确失败/受控adapter路径。
6. Green；相关plugin package/manager/update/trust suites；受控本地mock server冒烟，无真实GitHub安装/下载巨大包。

**Accept:** byte/cancel预算先于安装buffer；normal release/source fallback/pause/retry不变。**Rollback:** 下载实现可独立撤回，现有插件与package lock不改。

## A4：分页请求的 generation owner 与稳定回调（R03）

**Files:** Modify `src/renderer/use-browse-pagination.ts`, `src/renderer/App.tsx`（调用处callback稳定）；Create `tests/unit/browse-pagination-lifecycle.test.ts`；Modify `tests/unit/browse-pagination.test.ts`；Regression `tests/e2e/asset-pagination.test.ts`。

1. 挂载实际hook的minimal React/happy-dom测试宿主（不用新增测试库），用deferred Promise控制A/B页/layout响应。Red：A100在途→切B→B100在途→A完成，B仍占位/loading；success/fail/取消分支都测。覆盖StrictMode mount-cleanup-remount与真正unmount，不把reset当作unmount。
2. Assert B100重复ensure不会第二次发；layout A结束不能清B boolean；reset/dispose/unmount后旧结果不改总数/items/loading，remount新owner正常工作。没有完整hook复现就不直接大改。
3. Minimal owner结构：`{ generation, inFlightOffsets, layoutInFlight, disposed }`；请求捕获owner，finally只删除捕获owner占位；发布loading须current===owner。保留分页limit/layoutchunks/完整ID排序，不能只有response guard。
4. App failure handler `useCallback`或latest-callback ref，依locale/error最新语义；controller成员稳定。监测无关toast rerender不重建observer，但necessary loading/layout settle仍重观察。
5. `npx vitest run tests/unit/browse-pagination.test.ts tests/unit/browse-pagination-lifecycle.test.ts`；then `node scripts/run-e2e.mjs tests/e2e/asset-pagination.test.ts tests/e2e/preview-background-refresh.test.ts`（单次build，隔离userData）。

**Accept:** 逆序、deep jump、末尾340资产、collection/trash、缩放、全范围选择都保留。**Rollback:** owner封装独立撤回，不改协议。

## A5：多选元数据的 session cache 与有界去重（R04）

**Files:** Create `src/renderer/metadata-read-controller.ts`, `tests/unit/metadata-read-controller.test.ts`, `tests/unit/inspector-multi-edit-lifecycle.test.ts`, `tests/unit/inspector-metadata-session.test.ts`；Modify `src/renderer/use-inspector-multi-edit.ts`, `src/renderer/use-inspector-asset-metadata.ts`（仅owner/commit guards，不重写save语义）, `src/renderer/App.tsx`（所有开库入口cache owner和batch listTags），保留 `src/renderer/inspector-multi-edit.ts` model。

1. Red：1,000选项冷cache、重复selectedIDs、选择变更/反选/切库/同libraryId重开、慢/失败response；maxPending≤4，最终全部成功项参与mixed/uniform；取消后不继续发、不写当前会话。旧单选read/save→关闭并重开同libraryId→新session、旧read晚于新save完成均要受控复现。
2. Run `npx vitest run tests/unit/metadata-read-controller.test.ts tests/unit/inspector-multi-edit-lifecycle.test.ts tests/unit/inspector-metadata-session.test.ts tests/unit/inspector-multi-edit.test.ts`。
3. 实现明确session object（不能只libraryId）；key包含session+assetId；同session同ID共享in-flight Promise。初值4并发read预算是计划提案，不是4个SQLite写者；每请求fail不悬挂队列，disposed不调度。
4. 所有单选/多选cache writer捕获session owner，旧owner cleanup/read/save response不访问current Map/UI；App普通开库、导入开库、MCP生命周期、sync开库均旋转owner。entityVersion单调，旧read不得覆盖较新save结果；没有新版本确认不盲清version-conflict。只补commit guard，保存expectedVersion/optimistic/history语义不变，不取消已经提交的持久写操作。
5. 批量标签listTags每batch一次，仍读取全部目标metadata，不截断1k selection；source/root metadata cache清理保持。
6. Green；扩大 `tests/e2e/ai-inspector-refresh.test.ts`/多选隔离场景（先核对入口）验证结果与旧model一致；收IPC峰值、p95 browse响应、取消后新请求数。

**Accept:** 同结果、完整选择、明确上限、无跨session污染；不得仅延长15s deadline。**Rollback:** controller/callsite可撤，无持久数据迁移。

## A6：watcher 的领域变化与通知降噪分离（R05）

**Files:** Modify `src/worker/library-service.ts`, `src/shared/protocol/responses.ts`（如需additive presentation字段）, `src/main/index.ts`, `src/renderer/App.tsx`；Modify `tests/worker/library-watcher.test.ts`, `tests/unit/protocol.test.ts`；Create `tests/worker/watcher-multi-library-events.test.ts`。

1. Red clock+双库：A client mutation→B watcher修改在1.5s抑制窗口，B必须发领域变化；同库client+external混合也不丢真实变化。
2. 记录现有UI通知数量、plugin domain event、Main sourcePathCache invalidation、autoAI（opt-in）触发作为行为契约，不把DB sequence可刷新等同完整副作用。
3. Minimal：always emit committed asset domain change；toast suppression若保留用optional字段/consumer policy按libraryId作用域；source:'watcher'和旧字段兼容。
4. 不把所有domain event强行转换toast、不移除durable change sequence/TEMP epoch/external data_version；批量与同asset多次写按现有幂等策略处理。
5. Run `node scripts/run-vitest-with-electron.mjs run tests/worker/library-watcher.test.ts tests/worker/watcher-multi-library-events.test.ts tests/unit/protocol.test.ts`；Main fan-out用mock/隔离集成验证；tray resume回归。

**Accept:** 双库domain side effects完整、toast不轰炸、相同assets/order/metadata结果。**Rollback:** additive字段/呈现策略可独立回退，不改数据库。

## A7：AI完成与其它背景事件共享刷新入口（R09）

**Files:** Create `src/renderer/background-refresh-controller.ts`, `tests/unit/background-refresh-controller.test.ts`；Modify `src/renderer/App.tsx`、已有 `coalesced-refresh.ts`（必要时保持API）；Regression `tests/e2e/preview-background-refresh.test.ts`, `task-status-polling.test.ts`。

1. Red：block一次read后发送100个AI完成/磁盘混合事件，最多one active+one dirty trailing；这是并发/待办容量，不是总读取次数永远≤2。加第二次read期间持续burst、导航/切库晚到completion、混合asset IDs合并；事件停止后最终追平。selected Inspector targeted refresh正确；read failure+后续新事件不丢、不无限retry。
2. 先复用createCoalescedRefresh而非新造竞争loop，session-scoped dispose；所有background入口审查是否真正接入，而不是新增未用controller。
3. 第一轮保持conservative full requery结果，合并冗余调用；只有覆盖字段依赖测试后再缩小sidebar/count刷新。AI rating排序/筛选、tags、analysisStatus参与query时，完整结果与最终计数必须一致。
4. Viewer identity、selected asset、scroll anchor、smart collection草稿不重导航；人工点击刷新仍及时，不因debounce增加交互等待。
5. `npx vitest run tests/unit/background-refresh-controller.test.ts tests/unit/coalesced-refresh.test.ts tests/unit/asset-change-cache.test.ts`；`node scripts/run-e2e.mjs tests/e2e/preview-background-refresh.test.ts tests/e2e/task-status-polling.test.ts tests/e2e/filter-interaction.test.ts tests/e2e/ai-inspector-refresh.test.ts`。

**Accept:** 完成通知功能不减，背景请求预算减少，4种scope全屏保持，最终query/计数正确。**Rollback:** 入口合并切片可撤，既有serialPoll不变。

## A8：render RPC 的 settle-once 资源清理（R06）

**Files:** Create `src/worker/pending-render-rpc.ts`, `tests/unit/pending-render-rpc.test.ts`；Modify `src/worker/index.ts`，保持model/document protocol。

1. Red fake ParentPort+timer：already-aborted不post；success/timeout/abort/post error/shutdown settle一次；迟到重复response不再生效；每终态map/timer/abort-listener全清。
2. FBX转换deferred期间abort后不能继续post offscreen。监听器计数用受控signal adapter，不依靠GC猜测。
3. Implement小型helper拥有requestId/map/timer/listener与dispatch；source authorizations、类型化failed timeout结果及abort拒绝语义不变。
4. `npx vitest run tests/unit/pending-render-rpc.test.ts tests/unit/offscreen-thumbnail-renderer.test.ts`；`node scripts/run-e2e.mjs tests/e2e/model-thumbnail.test.ts tests/e2e/model-viewer.test.ts`（媒体能力齐全才实测）。

**Accept:** 无preabort工作、正常media FIFO/viewport优先和fallback不变。**Rollback:** helper适配可撤，无schema/IPC变更。

## A9：extension upload staging owner（R07）

**Files:** Modify `src/main/extension-server.ts`, `src/main/index.ts`（handleSaveUpload）；Modify `tests/unit/extension-message.test.ts`；Create `tests/unit/extension-staging-lifecycle.test.ts`。

1. Red：无库/worker未ready/业务error/throw/客户端abort/成功/并发；每次只删本上传staging，callback执行期间文件存在，结果结束不残留；非本app临时文件不触碰。
2. 定义server-created→Main-owned→Worker-done的唯一交接；最小fix将Main完整入口（含early return）纳入finally。server失败fallback cleanup幂等且只用validatedownedpath。
3. 若需启动残留回收，只扫描本应用明确prefix+TTL+非活跃operation；此策略独立测试与审批，不清空全temp、不用未解析变量递归删除。
4. `npx vitest run tests/unit/extension-message.test.ts tests/unit/extension-staging-lifecycle.test.ts`；正常扩展采集isolated E2E保target folder/source URL/reveal/focus策略。

**Accept:** 早退也清理且无过早delete；不增加pairing/token产品变化。**Rollback:** ownership orchestration独立撤回。

## A10：延期更新安装器的持久完整性 receipt（R08）

**Files:** Modify `src/main/pending-app-update.ts`, `src/main/app-update-service.ts`, `src/main/index.ts`；Modify `tests/unit/pending-app-update.test.ts`, `tests/unit/app-update-service.test.ts`（执行前核对现有命名）；Create `tests/unit/pending-update-integrity.test.ts`。

1. Red：prepared后字节修改/截断/缺失/目录或链接替换、restore→launch之间改文件、旧metadata；失败不得执行installer，应用正常打开且能重新下载；验证与launch不可并行重复。
2. receipt保存 extracted installer 的sha256+size和格式版本；异步stream hash、regular-file、真实cache containment。摘要来自下载验证后实际解出的字节，不用任意本地文件计算hash就自称可信。
3. legacy pending没有可信摘要：不静默执行，清失效pending/normal startup，提示重新准备；保notes/notice兼容，不能为“保持旧行为”继续盲launch。
4. launch前再次重验，尽量减小TOCTOU；**同用户恶意程序仍能修改本地文件，不宣称完全消除攻击**。无需新增资产库加密/签名证书或改更新server格式。
5. `npx vitest run tests/unit/pending-app-update.test.ts tests/unit/app-update-service.test.ts tests/unit/pending-update-integrity.test.ts tests/unit/update-native-ui.test.ts`；A1 native fixture verifier9场景再跑；不运行正式已安装应用更新。

**Accept:** 坏cache不执行、不阻断本体；合法installer仍原用户`--updated`自动打开一次，失败retry/close保持。**Rollback:** receipt读取兼容、仅工具/cache metadata回退；旧库无影响。

## A 检查点：先交付可靠性，不把B/C隐藏进本次修复

1. 重跑所有新增red→green用例及本轮162基线、import/schema/recovery相关组；记录真实通过/失败/skip/not-run，历史失败分类不伪绿。
2. `npm run typecheck`、`npm run lint`、`git diff --check`。
3. 同一个fresh构建跑filter/fullscreen/import/pagination/task poll/critical confirmation回归；使用mock网络和临时userData，不触碰用户安装。
4. 记录功能矩阵、source diff、基准请求数、artifact/gate dry-run。没有发布授权就停在可审diff，不升版本、不做GitHub/ECS操作。

## B1：真实 bounded日志尾读及debug热路径（R14）

**Files:** Modify `src/main/app-logger.ts`, `src/main/plugin-package-ipc.ts`, `src/main/plugin-activation-coordinator.ts`；Modify `tests/unit/app-logger.test.ts`；Create `tests/unit/log-tail-budget.test.ts`, `tests/unit/plugin-diagnostics-policy.test.ts`。

1. 使用fresh temp构造100MB JSONL/多字节/截断行，read spy或注入FS证明现状读整文件。预期I/O≤2,000,000+4字节容差，不以解析输出只有2MB就算通过。
2. bounded fd read（open/fstat/read/close）先保持同步API，按尾部offset读取、丢弃首个不完整行/UTF8边界，文件并发增长/截断安全；所有分支close。保留limit、correlation顺序、redaction与坏行忽略契约。
3. plugin贡献list默认零diagnostic FS写；debug需显式开关、bounded/redacted/限频、Main注入路径。logger失败不能改变业务返回。
4. `npx vitest run tests/unit/app-logger.test.ts tests/unit/log-tail-budget.test.ts tests/unit/plugin-diagnostics-policy.test.ts tests/unit/session-log.test.ts`。
5. 测尾读p50/p95/分配和10/100插件重复list；没有量到写log占用就不本步全改async logger。若后续异步化，另加ordered flush/exit/crash durability设计，不能随意丢最后错误。

**Rollback:** API/格式不变，只回退reader/debug策略；不删除旧session日志。

## B2：scoped watcher SQL与可重算缓存寿命（R12/R13）

**Files:** Modify `src/worker/library-service.ts`（refreshManagedAssetsOnOpen/cache owner）；Create `tests/worker/scoped-reconciliation-query.test.ts`, `tests/unit/session-derived-cache.test.ts`（若抽纯cache helper）, `src/worker/session-derived-cache.ts`；Regression `tests/worker/reconciliation-performance.test.ts`, `library-watcher.test.ts`, image/color/exr相关组。

1. red SQL trace：100k library只改单个linked root，existingAssets query应仅返回scope资产；对旧全库+JS过滤的有序结果做差分，include explicit ignore/offline/空scope/null linkedID。
2. 先记录EXPLAIN/query row count；参数化WHERE下推，保scope undefined的全库语义，IN值批次有界、不拼用户SQL。无充分计划证据不新增schema/index。
3. cache先测独立key数量/命中/关闭后保留。给EXR/color可重算probe独立LRU（初始每类256条；需确认结果entry轻量，若持有bytes改为bytes预算），key保持revision/source identity/override。
4. 建立反向owner或session-owned map，关闭仅释放该库引用，跨库共享结果若保留则有全局hard cap。eviction不删artifact/DB；命中/重算一致。
5. `node scripts/run-vitest-with-electron.mjs run tests/worker/scoped-reconciliation-query.test.ts tests/worker/reconciliation-performance.test.ts tests/worker/library-watcher.test.ts`；纯cache test单跑。20k/100k同fixtures测p50/p95/RSS/browse lag，重试/离线对照。

**Accept:** 子scope行数下降、结果相等、cache上限和close释放真实成立；无可测收益保留旧query并记录。**Rollback:** SQL/cache policy单独切片撤回，无迁移。

## B3：geometry 前缀和/二分窗口（R15，条件实施）

**Files:** Create `src/renderer/height-index.ts`, `tests/unit/height-index-equivalence.test.ts`；Modify `src/renderer/viewport-window.ts`, `masonry-columns.tsx`, `justified-asset-rows.tsx`, `canvas-asset-layout.ts`；Regression `tests/unit/viewport-window.test.ts`, `tests/e2e/large-library-scroll-benchmark.test.ts`, `asset-pagination.test.ts`。

1. 先测samefixture 10k/50k/100k真实Electron滚动long-task、frame p95、mounted DOM、allocations；纯函数约1ms不足以单独决定启用。
2. red随机差分oracle旧columnWindow，覆盖空、NaN/Infinity/负/0高度、top/bottom无穷、最后一项、恰好边界、overscan；对照start/end/全部spacers/total，不能只比较start。
3. 高度归一化后几何变化时构建prefix index；滚动二分；不能只按数组长度缓存：同长度dimensions patch/行高变化也必须失效。不要每滚动重建index或在item resize后用旧index。现有export/调用行为兼容。
4. 保现有overscan（不要任意缩小5屏）、即时scroll发布、深跳hydration、字幕/缩放/面板/尺寸patch；差分核对框选/keyboard rank及未加载slot的目的地hydration，不只比较窗口索引。
5. `npx vitest run tests/unit/height-index-equivalence.test.ts tests/unit/viewport-window.test.ts`；isolatedE2E + before/after≥30samples。没有明显收益、白屏/anchor回归则不合入。

**Rollback:** 旧窗口函数保oracle直至通过，单切片撤回；不驱逐loaded summaries、不改offset协议。

## C1：无行为改变的纯 schema / 跨层value提取（R16）

**Files（提案，实施前按符号依赖重新确认）:** Create `src/worker/schema/migrations.ts`, `src/worker/schema/sql.ts`, `src/shared/model-render-limits.ts`；Modify `src/worker/library-service.ts`, `src/renderer/3d-viewer/limits.ts`兼容re-export；Test `tests/worker/migration-discipline.test.ts`, `schema-compatibility.test.ts`, `schema-downgrade-chain.test.ts`, `schema-lenient-read.test.ts`。

1. 先捕获49 migration SQL/checksum逐项hash，导出行为baseline及recovery/foreign-key exceptions。不借文件提取重写/格式化SQL，不调整编号。
2. 引入schema目录但LibraryService继续re-export MIGRATIONS/SUPPORTED_SCHEMA_VERSION/TABLE_REBUILD等公共符号；移无副作用常量与纯函数，依赖保持朝shared，不引入react/electron runtime到schema。
3. 跨层model限值移真正shared，renderer原路径re-export兼容现有tests/API。i18n catalog移shared若需大量import改动另一个切片，不能混本步。
4. 逐slice typecheck/lint + `node scripts/run-vitest-with-electron.mjs run tests/worker/migration-discipline.test.ts tests/worker/schema-compatibility.test.ts tests/worker/schema-downgrade-chain.test.ts tests/worker/schema-lenient-read.test.ts`。

**Accept:** 49项byte-for-byte不变、旧库/recovery/checksum安全，bundle/runtime行为不变。**Rollback:** 仅import/re-export移动，用户库不需要回滚。

## C2：小步组合根与领域owner提取，不一次性拆大类

**Files（先选一个切片，不全创建）:** 候选 `src/renderer/library-session-controller.ts`, `src/main/composition/update-coordinator.ts`, `src/main/composition/external-ingress.ts`, `src/worker/import/pending-import-owner.ts`, `src/worker/reconciliation/watcher-owner.ts`；Modify corresponding `App.tsx`, `main/index.ts`, `library-service.ts`；Create每owner单元/生命周期测试。

1. 列owner dependency ports、start/stop/dispose/reentrant/late response规则，明确路径属于Main/Worker/renderer；先选A阶段已测的pending import或refresh owner。
2. 提取现函数与显式依赖，不改变事务位置/请求shape/事件顺序。LibraryService保持façade，Main index保composition，不用一次替换状态库/全局Context。
3. 新owner测试覆盖create/start/stop/dispose twice/failure/close-reopen，旧public API用差分回归。每切片独立PR/diff checkpoint，不把4个大文件同时大范围改写。
4. 加轻量静态boundary gate（只限制不合理新依赖、保当前已确认纯复用兼容路径）；不为了漂亮图抹掉真实依赖。
5. 整体回归当前新版filter/updater/import/fullscreen/pagination/plugins/MCP/API；生成新inventory比较职责/依赖变化，减少耦合不是仅文件行数变小。

**Stop:** 需要持续schema变化、新协议或改变newer/stuck库策略，另开设计确认。**Rollback:** 每owner适配层可独立退，不动durable data。

## 最终验收、性能测量和交付格式

### 固定不变式

以报告第6节为硬门槛：asset/revision/path身份、人工与AI分层、完整query/选择、token/commit/recovery、lease/fence/durability、linked ownership、Viewer/UI输入、更新自动打开、跨版本能力和ECS暂停。任何相违背“优化”不可接受。

### 基准方法

- 同机、同源码build、同fixture/seed、同热冷态，≥30 samples，记录p50/p95/max/RSS或真实heap；CPU/byte/IPC预算明确维度。
- correctness必须先通过。性能p95建议≤同fixturebaseline110%；baseline<5ms给绝对2ms噪声容差；预算不等于承诺用户机器通用性能。
- 请求数：AI burst的并发/待办容量最多active+trailing，持续事件停止后最终追平；多选max4且结果全；scopedSQL只返回对应scope；日志I/O≤2MB+UTF8容差；资源终态不存在owner泄漏。
- 使用fresh fixture生成，不带 `--reset` 指向已有或不明确目录。下方示例在已确认仓库根执行，100k另建新Guid目录，不拿真实库代替。

```powershell
$architectureFixtureName = 'architecture-perf-20k-' + [Guid]::NewGuid().ToString('N')
$architectureFixturePath = Join-Path (Join-Path (Get-Location).Path 'tmp') $architectureFixtureName
if (Test-Path -LiteralPath $architectureFixturePath) { throw 'Fixture path already exists; choose a new path.' }
npm run large-library:generate -- --output $architectureFixturePath --assets 20000 --seed 20261007
if ($LASTEXITCODE -ne 0) { throw 'Fixture generation failed; do not benchmark partial output.' }
npm run test:perf:large-library -- $architectureFixturePath
```

- `comprehensive-perf-bench` 默认不变fixture；本计划不设置 `SUPER_PERF_BENCH_ALLOW_MUTATION=1`，如测mutation另建明确可丢弃clone。
- Windows native/UI与成品基准单独运行，不并发build；真实NAS/GPU等能力不齐列NOT_RUN，不算通过。

### 交付清单

1. 每项issue状态（复现/修复/验证/延后）+精确证据，说明未完成条件，不用“全部优化完”掩盖deferred项。
2. 修改范围/兼容性/不变式检查；每切片回滚方式。无数据migration才允许代码级回滚，不笼统承诺所有未来版本回退安全。
3. tests JSON/isolated UI screenshots、before/after指标、环境和基准脚本；明确历史失败与platform skip。
4. architecture/inventory/ADR更新；全部Proposed决策只有用户确认并实际合入后才标Accepted。
5. 可审diff及本地报告。**没有另行授权，不bump、不安装、不打包、不GitHub/ECS发布、不push。**

### 给 Codex 计划模式的第一条动作

读取全部必读文档并确认当前dirty/source后，针对**阶段A**输出带依赖和测试命令的最终计划；只追问会改变正确性/授权的少量决策（实施到A/B/C、legacy pending updater策略、所需测试能力）。其余按本文保行为默认推进规划。用户确认前不要编辑业务代码。
