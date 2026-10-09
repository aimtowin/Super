# 阶段 A 持续实施与验收台账

本台账承接 2026-10-07 第一批和 2026-10-08 第二批执行记录，不覆盖历史证据。
范围仍为决定版 A0 → A1a → A2 → A3 → A8 → A9 → A10 → A4 → A5 → A6 → A7 → A1b → A 检查点。用户要求持续推进；批次汇报不是整个目标完成。B/C、打包、发布、安装、Git 推送和 ECS 不在本次范围。

本次证据目录：`tmp/architecture-stage-a-2b883839b1de4b84a0480bc7ee4a2c25/`。测试、构建和 native 门禁由根代理串行运行；子代理只读审查或在明确单写者文件范围编辑。

后续授权变更：用户于本轮明确要求快速收尾并打包发布 ECS/GitHub，故阶段 A 验收后增加 2.3.17 发行流程。下文原“NOT_RUN / 不在本次范围”保持历史时点，不解释为已发布；实际新发行证据登记于 `docs/releases/v2.3.17-validation.md`。B/C、ECS 迁移和账号服务仍未获授权。

## 完成审计

| 项目 | 实施状态 | 验证状态与剩余工作 |
| --- | --- | --- |
| A0 / A1a | 已完成 | 最终默认并行 71 文件 1152 PASS / 1 Windows 不适用 SKIP、exit 0；严格静态门禁通过；来源清点1490文件逐项hash通过 |
| A2 | 已完成 | 新 GUID c48189bd... 版本17 fresh编译真实Service / UtilityProcess探针，1 PASS、exit 0；当前source/compiled hash现场复验 |
| A3 | 已完成 | 下载预算、暂停/取消链和相关回归纳入最终联合验收；小 fixture 内存样本不等于真实 256 MiB RSS 上限 |
| A8 | 已完成 | RPC settle-once / 真正被 Worker 调用的 orchestrator 与 fresh 媒体已验证；不承诺撤销已派发 GPU/共享 FBX 工作 |
| A9 | 已完成 | staging / Worker actual terminal 纳入最终联合验收，期限到达不删活跃 Worker 源；生产扩展全链路未测 |
| A10 | 已完成 | 首次目标红测 23 PASS / 13 FAIL；首版 54 PASS / 1 ESM spy 夹具 FAIL；修夹具后 launcher 专项 27 PASS / 2 真实 FAIL；最终六文件 60 PASS，exit 0；版本17 fresh native 九场景 PASS，未实际安装 |
| A4 | 已完成 | 原真实红测修复后34 PASS；最终fresh UI 21项与实际成品筛选通过，旧finally只清自己的占位 |
| A5 | 已完成 | 草稿、历史恢复、人工/AI来源、完整多选、原始4/3预算、Panel及实际hooks十一文件83 PASS；最终联合/真实UI通过 |
| A6 | 已完成 | 非App179 PASS、联合A7六文件100 PASS；独立domain/notification接线及真实UI验收通过，领域事件不因静音消失 |
| A7 | 已完成 | 保留导航与local1500真实red；最小修复后100 PASS；fresh UI覆盖AI单项/批量、延迟计数及四种全屏scope，21 PASS/exit 0 |
| A1b | 三片及实际发行已完成 | 最终七文件166 PASS/exit 0；实际package、Forge/Inno、full ZIP、20delta、canonical checksum及成品4E2E通过；GitHub46附件digest、ECS22binary完整远端SHA与公开feed/完整delta通过 |
| A 检查点 | 已完成限定实施验收及新增发行 | typecheck/lint/diff/extension、71文件联合、21UI、8媒体、9native、1fresh A2 IPC、结构图/矩阵/回滚与1490文件全源清点已验；2.3.17正式GitHub/ECS已发布，不宣称历史全量mainline绿或真实安装PASS |

不得把“代码已写”“focused assertions 全绿”或“单次诊断运行退出成功”替换为全部清单完成或 release-ready。

## 默认并行运行退出问题

前批两个 18 文件默认并行组合均为 294 个断言通过但实际进程 exit 1，Windows 原生退出提示包含 `PostQueuedCompletionStatus: (6)`。显式串行的 green 不能抹掉该 FAIL。

本次缩小范围：

