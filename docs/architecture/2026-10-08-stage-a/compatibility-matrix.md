# 阶段 A：兼容性与验收证据矩阵

记录日期：2026-10-08，最终收尾登记 2026-10-09，Asia/Shanghai。实际 checkout 为 `C:/Users/Administrator/Desktop/Super-main`。阶段 A 原清单及限定共同门禁已完成；本文件按实际证据区分源码验收、真实成品与远程发行，不将未运行项计为通过。

范围对应决定版的 **A0 → A1a → A2 → A3 → A8 → A9 → A10 → A4 → A5 → A6 → A7 → A1b → A 检查点**。后续用户已明确授权打包并发布 GitHub 与旧 ECS 自动更新源；当前版本已由根任务提升至 2.3.17，package/lock 仅提升根版本，未升级依赖。实际成品与发行结果仍由根任务登记。授权/版本提升不等于已发布或成品 PASS；B/C、真实安装、ECS 迁移和账号服务仍未开启。

参照：[决定版](C:/Users/Administrator/Desktop/Super-main/docs/plans/2026-10-07-architecture-stage-a-decisions.md)、[首批执行记录](C:/Users/Administrator/Desktop/Super-main/docs/plans/2026-10-07-architecture-stage-a-execution.md)、[第二批执行记录](C:/Users/Administrator/Desktop/Super-main/docs/plans/2026-10-08-architecture-stage-a-batch-2-execution.md)、[持续台账](C:/Users/Administrator/Desktop/Super-main/docs/plans/2026-10-08-architecture-stage-a-continuation.md)、[实施结构索引](C:/Users/Administrator/Desktop/Super-main/docs/architecture/2026-10-08-stage-a/README.md)、[离线浏览页](index.html)、[当前结构 SVG](architecture-overview.svg)。历史文档中的批次 NOT_RUN、旧计数和旧源码 SHA 保留当时时点；不能套用到当前源码。结构图本身不证明门禁通过。

## 1. 证据口径

- **真实目标 red**：执行原业务函数、真实 hook，或保持原行为的提取函数，因待修不变式失败。源码接线断言是静态证据，不等同于运行整个应用。
- **新契约 TDD red**：新增 module/export/schema 尚不存在导致失败；可驱动实现，但不能据此声称复现旧业务漏洞。
- **夹具错误**：URL、README/LICENSE、ESM spy、类型或清理方式不正确；单独记录，不计目标 red。修夹具不能削弱原业务断言。
- **局部 green**：只证明命令实际覆盖的文件、断言与能力；JSON 的 `success=true` 不单独证明实际进程 exit 0。以下退出状态来自根代理串行命令记录/报告，而不是本索引作者重新运行。
- **SKIP / BLOCKED / NOT_RUN**：不计 PASS。多组用例有重叠，不能将通过数相加形成“全量通过”总数。fake UtilityProcess、生产 Service 的 fixture UtilityProcess、生产 Main/App 全链路是三个不同证明层级。

证据根：

| 代号 | 原始文件根 |
| --- | --- |
| E0 | [首批根](C:/Users/Administrator/Desktop/Super-main/tmp/architecture-stage-a-64bd5af93ec64fea8e26088cae111fab/) |
| E2 | [第二批根](C:/Users/Administrator/Desktop/Super-main/tmp/architecture-stage-a-3cfc3116c84d4cd981ef22ac85af19ed/) |
| EC | [持续实施根](C:/Users/Administrator/Desktop/Super-main/tmp/architecture-stage-a-2b883839b1de4b84a0480bc7ee4a2c25/) |
| EN | [本轮 fresh native 根](C:/Users/Administrator/Desktop/Super-main/tmp/architecture-stage-a-5295dce2-4cf2-4867-a7e1-1c6d38f497a1/) |
| EN2 | [2.3.17 最终 fresh native 报告](C:/Users/Administrator/Desktop/Super-main/tmp/architecture-stage-a-8c7cf0d7-2a46-41fe-a306-216afdaf4e53/gate-results.json) |
| EP | [2.3.17 fresh A2 UtilityProcess manifest](C:/Users/Administrator/Desktop/Super-main/tmp/architecture-stage-a-c48189bd-9349-4c29-b1b3-07179be1eda1/import-expiry-probe/manifest.json) |

