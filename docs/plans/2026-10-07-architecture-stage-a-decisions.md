# Super Lib 架构可靠性：阶段 A 决定版 Implementation Plan

> **For Codex:** 本文件是计划产物，未授权实现。先完整读取本文件及原审查；用户确认后才按 @executing-plans 的逐项验证流程实施。复用当前 checkout，保留所有既有 dirty 文档；不自动 commit/push/package/publish。

**Goal:** 消除已确认的请求、文件和资源生命周期缺口，固化回归/产物选择证据，同时保留当前功能、体验和资产安全。

**Architecture:** 保持 Renderer → Preload → Main → Library UtilityProcess；保留 LibraryService façade、typed IPC、schema49、原有事务/租约/恢复。引入必要的小型 owner，不新增统一状态框架、全局事件总线或 SQLite writer。

**Tech Stack:** 当前锁定 Electron43.1.0 / React19.2.7 / TypeScript6.0.3 / better-sqlite3 12.11.1；Vitest、happy-dom、Playwright/Electron和现有 Inno 工具。

---

## 0. 状态、取舍与范围

本次计划复核日期2026-10-07（Asia/Shanghai）。仓库 `C:/Users/Administrator/Desktop/Super-main`，版本2.3.16，HEAD `67298c17d792070b09adc05d5a3af3cac722ff4f`，未前进；原 inventory 的1,317份源/测试/扩展/脚本SHA-256全部匹配。git status只有既有文档修改和未跟踪文档。不要依赖环境中的旧Serpent-main路径。

历史执行必读：根 `AGENTS.md` 和云端暂停交接文件仅在本机提供，属于私人操作边界，不随 GitHub 文档发布，也不由本计划继承新任务授权。仓库内依据为[原架构审查](../architecture/2026-10-07-review/architecture-review.md)、[ADR提案](../architecture/2026-10-07-review/adr-proposals.md)、[原验证记录](../architecture/2026-10-07-review/verification.md)、[原完整计划](2026-10-07-architecture-optimization.md)。本文件收敛其阶段 A 的开放选择；实施结果以带日期的最终验证记录为准。

选择“先保行为修边界，再测量，再拆模块”。不选择只增大缓存/并发，也不选择全面重构。理由是已有体验和已完成优化良好，新增风险来自异步所有权，而非技术栈不适合。

### 本轮收敛的决定

- 默认实施范围为A0—A10及A检查点；A1拆为门禁A1a和provenance/附件A1b。B/C只保留条件路线，不隐含授权。
- 不重复已完成的serialPoll、coalescedRefresh、scoped import summaries、TEMP epoch/data_version、changed-file async hash、分页sentinel/reflow、filter UI、updater自动打开。
- A4稳定回调使用`useCallback`，不再增加latest-callback-ref抽象。
- A5采用一个Renderer实例共享的读取调度器、不可复用的库会话token和每资产readEpoch。不以libraryId或library summary对象身份替代会话。
- A6仅新增可选`suppressWatcherNotification`呈现字段；领域事件始终传递。A7直接复用现有`createCoalescedRefresh`，不强制新background-refresh-controller生产模块。
- A9区分“请求Promise结束”和“Worker真正终结”；新增仅Main本地的terminal回收回调，不修改Worker/HTTP wire格式，不把deadline或client disconnect当后台取消。
- A10默认使无可信receipt的legacy pending失效：正常打开应用并提示重新准备更新，不对旧缓存补算hash后盲执行。
- 不启动真实安装/用户图库，不连接ECS/GitHub/AI/WebDAV，不改账号/MUTAI/远程目录，不升版本、不生成发行包、不自动提交/推送。

### 证据分类（不是故障发生率或已修复声明）

| 类型 | 项目 | 实施前门槛 |
| --- | --- | --- |
| 当前代码缺口 | R01 TTL；R02下载字节预算；R04多选无界/所有cache writer；R05领域事件抑制；R06 RPC清理；R07 staging；R09 AI刷新旁路；R10门禁 | 先针对真实函数/入口补deterministic red，不以旧测试通过代替新复现 |
| 代码+最小竞争模型 | R03分页旧finally；R04晚到read/save和同版本rating | 挂载实际hook/调用实际cache writer；当前未完成完整React现场复现 |
| 工具确认 | R11 collector当前返回265二进制，235 delta | fixture重现错版选择；不能由旧包文件名或当前HEAD推断构建来源 |
| 完整性加固 | R08延期installer receipt | 不称已证明远程漏洞；明确legacy体验变化和TOCTOU限制 |
| 测量候选/维护性 | R12—R16及PDF/GPU/chunk观测 | B/C延后；新同机指标、差分正确性和用户范围确认后才推进 |

## 1. 顺序、共同工作流与交付状态

```text
A0 → A1a → A2 → A3 → A8 → A9 → A10 → A4 → A5 → A6 → A7 → A1b → A检查点
                                                                        ↓ 停止
                                                         B测量后另确认 → C渐进提取
```

A5的session owner→A7、A6的呈现契约→A7是功能依赖；A4独立，其余顺序用于控制合并/验证风险。`App.tsx`、`main/index.ts`、`library-service.ts`、`worker-client.ts`均单写者串行修改。子任务可以只读复核或编辑无交叉的测试，不能同时修改这些大文件。native/build/E2E/perf也串行；A阶段不跑性能造数。

每任务依次：读确切入口 → 写新测试 → 运行并确认因目标缺口失败 → 最小实现 → 同命令green → 相关回归 → 审diff/记录兼容与回滚。尚不存在的Create文件要先写测试，不能把“路径不存在/fixture错误”当已复现业务缺陷。以下命令均是**未来实施命令，本次没有执行这些新测试或实现**。

门禁状态固定为`PASS/FAIL/SKIP/NOT_RUN/BLOCKED`，附required/platform/reason/evidence。非适用平台用`SKIP(reason=platform-not-applicable,required=false)`；所需能力缺失用`BLOCKED`，未执行用`NOT_RUN`。任何required非PASS都不能晋升为release-ready。既有lavfi造数失败保留FAIL，不为通过而skip、放宽timeout或减断言；该夹具的独立修复不隐含包含在A中。

所有新证据放 `tmp/architecture-stage-a-<runId>/`，每次新Guid；新任务记录放Create `docs/plans/2026-10-07-architecture-stage-a-execution.md`。不清空历史out/make、baseline或真实log/cache。只有新夹具的明确owned目录可清理；先验证绝对路径归属。