- `runtime-unit-isolation.json`：16 单元文件，230 PASS，实际 exit 0。
- `runtime-worker-isolation.json`：2 Worker 文件，64 PASS，实际 exit 0。
- `runtime-combined-trace.json`：同一 18 文件，294 PASS，实际 exit 0；仅在 owned tmp 中添加 fork/exit/PID 诊断加载器并附默认 reporter。未修改生产退出/超时/并发配置。
- 后续未插桩及 JSON-only trace 各实际 exit 1；此时 A6 已在原 WorkerClient 测试文件新增一个真实红测，报告为 294 PASS / 1 FAIL（295 项），不能叫作“同断言全绿重现”。未插桩还出现同一原生错误文本；trace 的 coordinator code=1 有业务失败解释，不能据此确认原生退出根因。待 A6 修复且所有相关文件冻结后重新核对。

A6 修复后 `runtime-after-a6-green.json` 与 `runtime-drained-fixture.json` / `runtime-owned-fixtures.json` 仍是 295 PASS / 0 FAIL，但实际 exit 1 且原生错误重现：仅 await Service closeAllAsync（含 create/reopen/recovered 所有 owned Service）不足以证明 fs.watch 原生 observer 已完成 close。没有因此修改生产 shutdown、全局并发、测试超时、依赖或 runner 退出码。

将 extension-save 的测试私有 observer 改为与生产相同的真实 `fs.watch(..., {recursive:true})`，仅在创建时登记一次 `close` acknowledgement，teardown 先关闭所有 owned Service 再 await 每个实际 observer close event。不是 no-op observer、sleep 或抑制 stderr。`runtime-native-close-ack.json` 和 `runtime-native-close-ack-repeat.json` 连续两次同一 18 文件、默认并行、JSON-only reporter 均 295 PASS / 0 FAIL / 0 SKIP，实际 exit 0。证据支持完善测试 fixture drain；不能扩大为已证明或修复 Electron/libuv 原生 IOCP 缺陷。此前所有 FAIL 均保留，最终冻结后仍需正常共同门禁。

带诊断加载器/reporters 的成功会影响时序，不能单独证明缺口已修复；后续两次未插桩默认并行 JSON-only 的 close-ACK green 才是当前直接证据。最终共同重跑仍须保留真实退出状态。不跳过失败、不放宽 timeout、不改全局为串行来制造 green。

## 兼容与安全边界

- 发行版本为 2.3.17；仅根版本提升，无依赖升级、schema49 迁移或 durability 降级。
- A4 不改 100/500 分页边界、trash、深页/布局 fallback、观察器 loading rearm；locale-aware callback 保留。
- A5 统计原始 metadata API Promise，而非取消后的逻辑 consumer；多选必须全部 ID，不用成功子集或可见 summaries 代替。
- A10 receipt 只由可信下载/解包生成，legacy 需重新准备；最终 guard 不等于数字签名，也不消除同用户恶意程序的最后 exec 竞争。
- 所有 fixture/userData/探针输出独立拥有；不操作用户图库、已安装软件、旧 out/baseline 或历史日志。

阶段 A 原清单及限定共同验收已完成；新增2.3.17发行任务于2026-10-09完成，实际产物与远程状态以本版验证记录为准。未执行的历史全量门禁、真实安装和性能测量不计为通过。

## 本批新增真实证据

### 发行收尾：2026-10-08

- 版本提升至 2.3.17；package-lock 仅两处根版本修改，依赖和数据库结构不变。
- `a1b-artifact-first-green.json`：164 PASS，exit 0；随后末端真实源码漂移追加测试 1 PASS / 1 FAIL，exit 1。凭证写前追加纯输入复验后 `a1b-final-green.json` 七文件 166 PASS / 0 FAIL / 0 SKIP，exit 0。
- 冻结后去重的 71 文件联合回归：`checkpoint-contract-final.json` 1152 PASS / 0 FAIL / 1 SKIP（Windows 不适用的 POSIX 权限场景），实际 exit 0；保持默认并行，没有改全局超时或 runner 退出码。
- fresh UI：首轮 16 PASS / 5 FAIL，重跑 20 PASS / 1 FAIL，最终原十一文件 `checkpoint-ui-final.playwright.json` 21 PASS / 0 FAIL / 0 SKIP，exit 0。修复的是测试首次引导及异步导入等待，原功能断言保留。
- fresh 媒体：首轮 1 FAIL / 7 NOT_RUN；完整重跑 7 PASS / 1 FAIL。HDRI 选择器按实际 document portal 定位后 `checkpoint-media-final.playwright.json` 8 PASS / 0 FAIL / 0 SKIP，exit 0；生产媒体逻辑未为测试调整。
- 2.3.17 严格 typecheck、全仓 lint、diff-check 和 extension:verify 均 exit 0。现有 Babel 大文件与 Vite 分块警告未隐藏。
- 最终 Service UtilityProcess probe 从新 GUID `c48189bd-9349-4c29-b1b3-07179be1eda1` fresh 编译；`checkpoint-import-probe-final.playwright.json` 1 PASS，exit 0，覆盖 TTL 清理失败后同 PID、token 失效与隔离恢复。
- 真实安装器、成品回归及远程发布由本版验证记录继续登记，不将这些源码门禁写为成品已发布。

