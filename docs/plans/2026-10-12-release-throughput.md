# Release Throughput Implementation Plan

> 本文是本地发布工具优化的历史实施计划，保留实际实施与验证结果；不是对当前会话的新任务指令，也不要求安装不可用的外部技能。

**Goal:** 在保留发布安全校验与历史增量覆盖的前提下，优化已实测的文件哈希瓶颈，并纠正把 Codex 额度暂停误计为编译耗时的判断。

**Architecture:** 使用有界、保序、失败后停止派发且等待在途任务收尾的文件读取调度器。每次验证仍重新读取全部字节，保留路径、文件身份、读取前后属性及 macOS 链接复核；不引入跨阶段缓存。提供只读诊断入口，区分目录枚举、哈希与链接检查的实际运行耗时。

**Tech Stack:** Node.js 24、ES modules、Vitest、SHA-256、现有构建来源凭据。

**记录边界（2026-10-13 文档核对）：** 本文保存本地实施与验证历史；本次仅同步 Markdown，优化源码和诊断 CLI 仍未提交，不随文档推送交付。后文“未推送”“当前工作区”指对应性能实施／试构建时点，不是公开 main 已包含这些代码的承诺。

---

## Scope and evidence

- 上轮 17:05–18:55 的空档由用户确认是 Codex 额度暂停，不属于编译、上传执行或软件性能问题。
- 2.3.21 的日志显示：打包约 39 秒，make 约 97 秒，Inno 阶段约 190 秒，20 来源增量阶段约 1,538 秒；其中 20 次增量 Inno 编译合计仅约 54 秒。日志文件时间跨度是阶段证据，不是细分函数耗时。
- 未修改源文件前，在完整 2.3.21 凭据上只读运行两轮：不可变输入检查 0.780 / 0.695 秒，固定媒体检查 0.071 / 0.059 秒，程序载荷检查 11.654 / 10.896 秒，完整程序凭据检查 11.674 / 11.775 秒。
- 增量生产者及其来源绑定、父进程验证多次调用完整程序验证；优化每次验证的安全文件读取吞吐，而不是跳过验证。
- 本轮不重新发布，不变更版本，不推送 Git，不连接或修改 ECS，不运行或覆盖用户安装版及资源库。
- writing-plans 引用的 `superpowers:*` 技能未安装；遵从用户已明确的实施要求，在现有干净工作区顺序执行，不启动代理或自动提交。

### Task 1: Diagnose and select bounded concurrency

**Files:** Read `scripts/release/build-provenance.mjs`, `scripts/release/build-inno-delta.mjs`, `scripts/release/build-retained-deltas.mjs`, `scripts/release/artifact-manifest.mjs`; read the frozen 2.3.21 receipt and package without rewriting either.

1. 对完整程序验证计时并确认旧凭据有效。
2. 在内存中导入字节不变的旧模块，仅导出其私有读取函数用于诊断；比较 1 / 4 / 8 路读取，并逐次对照原始完整载荷指纹。
3. 选择保守并发上限；不并行运行完整 GUI，不并行多份编译器以掩盖单次验证瓶颈。

**Verification:** 每个样本包含文件数、真实计时与指纹一致结果；不以停止运行、日志墙钟跨度或额度暂停计算速度提升。

### Task 2: Implement failure-safe bounded file hashing (TDD)

**Files:** Create `scripts/release/bounded-map.mjs`, `scripts/release/bounded-map.d.mts`, `tests/unit/release-bounded-map.test.ts`; modify `scripts/release/build-provenance.mjs`.

1. 写并发上限、结果保序、空输入、非法并发数、失败停止派发、在途任务收尾测试。
2. 运行 `npx vitest run tests/unit/release-bounded-map.test.ts`，先确认缺少实现时失败。
3. 使用共享游标、固定数量 worker、失败标记实现有界映射；所有在途任务完成后再抛首个错误。
4. 仅替换源文件与程序普通文件的串行哈希循环。保留原有 `digestFile` 及链接复核，不使用时间戳缓存、不改凭据格式。

**Verification:** 上述新测试通过；原有输入漂移、载荷漂移、链接逃逸与派生物来源测试仍拒绝不安全输入。

### Task 3: Add honest read-only timing and verify equivalence

**Files:** Modify `scripts/release/build-provenance.mjs` and `.d.mts`; create `scripts/release/profile-package.mjs` and `tests/unit/release-package-profile.test.ts`; update this plan with actual measurements.

1. 提供只读载荷检查 API，返回文件列表与分阶段耗时；明确它不是构建来源凭据，不写入 sidecar 或基线。
2. CLI 接受仓库内程序目录与受限并发数，输出 JSON 计时及 SHA-256 指纹，不导入运行版、不联网。
3. 在同一真实载荷上交替比较旧模块与新模块，核对完整文件列表及指纹一致。
4. 在单元测试中验证 1 / 4 / 8 路结果一致、相同长度内容改动仍被识别、增加/删除文件被识别、Windows 链接与目录逃逸被拒绝。
5. 运行相关发布单元测试、类型检查与相关脚本 lint；只记录实际执行结果。