## 2. 按原任务逐项映射

| 项目 | 源码不变式 / 实际变化 | 直接红绿证据与证明范围 | 尚不足 / 最终状态 |
| --- | --- | --- | --- |
| A0 基线与隔离 | 不占用用户软件、真实库、NAS、日志或历史 out；fresh Guid fixture；不运行隐式安装/ABI rebuild。 | E0 `baseline.json` 162 PASS；EC `baseline-16-current.json` 182 PASS，实际 exit 0。冻结后去重联合 `checkpoint-contract-final.json` 71 文件、1152 PASS / 0 FAIL / 1 SKIP，默认并行、实际 exit 0。 | 联合范围以该命令实际文件为准，不是历史 full suite；最终全源 fingerprint/成品仍待根任务登记。 |
| A1a 单一门禁 | 实际 gate manifest/runner、普通与 isolated 默认 E2E 共享显式清单；36 文件、四阶段、五态、required 非 PASS 阻断。dry-run 不 spawn/写 evidence；runner 的 package 阶段仅列计划。原 CLI 透传与前置 alias 保留。 | E0 `a1a-red.json` 1 PASS / 3 静态目标 FAIL → `a1a-final-green.json` 27 PASS、exit 0；最终严格 typecheck/lint/diff-check/extension:verify 均 exit 0，联合71文件、限定fresh UI/媒体/IPC/native证据见第5节。 | 不将限定检查点称完整 development E2E 全量通过。缺本地能力仍必须 BLOCKED，不能下载补齐或使用旧 EXE；实际成品剩余由根登记。 |
| A2 导入 TTL | [scheduleImportExpiry](C:/Users/Administrator/Desktop/Super-main/src/worker/library-service.ts:6801) 仅包住最后的 removeOperation 故障；先失效 token、清 timer、写 rolled_back/IMPORT_EXPIRED。15 分钟 TTL、安全路径断言、有限 FS retry、commit/resolve/close 与重开恢复不变。 | E0 unit red 5 PASS / 4 目标 FAIL → 9 PASS；真实 Service + fixture UtilityProcess red 因 EPERM exit 1 → 同对象/同 PID/forkCount=1 继续 ping/list。E2 fresh probe PASS、EC unit58 PASS；最终2.3.17 EP新GUID重新编译并校验hash，EC `checkpoint-import-probe-final.playwright.json` 1 PASS、实际 exit 0，覆盖同PID继续运行/token失效/隔离恢复。 | 真实 TTL 小切片，不是生产 composition root 全 E2E。EP manifest记录当前source/compiled hashes，不复用早批bundle，也不是整个生产Worker所有命令证明。 |
| A3 插件下载 | 默认 client 收每个 chunk 前执行实收 bytes 预算，256 MiB archive 上限；父 signal、pause、header/active-idle deadline、reader terminal 清理传到底。失败/取消不继续 source fallback、不删除旧插件；权限/信任/ZIP/path 检查保留。 | E2 `a3-red.json` 6 PASS / 28 FAIL，其中 27 目标失败、1 缺 README 夹具失败；`a3-verified-green.json` 78 PASS，实际 exit 0。使用实际 client/manager + fake 网络流，非线上 GitHub 下载。 | custom client 可忽略可选控制；预算非 metadata JSON / RSS 上限。256 KiB 小样本不是 256 MiB 峰值证明。大包、线上网络、性能/NAS测量 NOT_RUN。 |
| A8 render RPC | [registry](C:/Users/Administrator/Desktop/Super-main/src/worker/pending-render-rpc.ts) 与 [实际 orchestrator](C:/Users/Administrator/Desktop/Super-main/src/worker/model-render-orchestrator.ts) 被 Worker entry 使用。entry 先建；success/typed timeout/AbortError/post throw/dispose settle-once 清 Map/timer/listener；转换 await 后先检查 signal 再读 status；shutdown 先 dispose。 | E2 `a8-red.json` 8 项原行为提取后的目标 FAIL → related55 PASS、exit 0；最终EC `checkpoint-media-final.playwright.json` fresh model-thumbnail/model-viewer 8 PASS / 0 FAIL / 0 SKIP、实际 exit 0。deferred 真入口算法不是未接生产模型。 | 逻辑终结，不是取消已派发 GPU/offscreen 或共享 FBX cache。保 single-flight/source authorization/HTML fallback；8项fresh媒体用例不等于所有格式/真实GPU取消/性能证明。 |
| A9 上传 staging | [staging](C:/Users/Administrator/Desktop/Super-main/src/main/extension-upload-staging.ts) claim→dispatch 后由 [WorkerClient](C:/Users/Administrator/Desktop/Super-main/src/main/worker-client.ts:186) requestId+origin child 保有资源；有效 response/not-dispatched/对应 child 实际 exit 才 release。deadline/disconnect/kill 意图不是 terminal。owned direct-child/realpath/link guard、一次清理与残留诊断保留。 | E2 原真实 Server/WorkerClient red 59 PASS / 6 目标 FAIL → `a9-verified-green.json` 139 PASS；追加旧 shutdown continuation、terminal callback 重入、timer red 20 PASS / 3 FAIL → 23 PASS，实际 exit 0。 | 本地 HTTP/真实文件 + fake UtilityProcess 事件，不是扩展→生产 Worker 完整 E2E。child 无有效终态且仍活着时必须留源；崩溃后全 temp 残留扫描未新增。 |
| A10 延期更新 | [PendingStore/resumer](C:/Users/Administrator/Desktop/Super-main/src/main/pending-app-update.ts) 持久 receipt 候选由 [Service](C:/Users/Administrator/Desktop/Super-main/src/main/app-update-service.ts:756) restore/final launch 流 hash/type/owned path 验证。legacy 不补 hash 自证，正常启动并要求重新准备；同已安装版本不重复安装；Windows 等真实 spawn，不 unref/提前 quit。 | EC `a10-red.json` 23 PASS / 13 目标 FAIL；首轮唯一 ESM spy 夹具失败单列；旧 Main launcher目标red后最终60 PASS/exit0。EN首轮fresh九场景PASS、completed图已查看；最终2.3.17 EN2新GUID fresh九场景实际PASS/exit0。 | native只启动隔离probe，不运行用户安装器。Main helper/接线静态与文件测试不是整生产Main E2E；receipt不是签名，不解决同用户恶意执行竞争。真实安装/发布NOT_RUN。 |
| A4 分页 owner | [use-browse-pagination](C:/Users/Administrator/Desktop/Super-main/src/renderer/use-browse-pagination.ts:308) 稳定 callback、owner/generation 占位、旧 finally 仅清自己的 reservation；生命周期 cleanup/StrictMode reset。100 summaries / ≤500 layout chunks、trash、深页/fallback、loading observer rearm 不变。 | EC `a4-red.json` 22 PASS / 12 目标 FAIL → `a4-green.json` 34 PASS，exit 0。真实 happy-dom hook，保留旧断言；冻结后 EC `checkpoint-ui-final.playwright.json` 21 PASS、实际 exit 0。 | 实施与 App 接线已冻结，UI 检查点通过范围以该报告实际用例为准；不把 21 项或小 fixture 推导为全部图库/ viewport/缩放性能证明。 |
| A5 Inspector / metadata | [controller](C:/Users/Administrator/Desktop/Super-main/src/renderer/metadata-read-controller.ts:149) 单稳定实例、opaque owner（同 ID replacement 也换 token）、asset epoch；raw unsettled IPC ≤4，bulk ≤3，primary 优先；取消 consumer/旧 session 不早释放 slot。完整 all-ID 模型，不取成功子集；confirmed metadata ≠ dirty draft；失败显式 retry；人工/AI 分层、expectedVersion 与 conflict minimum 保留。 | EC 原实际 hooks red 2 PASS / 13 FAIL；review 中真实 Service undo 合法 logical-version 回退与两个编辑器覆盖 red；late-AI provenance 2 PASS / 2 FAIL；实际 Panel single-AI→multi 人工 aggregate 3 PASS / 1 FAIL。最终 `a5-layout-reviewed-green.json` 83 PASS / 0 FAIL / 0 SKIP，根实际 exit 0；冻结后 UI 检查点 21 PASS、exit 0。 | 实施、App writer/invalidator 接线均已冻结；happy-dom hooks/Panel、deferred API、真实 Service history 与限定 Electron UI 不等于大图库交互/RSS测量。显式成功 history restore 只重置读取 baseline，不改 DB/history version，独立 conflict floor 不撤。 |
| A6 领域事件与提示 | [Service](C:/Users/Administrator/Desktop/Super-main/src/worker/library-service.ts:6159) 每库短窗仅给 watcher 添加可选 suppressWatcherNotification，已提交变化仍发；[strict schema](C:/Users/Administrator/Desktop/Super-main/src/shared/protocol/responses.ts:351)→WorkerClient→[实际 Main publisher](C:/Users/Administrator/Desktop/Super-main/src/main/asset-change-publisher.ts:13) 始终 cache→plugin→opt-in AI→renderer。默认/省略/false 不静音。 | EC `a6-red.json` 139 PASS / 8 目标 FAIL（5 Service/2 parser/1实际 WorkerClient消息）；`a6-nonapp-green.json` 179 PASS，exit 0。`a6-a7-app-first-green.json` 66 PASS 后，`a7-local-final-green.json` 联合六文件 100 PASS、exit 0；冻结后 UI 检查点 21 PASS、exit 0。 | 全链接线已冻结，App toast 候选与 domain snapshots 独立 capture/clear、晚 publish owner guard 已接线。限定 UI 报告不是所有通知场景证明；quiet 不能停止 cache/plugin/AI，不能跨库静音。 |
| A7 背景刷新 / 导航 | 复用既有 coalescedRefresh one-active+dirty-trailing；[hydrateContent](C:/Users/Administrator/Desktop/Super-main/src/renderer/content-hydration.ts:42) 等全部已派发 raw count/sidebar Promise 排空，失败不提前释放租约；前台首屏/loading 不必等慢计数。AI item/batch terminal 与 watcher 走同 owner/coalescer，不砍 filter/rating/tag 依赖。 | EC 初五项 URL 夹具错误不计 red；`a5-review-a7-corrected-red.json` 混合集的 A7 四项为真实函数目标失败。导航/租约 10 FAIL → 79 PASS；本地移除夹具纠正后 2 PASS / 4 目标 FAIL → `a7-local-final-green.json` 六文件 100 PASS / 0 FAIL / 0 SKIP、实际 exit 0。冻结后 `checkpoint-ui-final.playwright.json` 21 PASS、exit 0。 | 实施与 App 接线已冻结。限定 Electron UI 与局部真实函数回归不替代最终所有共同门禁或性能测量。transport reject 保原不发布策略；typed per-field 成功允许其他成功字段不是 metadata 多选降级。 |
| A1b 构建关联 / 附件 | [receipt](C:/Users/Administrator/Desktop/Super-main/scripts/release/build-provenance.mjs) 捕获全类型/untracked production inputs；只声明生成 .vite/dist-extension/native rebuild 及当前平台 pin-media；ufbx/font/license/resources 不可任意漂移。薄 npm/Forge launcher早捕获、prePackage只读前置guard、postPackage最终payload、preMake exact receipt 复验；sidecar不自引用，先验证父级后 mkdir，package/derivative凭据写前复验source。 | EC 首片缺module为NEW CONTRACT red；第二片静态/新合同FAIL分开。Mac links及package sidecar真实缺口 → 安全109 PASS；第三片先164 PASS，随后末端真实source-drift 1 PASS / 1 FAIL、exit1。凭据写前追加纯verifyBuildInputs后 `a1b-final-green.json` 七文件166 PASS / 0 FAIL / 0 SKIP、实际exit0，包含原两项末端测试。 | 代码冻结及限定契约通过，不等于真实package/make；成品仍NOT_RUN。Windows x64/macOS arm64 native合同；Linux BLOCKED，不计实平台打包PASS。旧delta source baseline无需receipt/当前HEAD追认；数量20/阈值60%不变。正式Win集合保installer+setup ZIP+实际retained，不新增portable ZIP。 |
| A 最终验收 | 冻结所有写者、共同静态/兼容/回归、限定fresh UI/媒体/IPC与native、可审diff/结构/矩阵/rollback；实施不扩B/C。 | EC最终默认并行71文件1152 PASS / 0 FAIL / 1 Windows不适用SKIP、exit0；静态四门禁exit0；fresh UI21、媒体8、2.3.17 A2 probe1及EN2 native九场景均PASS/exit0；SVG/PNG与离线页面实际渲染验收。原兼容210/1SKIP历史证据保留，重叠不相加。 | 最终全源清点及真正成品发行由根任务接续登记；不从已有局部或联合green推出未运行项PASS，不宣称历史full suite全量通过。Mermaid引擎渲染未执行。 |