## A0：确认基线、隔离和能力

**Files:** Read上述必读文件、`package.json`、`vitest.config.ts`、`playwright.config.ts`、`scripts/run-vitest-with-electron.mjs`、`scripts/run-e2e.mjs`、`tests/e2e/electron-test-helpers.ts`；Create执行记录。

1. 执行`git rev-parse HEAD`、`git status --short`、`git diff --stat`；源码若漂移，更新问题定位，不覆盖dirty业务。
2. 记录Node/Electron/平台/ABI；若本地依赖不齐，BLOCKED，不自动npm install/升级。Worker及依赖原生库的unit均使用Electron Node runner，避免在Node和Electron ABI之间来回重建。
3. 按原verification.md运行16文件基线，输出新JSON路径；旧162仅是旧结果，不硬编码未来数量。检查fixture只用mkdtemp/独立userData。
4. 盘点`.vite`是否被其他dev/build任务使用，不停止用户应用；E2E runner会重建该目录，必须独占。需要另checkout时先记录选择，不盲建worktree。
5. Native能力检测沿用本地工具定位：`SUPER_INNO_TOOLS`指向的ISCC，或`%LOCALAPPDATA%/SuperTools/inno/tools/ISCC.exe`，另需`%WINDIR%/Microsoft.NET/Framework64/v4.0.30319/csc.exe`和interactive desktop；“存在旧preview.exe”不能证明当前源码重新编译通过。

**验收/回滚:** 基线和能力状态可追溯、隔离成立；只增加记录，业务无回滚。需要用户确认的是未来开始阶段A，而不是再次询问已经明确的云端暂停范围。

## A1a：单一回归门禁清单（R10）

**Create:** `scripts/release/gate-manifest.mjs`、`scripts/release/run-gates.mjs`、`tests/unit/release-gate-manifest.test.ts`。

**Modify:** `scripts/verify-mainline.mjs`、`scripts/release/pipeline.mjs`、`scripts/run-e2e.mjs`、`scripts/release/verify-update-native-ui.ps1`、`scripts/release/capture-update-preview.ps1`、`package.json`。保留旧npm alias；版本号不动。默认E2E由manifest供给；run-e2e仍支持显式文件CLI覆盖，不在package.json留第二份重复默认清单。

**Read:** `scripts/release/preview-update-ui.iss`、`tests/fixtures/native-update/Super.cs`。

1. Red：清单路径存在/id唯一，default E2E不会漏filter/preview/AI Inspector/task polling/import conflicts/tray；mainline与pipeline共享清单，无递归调用自身alias。required gate失败/缺能力不返回成功；dry-run不spawn、不安装、不网络。
2. 固定条目`{id,stage,platform,required,capabilities,command,argv,preconditions,evidence}`；固定stage为contract/development/native-updater/package。显式保留现有正常E2E清单，补专项，不glob全部NAS/benchmark用例。
3. development把E2E合为一次`run-e2e.mjs`调用，单次fresh build、Playwright workers=1；每个测试结果独立记录，失败不被总命令exit0掩盖。
4. native-updater runner先从当前`.iss`编译preview及生产分支probe，再运行现有9场景验证器；版本从package读取，不硬编码2.3.15。runner分配fresh Guid目录，ISCC两次均用`/O<dir>`；给验证器增加可选`-PreviewDirectory`，给capture增加可选`-OutputDirectory`，所有EXE/log/screenshot/probe路径都由本次目录派生。保留两脚本旧CLI默认路径，但门禁绝不消费默认目录旧EXE；编译失败立即停。csc运行probe仍在该目录内独立Guid子目录，不对已安装Super运行安装器。另有package stage，本计划只dry-run/列NOT_RUN，不生成成品。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/release-gate-manifest.test.ts tests/unit/update-native-ui.test.ts
node scripts/release/run-gates.mjs --stage development --dry-run
node scripts/release/run-gates.mjs --stage native-updater --dry-run
node scripts/release/run-gates.mjs --stage package --dry-run
```

native runner内部明确执行以下链（本次不执行；未来先确认owned输出和工具）：

```powershell
$architectureIsccPath = if ($env:SUPER_INNO_TOOLS) {
  Join-Path $env:SUPER_INNO_TOOLS 'ISCC.exe'
} else {
  Join-Path $env:LOCALAPPDATA 'SuperTools/inno/tools/ISCC.exe'
}
$architectureAppVersion = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
$architectureNativeDirectory = Join-Path (Get-Location).Path ('tmp/architecture-stage-a-' + [Guid]::NewGuid().ToString('N') + '/native')
New-Item -ItemType Directory -Path $architectureNativeDirectory -Force | Out-Null
& $architectureIsccPath ("/O" + $architectureNativeDirectory) ("/DAppVersion=" + $architectureAppVersion) 'scripts/release/preview-update-ui.iss'
if ($LASTEXITCODE -ne 0) { throw 'Preview compilation failed.' }
& $architectureIsccPath ("/O" + $architectureNativeDirectory) ("/DAppVersion=" + $architectureAppVersion) '/DSuperUpdateCompileOnly' 'scripts/release/preview-update-ui.iss'
if ($LASTEXITCODE -ne 0) { throw 'Production-branch fixture compilation failed.' }
pwsh -NoProfile -File scripts/release/verify-update-native-ui.ps1 -PreviewDirectory $architectureNativeDirectory
if ($LASTEXITCODE -ne 0) { throw 'Native updater fixture checks failed.' }
```

**验收:** required专项全部可列、Windows能力缺失BLOCKED、旧命令不绕过清单；不同阶段不隐式触发package/publish。**回滚:** 清单/runner/wiring独立diff回退；不改源包/数据库。

## A2：pending import TTL清理故障隔离（R01）

**Modify:** `src/worker/library-service.ts`的`scheduleImportExpiry`及`tests/worker/pending-import-lifecycle.test.ts`。Read `src/worker/windows-fs-retry.ts`；不新建生产owner类。

1. Red用现有`ManualImportClock/importClock/importTtlMs`和真实Service：timer先失效token/写rolled_back后cleanup throw；诊断回调自身throw；正常后续库查询；close/resolve/expiry竞争。普通清理故障可spy实际removeOperation；unsafe祖先/链接用真实安全断言测试。
2. 仅在TTL callback里捕获removeOperation故障，复用已有不会向外抛的`diagnose`，事件`import.expiry.cleanup`关联库/operation/错误。不全局吞removeOperation，不改15分钟TTL、原durable状态、commit/resolve/close错误语义，不新增无限重试timer。
3. token不因清理失败复活；锁/权限恢复后的安全残留由既有重开恢复接续。unsafe target仍拒绝，外部数据不删。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/pending-import-lifecycle.test.ts tests/worker/import-confirmation.test.ts tests/worker/import-source-stability.test.ts tests/worker/database-recovery.test.ts tests/unit/windows-fs-retry.test.ts
```

