# Super Lib：确认仍未修复的问题清单（2026-10-09）

> 后续实施状态见[软件本体补齐结果](../reference/completion-results-2026-10-10.md)。本页历史复现/上游固定版本事实保留，不因修复反向改写。

> **后续状态更新（2026-10-10）**：下文保留 2.3.17 修复前快照。U01–U08 的后续修复已随 [2.3.18 发行](../releases/v2.3.18-validation.md)交付；原复现结果不反向改写。当前真实失败及验收缺口见[2.3.18 已知问题](../reference/known-issues-2.3.18.md)。仍使用旧 2.3.17 的用户按下文安全提醒处理。

> **8 项；本轮只诊断、复现、记录，不修改产品行为。** 基线为 Super Lib 2.3.17，源码提交 `fcf074d6e771fb69394f30dcdb79d531848a51c7`。这些是本次测试实际失败的独立问题，不是把上游发行说明直接复制成待办。

关联：[上游发行逐项对照与验证边界](../reference/serpent-followup-audit-2026-10-09.md) · [Super Lib 差异化能力](../reference/superlib-differentiators-2026-10-09.md) · [历史决策](../POST_DEVELOPMENT_DECISIONS.md)。

## 先看结论与使用提醒

| ID | 优先级 | 确认的问题 | 本次实际结果 | 上游对应节点 |
| --- | --- | --- | --- | --- |
| U01 | P0 | 链接文件夹的“移入回收站”仍会移动外部源文件和目录 | 临时源目录消失；模拟系统回收站接口被调用 3 次 | [0.2.4](https://github.com/dolag233/Serpent/releases/tag/v0.2.4) |
| U02 | P0 | 同步把暂时缺失的本地文件当成删除 | 第二轮同步删除内存远端的文件，`remoteDeletes=1`，并写墓碑 | [0.2.4](https://github.com/dolag233/Serpent/releases/tag/v0.2.4) |
| U03 | P2 | 红色筛选误包含零饱和度灰色 | 真实 SQL 返回 `gray` 和 `red`，而不只是 `red` | [0.2.6](https://github.com/dolag233/Serpent/releases/tag/v0.2.6) |
| U04 | P1 | 非整数的正数 EXIF 尺寸能污染资产列表响应 | 返回 `1.5×2.5`，`assetSummarySchema` 校验失败 | [0.2.8](https://github.com/dolag233/Serpent/releases/tag/v0.2.8)，同类尺寸防护遗漏，不是原始照片一比一复现 |
| U05 | P1 | 只改路径、不改内容的资产不会生成同步路径动作 | `old.txt → new.txt` 且哈希不变，计划返回空数组 | [0.2.1](https://github.com/dolag233/Serpent/releases/tag/v0.2.1)，[0.2.3](https://github.com/dolag233/Serpent/releases/tag/v0.2.3) |
| U06 | P2 | GBK 中文文本预览乱码 | `D6 D0 CE C4` 经真实文本读取返回 4 个替换字符，而非“中文” | [0.2.6](https://github.com/dolag233/Serpent/releases/tag/v0.2.6) |
| U07 | P2 | 仅凭文件名给普通图片加灰度/反相显示 | `photo_roughness.png` 被推断为标量贴图，产生 `grayscale(1)` | [0.2.5](https://github.com/dolag233/Serpent/releases/tag/v0.2.5) |
| U08 | P2 | 磁盘对账仍会自动合并连号图片 | 未经过显式导入确认的 3 张新增图片，被列表投影为一项 3 帧序列 | [0.2.6](https://github.com/dolag233/Serpent/releases/tag/v0.2.6) |

优先级是本次维护建议：P0 表示应先处理的数据安全路径，并非已证明用户发生真实数据损失。**现在不要对真实链接目录使用“移入回收站”作试验；仅取消引用请用“从库中移除”。未解决 U02 前，不要在本地文件缺失、磁盘离线或库路径搬移过程中强行执行同步。** 手工备份应独立于可能传播删除的同步目标。

## 复现方法与安全边界

[独立审计用例](../../tests/audit/serpent-followup.test.ts)使用真实本地产品模块；[独立配置](../../vitest.serpent-audit.config.ts)不匹配日常 `vitest.config.ts` 的 `tests/{unit,worker}`。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.serpent-audit.config.ts --reporter=verbose
```

当前结果：**10 个用例，8 失败、2 通过，退出码 1**。这是缺陷清单对应的真实红灯，不是构建/发布成功报告。修复后应让正确行为断言通过，而不是把断言改成接受错误结果。

- 所有文件写入都在本测试 `mkdtemp` 创建的独占临时根下，关闭数据库和监视器后才清理；真实素材、已安装软件、ECS、真实 WebDAV 均未操作。
- U01 使用可恢复的临时重命名来模拟 `trashItem`，**没有调用 Windows 系统回收站**；测试证明产品交给删除接口的目标，而不是系统回收站自身的实现。
- U02 使用真实 `LibraryService → createLibrarySyncPort → SyncEngine → runSyncActions`；只有网络传输替换为内存驱动。首次上传与第二次删除均实际执行，不只是查看规划字符串。
- U03 执行产品生成的 SQL，数据库为真正的 `better-sqlite3 :memory:`。
- U04 控制 EXIF 解析器与 OIIO 子进程输出；落库、列表投影及 Zod 协议校验是真实代码。夹具是携带合法 PNG 帧头的 RAW 路径，**不是用户的原始损坏照片，也没有真实 OIIO 解码验收**。确认的是解析器边界缺少整数校验，不能宣称所有坏照片都打不开。
- U05、U07 是真实生产函数的确定性单元复现，并追踪到调用入口；没有真实 WebDAV MOVE 或视觉截图验收。
- U06、U08 运行真实库创建、导入/读取或对账/列表管线。

两个正对照分别证明：`removeLinkedFolder` 仅解除链接已安全；UTF-8 中文读取正常。它们防止把“所有链接移除均删源文件”或“所有文本均乱码”写进结论。

## U01：链接目录“移入回收站”仍触碰外部源文件

- **触发步骤**：链接一个外部目录；对链接根使用“移入回收站”，对应 `deleteLinkedFolderSubtree(relativePath:'', deleteFromDisk:false)`。相同方法也可用于链接子目录。
- **执行证据**：[Renderer 删除入口](../../src/renderer/use-folder-delete-actions.ts) `trashLinkedFolderSubtree` → [Worker](../../src/worker/library-service.ts) `deleteLinkedFolderSubtree`：对索引资产调用 `deleteLinkedAssets(deleteSourceFile:true)`，随后对剩余源目录调用 `trashItem(dirPath)`。不是安全的 `removeLinkedFolder` 路径。
- **预期 / 实际**：普通解除链接不应变更外部文件；实际会把外部目录内容交给系统回收站。根目录剩余的未索引内容也在目录级调用范围内，这一点来自源码追踪，测试不单独宣称已验证未索引文件情形。
- **影响**：其他程序依赖的素材可能突然不在原路径。是否可由系统回收站恢复取决于操作系统、卷类型及后续操作；不能保证网络卷可恢复。
- **验收要求**：默认链接移除只删除库索引；根/子目录/批量/拖入回收站分别验证。只有明确“强制从硬盘删除”及危险确认后才允许删源。保留现有安全解除链接回归。

## U02：暂时找不到文件被传播为远端删除

- **触发步骤**：先同步一个托管资产；临时把库内文件挪到测试根的另一位置，保留库内资产身份；再次同步。
- **执行证据**：[Worker](../../src/worker/library-service.ts) `syncSnapshot` 遇到 `!existsSync` 直接跳过；[端口](../../src/worker/sync/library-port.ts)不传“缺失但未删除”集合；[规划器](../../src/worker/sync/sync-plan.ts)把“当前快照无、旧 manifest 有”统一解释为删除；[执行器](../../src/worker/sync/sync-runner.ts)执行 DELETE 和墓碑写入。
- **实际**：第一轮远端文件存在，第二轮变为不存在，删除数为 1；并非仅标记缺失。
- **影响**：同步副本不再是安全恢复来源；墓碑还可能影响另一设备。本次没有真实云端或多设备实验。
- **验收要求**：区分可用、暂时缺失、明确删除三种事实；缺失不产生 DELETE/墓碑，远端存在时可恢复；用户明确入回收站的删除仍可传播。覆盖离线/权限错误/路径切换、显式删除、恢复及既有墓碑。

## U03：灰色误匹配红色

- **触发步骤**：色卡含 `hue=0, saturation=0, lightness=.5` 的灰色及正常红色；选择红色。
- **执行证据**：[colorFilterSql](../../src/shared/color-filter-presets.ts) 的 hue 分支只查色相；[库查询](../../src/worker/library-service.ts)使用此 SQL。中性色分支存在，不等于彩色分支排除了中性色。
- **实际**：真实 SQL 同时返回灰色与红色。包含误入也意味着排除红色可能误排灰色，后者是由同一条件推导，未另跑全界面排除测试。
- **验收要求**：彩色色相匹配增加饱和度/亮度或色差边界；红/黑/灰/白、包含/排除、低饱和度接近色、空色卡均有回归。

## U04：图片尺寸只检查大于零，没有检查整数

- **触发步骤**：EXIF 解析器返回宽高 `1.5,2.5`，源帧头合法 `1×1`；生成 RAW 缩略图后读取资产列表。
- **执行证据**：[normalizeRawImageMetadata](../../src/worker/raw-image-metadata.ts) 接受有限非整数；[persistRawImageMetadata](../../src/worker/library-service.ts)用 `metadata.width ?? headerSize.width` 存库；`assetSummaryFromRow` 仅 `>0`；[协议](../../src/shared/asset-types.ts)要求 `.int().positive()`。
- **实际**：列表响应带小数，整个数组校验失败。上游最新 `usablePixelDimension` 和 `resolvedExtractedPixelSize` 对尺寸采取正整数及整对帧头回退。
- **已经防住的部分**：本轮另一次零尺寸探测返回 `null×null`，协议校验成功。**不能把上游“零 EXIF 导致目录打不开”原样当作 Super Lib 当前缺陷。** 零值仍可能遮掉真实帧头，但此清单的失败断言针对非整数响应污染。
- **验收要求**：解析、持久化、投影统一正整数约束；无效成对尺寸使用有效源头回退。添加零、负数、小数、NaN、单边损坏与正常 RAW/TIFF/JPEG；以真实坏照片完成 UI 端补充验收。

## U05：同步只比较内容哈希，漏掉路径变化

- **触发步骤**：上次两端条目均为 `old.txt`；本地当前改为 `new.txt`，内容哈希相同；调用真实 `planSyncActions`。
- **实际**：空动作数组。规划器的双方已知分支只检查哈希，没有路径比较；执行器也没有 `move-remote/relocate-local` 动作类型。上游在 0.2.1 加入 MOVE，0.2.3 补同步移动后的目录与视图收口。
- **影响**：搬移整理无法正确反映到另一端。只修改内容与路径时也必须确认新路径写回，不能只补一个路径单元测试。
- **验收要求**：本地/远端单侧改路径、双侧改路径、路径与内容同时变化、同名占用及远端空目录清理；远端不支持 MOVE 时有安全降级。本次证明漏规划，未对真实服务端执行 MOVE。

## U06：GBK 被无条件按 UTF-8 解码

- **触发步骤**：导入 GBK 编码“中文”的四个字节，打开文本预览。
- **执行证据**：[readTextAsset](../../src/worker/library-service.ts) `slice.toString('utf8')`，未走上游新增的编码识别。
- **实际**：出现替换字符；同一服务读取 UTF-8 中文正对照通过。
- **验收要求**：UTF-8/BOM/GBK/GB18030/UTF-16 分别验证；二进制拒绝和截断边界正确。编辑保存必须明确编码策略，不能静默损坏源文本。当前已确认显示乱码，不宣称本轮实际发生保存损坏。

## U07：文件名决定不应自动决定颜色显示

- **触发步骤**：普通彩色图片名包含 `roughness`（`gloss` 还可能触发灰度反相），不由用户主动选择通道显示。
- **执行证据**：[AssetPreviewModal](../../src/renderer/AssetPreviewModal.tsx) 对图片调用 [detectPbrTextureChannel](../../src/renderer/pbr-texture-channel.ts)；[ZoomablePreviewImage](../../src/renderer/zoomable-preview-image.tsx)使用 `pbrTextureDisplayFilter` 生成的 CSS。
- **实际**：`photo_roughness.png` 产生 `grayscale(1)`。这不是自动辨认材质后用户明确要求的通道模式，源字节不被改写。
- **验收要求**：默认按普通图像显示；通道显示通过显式操作/可信元数据开启。普通文件名、真实贴图、主动通道模式都验证，保留 3D 材质本身的 PBR 映射。

## U08：刷新磁盘自动把新增连号图片合并

- **触发步骤**：库创建后，直接向托管目录写入 `frame0001.png`、`frame0002.png`、`frame0003.png`；只执行 `refreshManagedAssets`，不执行序列导入确认或手动创建。
- **执行证据**：[LibraryService](../../src/worker/library-service.ts) 对账结束调用 `createDetectedImageSequences(discoveredAssetIds)`；恢复路径也有同类调用，但本轮只运行对账复现。
- **实际**：列表由 3 张独立图片变成一个 3 帧序列。字节没有丢失，但独立浏览与选中语义被后台操作改变。
- **验收要求**：仅显式导入确认或手工序列创建才自动成组；磁盘监视、对账、恢复不隐式合并。序列帧完整性、独立图像可见性与已有序列刷新均保留。

## 不混进这 8 项的内容

- 旧 [follow-up-fixes](follow-up-fixes.md) 与发行记录中的历史失败不自动视为今天仍未修复；本轮没有重跑全量历史失败套件。需继续验证的路径见审查报告。
- JFIF/AVIF/字体/FLV、任意取色相似度等上游新增能力，与“原功能损坏”不同，放在功能差异表，不通过改命名扩大缺陷数量。
- NAS 阻塞、长期写租约、Windows 原生对话框焦点、macOS 启动、第三方 AI/WebDAV/插件问题未全部实机复现；仍明确标为待验收，不能从 278 项专项通过推出全部已修复。
- 本轮不提升版本号、不打包、不发布安装器、不更新 ECS；完成的是审计产物与既有 MIT/历史文档的 Git 同步。