## 3. 数据、API与环境硬不变式：实际 diff 核对

本节核对对应采样时点的 `git diff` 与源码，而非引用计划要求自证。LibraryService diff 仅 A2 TTL cleanup catch、A6 presentation-only flag/每库短窗及对应 mutation 调用/close 清理；没有 migration、事务、恢复或 linked 删除逻辑 hunk。A4/A5/A6/A7 App 已冻结；下列数据/API结论不由 UI 绿测推导，最终全源 fingerprint 与发行版本变更仍由根任务重采样。

| 硬门槛 | 当前源码 / diff 证据 | 结论与边界 |
| --- | --- | --- |
| schema49 / 资产与修订身份 | [MIGRATIONS末项49](C:/Users/Administrator/Desktop/Super-main/src/worker/library-service.ts:3168)、SUPPORTED_SCHEMA_VERSION由末项取得；migration/历史/资产修订路径区无 diff。 | 未加迁移、未改 DB/history logical version；不声称通过矩阵完成新库/旧库所有场景。 |
| foreign_keys / journal / durability | [openConfiguredDatabase](C:/Users/Administrator/Desktop/Super-main/src/worker/library-service.ts:4761) foreign_keys=ON；已确认local→WAL，network/unknown→DELETE；synchronous=FULL并验证值2。readonly probe不写journal/synchronous PRAGMA。该区与network-storage无 diff。 | 没有关闭FK、改journal选择、降synchronous或以cache优化替代安全检查。 |
| lease与写 fence | [LibraryWriteCoordinator](C:/Users/Administrator/Desktop/Super-main/src/worker/library-write-coordinator.ts:42) 文件无 diff；[runBoundedWrite](C:/Users/Administrator/Desktop/Super-main/src/worker/library-service.ts:8006)原BEGIN IMMEDIATE边界、assertCurrent/heartbeat/release错误诊断未变；async导入检查也未变。 | 不改 owner/fencing-token/lease期限或 writer 拓扑；新逻辑取消不能当物理写入已结束。 |
| 验证备份/恢复阶梯 | [online snapshot/quick_check](C:/Users/Administrator/Desktop/Super-main/src/worker/library-service.ts:6322)、两slot验证后旋转、[readonly backup validation](C:/Users/Administrator/Desktop/Super-main/src/worker/library-service.ts:38597)与primary→verified backup→Assets recovery区无 diff。 | 未以未经验证备份/暂存替代可恢复slot，未跳过newer/stuck schema策略。 |
| owned staging / linked删除 | [assertSafeOperationPath](C:/Users/Administrator/Desktop/Super-main/src/worker/library-service.ts:6716)与removeOperation未改；TTL只捕获清理失败。[deleteLinkedAssets](C:/Users/Administrator/Desktop/Super-main/src/worker/library-service.ts:32899)原deleteSourceFile=false仅记录；true仅显式请求的regular source file经trashItem，20-ID限制与journal恢复不变。 | 不新增自动删除外部linked root权限。A9仅收回明确owned upload目录；不混用linked路径所有权。 |
| 公共API / IPC | `src/shared/library-api.ts`、protocol requests/channels、preload/index均无 diff；responses唯一变化是 [可选boolean呈现位](C:/Users/Administrator/Desktop/Super-main/src/shared/protocol/responses.ts:365)。 | 不是“协议完全未改”：这是兼容additive事件字段。strict schema接受省略/false；domain fanout不据此早return。render与upload资源port是本进程内部，不新增取消wire。 |
| 版本 / 依赖 / 更新源 | 根任务已将package.json与package-lock顶层/根package version提升为2.3.17；lock实际diff仅两处根版本，没有依赖条目变更。React19.2.7 / TS6.0.3 / Electron43.1.0 / better-sqlite3 12.11.1保持；Service更新origin区未改。 | 版本提升已完成，GitHub与旧ECS更新源发布已授权但实际结果待根登记；不把本地审计或版本号当线上已更新。依赖/ABI不升级，npm原native前置仍按实际能力验证。 |