**真实IPC门槛（独立小切片）:** Create `tests/fixtures/import-expiry-probe/main.ts`、`tests/fixtures/import-expiry-probe/worker.ts`、`scripts/build-import-expiry-probe.mjs`、`tests/e2e/import-expiry-fault-containment.test.ts`。fixture编译真实LibraryService，在真实Electron UtilityProcess中使用ManualClock；仅fixture对该Service实例的实际`removeOperation`替换为单次throw EPERM，触发真实TTL callback后恢复原方法（非生产env入口，非全局fs补丁，非global uncaughtException吞错）。测试必须先收到该fault诊断，随后同一UtilityProcess ping/list响应，并核对expired状态及安全重开恢复。Main/Worker/userData/库全owned；沿用Vite外置Node/native依赖策略，但不写`.vite`，构建器只输出fresh Guid目录及probe manifest。Playwright用test-only `SUPER_E2E_IMPORT_EXPIRY_PROBE_MANIFEST`消费本次manifest；缺失/源码hash不符即失败，不加载默认旧probe。该fixture env不进入生产启动代码。

fault严格匹配已prepare的唯一owned operationPath且只armed一次，执行真实`assertSafeOperationPath`后才抛cleanup错误，其他调用委托原方法，原安全断言不改。先由ParentPort请求arm并返回ack，再在实际`setImmediate/setTimeout`回调内执行ManualClock advance，**不放进请求handler catch、不catch该timer callback**；旧TTL缺口应使这一个UtilityProcess退出，修复后同child对象/同PID继续响应且无respawn。diagnostic到达后还原方法，再close/reopen查恢复。manifest额外绑定runId与compiled bundle hash，E2E复验，不让旧bundle伪green。Electron launch用现`electronLaunchEnv()`移除`ELECTRON_RUN_AS_NODE`；证据只称“真实Service TTL在真实UtilityProcess中的隔离”，fixture没有启动生产worker/index，不扩大为整个生产组合根已端到端验证。

```powershell
$architectureProbeManifest = node scripts/build-import-expiry-probe.mjs --print-manifest
if ($LASTEXITCODE -ne 0) { throw 'Import expiry probe build failed.' }
$architecturePreviousProbeManifest = $env:SUPER_E2E_IMPORT_EXPIRY_PROBE_MANIFEST
try {
  $env:SUPER_E2E_IMPORT_EXPIRY_PROBE_MANIFEST = $architectureProbeManifest
  npx --no-install playwright test tests/e2e/import-expiry-fault-containment.test.ts --workers=1
  if ($LASTEXITCODE -ne 0) { throw 'Import expiry UtilityProcess gate failed.' }
} finally {
  $env:SUPER_E2E_IMPORT_EXPIRY_PROBE_MANIFEST = $architecturePreviousProbeManifest
}
```

`--print-manifest`固定stdout仅一条绝对manifest路径，构建日志走stderr；manifest记录fixture/source hashes与本次compiled entry。不存在此harness的当前状态是NOT_RUN，不把同进程Service测试称为IPC存活；未来A验收若没跑此门槛须显式BLOCKED该项。

**验收/回滚:** timer不throw、token单次、commit不撤销、错误保留证据；仅callback切片回退，无迁移。fixture保留给故障回归，不进入发行载荷。

## A3：插件流式接收预算和取消链（R02）

**Modify:** `src/main/plugin-github-client.ts`、`src/main/plugin-package-manager-types.ts`、`src/main/plugin-package-manager.ts`、`src/main/plugin-install-operation.ts`、`tests/unit/plugin-github-client.test.ts`、`tests/unit/plugin-install-operation.test.ts`。**Create:** `tests/unit/plugin-download-budget.test.ts`。

1. Red假stream：未知/虚假Content-Length、超过256MiB边界（小预算fixture模拟，不实际下载大包）、碎片chunk、header/reader挂起、API/commit/source fallback、pause期间取消、无reader；校验reader.cancel、listener/timer和终态一次。
2. 所有默认client下载使用PackageManager现有archive预算，收chunk前按累计实收bytes检查；Content-Length仅作早拒绝，不作信任依据。安装后的ZIP/path/symlink/解压限额不移除。
3. 注入父AbortSignal贯通API、并行commit查询、download、pause/read及安装/更新两种入口（现manager:405更新也要传预算）；header及active-idle默认30s可配置，pause等待也可取消，pause不消耗idle、恢复后重启，不引任意总时长上限。挂起reader.read时主动reader.cancel，而非只在read前查signal。每terminal清监听/timer；旧插件替换待完整校验，失败不删旧版。
4. 仍返回Uint8Array。无reader的默认网络下载不能调用无界arrayBuffer，给明确可诊断失败；保留公开custom client合同，宿主最终archive check仍必做。正常release/source fallback和用户pause/retry语义均要回归。
5. 只保证archive bytes上限；chunks+合并可有约2倍以上内存峰值，测RSS/峰值分配并记录，不承诺256MiB RSS。流式落盘/解包是另行测量后任务。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/plugin-github-client.test.ts tests/unit/plugin-download-budget.test.ts tests/unit/plugin-install-operation.test.ts tests/unit/plugin-package-manager.test.ts tests/unit/plugin-package-archive.test.ts tests/unit/plugin-trust-prompt.test.ts
```

**验收/回滚:** 接收期超限先于最终合并、取消不悬挂、旧版完整保留；client/option适配独立撤回，不变权限/信任/API格式。

## A8：render RPC settle-once（R06）

**Create:** `src/worker/pending-render-rpc.ts`、`src/worker/model-render-orchestrator.ts`、`tests/unit/pending-render-rpc.test.ts`、`tests/unit/model-render-orchestrator.test.ts`。**Modify:** `src/worker/index.ts`。

1. 固定helper职责：`request({buildMessage,timeoutMs,timeoutResult,signal})`、`settle(requestId,parsedResult):boolean`、`dispose(reason)`；factory注入dispatch/UUID/timer，model/document各一实例。schema解析保留在真实消息入口。
2. Red：preabort/disposed不创建timer、不post；先建entry再dispatch，支持同步fake响应；注册abort后再检查signal；build/post throw、success、typed timeout、abort、dispose/shutdown、迟到重复回复全部settle一次并先清Map/timer/listener。
3. timeout保原MODEL_RENDER_TIMEOUT/DOCUMENT_RENDER_TIMEOUT failed result，abort保AbortError。shutdown先dispose registries再等媒体/库close；保现有single-flight、source authorizations、HTML fallback与deadline。
4. 确定把现`orchestrateRender`原函数提取为`createModelRenderOrchestrator(ports)`返回同签名函数；ports只含真实convert Fbx、resolve companions、authorize source、request model render，格式/URL/HDRI/尺寸/deadline/view映射沿用shared常量。真实index组合根供Service/现converter/registry ports，single-flight、diagnostic/fallback wrapper与媒体job owner留原调用层，不把整个index导入测试。真实提取函数在调用converter前、conversion await后且读取status前、发RPC前检查signal；测试用deferred converter的ready/failed两分支验证转换期间abort不再resolve companions/授权/发RPC，另测正常FBX/glb、conversion typed failure、companion授权及多view合同。测试的是将被生产调用的函数，不另造平行模型。不向共享single-flight converter强塞个人signal；已开始的FBX转换/缓存写入可完成，禁止的是之后的新render及取消job发布render结果，不宣称撤销FBX cache。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/pending-render-rpc.test.ts tests/unit/model-render-orchestrator.test.ts tests/unit/offscreen-thumbnail-renderer.test.ts tests/unit/model-thumbnail-protocol.test.ts tests/unit/worker-client.test.ts
```

