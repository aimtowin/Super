# 架构决策提案

日期：2026-10-07；基线 Super v2.3.16。**全部 Proposed，等待计划模式审阅与用户确认；不是已经实施或已经批准的设计。**

## ADR-A01：保留本地优先多进程模块化单体

**Context**：已有 Renderer/Preload/Main/Library UtilityProcess、受管脚本插件运行时及完整历史库恢复。用户体验良好，现有测量不支持替换数据库/状态库或多 writer。

**Decision（提案）**：保留进程拓扑、LibraryService façade、公共协议/插件 API 与 schema 49；通过领域切片提取纯逻辑和生命周期 owner。Main index 最终仅做 wiring，但不一次性搬空。

**Consequences**：可渐进回滚，行为对照和现有测试可复用；短期仍有大 façade 文件，迁移接口和兼容 re-export 有维护成本。

**Alternatives**：全量重写/多 Worker writer 会扩大租约、恢复、事务一致性和跨版本兼容风险；仅加 cache 或调高并发不解决 ownership；服务化/云端库不符合本轮范围。

**Gate**：逐字校验 migrations SQL/checksum；静态层间边界测试；每切片独立功能/生命周期回归。任何需要 schema/API 变更的切片转为单独计划。

## ADR-A02：请求生命周期与库会话同寿命

**Context**：分页旧 finally 可清新请求占位，多选读取无界且迟到响应回写共享 cache；render RPC abort listeners 未统一清理。

**Decision（提案）**：以不可变 session/generation 对象拥有请求占位、metadata cache、去重表和 dispose。每次异步请求捕获自己的 owner；只对该 owner cleanup，只有 current owner 才发布 UI 状态。多选读取最大并发初值4，非截断；实测后只能在独立变更里调参。render RPC 用 settle-once helper；任何终态清 timer/listener/map，preabort 不 post。

**Consequences**：状态竞争可确定性测试；取消后仍无法中止已经运行的同步 SQLite 语句，需诚实记录“不再调度/不应用”而非虚构服务端 cancellation。queue、dedupe、dispose 增加小型状态机成本。

**Alternatives**：只加响应 generation 检查无法保护 finally；延长请求 deadline 不能消除排队；Promise.all 限制只显示项会破坏全选编辑语义；跨库 assetId-only cache key 不足。

**Gate**：deferred Promise逆序、实际hook StrictMode/remount/unmount、A→B同offset、所有单选/多选cache writer在close/reopen同libraryId时隔离；旧read晚于新save不得倒退entityVersion或盲清conflict。1k selection完整mixed/uniform、preabort/迟到回调/timeout；不取消已提交保存。

## ADR-A03：领域变化不可被通知降噪吞掉

**Context**：LibraryService 全局 watcher suppression 同时跳过 onAssetsChanged，而 Main 用此事件更新 cache/plugin/autoAI。AI completed 又绕过已有 refresh coalescer。

**Decision（提案）**：领域变化照常发布；抑制磁盘toast的信息按库作用域携带，可选字段维持旧客户端兼容。Renderer背景刷新共用one-active+one-dirty-trailing owner，这是并发/待办容量，不是持续事件永远只允许两次读取。AI影响当前filter/search/smart collection时仍正确重查，不全局跳过AI refresh。

**Consequences**：业务副作用完整，多库相互隔离；内部收到更多真实事件，需要消费端已有幂等/合并措施；细粒度 refresh dependency 只能在测试证实后启用。

**Alternatives**：只缩短抑制窗口无法消除漏领域副作用；只靠 library.changed 可以刷新 UI，但不能代替当前 Main 的所有资产事件语义；全局强行重查会恢复冗余工作。

**Gate**：双库混合变更、100 AI completion burst、最终计数/过滤正确、preview identity/selection/scroll 保持，toast 数量符合现有体验。

## ADR-A04：验收与附件选择统一为可核验 manifest

**Context**：v2.3.16 有效的手工补验未全部进入 default pipeline；通用 collector 在有历史包的 out/make 收到265二进制；本版专用 helper 正确选22，不是通用工具已修复。

**Decision（提案）**：versioned gate manifest定义平台/能力/阶段/required状态；runner输出PASS/FAIL/SKIP/NOT_RUN/BLOCKED及证据。构建时生成provenance receipt，绑定HEAD、源码快照/dirty指纹、实际packaged version与文件hash；make衍生物关联输入receipt。当前版artifact manifest据此校验source/target/platform/full/installer/delta/size/hash，hash/upload/resume/promotion消费同集合。收集时的当前HEAD不能证明旧包来源，缺凭据不能补签成可信；不清空历史out或修改不可变baseline。

**Consequences**：未来验收和附件数量不依赖人脑，能阻止缺测/错版晋升；增加 runner/manifest 测试和能力探测。Windows native UI依赖 interactive desktop + Inno，其他平台不能伪装为通过。

**Alternatives**：每版 tmp helper 可短期安全但不能成为默认工程能力；扩大 glob 可能引入 destructive NAS/benchmark/native 用例；清理 out/make 破坏历史产物且不能解决 metadata可信性。

**Gate**：静态 manifest contract、平台 capability 失败语义、无外部写入的 dry-run、旧文件混入、缺失/重复/hash错误、draft未完整不得晋升；本计划不实际 GitHub/ECS publish。

## ADR-A05：性能改变必须先有等价性和收益证据

**Context**：用户当前体验良好；scoped watcher/geometry/cache/log确有可避免工作，但没有全场景大库/UI收益证明。前一轮保持 summaries 未驱逐有实际 heap依据。

**Decision（提案）**：先量 scoped SQL、metadata请求预算、tail read bytes、geometry定位与 frame/heap；性能提交附差分对照与同机 baseline。优先局部参数下推、前缀和/二分、可重算 cache LRU；不变搜索/选择/preview/恢复语义，不降低 durability。

**Consequences**：收益可解释，能决定“不做”；基准维护与样本噪声管理成本增加。可重算 cache 容量改变可能增加 miss 延迟，须测并保 deterministic结果。

**Alternatives**：驱逐所有 browse summaries、FTS-only搜索、cursor替换offset、并发writer、任意加大媒体并发都可能破坏已验证契约，没有现成收益证据。

**Gate**：正确性先通过；同 fixture ≥30样本，p95建议≤baseline110%并对<5ms加绝对2ms噪声容差；没有明显收益或只有统计噪声则保留 baseline，不以“任务已开始”为由强行合入。