历史只读 fingerprint（初次矩阵2.3.16采样，保留追溯，不替代根最终2.3.17全源清点；其中package-lock旧hash不代表版本提升后的当前文件）：

```text
src/worker/library-service.ts          3940e7cebdf549fd7baee55251eb0298fab11bd4a9a3630e867794c6ad8203e8
src/worker/library-write-coordinator.ts 06514600a2b6a6fc8a2ad350d4291adeb51fc35d793233f81332e7e53d1a1951
src/worker/network-storage.ts          a3310da82c2b6361a470a19e9d6bd8df226911545624c519597ec225741e087e
src/shared/library-api.ts              4d1c45ec2dafbb14ad81c57e7e966c70962e14ff705e92d0300e45c85216a0d1
src/shared/protocol/requests.ts         f33acd89e016c3f584538cc29a8fa77911f8305e2b6b6be23e4d001b77dd0ed0
src/shared/protocol/channels.ts         a77e4775d355b26a4f0fced513b624f8fa1031cec4bc86ebfd5d61c5b0733505
src/preload/index.ts                   4046295a16ece547901095893c15dd9f6e87df7dcbf17a809869c5a8dc547a69
package-lock.json                      89f4179000e68b5978667bbb22551e28c9ecf123ae4f98832c043faf650c755d
```