**验收边界:** abort后不再提交新render请求/发布该job render结果，已dispatch Main工作允许在既有deadline内结束。当前wire没有cancel message，**不承诺立即停止已发offscreen/GPU或既有FBX cache写入**；物理跨进程取消另立协议设计。**回滚:** helper与调用适配切片撤回，无schema/protocol改变。媒体真实E2E见A检查点，能力不足不充PASS。

## A9：上传staging与Worker真实terminal所有权（R07）

**Create:** `src/main/extension-upload-staging.ts`、`tests/unit/extension-staging-lifecycle.test.ts`。**Modify:** `src/main/extension-server.ts`、`src/main/index.ts`的handleSaveUpload、`src/main/worker-client.ts`、`tests/unit/extension-message.test.ts`、`tests/unit/worker-client.test.ts`。

1. 状态固定：Server receiving → Main claimed → Worker dispatched → actual terminal → cleaned。Server创建本地staging handle，接口只含`claim()/release()`，作为内部`onSaveUpload(upload, handle)`第二参数传Main，绝不加入HTTP payload/WorkerCommand。Server finally仅release未claimed；Main在dispatch前claim，WorkerClient terminal release；claim后的construction/post failure由Main走未dispatch释放。请求timeout/HTTP disconnect不进入立即删除finally；handle按validated owned目录幂等释放。
2. WorkerClient.request增加本地`onTerminal` option，以独立资源记录保存requestId和对应child实例；原因只有response/not-dispatched/worker-exit。正常/迟到有效response、确定对应UtilityProcess exit调用一次；cleanup回调故障只诊断，不改变业务响应。
   child监听器闭包绑定originChild；旧child的message/exit只可处理其资源记录，不改变新child的ready/pending，也不对新child执行protocol kill。资源迟到response在expired-request 10分钟记录淘汰/unknown-response判定前识别，清理后消费该回复，不误判协议故障。只有消息schema真实有效且来源匹配才能认response terminal；无效reply要保资源直到同实例exit。
   ready timeout移除该实例initial listener，迟到handshake不得令新child ready。资源entry在post前建立；post throw同时清业务pending/timer并通知not-dispatched。回调同步throw/异步Promise rejection都诊断且不变原响应；真实目录删除失败明确记残留，不将“通知settled”记为“文件已删”。
3. client deadline/rejectAll/protocol failure/shutdown发起kill均不是actual terminal；资源记录不能跟expired-request TTL一起丢。确认exit后再清；没收到terminal且child仍活着就保留staging，不按任意定时器赌删文件。新child启动不能替旧child证明完成。
4. body abort前Server pipeline负责清；body完整且Worker已dispatch后HTTP disconnect不撤销导入/不删source。没库/worker不可用/构造或post失败走未dispatch清理。并发只删自己validated directory；无需启动扫描器、全temp清空或新pairing策略。
5. Red：early return、业务error、正常完成、超时→Worker继续读→迟到response、expired map淘汰后资源response、protocol kill→exit、正常response+exit双通知、客户端断开、两upload交错；old child ready timeout/退役→new child ready/in-flight→old handshake/message/exit不清新状态或回收新upload，cleanup throw/rejection保业务结果并记残留。测试真实WorkerClient fake UtilityProcess事件和同一staging helper，不用另造平行状态机。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/extension-staging-lifecycle.test.ts tests/unit/extension-message.test.ts tests/unit/worker-client.test.ts tests/unit/extension-save-context.test.ts tests/worker/extension-save.test.ts
```

**验收/回滚:** early reject不残留、活跃Worker源仍可读、terminal幂等回收、错instance不回收。独立回退本地owner/options wiring；不改资产commit或wire。不能改回“所有finally立即delete”并声称保行为。

## A10：延期installer receipt（R08）

**Modify:** `src/main/pending-app-update.ts`、`src/main/app-update-service.ts`、`src/main/index.ts`、`tests/unit/pending-app-update.test.ts`、`tests/unit/app-update-service.test.ts`。**Create:** `tests/unit/pending-update-integrity.test.ts`。

1. receipt固定版本1，记录已验证download解出installer的sha256、bytes、appVersion与真实cache路径；不是对任意旧文件补hash。stream hash、regular-file、realpath containment；拒绝符号链接/目录/越界。
2. Store读取层固定返回`absent/legacy/candidate/invalid`，不能让现loadPending的schema catch先把legacy/invalid吞成undefined。只有candidate进入Service异步校验成为valid/invalid；Main同步启动restore改await并容错，absent正常无提示，其他失败路径按下一项提示一次。补Store→Service→Main真实调用链测试，而非只测Service方法。最终完整性guard集中在launchPreparedUpdate，覆盖启动延期、手动立即更新和downloadAndInstall全部入口；one-active launch/verify。合法完成仍原用户`--updated`打开一次，保retry/close。prepare后篡改/截断/缺失、restore到launch之间替换、并发点击均red。
3. 旧receipt或bad cache：清无效pending记录（仅owned cache可清）、正常打开本体并一次性提示重新准备，不自动重新下载，不执行不可信installer，不阻断开库。保notes/completed-notice旧格式与版本匹配；校验失败不生成完成标记。新pending格式回滚到旧strict reader可被拒绝但本体正常启动，completed notice不连带失效。
4. 明确同用户恶意程序仍能在校验与exec间替换文件；不宣称签名、强沙箱或彻底消灭TOCTOU，不改更新server/schema49。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/pending-app-update.test.ts tests/unit/app-update-service.test.ts tests/unit/pending-update-integrity.test.ts tests/unit/update-native-ui.test.ts tests/unit/update-retention-policy.test.ts
node scripts/release/run-gates.mjs --stage native-updater
```

