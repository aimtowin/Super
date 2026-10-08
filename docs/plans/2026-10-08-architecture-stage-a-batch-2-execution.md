# 阶段 A 第二批：A3 / A8 / A9 执行记录

日期：2026-10-08，Asia/Shanghai。用户“继续”后，按决定版顺序实施三个任务并停在批次检查点。**本批代码已实施、专项及串行回归通过；默认并行合并调用仍有退出异常，不是整个阶段 A 完成或可发布的声明。**

## 1. 范围与状态

- 实际仓库：`C:/Users/Administrator/Desktop/Super-main`，复用当前 checkout，保留首批代码和全部既有 dirty 文档。
- HEAD 保持 `67298c17d792070b09adc05d5a3af3cac722ff4f`；版本保持 `2.3.16`。
- 沿用现有 Electron `43.1.0` / Node `24.18.0` / ABI `148` 的 Vitest runner；系统 Node `24.15.0` / ABI `137` 仅用于已有脚本。没有安装、升级或重建依赖。
- 未操作真实图库、已安装应用、用户日志、账号/MUTAI、GitHub、AI、WebDAV、ECS；未 commit/push、升版本、打包、安装或发布。
- 主代理运行所有测试/构建；这些资源性命令串行。只读 typecheck/lint 曾短暂重叠，二者最终退出 0。子代理负责不相交的 A3 文件实现及只读交叉复核，没有代跑测试。

| 项目 | 当前状态 |
| --- | --- |
| A0 / A1a / A2 | 首批已实施；本批重验基线和 fresh A2 IPC probe 通过 |
| A3 | 已实施；默认 client 的接收预算、取消、pause/idle 边界专项 PASS |
| A8 | 已实施；真实提取函数/registry 的专项与相关回归 PASS |
| A9 | 已实施；HTTP/文件 staging、fake UtilityProcess 原函数路径及交叉复核回归 PASS |
| 默认并行 18 文件合并调用 | **FAIL**：断言全绿但进程退出 1；原因未确认 |
| 相同 18 文件显式串行调用 | **PASS**：294 / 0 / 0，进程退出 0；不替代上一行 |
| A10 / A4 / A5 / A6 / A7 / A1b / 整个 A 检查点 | **NOT_RUN**；不自动进入下一批 |
| B / C、真实发行/ECS | 不在本批范围 |

## 2. A3：插件下载预算与取消链

修改 `plugin-github-client.ts`、`plugin-package-manager-types.ts`、`plugin-package-manager.ts`、`plugin-install-operation.ts` 及两个原测试文件；新增 `plugin-download-budget.test.ts`。

- 默认网络 client 在收取每个 chunk 前检查累计实收字节；默认 archive 预算沿用 256 MiB。`Content-Length` 仅供早拒绝，虚假/缺失长度不能绕过预算。无 reader 时诊断失败，不回退到无界 `arrayBuffer()`。
- API/commit 查询、zipball/release 下载及安装/更新入口贯通父 signal。并行 asset/commit 有局部取消 owner：任一失败取消 sibling，不取消父操作。不因预算失败或用户取消继续 source fallback。
- header 与 active read idle 默认各 30 秒，可配置。挂起 reader 可被取消；pause 停止 idle 计时，resume 重启 idle 窗口；所有 pause waiter 可被 stop 唤醒。没有新增总下载时长上限，持续有进展的 80 秒 fake 下载仍可成功。
- 终态只发布一次，清定时器、监听器及 reader；reader.cancel 的坏实现不能无限阻塞调用者。同步 fetch/read 中止同时抛错的 Promise 仍被观察，避免晚到 rejection。
- 保留返回 `Uint8Array`、原权限/信任提示、ZIP/path/symlink/解压检查和旧插件替换时机。失败/取消不删除已安装旧版。

兼容限制：公开 custom client 可忽略新增可选控制；宿主最终 archive check 保留，但不能保证任意旧 custom client 自己的读取有超时/取消预算。预算针对 archive 实收字节，不是所有 metadata JSON，更不是进程 RSS 上限。chunks 与合并 buffer 会同时存在，真实大包峰值及流式落盘留待后续测量。

Red 记录 `a3-red.json` 为 6 通过 / 28 失败，其中 **27 项是目标边界失败，1 项是旧包夹具缺 README**，后者不计业务复现。首次 related green 的 6 项失败属于夹具 README/LICENSE 和 microtask 等待方式；补合法 fixture、改为 await 实际终态后，原业务断言不放宽，78 项全部通过。

小包内存采样使用 fake 256 KiB archive、32 KiB chunks、18 次采样，见 `a3-memory-sample.json`。RSS 从 71,127,040 到采样最大 74,186,752 bytes，external 从 2,700,341 到采样最大 4,609,112 bytes。runtime 报告 arrayBuffers=0，不代表没有 buffer 分配；离散采样最大值不是真实连续峰值。该单项调用为 1 通过 / 33 filter-skipped，**不是整个 suite green，也不是 256 MiB 大包/RSS 保证**。