## 4. 失败、修正与回滚不能被绿测覆盖

- 默认并行18文件曾出现断言全绿但实际exit1、`PostQueuedCompletionStatus: (6)`。这些是 FAIL，不因JSON success或串行诊断绿改写。EC `runtime-native-close-ack.json` 与repeat连续295 PASS/exit0，真实recursive fs.watch fixture登记并等待close ACK；没有改全局并发/runner退出码或生产observer。最终默认并行71文件1152 PASS/1SKIP、实际exit0也保留原FAIL；证据支持fixture drain，不宣称修复Electron/libuv原生缺陷。
- A5 review确实发现实现后的草稿覆盖/undo版本回退，不能只引用首轮63绿。来源flag与multi Panel红也是真回归，不因batch保存原路由未坏而忽略呈现问题。最终83保留上述原断言。
- A1b Mac链接、early-producer/source drift与sidecar目录是新增实现的真实缺口，109绿覆盖修正；最初missing-export合同红不升级为旧collector复现。第三片164绿之后末端源码漂移真实red仍保留：实际final artifact第二次FileHandle打开时改owned源码，1 PASS/1 FAIL、exit1；末端纯verifyBuildInputs最小修复后七文件166 PASS/exit0，不降低原凭据/locator未写断言。
- 初始typecheck/lint存在FAIL：fixture端口类型与React render ref读写均按原严格规则修，不关闭规则/strict。2.3.17最终原严格typecheck、全仓lint、diff-check、extension:verify均实际exit0，历史FAIL不删除。
- 媒体首轮1 FAIL/7 NOT_RUN、重跑7 PASS/1 FAIL保留；HDRI选择器按实际document portal定位后 `checkpoint-media-final.playwright.json` 8 PASS/exit0，生产媒体逻辑未为测试调整。