**验收/回滚:** 坏cache不执行、本体照常、合法流程自动重开不退化；receipt读取对旧数据兼容为“重新准备”，不恢复盲launch。代码级独立回退不会回滚资产库；cache metadata可以再下载重建。

## A4：分页generation cleanup与稳定callback（R03）

**Modify:** `src/renderer/use-browse-pagination.ts`、`src/renderer/App.tsx`、`tests/unit/browse-pagination.test.ts`。**Create:** `tests/unit/browse-pagination-lifecycle.test.ts`。

1. 实际hook宿主用文件头happy-dom、React `act/createElement/createRoot`（参考`tests/unit/audio-player-controls.test.ts`）；仍用`.test.ts`，现config不会收`.test.tsx`。不加testing-library依赖。
2. deferred red序列A100在途→reset B→B100在途→A success/fail/finally：B占位/loading仍在，B重复ensure不二发；layout旧finally不能清新layout。StrictMode mount-cleanup-remount及真正unmount分开测；新owner仍可正常加载。
3. owner固定`{generation,inFlightOffsets,layoutInFlight,disposed}`；reset/beginPage建新owner，真正effect cleanup失效旧owner，StrictMode再次setup须建可用owner。每请求捕获owner，finally仅清捕获owner；items/total/loading/definition/layout/filled/deleted等所有发布点仅current owner可写。保分页limit、layout chunk、未知ID/排序和目的地hydration。
4. App失败回调确定为`useCallback(() => setError(t('toast.loadMoreFailed')), [setError,t])`。locale变化正常更新，无关toast render不重建controller/observer；必要loading settle后仍重观察sentinel。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/browse-pagination-lifecycle.test.ts tests/unit/browse-pagination.test.ts tests/unit/merge-asset-summaries.test.ts
```

**验收/回滚:** hook真实red→green；末尾340、collection/trash、deep jump、缩放和全范围反选保留，UI在A检查点验证。owner/callback独立回退，无offset协议改变。

## A5：完整元数据模型、会话与读取预算（R04）

**Create:** `src/renderer/metadata-read-controller.ts`、`tests/unit/metadata-read-controller.test.ts`、`tests/unit/inspector-metadata-session.test.ts`、`tests/unit/inspector-multi-edit-lifecycle.test.ts`。

**Modify:** `src/renderer/App.tsx`、`src/renderer/use-inspector-multi-edit.ts`、`src/renderer/use-inspector-asset-metadata.ts`、`src/renderer/use-browser-session-restore.ts`。保`src/renderer/inspector-multi-edit.ts`模型和保存expectedVersion/history/optimistic语义。

1. 明确三个生命周期：activateSession(summary)总是新token（同libraryId重开也是新会话）；updateSessionSummary(summary)不换token（rename等摘要更新）；disposeSession(owner)移队列/禁发布。App普通open/create、startup restore、import-open、MCP lifecycle、sync-open都接activate，不把每个setLibrary当重开。
2. 调度器按Renderer实例稳定持有；session拥有cache/conflicts/readEpoch，consumer拥有selection/effect兴趣。两个实际hook的effect都依赖不可复用session token，不能只看libraryId/selection。取消一个共享consumer不取消其他consumer，最后一个queued consumer取消则不dispatch，所有Promise有终态；consumer可立即得到CANCELLED，但原始`api.getAssetMetadata` Promise另行持有slot，只有它settle/deadline才释放，不由逻辑consumer finally释放。每session每asset current epoch才dedupe；force refresh/mutation后不可共享旧读。read派发捕获owner+epoch，commit时current/未disposed/epoch匹配且entityVersion不倒退；无新版本确认不清version-conflict。
   失效入口同步标stale并前进epoch，当前active consumer的受影响ID去重进入新epoch队列；批量burst合并queued项，在预算内追平。旧epoch响应只settle原始slot，不恢复旧cache；选择不变也必须继续新读，`cache.has`不能绕过stale/epoch检查。多选model仅等全部selected IDs有current epoch数据后恢复，未受影响且current的数据可复用。session dispose取消其待办；不对无consumer的资产预读，不能无新事件无限失败重试。
3. metadata save、batch rating/tag、AI/域变化等已有失效入口前进readEpoch；没有assetIds时保守全scope失效。rating现不总bump entity_version，故只比版本不够：old(v7,rating0)→batch rating5成功(v7)→old返回不能覆盖rating5。单选/多选/保存所有cache writer使用同一commit guard；owner失效的尚未dispatch save不再发，已dispatch持久保存照常完成，但不发布新会话cache/UI/notice/history，不重写expectedVersion/optimistic/history。
4. 预算定义为客户端尚未settle的metadata IPC Promise，**不是Worker物理工作数**：总≤4（含旧session），bulk≤3，primary单选优先用第四slot。dispose丢旧queued，但旧in-flight直到已有Promise/既有deadline结束才释放slot；空slot立即新读。全部4个被旧primary占用时新primary排优先队列，UI不freeze，不延timeout/谎称服务端取消。
5. 多选必须完整：沿用model“任一selectedID缺metadata则aggregate=null”；部分失败不以成功子集算mixed/uniform/共同标签，不截断selection。显示明确可重试状态，失败项重试；batch listTags一次，但每个目标的metadata/history/save仍完整。
6. Red 1k冷selection、重复ID、取消/失败、read晚于save、同版本rating、同ID不同session、rename不rotate、同libraryId重开、StrictMode；两项选中read blocked→AI/batchTag失效（selection不变）→旧响应丢弃→新epoch全读完成，aggregate恢复最新字段；old bulk3→dispose→new primary第4、20次重开不无限发、全部slot占满后下一settle优先读，迟到finally只释放其客户端IPC slot不污染新owner。分别计logical consumer与原始IPC active，不将前者取消误报后者预算下降。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/metadata-read-controller.test.ts tests/unit/inspector-metadata-session.test.ts tests/unit/inspector-multi-edit-lifecycle.test.ts tests/unit/inspector-multi-edit.test.ts tests/unit/browser-session.test.ts
```