| 命令范围 | 实际结果 | 证据 |
| --- | --- | --- |
| A10 原 Store/Service/integrity/native 静态/retention 五文件 | 54 PASS / 1 FAIL，exit 1；唯一 ESM namespace spy 夹具失败 | `a10-green.json` |
| 修正夹具 + 实际 Main launcher red（精确旧函数 body） | 27 PASS / 2 FAIL，exit 1；提前 resolve/unref、异步 error 未接收 | `a10-launcher-red.json` |
| A10 六文件最终 | 60 PASS / 0 FAIL / 0 SKIP，exit 0；含真实文件 link/replace/stream tamper、安全重准备、合法 launch 与失败链 | `a10-green-final.json` |
| A6 watcher/protocol/WorkerClient 三文件 red | 139 PASS / 8 FAIL / 0 SKIP，exit 1；5 Service、2 strict parser、1真实 WorkerClient 消息入口 | `a6-red.json` |
| A1b 新 receipt 合同 TDD | 新合同未实现的预期 red；不是旧 collector 的业务复现 | `a1b-contract-red.json` |
| 原审查十六文件基线当前重跑 | 182 PASS / 0 FAIL / 0 SKIP，实际 exit 0；数量随本轮真实新契约变化，不硬编码旧 162 | `baseline-16-current.json` |
| A2 五文件导入/恢复/Windows retry | 58 PASS / 0 FAIL / 0 SKIP，实际 exit 0；真实 UtilityProcess 另列，不能由本组代替 | `a2-regression-current.json` |
| 九文件库兼容/迁移/恢复/生命周期 | 210 PASS / 0 FAIL / 1 SKIP，实际 exit 0；POSIX 不可写目录测试在 Windows 不适用，未计 PASS | `data-compatibility-current.json` |
| A5 复核十文件 | 75 PASS / 0 FAIL / 0 SKIP，实际 exit 0；四项新业务 red 已确认并修复 | `a5-reviewed-green.json` |
| A5 AI 来源与实际保存路由追加审查 | 2 PASS / 2 FAIL，实际 exit 1；保留人工 draft 却错误设置 AI flag 会误清 AI 描述，待最小修复 | `a5-provenance-red.json` |
| A1b 第二片第一次 green 尝试 | 82 PASS / 1 FAIL，实际 exit 1；唯一 make 未知参数的目录解析待核真实 Commander 合同；不计全片通过 | `a1b-wiring-green.json` |
| A5 来源修复 + 十文件交叉回归 | 82 PASS / 0 FAIL / 0 SKIP，实际 exit 0；人工草稿不会误走采用/清空 AI 保存路由，真正 AI 编辑仍保留原路由 | `a5-provenance-reviewed-green.json` |
| A6/A7 实际 App loadContent + helper/coalescer/policy/分页首轮 | 66 PASS / 0 FAIL / 0 SKIP，实际 exit 0；实际 Electron 门禁仍待 fresh build | `a6-a7-app-first-green.json` |
| A1b 生成前漂移追加 red | 84 PASS / 1 FAIL，实际 exit 1；上游 plugin 改源码后 ensure/ufbx 已被调用，原红断言保留 | `a1b-early-producer-red.json` |
| A1b 生成前只读 guard / 完整 media gate / npm+Forge | 93 PASS / 0 FAIL / 0 SKIP，实际 exit 0；独立 immutable-only guard 允许 clean 缺 media，完整消费仍要求全部 hash-pinned media | `a1b-wiring-reviewed-green.json` |
| A7 导航与同会话 effect 生命周期追加 red | 0 PASS / 10 FAIL，实际 exit 1；八项真实旧首屏/补全覆盖新查询，两项 summary/locale 重建 coalescer 租约 | `a7-navigation-lease-red.json` |
| A1b Darwin payload 相对框架软链接合同 red | 10 PASS / 4 FAIL，实际 exit 1；真实 Windows relative symlink fixture 能力存在，合法 Darwin framework aliases 被新 receipt 误拒 | `a1b-mac-links-red.json` |
| A5 单选 AI 来源标记到多选人工 aggregate 的实际 Panel red | 3 PASS / 1 FAIL，实际 exit 1；批量保存路由不受影响，但 AI 徽章/样式错误残留 | `a5-multi-provenance-red.json` |
| A5 controlled selection / commit 阶段 baseline + 来源完整复核 | 83 PASS / 0 FAIL / 0 SKIP，实际 exit 0；不关闭 React purity 规则 | `a5-layout-reviewed-green.json` |
| A1b 前两片与 A10/A4 交叉复核 | 178 PASS / 0 FAIL / 0 SKIP，实际 exit 0；覆盖范围不同，不相加作为全套数 | `provenance-a10-a4-reviewed-green.json` |
| A1b sidecar 顺序真实 red | 0 PASS / 2 FAIL，实际 exit 1；junction 越界 mkdir 与 payload fs.open 时 source 漂移 | `a1b-sidecar-red.json` |
| A1b sidecar / 原 provenance / launcher / Mac 合同完整 green | 109 PASS / 0 FAIL / 0 SKIP，实际 exit 0 | `a1b-provenance-safe-green.json` |
| A7 导航/会话最终租约复核 | 79 PASS / 0 FAIL / 0 SKIP，实际 exit 0 | `a7-navigation-lease-green.json` |
| A7 local1500 第一轮夹具错误 | 0 PASS / 6 FAIL / 28 按 -t 过滤；其中五个缺 Math builtin 的 fixture 错误，不计业务 red | `a7-local-removal-red.json` |
| A7 local1500 纠正夹具后的目标 red | 2 PASS / 4 FAIL / 28 按 -t 过滤，实际 exit 1；重复原始查询、void request、旧 owner timer 与 replacement canvas 回写 | `a7-local-removal-corrected-red.json` |
| A7 local 最小修复与六文件联合 | 100 PASS / 0 FAIL / 0 SKIP，实际 exit 0；保留 1500ms、silent、scroll，但 scroll 等完整共享 lease 结束 | `a7-local-final-green.json` |
| A1b 第三片第一次 red | 0 PASS / 55 FAIL，实际 exit 1；8 源码缺入口/输出/collector/postMake 静态缺口、47 新 export/manifest/producer 合同 TDD；不称 55 个旧 runtime bug | `a1b-artifact-contract-red.json` |