回滚应使用逐hunk可审patch、逆依赖顺序，不整文件覆盖用户dirty改动、不reset/checkout硬撤、不删真实库/缓存/旧out/baselines：

| 切片 | 最小回滚范围 | 回滚后仍存在的风险 |
| --- | --- | --- |
| A1a / A1b | 先撤当前artifact消费者/producer，再launcher/Forge wiring，再pure receipt；门禁runner/alias另成片；保旧immutable baseline与证据。 | 重新暴露默认清单分叉/旧包按当前version打包/盲collector；不能称回滚后的包可信。 |
| A2 / A3 | TTL最后cleanup catch与测试一片；插件control/options/client→manager链一片。 | TTL错误可杀Worker；旧下载无界或取消旁路重新出现。无数据库降级动作。 |
| A8 / A9 | entry wiring与对应helper一起撤；Server/Main/Worker terminal所有权链一起撤，不只拆一端。 | render pending残留/转换后迟到post、deadline删除仍活跃Worker源重新出现。 |
| A10 | PendingStore/Service/Main薄resume和launcher成片撤，保现有更新URL/静默参数/native用户身份规则。 | legacy pending及最终launch完整性风险重新出现；真实用户缓存不得在回滚中“清空整理”。 |
| A4 / A5 / A6 / A7 | 先App/writer/invalidator/呈现接线，再相关hook/controller/hydration/publisher；新增strict可选字段与Service发送方成片评审。 | 防旧响应、raw预算、完整多选、草稿/provenance、domain通知与排空保护不可半撤后声称等价；逐回滚仍需原回归。 |