**验收/回滚:** all-ID aggregate等价、完整批改、版本/epoch不倒退，预算按已定义维度真实成立；测试调用真实hooks/cache writer，不只测试独立Map模型。controller与调用处独立撤回，DB/API不改。

## A6：领域事件与toast分离（R05）

**Modify:** `src/worker/library-service.ts`、`src/shared/protocol/responses.ts`、`src/main/index.ts`、`src/renderer/App.tsx`、`tests/worker/library-watcher.test.ts`、`tests/unit/protocol.test.ts`、`tests/unit/worker-client.test.ts`。

**Create:** `src/main/asset-change-publisher.ts`、`tests/unit/asset-change-publisher.test.ts`、`tests/unit/watcher-notification-policy.test.ts`及对应纯呈现helper `src/renderer/watcher-notification-policy.ts`（只选toast，不拥有refresh循环）。

1. 扩现有ManualScheduler/observer测试，不复制多库harness。R05 red：A client mutation后1.5s内B watcher提交，B领域事件必须发；同库混合也发。`noteClientFilesystemMutation`全部12处显式库ID，deadline改Map，close清本库，不变原窗口长度。
2. Service本地类型及shared strict schema都新增`suppressWatcherNotification?:boolean`，仅true时发送；未提供=现有可通知策略。committed watcher always emit/source:'watcher'；DB sequence/epochs/data_version不变。
3. Main小提取publisher并实际调用它，ports保cache clear/artifact invalidation/plugin event/opt-in autoAI/webContents.send原顺序/语义。新flag不抑制这些副作用；fake UtilityProcess验证strict parser/转发，不以library.changed代替资产事件。
4. App domain pending一直收；独立notification candidate只忽略flag===true的watcher，其余沿用原latest policy。静默最后到不能吞既有可通知候选；不顺手累加changedCount/改client或text-save优先级。两个arrival顺序、active read期间burst、切库/dispose都red。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/library-watcher.test.ts tests/unit/protocol.test.ts tests/unit/worker-client.test.ts tests/unit/asset-change-publisher.test.ts tests/unit/watcher-notification-policy.test.ts tests/unit/asset-change-cache.test.ts tests/unit/plugin-domain-events.test.ts tests/unit/source-path-cache.test.ts
```

**验收/回滚:** Worker事件→Main effects→Preload/App分别有真实入口证据；同库client窗口内外部变化仍可能静默toast，但领域效果完整。不承诺完美分类所有外部操作。可选字段/presentation/publisher独立回退，无迁移。

## A7：将AI旁路接入现有coalescer（R09）

**Modify:** `src/renderer/App.tsx`、`tests/unit/coalesced-refresh.test.ts`、`tests/e2e/ai-inspector-refresh.test.ts`、`tests/e2e/preview-background-refresh.test.ts`。保现有`src/renderer/coalesced-refresh.ts`API，不强制新生产controller。

**Create:** `src/renderer/content-hydration.ts`、`tests/unit/background-hydration-lifecycle.test.ts`。确定提取现App:3198—3258的真实count/sidebar hydration函数，App实际调用；不挂整个App的happy-dom宽bridge，不复制另一套loadContent。helper固定`hydrateContent({api, libraryId, scope, includeLibraryCounts, refreshSidebar, trashMode, showIgnored, isCurrent, publish})`返回同一hydration Promise，沿用现条件/并发/typed结果；UI setter保App的publish port，dependencies用type-only。此约60行提取只为真实边界可测试，不扩为background controller/整层重写。

1. 将per-item完成（App:3691）和`refreshAiBatchStatus`终态（:9190）都接同一session-scoped full-requery入口，否则仍双刷新。event assetIDs做集合并；数据dirty与toast候选分开，沿用A6。
2. one-active+one-dirty-trailing是并发/待办容量，不是持续写入期间永远只能两次read。单blocked read间100event最终两轮；第二轮期间再变则继续追平。helper dispose只停trailing，已开始read的每个发布点仍须owner/generation guard；共享Promise错误只在owner drain边界报告一次，不让100个调用各catch一遍。失败不无事件无限重试。
   active lease明确覆盖首屏及其count/sidebar hydration：现loadContent的`void(async...)`会在首屏返回后继续最多9个IPC，不能只await首屏就称完整full-requery有界。为内部loadContent增加`awaitHydration?:boolean`（默认false），经`reloadCurrentContent(options?)`及其ref签名透传普通/trash路径，只有背景drain传true；持有上述真实helper Promise。首屏register/items和contentLoading仍立即完成、交互不等sidebar，背景owner才await同一hydration后settle，不能把await放在原finally之前使contentLoading晚关。hydration错误仍不抹掉有效首屏，不改变前台导航的默认时序。所有hydration发布也用session/generation guard。smart-collection分支不走loadContent，只等现execute/result commit，不能假称awaitHydration在该分支补了sidebar；有额外任务则逐一核对，不能悄扩scope。Red针对真实hydration函数+现coalescer：首屏成功、第一组count/sidebar blocked→100event，第二组不得发；释放后恰好一次trailing追平。首屏loading/preview实际体验由真实Electron接线回归验证，两者证据分开记录。
3. 保计时：network750ms、silent/import120ms、ordinary asset300ms、history/local-removal1500ms。人工refresh仍及时。asset.derived.ready保持Inspector-only、thumbnail/dimensions局部patch、AI clear targeted-only；不把全部background都改full requery。
4. 第一轮不缩小query/count/sidebar依赖：AI rating sort/filter、tags、analysisStatus、smart scope及最终counts与旧模型一致。导航/切库晚到completion、unknown IDs fallback、full/filtered/smart/draft scope覆盖；viewer identity/selection/scroll不动。event wire只有libraryId：同ID重开后当前listener收到durable AI completion须读当前库，不能假装识别并丢掉旧session来源事件；只丢捕获旧owner的请求结果。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/background-hydration-lifecycle.test.ts tests/unit/coalesced-refresh.test.ts tests/unit/asset-change-cache.test.ts tests/unit/viewer-preview-policy.test.ts
```

