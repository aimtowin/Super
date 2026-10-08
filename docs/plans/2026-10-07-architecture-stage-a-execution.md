# 阶段 A 执行记录：首批 A0 / A1a / A2

日期：2026-10-07，Asia/Shanghai。用户“开始”确认后，按决定版与 executing-plans 的三任务检查点执行。**本记录包含已实施代码；不是整个阶段 A 完成或可发布的声明。**

后续进展（2026-10-08）：A3/A8/A9 已实施，专项与串行回归通过；默认并行合并调用存在待排查的退出异常。见[第二批执行记录](2026-10-08-architecture-stage-a-batch-2-execution.md)。下文 NOT_RUN/下一批描述保留首批结束时点，不代表最新完成状态。

## 范围与基线

- 工作目录：`C:/Users/Administrator/Desktop/Super-main`，复用当前 checkout，没有新建 worktree。
- 版本仍为 `2.3.16`；HEAD 仍为 `67298c17d792070b09adc05d5a3af3cac722ff4f`。
- 开始时只有既有 dirty 文档；1,317 个原 inventory 文件的 SHA-256 匹配。原八份审查/交接/计划文档的 SHA-256 在本批结束时仍匹配；决定版文档也未改，SHA-256 为 `60ddc6307502aca2b81b4686c0de3a2eab9c4d0e20b7d78e754cc4e430b8b7a4`。
- Windows；Node `24.15.0` / ABI `137`；Electron `43.1.0`，其 Node `24.18.0` / ABI `148`。依赖原生库的测试统一使用现有 Electron Vitest runner，没有切换 ABI 重建。
- 未操作真实图库、用户日志、已安装软件、ECS、GitHub、AI 服务或插件下载；未升版本、修改 lockfile、commit、push、package、make、安装或发布。
- 主代理串行运行所有测试、构建和 native 检查；子代理仅在互不重叠的文件上实现或只读审查。

## A0：基线和隔离 — PASS

重跑原 verification.md 中的 16 文件：**162 通过，0 失败，0 跳过**。不是沿用上一轮计数。测试为纯/mock 或 fresh 临时库；真实 IPC 探针使用单独标记的临时 root 与 userData/sessionData/logs/crashDumps。

运行前检查没有占用本 checkout 的开发/构建进程，没有同名 native preview/ISCC/csc 进程；不终止用户应用。ISCC 和 csc 已存在，`[Environment]::UserInteractive` 为 true。没有运行可能下载/重建依赖的 `ensure-native.mjs`。

原始证据根：`C:/Users/Administrator/Desktop/Super-main/tmp/architecture-stage-a-64bd5af93ec64fea8e26088cae111fab/`。该根及下文新建 Guid 目录均为本批测试证据，不清空旧 out/make、旧测试记录或缓存。

## A1a：单一门禁清单 — 实施与专项验证 PASS

新增 `scripts/release/gate-manifest.mjs`、`run-gates.mjs` 与 `tests/unit/release-gate-manifest.test.ts`；接入 mainline、release pipeline、development runner、两个 npm E2E aliases 及 native verifier/capture。

实际行为：

- 普通与 isolated E2E 共用显式 36 文件默认清单：保留原清单，补 filter、preview、AI Inspector、task polling、import conflicts、tray，以及 emoji/metadata 版本专项；不 glob NAS/benchmark。原显式文件/路径与 Playwright CLI 透传保留。
- 四阶段：contract / development / native-updater / package；五态：PASS / FAIL / SKIP / NOT_RUN / BLOCKED。required 非 PASS 不能成功，非适用平台 SKIP 不冒充测试通过；后续 gate 未执行明确标记。`releaseReady` 始终 false。
- dry-run 不 spawn、不新建证据目录，不自动安装或下载。package 在此 runner 内始终仅列计划，即使非 dry-run 也不执行打包。既有显式 release package 入口保留，本批未调用。
- development 只运行一次 `run-e2e.mjs`、workers=1，记录逐测试 JSON；非零退出、伪零退出中的失败/flaky、缺证据/缺默认文件/全跳过均不能 PASS。
- development 子进程固定已校验的本地 Electron，删除继承的 dist、packaged-app、run-as-node overrides；不改变父环境或通用成品测试 CLI。
- Electron 能力检测只读 package/path.txt/dist，不调用会自动下载的 Electron loader；缺失、不安全路径或 symlink 都只阻断。
- native runner 从当前 package 版本编译两分支到 fresh Guid 目录，缺任一新 EXE 即失败；参数化 verifier/capture 的目录，保留旧 CLI 默认值但门禁不用旧默认 EXE。拒绝已运行或歧义的同名 preview。