## 3. A8：render RPC 单次终结

新增 `pending-render-rpc.ts`、`model-render-orchestrator.ts` 及两个专项测试，真实 `worker/index.ts` 使用这些函数，不另造只供测试的平行状态机。

- model/document 各一个 registry；entry 在 dispatch 前建立，支持同步回应。preabort/disposed 不创建请求；check/subscribe gap、build/post throw、success、typed timeout、abort、dispose 和迟到重复回应都清 Map/timer/listener 并只终结一次。
- 保留原 MODEL_RENDER_TIMEOUT / DOCUMENT_RENDER_TIMEOUT、AbortError、deadline 和入口 schema 解析。shutdown 先 dispose registry，再执行原媒体/库关闭。
- 提取真实 orchestrator，保留格式、source/preview URL、companions 四字段、授权、HDRI、尺寸和 views 映射；在转换前、转换 await 后且读 status 前、发 RPC 前检查 signal。
- FBX shared single-flight、媒体 job owner、诊断/fallback wrapper 保留原层。取消个人任务不取消共享转换/缓存写入。

先把原算法提取并接入真实入口，再写 8 项目标 red；8 项均因目标缺口失败。补强后最终 registry 9 项、orchestrator 7 项及相关测试通过。**这是逻辑取消与资源清理，不是 wire cancel 或立即停止已发 offscreen/GPU/FBX cache；真实 GPU 媒体 E2E 本批 NOT_RUN。**

## 4. A9：上传源的真正终结所有权

新增 `extension-upload-staging.ts` 及专项测试；修改 Server、Main `handleSaveUpload`、WorkerClient 和原相关测试。handle 仅为 Main 本地第二参数，HTTP/Worker wire 不变。

```text
Server 接收 → Main claim → Worker dispatch → 有效 response / 对应 child 实际 exit → release
                            请求 deadline / HTTP disconnect → 不删除仍由 Worker 使用的源
未 claim / 未 dispatch → 本地安全回收；delete 失败 → 诊断残留，不假报已删除
```

- Server finally 仅释放未 claim 目录；Main dispatch 前 claim，construct/post 失败回收；真正 dispatch 后不再用业务 Promise finally 删除。
- WorkerClient 以独立资源记录绑定 requestId + origin child。有效正常/迟到 response、not-dispatched、对应实例 actual exit 才通知一次。deadline、protocol kill 意图、shutdown kill 意图不是 terminal。
- 资源记录不随 expired-ID 的 10 分钟 TTL 淘汰；迟到有效资源 response 先被识别，不误杀 Worker。旧 child 的 handshake/message/exit 不改变 replacement 的 ready/pending，也不回收新实例文件。
- ready 失败移除 initial listeners；post throw 清 pending/timer；exit 先令旧实例不可用再调用 cleanup，防止重入向死进程 dispatch。
- 删除前检查 owned direct-child 路径、类型、realpath；拒绝 junction/symlink/越界。只尝试一次、共享 Promise；失败记录 retained residual，不扫全 temp、不加无限 timer retry。
- cleanup 的同步 throw/异步 reject 与上传诊断回调 throw 均不改业务结果、不阻断未 claim 回收。

原真实 Server/WorkerClient 的初始 red：59 通过 / 6 目标失败。HTTP 地址与公共错误 fixture 的早期无效用例单独保留，不算目标 red；修正后相关 139 项通过。

交叉复核另外发现并用真实方法确定性复现三项：旧 shutdown await 期间 exit→replacement start→旧 continuation 清掉新状态；有效 response 的 terminal callback 重入 exit 导致业务被改为 rejection；ack 后 deadline timer 未清。新增 red 为 20 通过 / 3 失败，修复后 23 全通过。await 后加入 captured-child guard、timer finally 清理，先 settle 有效业务 response 再调用 local cleanup。最终只读复核未发现这几个最小补丁的新阻断问题。

测试范围：真实本地 HTTP、fresh 文件夹和实际 staging helper，以及 WorkerClient 的 fake UtilityProcess 事件。没有启动生产 Main composition root，也不是浏览器扩展→真实生产 Worker 的完整 E2E。若 child 未收到有效终结且仍活着，源保留；进程整个崩溃的残留扫描不在本批范围。

## 5. 最终证据与未解决的验证异常

证据根：`C:/Users/Administrator/Desktop/Super-main/tmp/architecture-stage-a-3cfc3116c84d4cd981ef22ac85af19ed/`。计数有重叠，不能相加作独立通过总数。