**Verification:** 真实载荷指纹与原版完全一致；原版 2.3.21 凭据不被修改。生产脚本改动后该旧凭据应拒绝新的源码状态，不应为了复测而更新旧发行证明。

## Acceptance and remaining work

- 单次读取吞吐改善必须以真实样本证明；不能把它宣称成整个发布阶段相同比例提速。
- 不删减 20 来源增量、全量测试或成品回归；不新增未经验证的“快速发布”跳过开关。
- 保留需要的新版本实际发布验证作为后续工作，不在本轮伪造新的已发布状态。

## Execution result

- Task 1 completed：原凭据改动前的完整只读验证通过；1 / 4 / 8 路试验文件列表和载荷指纹全部一致，选择保守默认 4 路。
- Task 2 completed：有界映射接入不可变输入和程序普通文件哈希，失败停止派发并等待在途读取收尾，保留原有所有安全检查。没有跨阶段缓存。
- Task 3 completed：只读载荷计时 API 与 CLI 可用；增量生产者／父验证计时日志已加入。实际旧新版载荷检查中位数为 11.567 → 4.204 秒，约缩短 64%，不冒充整个发布流程同比提速。
- Final tests：`npx vitest run tests/unit/build-provenance tests/unit/release --maxWorkers=2`，10 个文件、221 项通过，零失败、零跳过（11.94 秒）。
- Final typecheck：`npm run typecheck` 退出码 0，包含主项目与扩展项目。
- Final lint：修改的发布脚本、声明及三个测试文件 lint 退出码 0。
- Documentation verification：169 份 Markdown、988 条本地引用，零损坏链接；文档审查工具 5 项测试通过。`git diff --check` 无空白错误。
- 未重新打包／发布、未提交或推送 Git、未连接 ECS。旧 2.3.21 发行凭据及载荷不变；旧凭据正确拒绝当前已变化的生产脚本，不生成虚假的新证明。
- 完整证据、命令和统计边界见[耗时复核与优化结果](../reference/release-throughput-2026-10-12.md)。

## Local build validation follow-up

用户在短暂确认发布后明确变更为「只需要做本地验证，不要发布」。以最新指示为准：本轮不提交／推送 Git，不访问 GitHub 发布 API，不连接 ECS，不更改应用版本。

1. 使用当前 HEAD 的独立 detached 本地 worktree，复制当前未提交的发布工具修改，以及本机现有依赖和固定媒体；不把 `out/`、旧证明或用户资源库复制成新证据。
2. 在该独立目录运行发布工具专项测试、类型检查和 lint，随后用真实构建来源流程生成全新程序、安装器和完整 ZIP。
3. 在独立目录实际生成 20 个保留来源的增量包，记录每个来源的生产者与父验证耗时。使用现有基线只读生成，不覆盖主仓库中的任何正式基线。
4. 执行本地制品清单／校验和验证及成品启动、导入、搜索、导航、侧栏和预览专项回归；使用临时 profile 和测试库，不改用户安装版。
5. 核对主仓库原始发行产物、证明和基线未变；报告真实阶段耗时及验证边界。此次是工具与本地构建验证，不冒充新版本发行，不将未执行的全量 GUI 门禁标为通过。

### Local validation result

- 已完成全部本地验证步骤；隔离目录 `tmp/local-build-validation-20261012/` 保留供检查，未清理或操作用户数据。
- 成功运行 2026-10-12 19:58:32–20:15:10（Asia/Shanghai），约 16 分 38 秒；第一次准备失败及目录／依赖准备不计入成功运行耗时。
- 构建 ID `c24f46c0-ce3b-4385-9160-a50882a2a25d`；当前 859 个生产输入与主工作区逐字节一致，程序载荷仍与原正式 2.3.21 完全一致。
- 实际 package 24.062 秒、make 50.470 秒、Inno 135.436 秒、20 来源增量 554.415 秒、校验和 37.231 秒。增量阶段从原观测 1,537.89 秒缩短约 64%，编译器本身时间基本不变。
- 221 项工具／来源链测试通过，主项目和扩展类型检查、全量 lint、成品门禁与 22 件派生物验证通过。10 项选定成品回归通过，零失败、零跳过、零 flaky。
- 原正式发行的 315 个证据文件及程序载荷前后摘要一致。主仓库无新提交或推送，没有 GitHub 或 ECS 操作，版本未变。
- 第一次准备失败因隔离目录缺少本地生成的自动化声明；补齐实际声明后重跑，保留失败日志，未改或绕过门禁。
- 完整数据、产物 SHA、失败与未执行门禁范围见[后续实际本地验证](../reference/release-throughput-2026-10-12.md#follow-up-实际本地构建验证)。这次不冒充正式发行验收。