Red：原真实默认清单漏专项、normal/isolated 清单分叉、native 脚本没有本次输出目录参数，4 项测试中 **1 通过 / 3 目标失败**。

Green：23 项新清单/状态/CLI/隔离/证据/native-chain 契约测试，加 4 项原 updater 静态测试，**27 通过 / 0 失败 / 0 跳过**。

兼容边界：单独 development gate 不自动 ensure/rebuild native；缺少兼容 addon 时须先修本地能力，不能靠本批暗中下载解决。旧 npm alias/pretest 和 pipeline 的既有 native 前置未删除。`.vite` 独占仍为运行前提，未新增跨进程锁；native 认领仍依赖无并行 preview 的前提，不是完整进程树认证。

## A2：导入过期清理故障隔离 — PASS

唯一业务源码改动在 `src/worker/library-service.ts:scheduleImportExpiry`：token 失效、timer 清除、durable `rolled_back/IMPORT_EXPIRED` 写入顺序不变；仅捕获最后的 `removeOperation` 故障，复用 best-effort `diagnose` 记录 `import.expiry.cleanup` 与 library/operation。

保持原 15 分钟 TTL、单次令牌、commit/resolve/close 的错误语义、安全路径断言、有限 Windows FS retry 与既有重开恢复。不新增重试 timer，不全局吞 `removeOperation` 异常；失败暂存留给恢复，不让清理错误杀死 Worker。

新增四项真实 Service 单元条件：EPERM、ENOTEMPTY、诊断回调自身 throw、真实不安全 staging junction。修复前 **5 通过 / 4 因目标异常失败**；修复后 **9 通过 / 0 失败**。确认后续查询可用、token 不复活、无额外清理循环、audit 状态、恢复清残留；unsafe link 的目标 sentinel 保持原内容。

新增 test-only builder、Main/UtilityProcess fixtures 与独立 E2E。builder 不写 `.vite`，manifest 绑定输入及全部 compiled entry/chunk 字节；每次 fresh build，源码/字节漂移拒绝旧 bundle。只解析本 repo 已存在 Electron dist，不接受安装软件 override，不调用 loader。

真实 IPC red：arm ACK 后在请求 catch 之外推进真实 TTL callback，旧代码因目标 EPERM 使 UtilityProcess **exit 1**。green：收到对应 diagnostic，**同 child / 同 PID / forkCount=1** 继续 ping/真实 list，token 为 IMPORT_NOT_FOUND；audit 为 rolled_back / IMPORT_EXPIRED，已有资产数仍 1、原文件内容不变；还原 fault 后重开仅清理目标暂存。没有 respawn 或全局 uncaughtException 吞错。

最终 probe green 故意设置两个不存在的安装软件/dist overrides 仍通过。**证明范围是“真实 LibraryService TTL 在 fixture UtilityProcess 的故障隔离”，不是生产 composition-root 全链路 E2E。**

业务源码 SHA-256：

- red：`5b783c361ce01b1bcb2a0fb31208918dd2f588a1cc6b94986ba3e0e9d84e520f`。
- green：`50794abe90c66d32198babaa648d4ea75bdba548bd2364a8e88256fa1354923d`。

## 实际验证与证据

以下测试有重叠，**不能把计数相加当作独立通过总数**。

| 验证 | 结果 | 本地证据 |
| --- | --- | --- |
| 16 文件实施前基线 | 162 PASS / 0 FAIL / 0 SKIP | 主证据根 `baseline.json` |
| A1a 目标 red | 1 PASS / 3 FAIL | `a1a-red.json` |
| A1a 最终 + updater static | 27 PASS / 0 FAIL / 0 SKIP | `a1a-final-green.json` |
| A2 校正夹具后的 unit red | 5 PASS / 4 FAIL | `a2-unit-red-verified.json` |
| A2 unit green | 9 PASS / 0 FAIL / 0 SKIP | `a2-unit-green.json` |
| A2 真实 UtilityProcess red | 1 FAIL，EPERM exit 1 | `a2-ipc-red-verified.json` 与同名输出目录 trace/附件 |
| A2 最终隔离 IPC green | 1 PASS / 0 FAIL | `a2-ipc-lint-clean-green.json` 与同名输出目录附件 |
| TTL / confirmation / source stability / DB recovery / Windows FS retry | 5 文件，58 PASS / 0 FAIL / 0 SKIP | `a2-related-green.json` |
| 原 16 文件实施后回归 | 166 PASS / 0 FAIL / 0 SKIP | `baseline-post-change.json`；增加 4 项 A2 测试 |
| native 两分支 fresh 编译 + 9 场景 | PASS，自动打开/关闭、键盘、进度、失败重试、原用户 probe launch、缺 EXE 反馈 | native 根及 `gate-results.json`，见下文 |
| development/native/package dry-run | 无执行；显式确认桌面后均 NOT_RUN，releaseReady=false | CLI 输出；无证据目录写入由 mock 契约测试验证 |
| `npm run typecheck` | PASS，含 extension tsconfig | 本次退出 0 |
| `npm run lint` | PASS | 本次退出 0；仅已有大文件 Babel 提示 |
| `git diff --check` / 新 mjs `node --check` | PASS | 本次退出 0；Git CRLF 提示不算业务失败 |

