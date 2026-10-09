# Serpent 0.1.4 之后的修复：Super Lib 对照审计

日期：2026-10-09，Asia/Shanghai。用户授权范围：读取发行说明、对照本地源码、隔离复现、整理清单、连同先前 MIT/历史文档修改推送 Git。**不修产品行为，不打包、不创建 Release、不更新 ECS。**

最重要的两份交付：

- [真实存在且仍未修复：8 项，含复现/影响/验收条件](../plans/confirmed-unfixed-2026-10-09.md)。
- [Super Lib 差异化能力：哪些确实比当前 Serpent 多，哪些不能如此宣称](superlib-differentiators-2026-10-09.md)。

## 1. 三个比较基准

| 对象 | 固定基准 | 用途 |
| --- | --- | --- |
| 分叉来源 | Serpent `v0.1.4`，提交 `6aeb146c8f893a2f4be9249195c838a653bcb090` | 用户确认的起点；通过 tag 实际取源码，不从名称推断继承关系 |
| 上游当前公开版本 | Serpent `v0.2.9`，提交 `f58701a6c06a41c075ef8fe8c6f48b7a6305f498` | 判断后续修复及“上游没有”是否仍成立 |
| 本地审计源码 | Super Lib `2.3.17`，提交 `fcf074d6e771fb69394f30dcdb79d531848a51c7` | 本次实际执行的产品代码；未提交变化为文档/MIT 元数据及隔离审计文件 |

