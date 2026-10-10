# Super Lib 的差异化能力：相对 Serpent 0.1.4 / 0.2.9

> 后续实施状态见[软件本体补齐结果](completion-results-2026-10-10.md)。本页历史复现/上游固定版本事实保留，不因修复反向改写。

> 状态补充（2026-10-10）：正文保留原审计时点，不代表当前源码仍有全部原缺口。U01–U08 已在[阶段 1](followup-phase1-results-2026-10-09.md)修复；本轮 F01 及图标/拖放部分已在[本地升级首批](local-upgrades-results-2026-10-10.md)实施。README 下方为当前源码对照表；未打包发行。

> 截止 2026-10-09，本地 Super Lib 2.3.17 / `fcf074d`。**不是“Super 各方面都胜过 Serpent”的宣传表。** 先检查 0.1.4 分叉起点，再检查当前 0.2.9；仅相对起点新增、而上游也已有的能力不列为独有。

证据基准与完整修复对照见[审计报告](serpent-followup-audit-2026-10-09.md)。同时必须阅读[8 项真实未修复清单](../plans/confirmed-unfixed-2026-10-09.md)：有差异化功能不等于数据安全/性能问题都已解决。

“上游未有”只指本轮取得的 **dolag233/Serpent 0.2.9 发布源码内置入口与管线**，不覆盖第三方插件、未发行分支、后续版本或其他 fork。这里不安装/运行上游，不给未经同机实测的速度/内存百分比。

## 1. 可确认的内置能力或工程增强