**验收/回滚:** 新真实hydration函数/现coalescer的deferred red与真实App事件接线E2E分别有证据，AI Inspector和batch两条都通过；不把只发webContents事件的E2E当Main fanout验证，不把helper red称为整App blocking现场复现。实际App可用现task polling隔离Worker cmd log计IPC、核对选scope最终结果与早恢复首屏；无需新生产test env或宽App unit宿主。helper提取与入口接线分别独立切片回退，serialPoll不改。

## A1b：构建来源与唯一发行附件集合（R11）

**Create:** `scripts/release/build-provenance.mjs`、`scripts/release/build-with-provenance.mjs`、`scripts/release/artifact-manifest.mjs`、`tests/unit/build-provenance.test.ts`、`tests/unit/release-artifact-manifest.test.ts`。

**Modify:** `forge.config.ts`、`package.json`（package/make及prepackage/premake receipt wiring，不改版本）、`scripts/release/pipeline.mjs`、`scripts/release/lib.mjs`、`scripts/inno-build.mjs`、`scripts/release/package-file-manifest.mjs`、`scripts/release/build-inno-delta.mjs`、`scripts/release/build-retained-deltas.mjs`。npm alias保持；直接`release:delta`也须检查target receipt，不能只改retained wrapper。

按三个串行可回退切片：①receipt contract/纯验证与mock tests；②Forge/npm/衍生物来源wiring；③唯一附件选择/checksum。每片red→green，不一次引入通用发行框架；最终附件选择不能在receipt绑定前自称可信。

1. 先设计并red receipt：buildId、source HEAD、production-input snapshot/dirty fingerprint、target version/platform、builder/tool version、实际package files hashes；仅记录allowlisted配置，不保存env/密钥/源码diff内容。
2. 确定薄launcher而非“prepackage子进程export”：npm生命周期彼此是独立进程。`package/make`脚本改为`build-with-provenance.mjs package|make`，launcher新建runId/fresh receipt path并捕获输入，再执行原media ensure+verify-ufbx，随后spawn本地Forge CLI，env显式传同一buildId/path；prepackage/premake alias保留但只做无副作用输入preflight，原有媒体gate无损移到launcher捕获之后。pipeline继续消费这些alias，转发原CLI argv、不用shell拼命令。直接Forge则在本进程第一个consuming hook内新建同契约record，后续hook复用；不读取任意last receipt、不靠npm export跨进程，不重复覆盖快照。`make --skip-package`另需对现package receipt复验，不以新launcher source记录追认旧package。fixture测试npm双入口/直接Forge/skip-package及旧alias、不重复capture。
   快照必须在media/ufbx verify/extension/Vite工作之前捕获；immutable输入含全部src文件类型、实际HTML/extension静态资源、package/lock、tsconfig/Vite/Forge、参与脚本、Inno includes、图标/许可证/媒体锁；Forge复制的resources须全量列入：包括`resources/ufbx/`内JS/WASM/许可、`scripts/ufbx-wasm-lock.json`、`resources/fonts/DejaVuSans.ttf`等，不能把运行资源一概当生成漂移。media ensure明确可生成的binary按下一项单独核锁；构建参与的untracked也算，不能只git ls-files。前后immutable源hash不变。