发行来源为 [GitHub Releases](https://github.com/dolag233/Serpent/releases) 的官方 API，读取 tag 对应源码；本轮网页工具连接失败、浏览器技能服务未配置，因此没有把浏览器截图当作证据。未执行上游应用或上游脚本。最新公开版本核查时点为本轮，不能推断以后不会新增发行。

0.1.4 之后 API 返回 **10 个发行节点**：0.1.5、0.2.0、0.2.1、0.2.3、0.2.4、0.2.5、0.2.6、0.2.7、0.2.8、0.2.9。0.2.3 说明 0.2.2 已撤回并纳入其内容；不另造一个不存在的公开 Release，也不把撤回版本的“严重问题”猜成具体缺陷。

固定源码入口：[0.1.4 基线](https://github.com/dolag233/Serpent/tree/6aeb146c8f893a2f4be9249195c838a653bcb090) · [0.2.9 快照](https://github.com/dolag233/Serpent/tree/f58701a6c06a41c075ef8fe8c6f48b7a6305f498)。上游下载副本在本机忽略的 `tmp/`，不会作为 vendor 或新 Git 仓库提交。

## 2. 证据等级：不能把“查到代码”写成“用户实机已通过”

| 状态 | 本文含义 |
| --- | --- |
| **Uxx 已复现** | 本地生产模块的正确行为断言失败；进入未修复清单。夹具/替身范围另列 |
| **专项通过** | 本轮指定单元/Worker 回归通过，只覆盖该测试的断言；不自动证明完整 UI/硬件/第三方服务 |
| **部分防护** | 部分路径已有保护，但同类问题还有更窄的失败路径 |
| **源码对照，待验收** | 找到相关实现/差异，但没有完成本轮可归因的实际失败复现；不计入“确认未修复” |
| **能力差异/触发前提不同** | 上游新增产品能力、策略限制或本发行平台未具备，不能直接记为旧功能 Bug |
| **描述不足** | 上游只有泛化 UI/稳定性说法，缺少可证伪的条件，不能制造精确结论 |

历史 HTML 只是决策线索。本轮核对文件为 534773 bytes、SHA-256 `058fed38f0c6da372b31dda9e04d894169d714bc79f08313181298bef297e396`；其脱敏归档见 [POST_DEVELOPMENT_DECISIONS](../POST_DEVELOPMENT_DECISIONS.md)。历史“已修复/已发布”不能代替本轮验收，历史失败也不能不经复查就累计成当前缺陷。

## 3. 逐发行修复/可靠性对照

这里按发行说明的**具体修复与可靠性主张**归组。同一问题重复出现时引用同一 U 编号，不重复计数；纯新功能集中到第 4 节。未取得完整 UI 或第三方证据的项明确保留待验收。源码链接指向本仓库，函数名用于精确定位。

### 3.1 [Serpent 0.1.5](https://github.com/dolag233/Serpent/releases/tag/v0.1.5)

| 修复/可靠性主题 | 本地入口与本轮证据 | 结论 |
| --- | --- | --- |
| 父合集改名保留子级；对子合集增加成员 | [LibraryService](../../src/worker/library-service.ts) 的 collection/history 方法；`linked-folders.test.ts` 内层级快照和递归成员测试 | 专项通过；不等于完成父级改名的完整鼠标 E2E |
| 链接源外部移动保留身份；消除残留索引 | 同一 Worker 的 linked reconcile；`linked-folders.test.ts`、`linked-folder-index.test.ts` | 专项通过对应断言；暂时缺失与同步删除不能据此排除，另见 U02 |
| 大库平铺视口上沿漏图、滚动后越来越多空卡 | [窗口槽位](../../src/renderer/browse-window-slots.ts)、分页/布局与 visible-window 路径；相关 4 文件专项 | 专项通过；真实 2 万项图库/冷盘/RSS 未做本轮基准 |
| 平铺选择描边裁剪/圆角 | [样式](../../src/renderer/styles.css) 与 browse selection 样式 | 源码对照，待视觉/不同缩放验收 |
| 视频尺寸需要整库刷新 | [Worker](../../src/worker/library-service.ts) extracted metadata、后台通知与 browse 更新 | 源码对照，未本轮生成真实新视频并观察 UI |
| 非直连容器已生成代理却不能预览 | [预览策略](../../src/renderer/viewer-preview-policy.ts)、[轮询](../../src/renderer/preview-poll.ts) | 专项通过现成 URL、代理/等待判定；真实 MOV/AVI/WMV/MKV 待媒体验收 |
| 导入后树未更新；合集/链接交互回归 | [App](../../src/renderer/App.tsx) 的 import completion/reconciliation；链接专项 | 相关数据层通过；“若干交互”未给精确场景，不能一并判通过 |
| 删除库延迟进度；模态遮挡窗口控制 | [Main](../../src/main/index.ts)、[App](../../src/renderer/App.tsx) 的进度/模态与拖拽区处理 | 源码对照，待原生窗口 E2E；历史标题栏菜单修复不是本轮实机证据 |
| 原生拖拽预览比例 | [native-asset-drag](../../src/main/native-asset-drag.ts)；两个 native drag 单元文件 | 专项通过；未测试 OS 外部拖入目标 |
| OpenAI 兼容响应解析 | [AI 适配器目录](../../src/worker/ai)、[AI 搜索规划器](../../src/main/ai-search-planner.ts) | 搜索计划解析专项通过；分析适配器/供应商真实返回仍待验收，二者不是同一入口 |
| Eagle/Billfish 缩略图直接复用再归一化 | [eagle-library](../../src/worker/eagle-library.ts)、[billfish-library](../../src/worker/billfish-library.ts)、Worker import 路径 | 源码对照，未重跑本轮真实外部库 UI |
| 外部 ZIP 空间预检与清理、删库后重导同 ZIP 的读屏障释放 | [Main](../../src/main/index.ts)、[Worker](../../src/worker/library-service.ts) 的导入/关闭/产物生命周期 | 源码对照，重导 ZIP/低磁盘空间待验收 |
| 媒体内存/可见波次、单源查看器、播放/缩放/FBX 诊断 | [metadata-read-controller](../../src/renderer/metadata-read-controller.ts)、[查看器策略](../../src/renderer/viewer-preview-policy.ts)、Worker 媒体分支 | 控制器与策略专项通过；资源预算、进度条 Space、全屏闲置控件和 FBX 端到端未全部运行 |
| NAS/SMB、Windows 成品大库持续验证限制 | [既有阶段 A](../architecture/2026-10-08-stage-a/README.md)、[历史后续清单](../plans/follow-up-fixes.md) | 本轮同样未完成这些平台门禁，不用单元通过替代 |

### 3.2 [Serpent 0.2.0](https://github.com/dolag233/Serpent/releases/tag/v0.2.0)

| 修复/可靠性主题 | 本地入口与本轮证据 | 结论 |
| --- | --- | --- |
| 本地库工作不再用统一 Worker 截止时间 | [worker-client](../../src/main/worker-client.ts) `requestTimeoutForCommand`：导入/刷新/同步等不设限，普通读请求仍 15s、搜索 60s | **部分不同策略**；未构造真实排队超过截止时间的失败，本轮不列确认缺陷 |
| 去掉内容读写 32 MiB 策略上限、插件分块 | [Worker](../../src/worker/library-service.ts) `CONTENT_REPLACE_MAX_BYTES=32MiB`，分块仍检查总量；上游新增的放宽不同 | 明确能力/策略差异；不是所有大文件导入都有 32MiB 限制 |
| 指纹优先去重、取消复制/批量删除和真实进度 | Worker staged import 与 operation/task 管线；本轮 source stability/pending lifecycle | 导入一致性专项通过；进度显示、取消实际大规模磁盘删除待 UI/压力验收 |
| 托管/链接统一忽略语法与持久化即时应用 | Worker `parseGitignore/syncGitignore` 及 linked reconcile | 已有实现；空目录/取消规则后重现的完全行为待验收，不能认定全等于上游 |
| Windows 粘贴图片、插件写回和对话框 | [Main](../../src/main/index.ts) clipboard ingestion；插件 content/writeback 路径 | 源码对照，未与真实 Windows 剪贴板/插件联测 |
| 媒体超时、主题过滤、后退/首次恢复 | 预览策略、session restore、theme filter 路径 | 部分相关单元通过；泛化可靠性不能计作特定修复 |

### 3.3 [Serpent 0.2.1](https://github.com/dolag233/Serpent/releases/tag/v0.2.1)

| 修复/可靠性主题 | 本地入口与本轮证据 | 结论 |
| --- | --- | --- |
| 路径变更远端 MOVE；同步轮询设置保留 | [sync-plan](../../src/worker/sync/sync-plan.ts)、sync runner；sync 绑定另属设置 | **U05：只改路径无动作**；轮询设置没有单独复现失败 |
| 链接递归浏览超过首批 100 | [App](../../src/renderer/App.tsx) load-more，browse pagination；linked 相关测试 | 分页生命周期专项通过；本轮没新建 100+ 链接文件做 UI 末项验收 |
| 冲突/重复决策不被导入遮罩挡住，快速连点不重复 resolve | [ImportConflictDialogShell](../../src/renderer/ImportConflictDialogShell.tsx)、App import/ref、pending lifecycle/source stability | 防重入和待处理生命周期专项通过；完整双击 UI 与遮罩层级待 E2E |
| 插件状态损坏不锁死启动、安装错误可读 | [plugin-package-manager](../../src/main/plugin-package-manager.ts)、启动插件恢复流程 | 源码对照，未运行坏状态夹具/启动验收 |
| 打开库可取消；原生文件选择器关闭后焦点恢复 | Main library.open 与 window/input capture | 源码对照，原生焦点/取消开库未实机验证 |
| 框选不能误接管滚动条，错误浮层高于设置 | [样式](../../src/renderer/styles.css)、画布框选 handler | 源码对照，未本轮鼠标拖动/视觉验收 |
| Windows 插件安装 ZIP/目录分开 | [插件界面](../../src/renderer/PluginSettingsPage.tsx) 与 Main picker 路径 | 源码对照/界面差异，未对原生选择器逐步验收 |

### 3.4 [Serpent 0.2.3](https://github.com/dolag233/Serpent/releases/tag/v0.2.3)

| 修复/可靠性主题 | 本地入口与本轮证据 | 结论 |
| --- | --- | --- |
| 网络库切走卡住、遮罩不退 | [Main](../../src/main/index.ts)、Worker close/open、Renderer session fencing | 相关协调单元通过；NAS 切换本轮未复现，不判已修复或仍坏 |
| 点击文件夹被吞、内容不切；侧栏目录/合集/数量缺失 | [App](../../src/renderer/App.tsx)、[NavigationSidebar](../../src/renderer/NavigationSidebar.tsx)、[读协调器](../../src/renderer/metadata-read-controller.ts) | 部分生命周期专项通过；具体 UI 触发条件待实机 |
| Inspector 错误“文件丢失”状态 | [InspectorPanel](../../src/renderer/InspectorPanel.tsx)、availability/relink 路径 | 源码对照；未证明所有缺失判断准确；历史重链失败不能据此取消 |
| 外点误关模态 | [DialogShell/模式目录](../../src/renderer/ui/patterns)、模态焦点 seam | 源码对照，需按具体模态分别验收 |
| 无效拖放目标高亮/提示；批量改名与插件卸载交互 | [asset-drag-drop](../../src/renderer/asset-drag-drop.ts)、[插件界面](../../src/renderer/PluginSettingsPage.tsx) | 拖放判定专项通过；批量改名/卸载未做真实插件 E2E |
| 同步移动残留远端空目录、标签与树不刷新 | sync planner/runner 和 App sync completion | **U05 的漏路径动作已确认**；空目录清理和标签刷新是另需验收的表现，不计新增问题数 |
| 同 ID 多路径不误认为库损坏、不删最近项 | Worker open/registry 与 Main recent library | 源码对照，网络别名/复制库冲突未构造本轮实验 |
| 前台切换、大图解码不挡操作、几何预定位/滚动不抖 | browse window/layout、[预览](../../src/renderer/zoomable-preview-image.tsx)、foreground coordination | 相关单元通过；真实卡片响应时延未与上游同机比较 |
| 色卡回填更快；后台任务状态读取不堆积 | Worker palette/background queue；App coalescing polling | 源码对照；不能由去重/节流实现推出同等速度或零饥饿 |

### 3.5 [Serpent 0.2.4](https://github.com/dolag233/Serpent/releases/tag/v0.2.4)

| 修复/可靠性主题 | 本地入口与本轮证据 | 结论 |
| --- | --- | --- |
| 链接移除只删引用，源文件保持 | [use-folder-delete-actions](../../src/renderer/use-folder-delete-actions.ts) → Worker subtree delete | **U01**；单独 `removeLinkedFolder` 安全正对照通过，勿混为同一个入口 |
| 本地暂时缺失不传播远端删除 | 真实 snapshot → port → engine/runner，内存网络 | **U02**；已执行远端删除，而非仅理论风险 |
| 无像素信息卡片不多留空白 | [样式](../../src/renderer/styles.css)、卡片/layout geometry | 源码对照，未本轮跨类型截图测量 |
| 关闭查看器保留画布位置 | App preview close/session、browse scroll restoration | 相关 browse/preview 单元通过；真实浏览位置 E2E 未重跑 |
| 前台优先、任务即时读、链接不一次排全库缩略图、RAW 回填完成即停 | [阶段 A](../architecture/2026-10-08-stage-a/README.md)、Worker scheduling、Renderer polling | 部分控制器/窗口专项通过；队列规模与长期 RAW 停扫待压力验收 |

### 3.6 [Serpent 0.2.5](https://github.com/dolag233/Serpent/releases/tag/v0.2.5)

| 修复/可靠性主题 | 本地入口与本轮证据 | 结论 |
| --- | --- | --- |
| 导入结束不残留遮罩；不可取消的链接导入可隐藏 | App import progress/ref/finally 与 pending import | 终结状态单元/Worker 专项通过；隐藏/Esc/UI 层级待验收 |
| 左右换视频自动播放，同时尊重手动暂停 | [AssetPreviewModal](../../src/renderer/AssetPreviewModal.tsx)、video preview state | 源码对照，未本轮多视频实际播放与手动暂停复现 |
| 快速回到图片仍升级清晰原图 | [zoomable-preview-image](../../src/renderer/zoomable-preview-image.tsx)、preview cache/policy | 已有单源/占位升级逻辑；快速来回的真实图片解码 UI 待验收 |
| 文件名不再强制贴图通道染色 | AssetPreviewModal → [pbr-texture-channel](../../src/renderer/pbr-texture-channel.ts) → CSS filter | **U07**：普通文件名触发灰度 |
| AI 拒绝应有可辨识原因 | AI errors/reasons、[搜索规划器](../../src/main/ai-search-planner.ts) | 搜索计划拒绝/错误分类专项通过；具体供应商分析响应待验收 |

### 3.7 [Serpent 0.2.6](https://github.com/dolag233/Serpent/releases/tag/v0.2.6)

| 修复/可靠性主题 | 本地入口与本轮证据 | 结论 |
| --- | --- | --- |
| 文本格式过滤不能抛内部错误 | [format presets](../../src/renderer/format-filter-presets.ts)、filter schema、Worker query | 文本预设/契约专项通过；未本轮整页执行所有文本组合过滤 |
| 灰度不误当红色，灰色可独立筛选 | [color-filter-presets](../../src/shared/color-filter-presets.ts) → 真实 SQLite | **U03**；灰色桶存在，但彩色分支缺少中性排除 |
| 查看器开着切工作区标签再回来不能错视图 | Super 的 browser session/preview，而非上游 workspace-tab 状态机 | 触发前提不同；本地没有上游对应完整工作区标签能力，不冒充修复了该新功能 Bug |
| 识别 GBK 等旧编码 | Worker `readTextAsset` | **U06**；UTF-8 正对照通过 |
| 取消是普通通知，不是红色失败 | cancellation/errors 与各 UI 操作 catch | 各入口分散；未逐一复现全部取消路径，待验收 |
| 对账/监视/恢复不能自动将连号图成组 | Worker `refreshManagedAssets → createDetectedImageSequences` | **U08**；对账实际复现，恢复调用仅源码追踪 |
| 文本保存/关闭图标、侧键不被输入框截住；返回仍保格式条件 | [AssetPreviewModal](../../src/renderer/AssetPreviewModal.tsx)、navigation/input policy | 源码对照，侧键与文本框焦点待 UI 验收 |
| 代理播放提示关闭后不重复 | AssetPreviewModal/proxy hint lifecycle | 源码对照，未构造本轮关闭提示与重复通知实验 |
| 长浏览视口补图、中键拖移/全部展开、类型分类 | browse/window、viewer pan、sidebar/filter preset | 相关分页/预设专项通过；原生中键和展开大树未运行本轮 E2E |

### 3.8 [Serpent 0.2.7](https://github.com/dolag233/Serpent/releases/tag/v0.2.7)

| 修复/可靠性主题 | 本地入口与本轮证据 | 结论 |
| --- | --- | --- |
| 普通/链接忽略规则一致，空目录立即消失/重现 | Worker Git-ignore 与 sidebar tree materialization | 已有同类实现；空目录/反向恢复即时性待专项实机验证 |
| 乱序在滚动/布局里生效 | [client-shuffle](../../src/renderer/client-shuffle.ts)、App 对资产和 layout 都应用 seed | 3 个专项通过，包括 layout 同序；不同加载量/长滚动整体体验仍待压力验收 |
| 长期运行库持续可写 | [library-write-coordinator](../../src/worker/library-write-coordinator.ts)、writer heartbeat/fence | 未运行长时与停顿/租约失效实验；严格 fence 本身不是 Bug，不凭 15s 常量下结论 |
| AI/媒体大积压仍推进且进度准确 | Worker queue、App AI job状态；阶段 A 读协调 | 源码对照，真实大 backlog/供应商/资源压力未验收；不能认定“已全部优化” |

### 3.9 [Serpent 0.2.8](https://github.com/dolag233/Serpent/releases/tag/v0.2.8)

| 修复主题 | 本地入口与本轮证据 | 结论 |
| --- | --- | --- |
| 坏尺寸照片不能使文件夹读取失败，改用真实帧尺寸 | normalize/persistRawImageMetadata、summary/layout 投影、Zod | **部分防护 + U04**：零已防，正数小数仍使列表协议失败；未复现上游原照片与完整 UI |
| 内部拖动不误开导入提示，并可拖到其他目录 | [asset-drag-drop](../../src/renderer/asset-drag-drop.ts)、App 内部 MIME 判定 | 拖放判定 13 个单元通过；遮罩/同页拖动实际窗口仍待 E2E |

### 3.10 [Serpent 0.2.9](https://github.com/dolag233/Serpent/releases/tag/v0.2.9)

| 修复主题 | 本地入口与本轮证据 | 结论 |
| --- | --- | --- |
| 硬盘删除确认随深浅主题、应用内展示、Enter 行为 | [Main](../../src/main/index.ts) `confirmCriticalRendererRequest`、critical confirmation window | 已有主题内独立确认路径；原生确认窗口与 Enter 默认动作本轮未运行验收，**不是没有确认** |
| 导入不能清空已经显示的缩略图 | App background reconciliation；[布局预览](../../src/renderer/BrowseLayoutPreview.tsx) | 相关后台协调/布局预览专项通过；真实导入时跨帧闪白未新拍 UI |
| macOS 无法打开主窗口 | main/bootstrap、forge/package 平台配置 | 本发行交付 Windows；没有本轮 macOS 机器/产物验收，既不确认 macOS 仍坏也不宣称已修复 |

### 3.11 泛化条目处理

上述发行中的“若干 UI/稳定性/错误提示优化”、未给触发条件的“合集/插件交互回归”等只可标为**描述不足**。它们已作为不确定性保留，不能拆成虚构问题、拿局部单测盖章或计入 8 项真实清单。

## 4. 新能力差异：不是缺陷数量

| 上游新增方向 | Super Lib 当前比较 | 证据/边界 |
| --- | --- | --- |
| 0.1.5 虚拟化/会话/几何、单源预览 | 已有同类方案及阶段 A 后续收口 | 双方都有，不是 Super 独有；没有本轮同机性能胜负结果 |
| 0.1.5 JFIF、0.2.5 AVIF | 本地媒体注册没有对应原生预览入口 | 对照双方 `media-formats.ts` 与 Worker detect 类型；作为能力缺口，不说所有扩展名文件无法导入 |
| 0.2.0 官方插件目录、一方转换器、0.2.1 一方批量改名器 | 既有插件/Host/脚本架构不等于官方目录已部署 | Super 官方目录在历史范围中暂停；不在本轮启用 ECS 或补插件 |
| 0.2.0 文件夹排序/封面/历史、四档字体与重开上次库 | 本地具有多项同类功能 | 不列独有，具体排序/提示差异不从发行标题推断 |
| 0.2.1 AI 生成筛选、坏源文件逐项跳过 | AI“已分析”不等于内容“AI 生成”；坏源处理见 staged import | 语义必须分别核对，不把近似名称认作同功能 |
| 0.2.3 独立工作区标签与各自历史 | 本地 browser session 不等于多标签工作区 | 当前缺少对应完整能力；由上游 workspace tab 模块/API 确认区别 |
| 0.2.3 同步 AI 标签/描述、5s 自动上传与状态图标 | 本地 sync port 只有内容字段，metadataVersion 字段存在不等于元数据内容已传输 | 上游 sync metadata actions 另有实现；本轮不将新增功能写为原功能损坏 |
| 0.2.4 Emoji/装饰图形与颜色、合集排序/根级拖放 | Super 已有 Emoji 图标；上游有更完整 icon/glyph/color 外观 | Emoji 非独有；不把 Super 较少的样式说成更强 |
| 0.2.5 音频嵌入封面、hover scrub、应用 F11 全屏 | 本地音频派生/预览不等于上游新增封面策略 | 声音可播不是封面已支持；实际逐项媒体体验仍待运行验收 |
| 0.2.6 字体文件预览与字体分类 | 本地没有同等 font asset/viewer 注册 | 是字体资产预览缺口，不是 Super 四档“界面字体”缺失 |
| 0.2.6 批量文件夹操作、跳到所在目录、手动序列和导入预览 | 本地多项已有相近入口，但序列后台自动成组仍有 U08 | 批量/序列非独有，不能只读历史需求判全等 |
| 0.2.6 任意颜色+相似度、文本折行 | 本地颜色预设不等于任意取色相似度；文本部分已有本地预览 | 没有 custom-color 相似度实现；预设色多不等于匹配质量更好 |
| 0.2.7 忽略预览、内嵌信息、搜索历史、0.25–4 倍速 | 本地 RAW/视频元数据及搜索能力有部分重叠 | 不能当作 Super 独有；不宣称已完整补齐忽略预览/所有内嵌格式 |
| 0.2.8/0.2.9 文件夹详细 Inspector | 本地文件夹侧面板/组织数据不自动等于全部封面/字节/子目录字段 | 源码对照，功能细节差异保留 |
| 0.2.9 FLV、GIF 视频控件、逆转及图片写回、逗号多标签、音频偏好、侧栏名称搜索、4K 最大缩放 | 本地 FLV 注册缺失；其余按入口分别对照，未做全套界面验收 | 不把 GIF 能显示/浏览能搜索误认作全套新能力已存在 |

## 5. 测试执行与可重跑证据

机器：Windows x64；Node 24.15.0；Electron 43.1.0；Vitest 4.1.10。原生数据库通过仓库 Electron 测试包装器运行，未修改 native ABI、未安装/替换用户正在运行的软件。

| 本轮执行 | 结果 | 口径 |
| --- | --- | --- |
| 独立审计配置 | 8 FAIL、2 PASS、0 跳过，退出 1 | 8 个正确行为断言仍失败，逐个对应 U01—U08 |
| 导入/链接/后台/颜色/RAW/乱序专项 | 99 PASS、0 FAIL | 9 文件，其中没有新缺陷审计用例 |
| 分页/预览/拖放/筛选/更新等专项 | 179 PASS、0 FAIL | 23 文件 |
| 两组常规专项合并 | 278 次通过执行，**277 个去重用例** | `import-confirmation-dialog.test.ts` 的一个用例两组重复，不重复冒充新增覆盖 |
| 静态/文档检查 | `npm run typecheck`、审计文件 ESLint、`git diff --check` 通过；文档工具 5 项通过 | 本轮明确范围，不等于全量应用回归 |
| 文档本地引用 | 142 份 Markdown、567 处引用，0 断链 | 显式包含新历史与三份审计文档；公开远端链接不是逐页浏览验收 |

精简且不含私人路径/堆栈的执行索引见 [audit evidence JSON](serpent-followup-audit-evidence-2026-10-09.json)，保留命令、文件列表与状态；临时原始 JSON 放在本机忽略的 `tmp/`，公开仓库不依赖其存续。

审计重跑命令见未修复清单。常规专项均使用：

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts <evidence JSON 中相应 tests 文件列表>
```

没有本轮全量回归、真实 2 万项冷库/SMB/NAS/长期运行、macOS 成品、外部 AI 服务或真实 WebDAV 的综合结果。下表保留这些限制，不因文档推送而关闭。

## 6. 待验收事项（不计入确认未修复的 8 项）

| 组 | 需要补的真实实验 | 为什么尚不能作结论 |
| --- | --- | --- |
| R01 本地 RPC 截止与大积压 | 冷库/慢盘让合法操作排队超过 15/60s，核对 Main 超时与 Worker 实际完成一致性 | 常量及策略差异能确认，真实负载的可归因失败尚未运行 |
| R02 忽略规则 | 托管/链接空目录、规则编辑/撤回、保存后立刻显示/隐藏、搜索与对账一致 | 已有 Git 语法不保证树 materialization 正确 |
| R03 长期写租约 | 主动延迟/休眠恢复、写 lease 续约、与另一个写者 fencing 分别验证 | 不能把正确拒绝过期写者误判为 Bug |
| R04 NAS/媒体资源性能 | 切库、大图解码、大 backlog、RAW 回填停止、真实峰值内存与时延 | 本轮只做隔离逻辑专项，没有硬件同机基准 |
| R05 模态/焦点/进度/错误通知 | 原生文件选择器返回焦点，重复确认/取消，标题栏重叠，批量删除/同步刷新 | 历史修复与单元契约不是当前 UI 实机通过 |
| R06 外部 ZIP 与插件 | 低磁盘预检、删库重导同 ZIP、坏插件状态启动、写回/卸载/Host 焦点 | 本轮不操作真实外部库和第三方插件 |
| R07 多媒体实际交互 | 代理容器、返回原图、左右视频播放、代理提示、控件隐藏、PBR 真实图、字体/音频偏好差异 | 本轮没有真实完整媒体/视觉回归 |
| R08 平台与数据恢复 | macOS 打包启动、历史重链/崩溃恢复失败、同 ID 库别名 | 缺少本轮完整跨平台/原始错误重现证据；历史清单仍独立存在 |

## 7. 本轮实际变更与交付边界

新增两份清单、本审计报告、脱敏执行索引、独立审计测试和配置；README 与文档目录增加入口，历史决策文档追加本次证据口径。一起提交此前已存在的 MIT 许可元数据、版权与借鉴说明，不覆盖其余用户修改。

产品 `src/`、依赖版本、数据库 schema、应用版本号不变。**推送 Git 提交不表示这 8 项被修好了，也不表示新安装包已发布。** 后续若用户要求修复，应先处理 U01/U02，再以保持原功能的回归作为每组收口条件。