| ID | Super Lib 增强 | 本地真实实现 | Serpent 0.1.4 / 当前 0.2.9 对照 | 更强的具体维度与限制 |
| --- | --- | --- | --- | --- |
| D01 | 图片与 PDF 独立置顶悬浮参考窗 | [Main](../../src/main/index.ts) `openFloatingPreview`、`BrowserWindow(alwaysOnTop:true)`、成功展示后最小化主窗；[独立 Renderer](../../src/renderer/floating-preview.tsx)、[协议](../../src/shared/floating-preview.ts) | 两个版本未有同等 floating-preview IPC/独立窗口管线；上游查看器的浮动工具条不是独立参考窗 | 可在其他软件上方持续看参考图/PDF；不是所有资产均可悬浮，也不宣称本轮真实多屏/透明窗验收 |
| D02 | 按精确来源版本选择小体积 delta，保留 20 个来源，失败回退完整包 | [更新服务](../../src/main/app-update-service.ts) `deltas/fromVersion`、回退；[生成器](../../scripts/release/build-inno-delta.mjs)、[20 来源保留策略](../../scripts/release/update-retention-policy.mjs) | 上游 [app-update-service](https://github.com/dolag233/Serpent/blob/f58701a6c06a41c075ef8fe8c6f48b7a6305f498/src/main/app-update-service.ts) 使用 GitHub 完整资产选择，没有来源版本 delta 清单与这一生成/保留管线 | 小改动可少下载；仅精确来源命中的文件级差分，不是任意旧版二进制补丁。未命中/校验失败走完整包，当前云端可达性本轮未验收 |
| D03 | 更新完成原生提示后自动打开软件，异常可重试，延期包启动前复核 | [共享 Inno UI](../../assets/inno/silent-update-ui.iss) 的完成态/1s 自动启动、原用户启动；[pending update](../../src/main/pending-app-update.ts)、更新 launcher/receipt 完整性 | 上游 [安装器](https://github.com/dolag233/Serpent/blob/f58701a6c06a41c075ef8fe8c6f48b7a6305f498/assets/inno/serpentsetup.iss) 为标准 `postinstall skipifsilent` Run 入口，没有这套自定义完成态与自动/重试 receipt 管线 | 针对本对话“进度结束仍需手点”的闭环；不是上游不能安装/启动。完成/失败/延期/过期来源由专项契约覆盖，真实安装本轮未执行 |
| D04 | 文件夹粒度、默认关闭的自动 AI 分析开关 | [API](../../src/shared/library-api.ts) `setFolderAutoAiAnalysis`；[Worker](../../src/worker/library-service.ts) managed/linked `auto_ai_analysis` 与增量排队；App/sidebar 入口 | 上游有自动分析、队列和 suppression，但未有同等文件夹字段/控制 API；不能据此说上游没有 AI | 以目录为边界明确选择分析范围，减少不必要请求；不承诺所有子级继承/大队列性能已本轮验收，不是免费提供 AI 服务 |
| D05 | 文件夹批量 AI 结果审核，以及单项重分析新旧结果显式取舍 | [AiBatchReviewDialog](../../src/renderer/AiBatchReviewDialog.tsx) 分成功/失败/跳过/取消；[InspectorPanel](../../src/renderer/InspectorPanel.tsx) `onResolveReanalysis` 的采用新结果/保留旧结果；App 结果处理 | 上游有 AI 搜索、已有内容跳过和后台任务进度，但未有同等批次审核界面/这组用户取舍入口 | 让 AI 结果采用与队列进度区分开；没有把新结果自动盖住旧结果的承诺。历史 C108 的实际需求可回查；本轮未调用真实供应商，不将历史成功视作今日网络验收 |
| D06 | SolidWorks 原生扩展的专门识别/筛选与格式缩略图策略 | [media-formats](../../src/shared/media-formats.ts) `.sldprt/.sldasm/.slddrw`、`isSolidWorksExtension`；[媒体注册测试](../../tests/unit/media-formats.test.ts) | 0.1.4 与 0.2.9 的媒体注册/内置路径没有同等专门 SolidWorks 分类 | 避免把这些文件当 WebGL 模型并报伪预览失败；**不是能解码原生 CAD 几何**。仍需外部应用打开；普通未知文件在上游也可被索引 |
| D09 | 构建输入来源、最终包 receipt、发布附件集合的可追溯门禁 | [build-with-provenance](../../scripts/release/build-with-provenance.mjs)、[build-provenance](../../scripts/release/build-provenance.mjs)、[专项](../../tests/unit/build-provenance.test.ts)；历史阶段 A/A1b | 上游有发布 pipeline、校验和与 release-meta，但没有本地对应输入快照→最终包 receipt→附件集合收口实现 | 是交付工程增强，不是一个新素材功能；旧包不能靠现在 HEAD 反向冒认。不是代码签名、恶意攻击沙箱或所有发布渠道实机验收。相关测试/真实包结果沿用历史记录，本轮不重新打包 |

以上都以代码入口和上游对应管线对照为依据；没有仅凭“上游搜不到文件名”就宣称整项不存在。尤其 D02/D03 对照了上游真实更新选择器和 Inno `[Run]`，D04/D05 对照了上游 AI 自动分析/进度，而不把它们整体误报为缺失。

## 2. 两项更贴近本对话需求的交互差异，而非普遍胜负

| ID | Super Lib 的具体差异 | 上游实际已有能力 | 准确表述 |
| --- | --- | --- | --- |
| D07 | [font-color-preferences](../../src/renderer/theme/font-color-preferences.ts) + `AppFontColorPicker` 提供 Auto/21 色预设、深浅主题混色适配、偏好持久化；本轮 2 个专项通过 | 上游 [ThemeColorSettings](https://github.com/dolag233/Serpent/blob/f58701a6c06a41c075ef8fe8c6f48b7a6305f498/src/renderer/theme/ThemeColorSettings.tsx) 能编辑主/次文本等主题 token | Super 多的是独立预设选择体验，**不是上游不能改文字颜色**；任意色能力甚至不宜说预设比它更强 |
| D08 | [HoverTipHost](../../src/renderer/hover-tip.tsx) 与 [styles](../../src/renderer/styles.css) 把提示放固定右下角，接入 `title` 与统一 data-hover-tip | 上游 HoverTipHost 已有延迟、portal、可访问描述，位置依附控件 rect | Super 改变显示位置与旧 title 接入，减少指针附近遮挡；**不是首创 Tooltip**。角落提示也有视线移动代价，本轮不是可用性实验 |

## 3. 必须剔除的“伪独有优势”

| 容易写错的说法 | 为什么不能写 |
| --- | --- |
| “Super 独有 AI 自然语言搜索/智能合集” | 上游当前已有 `ai-search-planner`、搜索计划/合集能力；Super 差异应限于具体审核和文件夹开关 |
| “独有深浅主题、自定义背景、四档字体” | 当前上游 theme/background/font-size 模块已有这些；D07 仅特定文字预设入口不同 |
| “Emoji 图标只有 Super 有” | Serpent 0.2.4 不仅有 Emoji，还提供装饰 glyph/颜色与标签页外观；不是 Super 的比较优势 |
| “虚拟列表、可见缩略图、单源预览只有 Super 有” | Serpent 0.1.5 起公开说明，并有当前实现；双方方案可能不同，性能高低须同机数据 |
| “本地优先、WebDAV、MCP、插件、3D/PDF 是 Super 原创” | 0.1.4 基线已有多项基础架构；保留上游版权与 MIT，不能抹去继承关系 |
| “Super 支持所有新格式，且更稳定” | 本地缺 JFIF/AVIF/字体预览/FLV 等对应注册，且本轮确认 8 个问题；不能把索引未知文件说成格式预览已支持 |
| “只要 MIT 开源就不需声明上游” | MIT 须保留版权/许可；本仓库已保留 Serpent contributors，并在两个 README 末尾附原仓库借鉴链接 |

## 4. 当前上游反而更完整的方向

- 数据安全：0.2.4 已改成默认取消链接不碰外部源，并区分“缺失”与“明确删除”；Super 仍有 U01/U02。
- 同步：路径 MOVE/本地 relocate、metadata 内容动作；本地同哈希改路径无动作，且 port 未传 AI 标签/描述内容。
- 颜色：0.2.6 有颜色相似度/任意取色及中性保护；Super 的预设匹配仍误纳灰色。
- 格式/查看器：JFIF/AVIF/FLV、字体资产预览、嵌入音频封面偏好与 GIF/旋转扩展等发布能力，不能因 Super 基础媒体路径存在而认作全部已有。
- 工作区：上游完整 workspace tabs、独立历史与侧栏名称搜索等新入口；Super browser session 不等于它。
- 边界修复：GBK 解码、文件名不强制通道变色、对账不隐式生成序列、尺寸整数/成对回退，均有本轮实际对照。

## 5. 结论及下一步

Super Lib 具有清晰的**参考窗、按版本 delta、自动完成更新、AI 使用范围与结果审核、CAD 分类、交付可追溯性**差异；文字预设与角落提示是符合这轮用户偏好的交互变体。这些可保留为优势，不需要夸大来源或假称对上游全面胜出。

合理的后续顺序是先解决真实数据安全缺陷，再修确定性显示/同步/序列边界，最后依据需求挑上游新能力；本轮只记录，不自动开始修复或移植。详细失败重跑命令与验收条件见[确认未修复清单](../plans/confirmed-unfixed-2026-10-09.md)。