## 5. 最终共同验收登记（根代理更新）

以下是当前已知证据与剩余验收入口，不是本文件触发执行。App及A1b最终窄修复均已冻结；联合回归保持默认并行，根任务负责串行调度各门禁命令。本次文档更新只登记已提供/已读取证据，不自行运行门禁或认定尚未执行的成品发布成功。

| 验收项 | 本索引时点 | 最终需记录的直接证据 |
| --- | --- | --- |
| 所有写者freeze、当前source SHA/清点与安全diff | 代码实施已冻结，根版本已提升2.3.17；最终全源清点待根 | 最终源码fingerprint、每切片diff、schema/API/依赖/删除范围检查；新版本fresh A2 manifest不是全架构清点替代物。 |
| 原16文件基线+新增focused回归 | EC `checkpoint-contract-final.json` 去重71文件1152 PASS / 0 FAIL / 1 SKIP、默认并行、实际exit0 | 1 SKIP为Windows不适用POSIX权限用例；按实际命令/报告范围，不相加早批计数或称历史全量suite通过。 |
| 当前typecheck / lint / diff-check / extension:verify | 2.3.17四项原严格命令实际exit0 | 不替换为局部静态分析/关闭strict或lint规则；Babel大文件及Vite分块原警告未隐藏。 |
| fresh development/UI组合 | EC `checkpoint-ui-final.playwright.json` 实际21 PASS / 0 FAIL / 0 SKIP、exit0 | 本轮fresh UI检查点原始报告与真实退出；覆盖范围以实际用例为准，不升级为所有E2E/大图库证明。独占fresh .vite、isolated userData、workers1，不关闭用户软件。 |
| model-thumbnail / model-viewer | EC `checkpoint-media-final.playwright.json` fresh媒体8 PASS / 0 FAIL / 0 SKIP、实际exit0 | 实际fresh用例与原始报告；选择器夹具修正不冒充生产媒体修复，不推广为全格式/全GPU性能证明。 |
| A2真实UtilityProcess最终probe | 2.3.17 EP fresh编译；EC `checkpoint-import-probe-final.playwright.json` 1 PASS、实际exit0 | 新GUID manifest `c48189bd-9349-4c29-b1b3-07179be1eda1` 记录source/compiled hashes；同PID/child、token失效、隔离恢复。 |
| native updater | EN2 `8c7cf0d7-2a46-41fe-a306-216afdaf4e53` 2.3.17最终fresh九场景实际PASS/exit0 | 新GUID两分支/owned真实probe及原始报告，不复用旧EXE；不运行已安装Super安装器。 |
| 离线结构SVG/PNG/浏览页 | 根任务实际渲染验收通过 | 新版本图及新渲染PNG；本地页面/SVG可视与链接验收。Mermaid源没有引擎渲染，不伪PASS；结构图不替代代码门禁。 |
| A1b第三片真实producer缺口/新契约 | EC `a1b-final-green.json` 七文件166 PASS / 0 FAIL / 0 SKIP、实际exit0，代码已冻结 | 保留先164绿/后1PASS1FAIL真实red历史；末端纯source复验补修已关闭，原断言保留。fixture错与missing-export TDD单列，不以fake ISCC称真实安装器构建。 |
| 真实package/make、安装、签名、GitHub/ECS发行 | 2.3.17打包与GitHub/旧ECS更新源发布已授权；实际产物/发布NOT_RUN，真实安装不执行 | 根任务独立登记真正产物SHA、构建/成品门禁、GitHub附件、canonical feed及远程stage SHA验证/晋升；不以mock凭据、本地绿测或授权晋升draft，不扩ECS迁移。 |
| 大库p95/FPS/RSS、真实NAS/大插件/线上AI/WebDAV | NOT_RUN | 不宣称测量收益，不用静态架构图或小fixture推导性能百分比。 |
| 历史full suite/mainline/perf/lavfi问题 | NOT_RUN | 保留历史问题，不改skip/减断言/放宽timeout制造全量绿。 |