| 实际验证 | 结果及退出码 | 证据 |
| --- | --- | --- |
| 首批 gate/updater/pending 回归 | 36 PASS，0 FAIL/SKIP，exit 0 | `first-batch-regression.json` |
| A3 相关六文件 | 78 PASS，0 FAIL/SKIP，exit 0 | `a3-verified-green.json` |
| A8 提取专项及相关回归（早期，后被最终合集覆盖） | 55 PASS，0 FAIL/SKIP，exit 0 | `a8-related-green.json` |
| A9 相关回归（补交叉复核三项之前） | 139 PASS，0 FAIL/SKIP，exit 0 | `a9-verified-green.json` |
| A9 交叉复核 red→green | 20 PASS / 3 FAIL → 23 PASS，green exit 0 | `a9-review-red.json`、`a9-review-green.json` |
| 18 文件默认并行，第 1 次 | 291 断言 PASS，但 **exit 1 / gate FAIL** | `focused-final.json`、`combined-command-results.json` |
| 18 文件默认并行，第 2 次 | 294 断言 PASS，但 **exit 1 / gate FAIL** | `focused-review-final.json`、`combined-command-results.json` |
| 相同 18 文件，maxWorkers=1 诊断 | 294 PASS，0 FAIL/SKIP，exit 0 | `focused-serial-diagnostic.json` |
| 最终相同 18 文件，forks/maxWorkers=1/no-file-parallelism | 294 PASS，0 FAIL/SKIP，exit 0 | `focused-serial-final.json` |
| 原 16 文件最终基线，默认并行 | 174 PASS，0 FAIL/SKIP，exit 0 | `baseline-final.json`；原 162 + A2 四项 + WorkerClient 八项 |
| fresh A2 build + 真实 UtilityProcess | 1 PASS，0 FAIL/SKIP/flaky，build/test exit 0 | `a2-ipc-recheck.json` 及同名附件目录 |
| 最终 typecheck / lint | PASS，exit 0 | 本次命令；先前新 test callback 返回 boolean 的类型错误已改为 void |
| 安全 diff / SHA | PASS（git diff --check） | `source-hashes-final.json`，最终命令退出 0 |

默认合并调用在 JSON 写出后出现 `PostQueuedCompletionStatus: (6)`（本地错误文本解码为乱码），没有正常零退出。runner 透传 Electron child exit；Vitest JSON 的 success 不包含进程退出或全部 unhandled error 状态。完整可见命令输出与退出码保存在 `combined-command-results.json`，**不依 JSON 全绿改记 PASS**。

相同原生错误行也存在历史 `tmp/release-228-baseline-tests.log`，但历史本身有测试失败；这只是线索，不能确诊外部运行时 bug。串行同断言成功支持调查并行 forks/teardown，但不足以确认根因。两个真实 Service worker fixtures 使用 SQLite/fs.watch；旧 HTTP fixtures 有未 await 的 close，均只是候选。未改全局 Vitest 配置、未跳过测试/减断言/放宽 timeout、未 catch native 错误或把非零改成零。**默认并行验证异常仍待排查；完整阶段 A/发行 ready 阻断未消除。**

本批 fresh probe manifest：`tmp/architecture-stage-a-7e1a8b65-faef-4601-af58-fe0e5cfb23f3/import-expiry-probe/manifest.json`；source fingerprint `e7c47b46fbc0964e1d764e3ee77716a67b261fd5daa8a850b0b4385089fec9e5`。manifest/source/compiled hashes均由测试复验，同 PID、forkCount=1 的 TTL 故障隔离/恢复通过。旧首批 compiled bundle 不充本批证据；仍只证明 fixture UtilityProcess 的真实 Service 小切片，不充生产全链路。

未重跑：默认 36 文件 development E2E、完整 unit/Worker/mainline、生产 App build、真实模型/GPU/媒体/NAS、性能大样本、native updater 两分支/九场景、真实安装、package/发行。首批 native 9 场景是历史 PASS，当前 updater 静态 4 项通过不能替代新的 native 运行。旧 lavfi/history 失败未重跑、未修、未改 skip。

## 6. 不变式、回滚与下一步

SHA 复核确认 package/lock、A1a gate manifest/runner 及 A2 LibraryService 相对首批未变。未改 `src/shared`/`src/plugins`、schema49、事务/durability/lease/backup、linked-root 删除范围、信任权限和更新源；11 份本批生产文件及这些基准 SHA 在 `source-hashes-final.json`。

回滚按任务切片：A3 只撤 download control/options/operation 与对应测试；A8 只撤提取 helper + entry wiring；A9 只撤 staging/local terminal/origin guard 与 Server/Main wiring。无数据库迁移。不得用 git reset/checkout 覆盖首批和用户 dirty 改动；撤回 A9 会重新暴露 timeout 删除活动源的风险，不能称安全回滚后已修。

本批停止。下一步先定位默认并行测试退出异常，再按决定版继续 **A10（延期 installer receipt）→ A4 → A5**；其余 A 任务及最终 UI/native 检查点未完成。没有默认开启 B/C 或 ECS/打包发布。