### 共同静态门禁首轮

`npm run typecheck` 实际 exit 1：本轮测试 bridge 的过窄对象类型、可空 CLI 回传、logger mock / AsyncIterator / ChildProcess fixture 形状不准确。未放宽 strict 或生产 API，正在按真实端口修夹具。`npm run lint` 实际 exit 1：本轮 Inspector baseline / 编辑 ref 在 render 中读写、A4 fixture 的 render 外赋值，以及 A10 Main 遗留 import/无用赋值等。Inspector 将改为受控 selection + 按 owner/selection 稳定的局部 baseline、commit 阶段 ref 同步，不关闭 React purity 规则。最终状态必须由修后原命令重新验证，首轮 FAIL 不删除。

### Native updater 能力与验收

默认 capability 检查因环境缺 SESSIONNAME 返回 BLOCKED，原报告保留于 `tmp/architecture-stage-a-72a233d0-f1ec-4267-99ca-0a570c322ac6/gate-results.json`。随后只读 Win32 检查确认 UserInteractive=true、当前 session=21、OpenInputDesktop 成功且 GetDesktopWindow 非零；关闭本次打开的 desktop handle 后，仅本次命令设置/恢复 `SUPER_GATE_INTERACTIVE_DESKTOP=1`。

从当前源码 fresh 编译 preview 和 production compile-only 两分支，fixture 自身再编译 isolated Super.exe；九个 native 场景全部 PASS，runner 实际 exit 0，报告：`tmp/architecture-stage-a-5295dce2-4cf2-4867-a7e1-1c6d38f497a1/gate-results.json`。人工查看本次 completed.png：100% / 更新已完成 / 正在打开 / 软件打开后窗口自动关闭均正常。测试只启动 owned probe，不运行已安装应用的安装器、不关闭正在运行的 E:/Super 软件。

A10 最终 installer guard 覆盖启动延期、立即安装及 downloadAndInstall；Windows launcher 等待真实 spawn 确认、异步 error 拒绝且不 unref/不 quit，保原静默参数与 macOS openPath。坏 cache 不写完成标记；已安装同版本的残留 pending 不再次启动。Store → Service → Main 薄 helper 用真实文件/精确旧入口红测与 helper/接线断言验证，不称整个生产 Main 已做 E2E。