## 6. 根代理最终成品登记（2026-10-09）

上表的“待根登记 / 成品NOT_RUN / 真实产物NOT_RUN”保留表作者审计时点；以下直接执行证据更新当前状态，不改变真实安装及未测能力的边界。

- 全源清点：[inventory.json](inventory.json)，1490文件、661 TypeScript模块、2095相对依赖、0未解析依赖；逐文件SHA与16个离线链接核验通过。发行源码提交为 `4516e0a2928e0a92f757bbeee8a61c66d032ebd6`，源fingerprint为 `977b76babc85296270380a1e5c23e6d829cb1c3cd28e84c417b7400b738e1165`。
- 实际 `package`、`verify:package`、Forge `make -- --skip-package`、真实Inno均exit 0；同一buildId `ebd2acbe-e251-4f08-9263-bf1eb322a581`，7992包文件，完整安装器及更新ZIP已构建。没有以fixture ISCC替代真实成品。
- 实际发布包隔离运行的原四项E2E全部PASS/exit 0：Worker导入与重复确认、FTS5搜索筛选、关闭托盘存活、包含/排除/多选/反选/滚动/缩放/主题。未安装或替换用户正在运行的软件。
- A0/A1a/A2/A3/A8/A9/A10/A4/A5/A6/A7/A1b及A限定检查点均已完成。真实安装、签名、历史全量suite、NAS/大库/大插件性能仍未执行。
- 20增量、canonical校验和及GitHub/ECS实际发行已完成：46个GitHub附件完整digest匹配；ECS22binary+feed远端SHA通过后原子晋升，公开feed、完整delta及full首尾range通过。199MB公开整包下载超时没有计PASS，实际记录见[2.3.17验证记录](../../releases/v2.3.17-validation.md)。

子代理只读整理不运行门禁；上述最终执行由根代理实际调度并登记。architecture-designer技能用于不变式、失败模式和证据边界整理；所有功能结论仍以真实源码与限定测试证据为准。