Probe red manifest：`tmp/architecture-stage-a-5772db56-00b5-4a84-8581-457d6aa40e4a/import-expiry-probe/manifest.json`。

Probe 最终 green manifest：`tmp/architecture-stage-a-bfff3474-62ab-4f26-a285-fe26c3a638d8/import-expiry-probe/manifest.json`；输入 fingerprint 为 `63f3a41b9b5e8dd41cf0558262e7aade87b9d6c590230ad71e29f0a88dfa87f8`。旧 red 与最终 green 的夹具安全校验/断言有所加强，业务 red 的失效位置保持明确；没有把旧 compiled bundle当最终 green。

Native 根：`tmp/architecture-stage-a-cd425eee-1bfe-4102-b586-a0f034919d89/native/`，同级 `gate-results.json`；包含两份新 EXE、9 场景 log、progress/completed/launch-failed PNG 与 Guid 子目录实际编译的 `Super.exe` probe（源码来自 test fixture `Super.cs`，不是在该目录中运行 C# 源文件）。Inno `7.1.0`，本次编译版本参数为 `2.3.16`；未运行真实 Super installer。

本机未提供 SESSIONNAME 时，保守桌面能力检测为 BLOCKED；这不等于桌面实际不可用。先读 `[Environment]::UserInteractive` 并确认无并行 preview，再只在本次子命令设置 `SUPER_GATE_INTERACTIVE_DESKTOP=1`，运行后还原。

实现过程出现的非业务失败也保留：首次 unsafe-link 测试 finally 错用 rm junction、首次 Playwright 参数不是解构、首次 lint 的空解构/unsafe-finally。均已修夹具并重新构建/测试；**这些输出不计目标 red 或最终验收**。最终安全 cleanup 仅删除已标记且位于本机 tmp 的 fresh fixture root，不删 junction 指向的 sentinel。

复验命令：

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/release-gate-manifest.test.ts tests/unit/update-native-ui.test.ts
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/pending-import-lifecycle.test.ts tests/worker/import-confirmation.test.ts tests/worker/import-source-stability.test.ts tests/worker/database-recovery.test.ts tests/unit/windows-fs-retry.test.ts
node scripts/build-import-expiry-probe.mjs --print-manifest
# 将本次输出设为 SUPER_E2E_IMPORT_EXPIRY_PROBE_MANIFEST，按决定版 finally 还原环境后运行单文件 Playwright。
node scripts/release/run-gates.mjs --stage development,native-updater,package --dry-run
# 只有完成能力/进程检查后，才显式确认桌面并运行 --stage native-updater。
npm run typecheck
npm run lint
git diff --check
```

## 未执行、检查点与回滚

- **NOT_RUN**：默认 36 文件真实 development E2E、full unit/Worker suite、完整 mainline/extension/search-perf gates、生产 App dev build、媒体/GPU/NAS/性能测量、真实安装升级、package/发行验收。专项 green 不提升为整个发行链通过。
- 旧 lavfi 造数失败与历史验证问题未重跑、未修、未改为 skip，也不冒充本批新失败或已修。
- **NOT_RUN**：A3、A8、A9、A10、A4、A5、A6、A7、A1b 及整个 A 检查点；B/C 不在本批范围。下一批按决定版顺序 A3 → A8 → A9，待首批审阅后继续。
- 业务 diff 只有 TTL callback 的 10 行新增 / 1 行替换；未动 schema49、durability、public protocol 或 linked-root 删除范围。23 项门禁新契约与 4 项 TTL 回归测试均有独立证据。
- 回滚 A1a 时只撤回本批清单/runner/wiring/目录参数切片；回滚 A2 时只撤回 TTL catch 与其测试夹具切片。两者无数据库迁移，不能覆盖既有 dirty 文档；撤回故障隔离即重新暴露原 Worker 退出风险。
- 已完成独立只读复核，修正了 Electron loader 隐式下载、安装软件环境 override 与 sentinel 证明缺口。本批结束于三任务检查点，没有自动进入下一批、打包或发布。