3. 明确生成物`.vite`、`dist/extension`、native rebuild `.node`及receipt只按声明阶段变化；media实际binary另记录并对已捕获locks核验，不把整个dirty worktree要求不变，也不任意放宽所有目录。最终payload hash在rebuild/签名/复制验证结束后记录；receipt为独立sidecar防自引用。postPackage绑定实际version/files，preMake复验，不允许skip-package绕过输入证据。
4. Inno/full/delta衍生物关联input receipt和自身binary hash；旧delta source沿用不可变baseline原格式/既有hash，不因没有新receipt废弃历史链。缺可信receipt的是**新target包**，旧baseline无需追认HEAD。receipt是构建关联，不是数字签名/防同用户篡改。
5. artifact manifest明确targetVersion/platform、full installer/full ZIP、retained delta from/to、bytes/hash/来源。binary/sidecar/SHA256SUMS全部由同集合派生；retained数量从现策略计算，不硬编码本版22/46。逐文件stream hash，ZIP含installer及hash一致性验证。
6. Red fresh tmp tiny artifacts：旧full/旧target delta/异平台/无关ZIP、当前package.json但旧通用SuperSetup.exe/旧package、receipt缺失/源码或hash不符/附件重复缺失、非法路径；正常generated漂移不误拒绝，untracked生产输入、ufbx/font/runtime资源漂移必须拒绝，历史source baseline仍可选。mock覆盖npm package、npm make、直接Forge、直接delta四入口，缺证据在创建/替换输出前拒绝。缺新target receipt必须BLOCKED/UNVERIFIED，不补当前HEAD追认旧包；不删除旧out或“整理”历史链。
7. 本阶段以mock package/generated-input fixtures和hook wiring测试验证，不实际Forge package/make，不晋升draft，不SSH。package/native成品验收另列NOT_RUN，未来获打包授权后才跑真实构建链，不能从mock推断成品已验。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/build-provenance.test.ts tests/unit/release-artifact-manifest.test.ts tests/unit/release-gate-manifest.test.ts
node scripts/release/artifact-manifest.mjs --target-version 2.3.16 --platform win32-x64 --dry-run
```

后一个命令遇到现历史out无新target receipt时，预期非零退出且记录BLOCKED/UNVERIFIED，这是故意验证拒绝旧包，不是green gate；正例由fresh fixtures证明。`UNVERIFIED`只是产物可信度，不新增门禁状态，也不把预期负例的退出码直接计为release失败。未获打包授权，不产生本版新receipt来绕过此负例。

**验收/回滚:** 通用collector不把历史265项混成本版；hash/checksum消费同manifest，缺receipt旧产物明确不可晋升。工具wiring独立回退，无用户库变更；回退不能视为旧包来源已可信。外部upload/resume/promotion接入仅是未来发布工作流的消费者契约，本计划不执行外部写入。

## A检查点：交付可审改动和真实证据，到此停止

1. 单一测试表逐项标red→green、实际source SHA、JSON日志、时间、平台能力、对应不变式；旧基线162重跑，新增tests单独记。全量历史失败仍明确，不能把focused green当整个发行链PASS。
2. `npm run typecheck`、`npm run lint`、`git diff --check`；审核diff没有schema49变化、durability降级、public API破坏、linked root删除范围扩大、依赖升级或版本提升。
3. 将以下UI用例合成一次fresh dev build（不打包），用隔离userData/fixtures、workers=1；真实UtilityProcess probe独立构建运行；native9场景独立编译运行。不得同测perf，不能关闭用户应用来腾资源。

```powershell
node scripts/run-e2e.mjs tests/e2e/filter-interaction.test.ts tests/e2e/asset-pagination.test.ts tests/e2e/preview-background-refresh.test.ts tests/e2e/task-status-polling.test.ts tests/e2e/ai-inspector-refresh.test.ts tests/e2e/import-conflict-flows.test.ts tests/e2e/critical-confirmation.test.ts tests/e2e/tray-watcher-recovery.test.ts tests/e2e/organization-search-trash.test.ts tests/e2e/metadata-version-semantics.test.ts tests/e2e/library-lifecycle.test.ts
node scripts/run-e2e.mjs tests/e2e/model-thumbnail.test.ts tests/e2e/model-viewer.test.ts
node scripts/release/run-gates.mjs --stage native-updater
```

第二条媒体能力不齐记BLOCKED/NOT_RUN，不伪PASS；与第一条分开是因为媒体能力/失败类别不同，各runner各fresh build，前后串行。若native interactive desktop不足同样BLOCKED；本体可审diff交付不等于release-ready。

4. 数据硬门槛：asset/revision/path/人工与AI分层、全query/选择/过滤、token单次/commit/恢复、foreign_keys/synchronous FULL/WAL或DELETE/lease fence、verified backup ladder不变；newer/stuck库现有能力策略不悄改。full-screen/background、缩放锚点、快捷键与自动更新原用户重开一次保留。
5. 交付本地可审diff、执行记录、功能矩阵、每切片rollback及未测能力。不自动commit/push/bump/安装/发布；用户确认A的实施不自动批准B/C/ECS。

## 2. B/C的条件路线（本次不实施）

- **B1/R14**：`src/main/app-logger.ts`、`plugin-package-ipc.ts`、`plugin-activation-coordinator.ts`，新log-tail-budget与diagnostics-policy测试。先证明读100MB只需2MB尾及默认debug零I/O，再做bounded fd tail；不顺手改全部async日志。保UTF-8/截断行/脱敏/退出flush。
- **B2/R12/R13**：`src/worker/library-service.ts`及拟建session-derived-cache；scoped SQL trace/EXPLAIN、有序ID差分、20k/100k同机样本；参数化WHERE，缓存owner/LRU只处理可重算probe，不删metadata/artifacts。不追加schema/index换速度。
- **B3/R15**：`viewport-window.ts`、`masonry-columns.tsx`、`justified-asset-rows.tsx`、`canvas-asset-layout.ts`及拟建height-index。≥30同fixture真实Electron样本、随机差分/同长度geometry失效、spacer/overscan/deep hydration/keyboard与框选rank，收益确实超噪声才前缀索引/二分。不驱逐summary、不改offset。
- **C1/R16**：schema/sql/跨层limits纯提取，49 migrations SQL/checksum byte-exact，兼容re-export；原计划中四个schema测试全部跑。
- **C2/R16**：一次只选一个已测owner/组合根切片，保持facade/typed ports/事件和事务顺序；不同时大拆App/Main/Service。每片独立diff/回归/rollback。

性能非退化建议同机p95≤baseline110%，baseline<5ms加绝对2ms噪声容差；先 correctness、再速度。PDF/3D/GPU/NAS不拿局部模拟替真实设备。没有新指标/用户确认则B/C延后，不以“已经开始”为由强行合入。精确后续文件/命令沿用原完整计划，但先重新核对当前源码和范围。

## 3. 用户确认与计划完成口径

只需在实施前确认“按本决定版执行阶段A（含legacy pending重新准备策略）”。当前用户已要求只规划，所以不等待这个确认来完成**计划**。如希望保留legacy自动安装，需另设计可信来源恢复，不采用补hash自证的折中。B/C另行确认；真实发行/ECS始终另行当次授权。

本次计划复核已做：完整读取指定文档；HEAD/version/dirty复查；1,317文件SHA验证无漂移；collector只读复验265/235；先收集10个相关E2E文件23项，最后检查点13文件`--list`注册29项（只是收集，不是通过）；14个PowerShell命令块语法解析成功。ISCC/csc文件存在，但interactive desktop未验证，native gate仍NOT_RUN。没有重跑上一轮162项，没有运行新的红绿测试、应用build/安装或native UI。

与原计划相比必须采纳的边界修正：metadata不按成功子集建模；rating同entityVersion仍需epoch；startup restore/rename区分；A9不能按deadline删Worker源；A8不把本地abort当物理渲染取消；A2真正IPC需要新compiled fixture；A1 receipt区分immutable输入与生成漂移。以上均是**计划要求**，不是本轮已经实施的修复。

阶段A实施完成与计划完成是不同状态；实际required门槛、未测能力、历史失败都应留在执行记录。ADR此时仍Proposed。

### 本次计划产物验收

| 用户要求 | 已提供的位置/口径 |
| --- | --- |
| 每步文件、复现、红绿、依赖、验收、回滚 | A0—A10任务与A检查点；Create与Modify明确区分，命令是未来步骤 |
| 静态缺口、最小竞争模型、性能候选分开 | 第0节证据分类；B/C须真实同机测量，局部模型不充现场证明 |
| 合并重复方案、防并发污染 | 第1节串行依赖；A4 useCallback、A7复用coalescer；fresh fixture/runId |
| 少量确认、缺能力不算通过 | 第3节只需未来实施范围及legacy策略确认；五态门禁、native/媒体真实能力 |
| 默认止于A，保功能/数据/云端范围 | A检查点硬不变式；第2节B/C条件路线；无安装/发布/ECS/真实图库操作 |

只读文件核验覆盖114条不同源/测试/脚本/文档/资源文件引用，其中82条现存、32条明确计划Create；五条文档链接均可解析。现存八份基线/dirty文档SHA全部保留，源码SHA无漂移。新增计划本身无trailing whitespace/冲突标记；`git diff --check`通过。该验收只证明计划产物一致性，不证明尚未实现的业务修复通过。
