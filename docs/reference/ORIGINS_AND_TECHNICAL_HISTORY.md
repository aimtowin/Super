# Super Lib 项目来源与历史技术记录

初次整理日期：2026-10-11；当前发行入口核对：2026-10-13。Super Lib 是独立维护的本地资产管理品牌。来源署名、历史功能与性能比较集中在本文；主 README 末尾提供唯一导航入口，其他产品文档只说明 Super 自身。

当前正式产品为 **2.4.1**，实际交付见[2.4.1 发行验收](../releases/v2.4.1-validation.md)（功能同 2.4.0）；更新源已从域名改为服务器 IP 直连（`https://43.142.93.106`），本文涉及旧域名/旧 ECS 目录的记录一律按当时事实保留。操作见[使用手册](../user-guide/README.md)。下文的固定版本比较、旧标签判断、原始失败与摘录保留各自审计日期，不是 2026-10-13 对另一项目最新版本的实时核查，本轮没有重做跨产品性能测试或增加新的品牌比较。

## 阅读边界与开源许可

- 原始开源基础为 [dolag233/Serpent](https://github.com/dolag233/Serpent) **0.1.4**；感谢原作者与贡献者。Super Lib 继续以 [MIT 许可证](../../LICENSE) 开源，LICENSE 保留必要原作者版权。
- 侧栏 Emoji 分类参考 **0.2.9 / `f58701a6`** 的 `src/shared/entity-appearance.ts`。原源码注释和许可说明在本文原文摘录中保留；Super 图形复用本地 Icon，不复制远程 SVG。
- 功能比较是固定审计时点的源码与局部运行证据，不是品牌定位或全面优越性的宣传；0.2.10 比较固定源码为 **`782d4e5bcd3ee730c5e689d1e31d2769a513e180`**，Super 为 **2.3.18**。
- 未进行双方同机、同素材的性能测试。69.7→13.7 ms 是 Super 自身局部结果读取；安装器 -17.26% 是历史自身包体变化，不推导整次导入、FPS 或 RSS 的全面优势。
- 2.3.17 修复前 U01–U08 的失败及 JSON 原始哈希按原时点保留；后续已随 2.3.18 交付，详见[发行验收](../releases/v2.3.18-validation.md)。当前真实 K01（成品 Console 缺 typescript）仍见[已知问题](known-issues-2.3.18.md)，未因本次收敛被隐藏或修复。

## 收录范围与原文保全

下文收录原四份专门说明、原八项问题快照、中英文 README 对比段、三份机器证据，以及其他文件中被移出或中性化的原始段落。原文来自整理前提交 **`b992c273c9639892551518216b10dfd8c8dc0b37`**，各项附原 Git blob ID，可在历史提交恢复。2026-10-11 按用户要求移除第一份记录中单独的“实际差距”表，替换为 Super 自身的源码升级与验收记录；其他历史摘录不反向改写。历史版本的缺失结论不代表这轮已升级源码，源码通过也不代表已发布安装包。

可读正文仅调整标题层级和相对链接：被删除文件的链接指向本文内对应记录；保留文件的链接指向现有路径。原始 JSON、摘录正文及旧命令保留在代码块中，均是历史记录，不自动成为当前运行指令。原命令中的审计配置现已更名为 `vitest.history-audit.config.ts`，测试为 `tests/audit/library-safety-audit.test.ts`；数据安全断言与执行逻辑不变。

## 内容目录

1. [Super Lib 2.3.18 与 Serpent 0.2.10：功能及交付对照](#record-1)
2. [Serpent 0.1.4 之后的修复：Super Lib 对照审计](#record-2)
3. [Super Lib 的差异化能力：相对 Serpent 0.1.4 / 0.2.9](#record-3)
4. [Super Lib 性能证据与对照方法](#record-4)
5. [原始八项缺陷及对应版本节点](#record-5)
6. [README.md 原功能 / 性能表与借鉴说明](#record-6)
7. [README.en.md 原功能 / 性能表与借鉴说明](#record-7)
8. [serpent-followup-audit-evidence-2026-10-09.json — 原始证据](#record-8)
9. [followup-phase1-evidence-2026-10-09.json — 原始证据](#record-9)
10. [local-upgrades-evidence-2026-10-10.json — 原始证据](#record-10)
11. [THIRD_PARTY_NOTICES.md — 移出或中性化前的原始段落](#record-11)
12. [docs/POST_DEVELOPMENT_DECISIONS.md — 移出或中性化前的原始段落](#record-12)
13. [docs/README.md — 移出或中性化前的原始段落](#record-13)
14. [docs/assets/ui/screenshot-audit-2.2.8.md — 移出或中性化前的原始段落](#record-14)
15. [docs/plans/2026-10-07-architecture-optimization.md — 移出或中性化前的原始段落](#record-15)
16. [docs/plans/2026-10-07-architecture-stage-a-decisions.md — 移出或中性化前的原始段落](#record-16)
17. [docs/plans/2026-10-09-followup-upgrade-design.md — 移出或中性化前的原始段落](#record-17)
18. [docs/plans/2026-10-09-followup-upgrades.md — 移出或中性化前的原始段落](#record-18)
19. [docs/plans/2026-10-10-completion-and-release.md — 移出或中性化前的原始段落](#record-19)
20. [docs/plans/2026-10-10-local-upgrades.md — 移出或中性化前的原始段落](#record-20)
21. [docs/reference/completion-results-2026-10-10.md — 移出或中性化前的原始段落](#record-21)
22. [docs/reference/documentation-inventory-2.3.18.md — 移出或中性化前的原始段落](#record-22)
23. [docs/reference/documentation-review-2.3.18.md — 移出或中性化前的原始段落](#record-23)
24. [docs/reference/followup-phase1-results-2026-10-09.md — 移出或中性化前的原始段落](#record-24)
25. [docs/reference/known-issues-2.3.18.md — 移出或中性化前的原始段落](#record-25)
26. [docs/reference/local-upgrades-results-2026-10-10.md — 移出或中性化前的原始段落](#record-26)
27. [docs/releases/v2.3.18-validation.md — 移出或中性化前的原始段落](#record-27)
28. [docs/user-guide/README.en.md — 移出或中性化前的原始段落](#record-28)
29. [docs/user-guide/README.md — 移出或中性化前的原始段落](#record-29)
30. [docs/user-guide/features.md — 移出或中性化前的原始段落](#record-30)
31. [src/renderer/sidebar-appearance-catalog.ts — 移出或中性化前的原始段落](#record-31)
32. [tests/audit/serpent-followup.test.ts — 移出或中性化前的原始段落](#record-32)
33. [vitest.serpent-audit.config.ts — 移出或中性化前的原始段落](#record-33)

<a id="record-1"></a>

## 1. Super Lib 2.3.18 与 Serpent 0.2.10：功能及交付对照

原文件：`docs/reference/comparison-2.3.18-serpent-0.2.10.md`；Git blob：`6956a81a5f0770252180c11d3899efb6eca2086d`。除下方替换后的 Super 升级记录外，正文按原审计时点保留；原表可从上述 Git blob 恢复。

### Super Lib 2.3.18 与 Serpent 0.2.10：功能及交付对照

核对日期：2026-10-10。Super 从 Serpent **0.1.4** 接力开发，继续采用 [MIT](../../LICENSE)。本表对照 Super 已发行 `v2.3.18`（源码 `f5b0303`）和 Serpent 已发行 `v0.2.10`（源码 `782d4e5bcd3ee730c5e689d1e31d2769a513e180`）。本次读取上游发行说明、固定标签源码和 0.2.9→0.2.10 的变更；没有运行上游安装包。

依据：[Serpent 0.2.10 发行说明](https://github.com/dolag233/Serpent/releases/tag/v0.2.10)、[固定版本变更](https://github.com/dolag233/Serpent/compare/v0.2.9...v0.2.10)、[Super 成品验收](../releases/v2.3.18-validation.md)、[真实开发决策](../POST_DEVELOPMENT_DECISIONS.md)。旧 [0.1.4→0.2.9 审计](#record-2)继续作为历史证据。

复核期间，上游同名 0.2.10 标签从早先取得的 `1aaa8ede` 更新为 `782d4e5b`，发行时间为 2026-10-10T12:17:03Z。本表采用重新获取后的提交；两次快照间仅文本/ZIP 状态重置和迁移校验测试修订，已检查差异，下面的能力结论不变。复查时应使用提交链接锁定源码，而非假设标签永不变化：[当前固定源码](https://github.com/dolag233/Serpent/tree/782d4e5bcd3ee730c5e689d1e31d2769a513e180)。

### 共同基础和各自的扩展

“上游未见”仅指上述固定标签的内置源码，不涵盖插件、其他分支或未来版本。“已有”表示存在对应入口和管线，不表示所有文件、平台和外部服务均已验收。

| 功能 | Serpent 0.2.10 | Super 2.3.18 | 实际结论及边界 |
| --- | --- | --- | --- |
| 本地库、标签、合集、智能合集、WebDAV、AI、插件/MCP | 已有 | 已有并扩展 | 共同基础，不作为 Super 独有优势；真实第三方服务仍依赖配置和专项验证 |
| 分类 Emoji、图形、颜色 | 已有更广的外观能力 | 11 类、200+ Emoji；24 图形、8 色；旧偏好兼容 | Super 文件夹、合集、智能合集均可设置；本机偏好不随 WebDAV 库同步 |
| JFIF/AVIF/FLV、音频封面、GIF 控制、字体预览 | 已有相关能力 | 已补齐对应本体入口 | Super 有解码预算和降级；字体卡片是通用图标，TTC 预览首个字体，不是系统字体安装 |
| 任意颜色过滤 | 已有 | HEX 与 0–100 容差、包含/排除 | Super 使用周期 HSL 匹配；容差不是严格视觉色差标准 |
| 工作区、检索和目录信息 | 已有相关能力 | 最多 6 个会话工作区、侧栏过滤排序、搜索历史、索引目录统计、批量建目录 | 工作区不跨重启保存；目录统计基于库索引，可能落后于磁盘变化 |
| AI 生成信息 | 已有相关读取 | 有界读取 PNG 内嵌 SD/ComfyUI 信息 | 生成信息标记、AI 分析状态、来源判断是不同概念，缺少标记不证明人工创作 |
| 链接源保护、缺失与删除区分 | 已有 | U01/U02 等已修复，显式删除意图与源保护 | 原缺陷见历史清单；同步仍不是备份，离线盘/NAS 的真实多写者场景未完全验收 |
| 人工/AI 元数据同步 | 已有相关后续能力 | 独立版本、三路合并、提交冲突检查与取消 | 本地及模拟双设备验证不能替代真实服务器全部场景 |
| 明确图片写回 | 已有相关编辑能力 | 托管静态图片显式确认、备份原字节、原子替换及撤销 | 32 MiB/16M 像素限制；不把查看器旋转自动当成磁盘写入，不是整库事务 |
| 子项拖到直接父项 | 有层级管理 | 提升一级；顶层父项对应根目录；支持撤销 | 按用户需求修正，未经相同行为运行对照不评价上游缺陷 |
| 独立悬浮参考窗 | 未见等价独立窗口管线 | 图片/PDF 置顶参考窗，成功显示后最小化主窗 | Super 的明确功能差异；视频、音频及 3D 不适用 |
| 精确版本增量更新 | GitHub 完整包更新管线 | 20 个来源直达当前版，失败回退完整包 | Super 的交付增强；来源版本不匹配时收益为零 |
| 更新完成自动启动 | 标准安装器入口 | 完成提示后自动打开，启动失败保留重试入口 | Windows 已安装版验证；便携版及其他平台不继承该结论 |
| 目录 AI 开关、分析结果审核 | 有基础 AI 与任务管理 | 目录粒度开关、批次审核、重分析结果取舍 | Super 的细分流程增强，不能写成“Serpent 没有 AI” |
| SolidWorks 分类 | 未见专门内置分类 | SLDPRT/SLDASM/SLDDRW 分类、筛选与格式缩略图 | Super 分类增强；无原生 CAD 几何查看器 |
| 发布可追溯性 | 有 pipeline/校验和 | 额外输入快照、最终包 receipt、附件集合门禁及服务器 SHA 核对 | 工程增强不等于签名或完整安全审计；仍有成品控制台缺陷，见当前已知问题 |

上述 Super 差异的源码入口见 [旧差异化证据表 D01–D09](#record-3)。0.2.9→0.2.10 的变更未引入等价的悬浮窗口、Super 增量更新、SolidWorks 分类或 Super 发布 receipt 管线；结论限定为源码检查。

### Super 查看器与资源组织升级（2026-10-11，2.3.20 Windows 成品验收）

按用户确认的近边显示方式实施；这些能力已在 2.3.20 Windows 实际成品验收，并包含后续侧栏恢复排序和独立加载修复。实际线上状态以[2.3.20 发行验收](../releases/v2.3.20-validation.md)为准，不将专项通过写成全面性能超越。原单独差距表已移除，以下说明 Super 自身的功能、保护边界和可复查验收。完整实施与原专项测试结果见[本轮升级记录](../plans/2026-10-11-viewer-and-library-upgrades.md)。

| ID | Super 升级 | 实际保护与验收范围 |
| --- | --- | --- |
| G01 | Markdown 源码／渲染切换，卡片与检查器结构预览 | 保留草稿、保存与版本冲突流程；列表、任务项、表格、代码与长文测试；禁用原始 HTML、危险链接和隐式图片加载；真实窗口编辑切换通过 |
| G02 | ZIP 成员筛选、只读文本／图片预览 | 不落盘解压，不执行 HTML；最多 5000 项、8 GiB 累计声明内容，压缩比与单成员预算；真实图片格式与含动画页的总像素预算；穿越、符号链接、加密、重复成员、损坏及 CRC 拒绝测试；选择时验证资产版本 |
| G03 | 选择库内图片作为文件夹封面，支持重置 | 封面随完整资源库数据库保存；改名保持，缺失或删除后回退自动封面；不复制或修改源图片，不宣称属于资产级 WebDAV 元数据同步 |
| G04 | 全局、可逆的缺失链接隐藏偏好 | 默认关闭；分页前过滤，选择／布局／库计数使用同一规则；托管缺失不隐藏，回收站不受影响；不修改忽略规则或恢复真正删除的记录 |
| G05 | 原生打开、导入、另存为共享最近目录 | 成功才更新，取消不覆盖；明确路径优先，另存为文件名保留；记忆持久化失败不阻断选择器；测试注入不写真实偏好 |
| G06 | 新生成视频封面优先取时长 25% 的单帧 | 真实 FFmpeg 解码验证；短片、未知时长、空输出、退出失败与异常回退测试；最多一次回退，资源不足不热重试；不批量重建旧封面、不改源视频或代理 |
| G07 | 统一近边／闲置／常显工具栏与视频细进度 | 近边默认；图片、视频、GIF、模型、文本／PDF 共用设置，焦点与键盘操作可达；通知移开顶部查看器工具栏，窄工作区控件不伸入检查器 |
| V01 | 全屏稳定宿主跨上一张／下一张保留 | 真实窗口前后切图与四种浏览范围后台刷新测试；关闭仍退出全屏，内容按资产重建，避免上一个资产的编辑／播放器状态泄漏 |
| V02 | 查看器删除只作用于当前资产，保护编辑与链接源 | Delete 走既有回收站流程，托管 Shift+Delete 保留原危险确认，链接源不开放此永久删除键；文本输入不删除；链接去重与序列保留明确确认，并修复序列在零帧按 Home 未暂停的竞态 |

本轮不处理其他已知成品问题；[2.3.18 已知问题](known-issues-2.3.18.md)仍如实保留。真实 Windows 隔离进程与专项测试是本轮验收范围，不替代 macOS、所有特殊素材或后续签名安装器验收。

### 性能结论

Super 已有可复查的自身优化与发布数据，见 [性能证据、限制与测量方案](#record-4)。没有同机、同库、同版本的 Serpent 测试结果，因此目前无法得出“速度、内存、启动或总体性能全面超越”的结论。

F15 官方插件目录、账号及社区服务继续暂停；旧 ECS 更新源的既有发布授权和上述云端功能是不同范围。

<a id="record-2"></a>

## 2. Serpent 0.1.4 之后的修复：Super Lib 对照审计

原文件：`docs/reference/serpent-followup-audit-2026-10-09.md`；Git blob：`dcda777656fd44fb0ea89c9199a4e718a2c5bf7f`。以下正文按原时点完整保留。

### Serpent 0.1.4 之后的修复：Super Lib 对照审计

> 后续实施状态见[软件本体补齐结果](completion-results-2026-10-10.md)。本页为 0.2.9 / Super 2.3.17 历史审计；当前版本对照见[Super 2.3.18 / Serpent 0.2.10](#record-1)，当前失败见[已知问题](known-issues-2.3.18.md)。原复现事实不反向改写。

> 本页保留诊断轮的授权与结果。用户随后授权分阶段修复/升级；八项确定性问题的工作区修复、验收和仍未完成项见[阶段 1 结果](followup-phase1-results-2026-10-09.md)，不要将下文旧红灯当作新源码当前状态或将新源码当作已发行安装包。

日期：2026-10-09，Asia/Shanghai。用户授权范围：读取发行说明、对照本地源码、隔离复现、整理清单、连同先前 MIT/历史文档修改推送 Git。**不修产品行为，不打包、不创建 Release、不更新 ECS。**

最重要的两份交付：

- [真实存在且仍未修复：8 项，含复现/影响/验收条件](../plans/confirmed-unfixed-2026-10-09.md)。
- [Super Lib 差异化能力：哪些确实比当前 Serpent 多，哪些不能如此宣称](#record-3)。

### 1. 三个比较基准

| 对象 | 固定基准 | 用途 |
| --- | --- | --- |
| 分叉来源 | Serpent `v0.1.4`，提交 `6aeb146c8f893a2f4be9249195c838a653bcb090` | 用户确认的起点；通过 tag 实际取源码，不从名称推断继承关系 |
| 上游当前公开版本 | Serpent `v0.2.9`，提交 `f58701a6c06a41c075ef8fe8c6f48b7a6305f498` | 判断后续修复及“上游没有”是否仍成立 |
| 本地审计源码 | Super Lib `2.3.17`，提交 `fcf074d6e771fb69394f30dcdb79d531848a51c7` | 本次实际执行的产品代码；未提交变化为文档/MIT 元数据及隔离审计文件 |

发行来源为 [GitHub Releases](https://github.com/dolag233/Serpent/releases) 的官方 API，读取 tag 对应源码；本轮网页工具连接失败、浏览器技能服务未配置，因此没有把浏览器截图当作证据。未执行上游应用或上游脚本。最新公开版本核查时点为本轮，不能推断以后不会新增发行。

0.1.4 之后 API 返回 **10 个发行节点**：0.1.5、0.2.0、0.2.1、0.2.3、0.2.4、0.2.5、0.2.6、0.2.7、0.2.8、0.2.9。0.2.3 说明 0.2.2 已撤回并纳入其内容；不另造一个不存在的公开 Release，也不把撤回版本的“严重问题”猜成具体缺陷。

固定源码入口：[0.1.4 基线](https://github.com/dolag233/Serpent/tree/6aeb146c8f893a2f4be9249195c838a653bcb090) · [0.2.9 快照](https://github.com/dolag233/Serpent/tree/f58701a6c06a41c075ef8fe8c6f48b7a6305f498)。上游下载副本在本机忽略的 `tmp/`，不会作为 vendor 或新 Git 仓库提交。

### 2. 证据等级：不能把“查到代码”写成“用户实机已通过”

| 状态 | 本文含义 |
| --- | --- |
| **Uxx 已复现** | 本地生产模块的正确行为断言失败；进入未修复清单。夹具/替身范围另列 |
| **专项通过** | 本轮指定单元/Worker 回归通过，只覆盖该测试的断言；不自动证明完整 UI/硬件/第三方服务 |
| **部分防护** | 部分路径已有保护，但同类问题还有更窄的失败路径 |
| **源码对照，待验收** | 找到相关实现/差异，但没有完成本轮可归因的实际失败复现；不计入“确认未修复” |
| **能力差异/触发前提不同** | 上游新增产品能力、策略限制或本发行平台未具备，不能直接记为旧功能 Bug |
| **描述不足** | 上游只有泛化 UI/稳定性说法，缺少可证伪的条件，不能制造精确结论 |

历史 HTML 只是决策线索。本轮核对文件为 534773 bytes、SHA-256 `058fed38f0c6da372b31dda9e04d894169d714bc79f08313181298bef297e396`；其脱敏归档见 [POST_DEVELOPMENT_DECISIONS](../POST_DEVELOPMENT_DECISIONS.md)。历史“已修复/已发布”不能代替本轮验收，历史失败也不能不经复查就累计成当前缺陷。

### 3. 逐发行修复/可靠性对照

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

### 4. 新能力差异：不是缺陷数量

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

### 5. 测试执行与可重跑证据

机器：Windows x64；Node 24.15.0；Electron 43.1.0；Vitest 4.1.10。原生数据库通过仓库 Electron 测试包装器运行，未修改 native ABI、未安装/替换用户正在运行的软件。

| 本轮执行 | 结果 | 口径 |
| --- | --- | --- |
| 独立审计配置 | 8 FAIL、2 PASS、0 跳过，退出 1 | 8 个正确行为断言仍失败，逐个对应 U01—U08 |
| 导入/链接/后台/颜色/RAW/乱序专项 | 99 PASS、0 FAIL | 9 文件，其中没有新缺陷审计用例 |
| 分页/预览/拖放/筛选/更新等专项 | 179 PASS、0 FAIL | 23 文件 |
| 两组常规专项合并 | 278 次通过执行，**277 个去重用例** | `import-confirmation-dialog.test.ts` 的一个用例两组重复，不重复冒充新增覆盖 |
| 静态/文档检查 | `npm run typecheck`、审计文件 ESLint、`git diff --check` 通过；文档工具 5 项通过 | 本轮明确范围，不等于全量应用回归 |
| 文档本地引用 | 142 份 Markdown、567 处引用，0 断链 | 显式包含新历史与三份审计文档；公开远端链接不是逐页浏览验收 |

精简且不含私人路径/堆栈的执行索引见 [audit evidence JSON](#record-8)，保留命令、文件列表与状态；临时原始 JSON 放在本机忽略的 `tmp/`，公开仓库不依赖其存续。

审计重跑命令见未修复清单。常规专项均使用：

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts <evidence JSON 中相应 tests 文件列表>
```

没有本轮全量回归、真实 2 万项冷库/SMB/NAS/长期运行、macOS 成品、外部 AI 服务或真实 WebDAV 的综合结果。下表保留这些限制，不因文档推送而关闭。

### 6. 待验收事项（不计入确认未修复的 8 项）

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

### 7. 本轮实际变更与交付边界

新增两份清单、本审计报告、脱敏执行索引、独立审计测试和配置；README 与文档目录增加入口，历史决策文档追加本次证据口径。一起提交此前已存在的 MIT 许可元数据、版权与借鉴说明，不覆盖其余用户修改。

产品 `src/`、依赖版本、数据库 schema、应用版本号不变。**推送 Git 提交不表示这 8 项被修好了，也不表示新安装包已发布。** 后续若用户要求修复，应先处理 U01/U02，再以保持原功能的回归作为每组收口条件。

<a id="record-3"></a>

## 3. Super Lib 的差异化能力：相对 Serpent 0.1.4 / 0.2.9

原文件：`docs/reference/superlib-differentiators-2026-10-09.md`；Git blob：`92e84ac8e2b5a1abd92c330cb239ce14c1882d67`。以下正文按原时点完整保留。

### Super Lib 的差异化能力：相对 Serpent 0.1.4 / 0.2.9

> 后续实施状态见[软件本体补齐结果](completion-results-2026-10-10.md)。本页历史复现/上游固定版本事实保留，不因修复反向改写。

> 状态补充（2026-10-10）：正文保留 0.2.9 / Super 2.3.17 审计时点。Super [2.3.18 已发行](../releases/v2.3.18-validation.md)，当前上游为 0.2.10；最新能力、上游新增差距和验证限制见[当前对照](#record-1)与[当前已知问题](known-issues-2.3.18.md)。下文“当前上游/本轮”均指原审计时点。

> 截止 2026-10-09，本地 Super Lib 2.3.17 / `fcf074d`。**不是“Super 各方面都胜过 Serpent”的宣传表。** 先检查 0.1.4 分叉起点，再检查当前 0.2.9；仅相对起点新增、而上游也已有的能力不列为独有。

证据基准与完整修复对照见[审计报告](#record-2)。同时必须阅读[8 项真实未修复清单](../plans/confirmed-unfixed-2026-10-09.md)：有差异化功能不等于数据安全/性能问题都已解决。

“上游未有”只指本轮取得的 **dolag233/Serpent 0.2.9 发布源码内置入口与管线**，不覆盖第三方插件、未发行分支、后续版本或其他 fork。这里不安装/运行上游，不给未经同机实测的速度/内存百分比。

### 1. 可确认的内置能力或工程增强

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

### 2. 两项更贴近本对话需求的交互差异，而非普遍胜负

| ID | Super Lib 的具体差异 | 上游实际已有能力 | 准确表述 |
| --- | --- | --- | --- |
| D07 | [font-color-preferences](../../src/renderer/theme/font-color-preferences.ts) + `AppFontColorPicker` 提供 Auto/21 色预设、深浅主题混色适配、偏好持久化；本轮 2 个专项通过 | 上游 [ThemeColorSettings](https://github.com/dolag233/Serpent/blob/f58701a6c06a41c075ef8fe8c6f48b7a6305f498/src/renderer/theme/ThemeColorSettings.tsx) 能编辑主/次文本等主题 token | Super 多的是独立预设选择体验，**不是上游不能改文字颜色**；任意色能力甚至不宜说预设比它更强 |
| D08 | [HoverTipHost](../../src/renderer/hover-tip.tsx) 与 [styles](../../src/renderer/styles.css) 把提示放固定右下角，接入 `title` 与统一 data-hover-tip | 上游 HoverTipHost 已有延迟、portal、可访问描述，位置依附控件 rect | Super 改变显示位置与旧 title 接入，减少指针附近遮挡；**不是首创 Tooltip**。角落提示也有视线移动代价，本轮不是可用性实验 |

### 3. 必须剔除的“伪独有优势”

| 容易写错的说法 | 为什么不能写 |
| --- | --- |
| “Super 独有 AI 自然语言搜索/智能合集” | 上游当前已有 `ai-search-planner`、搜索计划/合集能力；Super 差异应限于具体审核和文件夹开关 |
| “独有深浅主题、自定义背景、四档字体” | 当前上游 theme/background/font-size 模块已有这些；D07 仅特定文字预设入口不同 |
| “Emoji 图标只有 Super 有” | Serpent 0.2.4 不仅有 Emoji，还提供装饰 glyph/颜色与标签页外观；不是 Super 的比较优势 |
| “虚拟列表、可见缩略图、单源预览只有 Super 有” | Serpent 0.1.5 起公开说明，并有当前实现；双方方案可能不同，性能高低须同机数据 |
| “本地优先、WebDAV、MCP、插件、3D/PDF 是 Super 原创” | 0.1.4 基线已有多项基础架构；保留上游版权与 MIT，不能抹去继承关系 |
| “Super 支持所有新格式，且更稳定” | 本地缺 JFIF/AVIF/字体预览/FLV 等对应注册，且本轮确认 8 个问题；不能把索引未知文件说成格式预览已支持 |
| “只要 MIT 开源就不需声明上游” | MIT 须保留版权/许可；本仓库已保留 Serpent contributors，并在两个 README 末尾附原仓库借鉴链接 |

### 4. 当前上游反而更完整的方向

- 数据安全：0.2.4 已改成默认取消链接不碰外部源，并区分“缺失”与“明确删除”；Super 仍有 U01/U02。
- 同步：路径 MOVE/本地 relocate、metadata 内容动作；本地同哈希改路径无动作，且 port 未传 AI 标签/描述内容。
- 颜色：0.2.6 有颜色相似度/任意取色及中性保护；Super 的预设匹配仍误纳灰色。
- 格式/查看器：JFIF/AVIF/FLV、字体资产预览、嵌入音频封面偏好与 GIF/旋转扩展等发布能力，不能因 Super 基础媒体路径存在而认作全部已有。
- 工作区：上游完整 workspace tabs、独立历史与侧栏名称搜索等新入口；Super browser session 不等于它。
- 边界修复：GBK 解码、文件名不强制通道变色、对账不隐式生成序列、尺寸整数/成对回退，均有本轮实际对照。

### 5. 结论及下一步

Super Lib 具有清晰的**参考窗、按版本 delta、自动完成更新、AI 使用范围与结果审核、CAD 分类、交付可追溯性**差异；文字预设与角落提示是符合这轮用户偏好的交互变体。这些可保留为优势，不需要夸大来源或假称对上游全面胜出。

合理的后续顺序是先解决真实数据安全缺陷，再修确定性显示/同步/序列边界，最后依据需求挑上游新能力；本轮只记录，不自动开始修复或移植。详细失败重跑命令与验收条件见[确认未修复清单](../plans/confirmed-unfixed-2026-10-09.md)。

<a id="record-4"></a>

## 4. Super Lib 性能证据与对照方法

原文件：`docs/reference/performance-evidence.md`；Git blob：`bb8ec3e992637df208b299a48f32afb6789bcf7b`。以下正文按原时点完整保留。

### Super Lib 性能证据与对照方法

核对日期：2026-10-10，当前发行版 2.3.18。表内测量保留发生时的版本与场景。对照 [Serpent 0.2.10](#record-1)时，目前只有源码能力对照，没有同条件运行数据。

### 已有测量能说明什么

| 场景 | 已记录数据 | 可得结论 | 不能推出的结论 |
| --- | --- | --- | --- |
| 20,001 行本地夹具，导入后结果读取 | 中位数 69.7→13.7 ms；整次导入 273.7 ms | 结果读取阶段延迟降低约 80.3%，约 5.09 倍 | 整次导入五倍提速、所有机器相同收益、比 Serpent 快 |
| 100k 资产热 SQLite 查询 | 首屏 17.6 ms，关键词 35.1 ms，单字符 153.7 ms，组合过滤排序 84.9 ms | 对这些固定查询给出响应量级，宽匹配成本更高 | 冷启动、全库导入、真实 NAS 或端到端 UI 时间 |
| 1,200 文件 reconcile | 总耗时 697.5 ms；事件循环延迟 p95 14.4 ms，最大 22.5 ms | 本地夹具的任务分段改善可响应性 | 所有磁盘/网络盘扫描都小于一秒 |
| 20k 合集首屏及布局 | 首屏 35.8 ms；一个布局块 50.3 ms | 渐进加载/分块布局有局部成本证据 | 全部 20,001 项布局只要 50.3 ms |
| v2.3.7→2.3.8 安装包 | 229.83→190.15 MiB，减小 17.26%；程序文件少约 45.63 MiB | 历史包体优化 | 当前包体、运行内存或与上游的差距 |
| v2.3.17→2.3.18 精确更新 | delta 3,527,895 B / full 198,779,769 B | 此来源版本下载约为完整包 1.775%，少传约 98.225% 字节 | 安装时间同比例下降；任意来源版本都能用这个包 |

查询/布局/导入/扫描原始范围见 [第一轮性能记录](../plans/2026-10-07-performance-first-pass.md)；包体见 [2.3.8 验收](../releases/v2.3.8-validation.md)；当前增量附件及 SHA 见 [2.3.18 验收](../releases/v2.3.18-validation.md)。历史一次 renderer GC heap 约 30 MB、最多约 105 张可见卡片，不能改写成应用总 RSS 上限。

### 当前架构措施及限制

分页、虚拟列表、可见缩略图优先、有界媒体解码、延迟代理、索引统计、RPC 排队预算和文件内容分块旨在控制工作量。RPC 普通请求上限 256，普通请求入队还受累计估算载荷 128 MiB 限制；控制请求单独保留最多 16 个槽。单消息估算遍历最多 100 万节点，超过预算拒绝；控制请求有独立放行规则，所以这些数值不是应用总内存上限。显式内容分块单次最多 1 MiB。超时请求在真实处理结束/确认前继续占预算，客户端不能用不断重试绕过背压。实际条件见 `src/main/worker-request-budget.ts`。

这些限额是工程契约，不能单独证明吞吐量、帧率或稳定性比上游更好。大内容旧接口仍保留最多 32 MiB 的小文件读取方式；这不是整款软件的导入大小上限。分块调用方式见 [脚本 API](../manual/scripts/api-reference.md)。

### 后续同条件基准方案（尚未执行）

| 项目 | 固定条件 | 输出 |
| --- | --- | --- |
| 版本 | Super 2.3.18 与 Serpent 0.2.10 成品，记录 SHA、平台、CPU、RAM、SSD、DPI | 可重复的版本/环境清单 |
| 数据 | 同一份自有素材；1k/20k/100k；区分托管与链接；另设慢盘/NAS | 数量、格式、总字节、异常文件清单 |
| 查询/首屏 | 冷/热缓存分开，相同查询、过滤和排序；热场景至少 30 次 | 中位数、p95、首次可交互时间 |
| 导入/扫描 | 排除 AI 外部请求；同时记录缩略图队列完成；重复内容和目录变更单列 | 总耗时、UI 最大卡顿、失败/重试数量 |
| 查看器 | 同一大图/GIF/视频/模型，连续切换及后台通知 | 开启时间、帧率、全屏持续、内存回收 |
| 内存/CPU | Electron 主进程、renderer、Worker 和媒体子进程全部计入；静置和峰值分开 | 总 RSS/峰值、CPU 时间、磁盘读写 |

所有报告同时保存失败与条件跳过。单次最佳值、开发态与成品混测、不同库规模、只计 renderer heap 都不足以支撑性能超越声明。当前已知成品故障见 [问题清单](known-issues-2.3.18.md)。

<a id="record-5"></a>

## 5. 原始八项缺陷及对应版本节点

原文件：`docs/plans/confirmed-unfixed-2026-10-09.md`；Git blob：`4799135c75bffda446df183676be2e7c36e375b4`。以下正文按原时点完整保留。

### Super Lib：确认仍未修复的问题清单（2026-10-09）

> 后续实施状态见[软件本体补齐结果](completion-results-2026-10-10.md)。本页历史复现/上游固定版本事实保留，不因修复反向改写。

> **后续状态更新（2026-10-10）**：下文保留 2.3.17 修复前快照。U01–U08 的后续修复已随 [2.3.18 发行](../releases/v2.3.18-validation.md)交付；原复现结果不反向改写。当前真实失败及验收缺口见[2.3.18 已知问题](known-issues-2.3.18.md)。仍使用旧 2.3.17 的用户按下文安全提醒处理。

> **8 项；本轮只诊断、复现、记录，不修改产品行为。** 基线为 Super Lib 2.3.17，源码提交 `fcf074d6e771fb69394f30dcdb79d531848a51c7`。这些是本次测试实际失败的独立问题，不是把上游发行说明直接复制成待办。

关联：[上游发行逐项对照与验证边界](#record-2) · [Super Lib 差异化能力](#record-3) · [历史决策](../POST_DEVELOPMENT_DECISIONS.md)。

### 先看结论与使用提醒

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

### 复现方法与安全边界

[独立审计用例](../../tests/audit/library-safety-audit.test.ts)使用真实本地产品模块；[独立配置](../../vitest.history-audit.config.ts)不匹配日常 `vitest.config.ts` 的 `tests/{unit,worker}`。

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

### U01：链接目录“移入回收站”仍触碰外部源文件

- **触发步骤**：链接一个外部目录；对链接根使用“移入回收站”，对应 `deleteLinkedFolderSubtree(relativePath:'', deleteFromDisk:false)`。相同方法也可用于链接子目录。
- **执行证据**：[Renderer 删除入口](../../src/renderer/use-folder-delete-actions.ts) `trashLinkedFolderSubtree` → [Worker](../../src/worker/library-service.ts) `deleteLinkedFolderSubtree`：对索引资产调用 `deleteLinkedAssets(deleteSourceFile:true)`，随后对剩余源目录调用 `trashItem(dirPath)`。不是安全的 `removeLinkedFolder` 路径。
- **预期 / 实际**：普通解除链接不应变更外部文件；实际会把外部目录内容交给系统回收站。根目录剩余的未索引内容也在目录级调用范围内，这一点来自源码追踪，测试不单独宣称已验证未索引文件情形。
- **影响**：其他程序依赖的素材可能突然不在原路径。是否可由系统回收站恢复取决于操作系统、卷类型及后续操作；不能保证网络卷可恢复。
- **验收要求**：默认链接移除只删除库索引；根/子目录/批量/拖入回收站分别验证。只有明确“强制从硬盘删除”及危险确认后才允许删源。保留现有安全解除链接回归。

### U02：暂时找不到文件被传播为远端删除

- **触发步骤**：先同步一个托管资产；临时把库内文件挪到测试根的另一位置，保留库内资产身份；再次同步。
- **执行证据**：[Worker](../../src/worker/library-service.ts) `syncSnapshot` 遇到 `!existsSync` 直接跳过；[端口](../../src/worker/sync/library-port.ts)不传“缺失但未删除”集合；[规划器](../../src/worker/sync/sync-plan.ts)把“当前快照无、旧 manifest 有”统一解释为删除；[执行器](../../src/worker/sync/sync-runner.ts)执行 DELETE 和墓碑写入。
- **实际**：第一轮远端文件存在，第二轮变为不存在，删除数为 1；并非仅标记缺失。
- **影响**：同步副本不再是安全恢复来源；墓碑还可能影响另一设备。本次没有真实云端或多设备实验。
- **验收要求**：区分可用、暂时缺失、明确删除三种事实；缺失不产生 DELETE/墓碑，远端存在时可恢复；用户明确入回收站的删除仍可传播。覆盖离线/权限错误/路径切换、显式删除、恢复及既有墓碑。

### U03：灰色误匹配红色

- **触发步骤**：色卡含 `hue=0, saturation=0, lightness=.5` 的灰色及正常红色；选择红色。
- **执行证据**：[colorFilterSql](../../src/shared/color-filter-presets.ts) 的 hue 分支只查色相；[库查询](../../src/worker/library-service.ts)使用此 SQL。中性色分支存在，不等于彩色分支排除了中性色。
- **实际**：真实 SQL 同时返回灰色与红色。包含误入也意味着排除红色可能误排灰色，后者是由同一条件推导，未另跑全界面排除测试。
- **验收要求**：彩色色相匹配增加饱和度/亮度或色差边界；红/黑/灰/白、包含/排除、低饱和度接近色、空色卡均有回归。

### U04：图片尺寸只检查大于零，没有检查整数

- **触发步骤**：EXIF 解析器返回宽高 `1.5,2.5`，源帧头合法 `1×1`；生成 RAW 缩略图后读取资产列表。
- **执行证据**：[normalizeRawImageMetadata](../../src/worker/raw-image-metadata.ts) 接受有限非整数；[persistRawImageMetadata](../../src/worker/library-service.ts)用 `metadata.width ?? headerSize.width` 存库；`assetSummaryFromRow` 仅 `>0`；[协议](../../src/shared/asset-types.ts)要求 `.int().positive()`。
- **实际**：列表响应带小数，整个数组校验失败。上游最新 `usablePixelDimension` 和 `resolvedExtractedPixelSize` 对尺寸采取正整数及整对帧头回退。
- **已经防住的部分**：本轮另一次零尺寸探测返回 `null×null`，协议校验成功。**不能把上游“零 EXIF 导致目录打不开”原样当作 Super Lib 当前缺陷。** 零值仍可能遮掉真实帧头，但此清单的失败断言针对非整数响应污染。
- **验收要求**：解析、持久化、投影统一正整数约束；无效成对尺寸使用有效源头回退。添加零、负数、小数、NaN、单边损坏与正常 RAW/TIFF/JPEG；以真实坏照片完成 UI 端补充验收。

### U05：同步只比较内容哈希，漏掉路径变化

- **触发步骤**：上次两端条目均为 `old.txt`；本地当前改为 `new.txt`，内容哈希相同；调用真实 `planSyncActions`。
- **实际**：空动作数组。规划器的双方已知分支只检查哈希，没有路径比较；执行器也没有 `move-remote/relocate-local` 动作类型。上游在 0.2.1 加入 MOVE，0.2.3 补同步移动后的目录与视图收口。
- **影响**：搬移整理无法正确反映到另一端。只修改内容与路径时也必须确认新路径写回，不能只补一个路径单元测试。
- **验收要求**：本地/远端单侧改路径、双侧改路径、路径与内容同时变化、同名占用及远端空目录清理；远端不支持 MOVE 时有安全降级。本次证明漏规划，未对真实服务端执行 MOVE。

### U06：GBK 被无条件按 UTF-8 解码

- **触发步骤**：导入 GBK 编码“中文”的四个字节，打开文本预览。
- **执行证据**：[readTextAsset](../../src/worker/library-service.ts) `slice.toString('utf8')`，未走上游新增的编码识别。
- **实际**：出现替换字符；同一服务读取 UTF-8 中文正对照通过。
- **验收要求**：UTF-8/BOM/GBK/GB18030/UTF-16 分别验证；二进制拒绝和截断边界正确。编辑保存必须明确编码策略，不能静默损坏源文本。当前已确认显示乱码，不宣称本轮实际发生保存损坏。

### U07：文件名决定不应自动决定颜色显示

- **触发步骤**：普通彩色图片名包含 `roughness`（`gloss` 还可能触发灰度反相），不由用户主动选择通道显示。
- **执行证据**：[AssetPreviewModal](../../src/renderer/AssetPreviewModal.tsx) 对图片调用 [detectPbrTextureChannel](../../src/renderer/pbr-texture-channel.ts)；[ZoomablePreviewImage](../../src/renderer/zoomable-preview-image.tsx)使用 `pbrTextureDisplayFilter` 生成的 CSS。
- **实际**：`photo_roughness.png` 产生 `grayscale(1)`。这不是自动辨认材质后用户明确要求的通道模式，源字节不被改写。
- **验收要求**：默认按普通图像显示；通道显示通过显式操作/可信元数据开启。普通文件名、真实贴图、主动通道模式都验证，保留 3D 材质本身的 PBR 映射。

### U08：刷新磁盘自动把新增连号图片合并

- **触发步骤**：库创建后，直接向托管目录写入 `frame0001.png`、`frame0002.png`、`frame0003.png`；只执行 `refreshManagedAssets`，不执行序列导入确认或手动创建。
- **执行证据**：[LibraryService](../../src/worker/library-service.ts) 对账结束调用 `createDetectedImageSequences(discoveredAssetIds)`；恢复路径也有同类调用，但本轮只运行对账复现。
- **实际**：列表由 3 张独立图片变成一个 3 帧序列。字节没有丢失，但独立浏览与选中语义被后台操作改变。
- **验收要求**：仅显式导入确认或手工序列创建才自动成组；磁盘监视、对账、恢复不隐式合并。序列帧完整性、独立图像可见性与已有序列刷新均保留。

### 不混进这 8 项的内容

- 旧 [follow-up-fixes](../plans/follow-up-fixes.md) 与发行记录中的历史失败不自动视为今天仍未修复；本轮没有重跑全量历史失败套件。需继续验证的路径见审查报告。
- JFIF/AVIF/字体/FLV、任意取色相似度等上游新增能力，与“原功能损坏”不同，放在功能差异表，不通过改命名扩大缺陷数量。
- NAS 阻塞、长期写租约、Windows 原生对话框焦点、macOS 启动、第三方 AI/WebDAV/插件问题未全部实机复现；仍明确标为待验收，不能从 278 项专项通过推出全部已修复。
- 本轮不提升版本号、不打包、不发布安装器、不更新 ECS；完成的是审计产物与既有 MIT/历史文档的 Git 同步。

<a id="record-6"></a>

## 6. README.md 原功能 / 性能表与借鉴说明

原文件：`README.md`；Git blob：`4a8ae5d44a0b9364886d1920e58a9278a90fed65`。以下正文按原时点完整保留。

### 与 Serpent 的功能及性能对照

本软件从 Serpent **0.1.4** 接力开发；本表对照已审阅的 **0.2.10 固定源码 `782d4e5b`** 与已正式发行的 **Super 2.3.18**。完整功能证据、新差距及边界见[当前详细对照](#record-1)、[当前已知问题](known-issues-2.3.18.md)及[真实开发决策](../POST_DEVELOPMENT_DECISIONS.md)。

| 对比维度 | Serpent 0.2.10 | Super Lib 2.3.18 | 结论与边界 |
| --- | --- | --- | --- |
| 本地库、WebDAV、基础 AI/智能合集、插件/MCP、3D/PDF | 已有内置能力 | 保留并独立扩展 | 共同基础，不列为 Super 独有 |
| Emoji 与图标外观 | 分类 Emoji、装饰图形、颜色及更多工作区外观 | 本轮借鉴 11 类/200 个 Emoji，24 个内置图形、8 色、分类搜索；兼容旧 Emoji 偏好 | 文件夹/合集/智能合集可用；仅本机偏好，不宣称与上游完整图形/标签页能力等价 |
| 子项拖到直接父项 | 有侧栏层级管理，本轮未同操作运行对照 | 子项提升一级；顶层父项对应根目录；合集同级重排、跨级移动及撤销保留 | 按用户需求修正，不把未经复测的上游行为列作缺陷 |
| JFIF / AVIF / FLV | 已有对应格式路径 | 本轮补导入、格式筛选、真实缩略图与预览路径 | JFIF/AVIF 原图；FLV 保留按需 FFmpeg 代理回退，不承诺原生播放所有编码 |
| 链接源保护与同步路径 | 默认解除引用、区分缺失与删除，支持路径动作 | 上一阶段 U01/U02/U05 修正默认保留外部源、持久删除意图及路径移动 | 同步不是备份；真实 WebDAV、多写者事务仍未完整验收 |
| 悬浮参考窗 | 无对应内置独立参考窗管线 | 图片/PDF 独立置顶窗口，成功显示后最小化主窗 | Super 的明确差异，非所有媒体都支持 |
| 更新下载 | GitHub 完整包选择 | 精确来源版本 delta，保留 20 个来源，失败回退完整包 | Super 交付增强；下载收益取决于来源版本与改动 |
| 更新结束体验 | 标准安装器 Run 入口 | 完成态提示、自动打开软件、失败可重试、延期包启动复核 | Super 针对本对话更新需求的闭环 |
| AI 使用范围及结果审核 | 自动分析/搜索与任务进度 | 目录粒度自动分析开关、批次结果审核、重分析新旧结果取舍 | 不称上游缺少 AI；真实供应商调用本轮未测试 |
| SolidWorks | 无对应专门内置分类路径 | SLDPRT/SLDASM/SLDDRW 分类/筛选与格式缩略图策略 | 识别而非原生 CAD 几何解码，仍需外部软件 |
| 构建/发布可追溯性 | 发布 pipeline、校验和 | 额外输入快照、最终包 receipt、附件集合门禁 | 工程增强，不等于代码签名或安全审计全通过 |
| 任意取色、音频封面与波形、GIF 控制、字体预览 | 发布源码已有相应增强 | 任意 HEX/容差包含排除；嵌入封面/波形开关；GIF 暂停逐帧；字体样例与卸载 | 有界解码；字体用通用卡片图标，不宣称生成字体缩略图；损坏/超限降级 |
| 工作区、目录与检索 | 已有工作区/目录/检索增强 | 最多 6 个独立会话工作区；目录索引 Inspector、侧栏过滤排序、搜索历史、PNG 内嵌生成信息与批量建目录 | 会话工作区不跨重启持久化；生成标记不等于判断图片是否 AI 生成 |
| AI 元数据同步、明确图片写回、大内容分块/队列预算 | 已有对应后续方向 | 人工/AI 分层元数据三路合并与取消；明确图片写回、原字节撤销；1 MiB 分块与 RPC 队列预算 | Mock 双设备/真实本地管线已验收；真实多写者 WebDAV/NAS 仍待专项；F15 账号/官方目录及 ECS 迁移继续暂停 |

| Markdown 渲染、ZIP 成员预览、自选目录图片封面 | 0.2.10 新增 | 暂无完整等价入口 | 已确认差距 G01–G03 |
| 缺失链接统一隐藏、选择器记忆、25% 视频取帧、近边控件 | 0.2.10 增强 | 相近功能尚未完整等价 | G04–G07；全屏切图等另列待验证 |

### 有证据的优化收益，而非未经实测的“全面超越”

| 测量对象 | 已记录的 Super 自身优化 | 与 Serpent 的结论 |
| --- | --- | --- |
| 20,001 行库中单项导入后的结果读取 | 历史同机夹具：全库结果管线中位数 **69.7 ms → 局部读取 13.7 ms**；整次导入仍为 273.7 ms | [原始测量及范围](../plans/2026-10-07-performance-first-pass.md)；没有同机 Serpent 数据，不推出整次导入五倍提速 |
| 安装器与程序文件体积 | v2.3.7→v2.3.8：安装器 **229.83→190.15 MiB（-17.26%）**，程序文件少约 45.63 MiB | [历史成品证据](../releases/v2.3.8-validation.md)；不是当前版本对上游的包体/RSS基准 |
| 一次精确版本增量下载 | v2.3.17→v2.3.18 delta ZIP **3,527,895 字节**，完整 ZIP 198,779,769 字节（约 1.775%） | [发布附件证据](../releases/v2.3.18-validation.md)；是这一次交付的数据，来源不匹配仍用完整包 |
| 虚拟列表、可见缩略图、原图优先/按需代理 | 双方都有相关优化；本轮新增格式沿用 Super 现有有界队列，不全量预转码 | 尚无同机同库 FPS、峰值 RSS、慢盘/NAS 或完整导入对照；不声称性能全面超越 |

测量范围与同条件对照方案见[性能证据文档](#record-4)。

借鉴说明：Super Lib 基于原开源项目 [dolag233/Serpent](https://github.com/dolag233/Serpent) v0.1.4进行借鉴与后续开发，感谢原作者及贡献者，并继续以 [MIT 许可证](../../LICENSE) 开源。

<a id="record-7"></a>

## 7. README.en.md 原功能 / 性能表与借鉴说明

原文件：`README.en.md`；Git blob：`d8de2f2ab097e0aadf00161f04f2d360a7d34ab0`。以下正文按原时点完整保留。

### Comparison with Serpent

Super Lib was developed from **Serpent 0.1.4**. This table compares reviewed **0.2.10 source `782d4e5b`** with published **Super 2.3.18**. See the [current detailed comparison](#record-1), [known issues](known-issues-2.3.18.md), and [real decisions](../POST_DEVELOPMENT_DECISIONS.md).

| Area | Serpent 0.2.10 | Super Lib 2.3.18 | Scope |
| --- | --- | --- | --- |
| Local libraries, WebDAV, basic AI/smart collections, plugins/MCP, 3D/PDF | Built in | Inherited and extended | Shared foundations, not exclusive features |
| Sidebar appearance | Categorized emoji, decorative glyphs/colors and workspace appearance | This batch adds 11 categories/200 emoji, 24 existing icons, 8 colors, category search and legacy preference compatibility | Local folder/collection/smart-collection preferences; not full upstream glyph/tab parity |
| Hierarchy dragging | Sidebar hierarchy management; not rerun with identical gestures here | Direct-parent drops promote one level; root drops, sibling collection ordering and undo are preserved | User-requested fix, not an unverified claim of an upstream bug |
| JFIF/AVIF/FLV | Corresponding format paths | This batch adds registry, filters, real decoding, thumbnails and preview routes | Original JFIF/AVIF sources; FLV uses on-demand FFmpeg fallback |
| Source protection/sync paths | Unlink protection, explicit deletion and path actions | U01/U02/U05 source fixes from phase 1 | Sync is not a backup; live multi-writer/WebDAV validation remains incomplete |
| Floating references | No equivalent built-in independent reference-window pipeline | Always-on-top image/PDF windows | Not every media type |
| Update delivery | GitHub full-package selection | Exact-source delta packages, 20 retained source versions and full fallback | Download savings depend on matching source and changes |
| Update completion | Standard installer Run entry | Completion UI, automatic launch, retry and deferred-package verification | Super-specific delivery workflow |
| AI scope/review | Automatic analysis/search and progress | Directory-level opt-in, batch review and explicit reanalysis choices | Not a claim that Serpent lacks AI |
| SolidWorks | No equivalent dedicated built-in classification path | SLDPRT/SLDASM/SLDDRW filters and format-thumbnail strategy | External app required for native CAD geometry |
| Build provenance | Release pipeline/checksums | Additional input snapshots, final receipts and attachment-set gates | Not code signing or comprehensive security certification |
| Color/audio/GIF/fonts | Corresponding built-in enhancements | Arbitrary HEX/tolerance, embedded artwork, waveform preference, bounded GIF pause/step and font preview/unload | Fonts intentionally use generic cards, not unsupported raster jobs |
| Workspace/directory/search | Corresponding enhancements | Up to 6 session workspaces, cached folder Inspector, sidebar filter/sort, search history, PNG generation markers and partial batch folders | Workspaces are session-only; markers are not an AI-origin detector |
| Metadata/image writes/content budgets | Corresponding later directions | Manual/AI three-way metadata merge and cancellation, explicit image write-back with exact undo, 1 MiB reads and RPC budgets | Mock two-device and real local pipelines verified; live WebDAV multi-writer/NAS remain separate acceptance. F15 accounts/catalog and ECS migration stay paused |

| Markdown / ZIP members / custom image folder cover | Added in 0.2.10 | No complete equivalent | G01–G03 capability gaps |
| Missing-linked visibility / picker memory / 25% video posters / proximity controls | Enhanced in 0.2.10 | Partial features without full parity | G04–G07; fullscreen navigation remains a separate check |

Historical measurements compare **Super against its own earlier implementation**, not against Serpent:

| Measurement | Recorded result | Evidence and limit |
| --- | --- | --- |
| Result hydration after a single import in a 20,001-row fixture | 69.7 ms full-library median → 13.7 ms scoped read; whole import 273.7 ms | [Performance record](../plans/2026-10-07-performance-first-pass.md); not 5× whole-import speed |
| v2.3.7→v2.3.8 installer size | 229.83→190.15 MiB, -17.26%; program files reduced by about 45.63 MiB | [Build evidence](../releases/v2.3.8-validation.md); not today's upstream size/RSS comparison |
| One exact-source delta, 2.3.17→2.3.18 | 3,527,895 bytes vs 198,779,769-byte full ZIP, about 1.775% | [Release evidence](../releases/v2.3.18-validation.md); unmatched sources still need a full package |
| Virtualization/visible thumbnails/on-demand proxies | Both projects have relevant optimizations | No matched FPS, RSS, NAS or whole-import benchmark; no universal superiority claim |

Acknowledgement: Super Lib builds upon the original open-source project [dolag233/Serpent](https://github.com/dolag233/Serpent); we thank its authors and contributors and continue to release Super Lib under the [MIT License](../../LICENSE).

<a id="record-8"></a>

## 8. serpent-followup-audit-evidence-2026-10-09.json — 原始证据

原文件：`docs/reference/serpent-followup-audit-evidence-2026-10-09.json`；Git blob：`39ccf4890d89837563ec8cb02db834eb12d00703`。以下为完整原始 JSON，字段、旧路径和哈希未替换。

````json
{
  "schemaVersion": 1,
  "commandKind": "Equivalent reproduction commands; reporting flags and argument ordering are omitted",
  "auditDate": "2026-10-09",
  "product": "Super Lib",
  "version": "2.3.17",
  "sourceCommit": "fcf074d6e771fb69394f30dcdb79d531848a51c7",
  "baseline": {
    "tag": "v0.1.4",
    "commit": "6aeb146c8f893a2f4be9249195c838a653bcb090"
  },
  "upstream": {
    "tag": "v0.2.9",
    "commit": "f58701a6c06a41c075ef8fe8c6f48b7a6305f498",
    "releases": [
      {
        "tag": "v0.1.5",
        "publishedAt": "2026-08-29T14:51:33Z",
        "url": "https://github.com/dolag233/Serpent/releases/tag/v0.1.5"
      },
      {
        "tag": "v0.2.0",
        "publishedAt": "2026-09-06T13:32:39Z",
        "url": "https://github.com/dolag233/Serpent/releases/tag/v0.2.0"
      },
      {
        "tag": "v0.2.1",
        "publishedAt": "2026-09-10T14:02:38Z",
        "url": "https://github.com/dolag233/Serpent/releases/tag/v0.2.1"
      },
      {
        "tag": "v0.2.3",
        "publishedAt": "2026-09-14T16:19:03Z",
        "url": "https://github.com/dolag233/Serpent/releases/tag/v0.2.3"
      },
      {
        "tag": "v0.2.4",
        "publishedAt": "2026-09-17T01:49:25Z",
        "url": "https://github.com/dolag233/Serpent/releases/tag/v0.2.4"
      },
      {
        "tag": "v0.2.5",
        "publishedAt": "2026-09-18T01:46:32Z",
        "url": "https://github.com/dolag233/Serpent/releases/tag/v0.2.5"
      },
      {
        "tag": "v0.2.6",
        "publishedAt": "2026-09-19T14:43:40Z",
        "url": "https://github.com/dolag233/Serpent/releases/tag/v0.2.6"
      },
      {
        "tag": "v0.2.7",
        "publishedAt": "2026-09-23T11:18:18Z",
        "url": "https://github.com/dolag233/Serpent/releases/tag/v0.2.7"
      },
      {
        "tag": "v0.2.8",
        "publishedAt": "2026-09-25T02:14:11Z",
        "url": "https://github.com/dolag233/Serpent/releases/tag/v0.2.8"
      },
      {
        "tag": "v0.2.9",
        "publishedAt": "2026-09-27T02:19:45Z",
        "url": "https://github.com/dolag233/Serpent/releases/tag/v0.2.9"
      }
    ]
  },
  "htmlSource": {
    "bytes": 534773,
    "sha256": "058fed38f0c6da372b31dda9e04d894169d714bc79f08313181298bef297e396"
  },
  "environment": {
    "platform": "win32",
    "arch": "x64",
    "node": "24.15.0",
    "electron": "43.1.0",
    "vitest": "4.1.10"
  },
  "runs": [
    {
      "name": "unfixed-desired-behaviour",
      "startedAt": "2026-10-09T10:59:58.578Z",
      "total": 10,
      "passed": 2,
      "failed": 8,
      "skipped": 0,
      "exitCode": 1,
      "command": "node scripts/run-vitest-with-electron.mjs run --config vitest.serpent-audit.config.ts --reporter=verbose",
      "files": [
        "tests/audit/serpent-followup.test.ts"
      ],
      "cases": [
        {
          "name": "U01 linked-folder trash must not move external sources",
          "status": "failed"
        },
        {
          "name": "control: explicit unlink already leaves external sources untouched",
          "status": "passed"
        },
        {
          "name": "U02 temporary missing local file must not delete a synced remote file",
          "status": "failed"
        },
        {
          "name": "U03 red hue filter must exclude a zero-saturation gray swatch",
          "status": "failed"
        },
        {
          "name": "U04 invalid EXIF dimensions must not poison an asset-list response",
          "status": "failed"
        },
        {
          "name": "U05 unchanged-hash local rename must produce a remote path action",
          "status": "failed"
        },
        {
          "name": "U06 GBK Chinese text must render without replacement characters",
          "status": "failed"
        },
        {
          "name": "U07 a filename alone must not desaturate an ordinary image preview",
          "status": "failed"
        },
        {
          "name": "U08 filesystem reconciliation must not silently merge numbered images",
          "status": "failed"
        },
        {
          "name": "control: UTF-8 Chinese text remains readable",
          "status": "passed"
        }
      ]
    },
    {
      "name": "focused-regression-1",
      "startedAt": "2026-10-09T10:11:22.087Z",
      "total": 99,
      "passed": 99,
      "failed": 0,
      "skipped": 0,
      "exitCode": 0,
      "command": "node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/import-source-stability.test.ts tests/worker/linked-folder-index.test.ts tests/worker/linked-folders.test.ts tests/worker/pending-import-lifecycle.test.ts tests/unit/background-reconciliation-wiring.test.ts tests/unit/client-shuffle.test.ts tests/unit/color-filter-presets.test.ts tests/unit/import-confirmation-dialog.test.ts tests/unit/raw-image-metadata.test.ts",
      "files": [
        "tests/worker/import-source-stability.test.ts",
        "tests/worker/linked-folder-index.test.ts",
        "tests/worker/linked-folders.test.ts",
        "tests/worker/pending-import-lifecycle.test.ts",
        "tests/unit/background-reconciliation-wiring.test.ts",
        "tests/unit/client-shuffle.test.ts",
        "tests/unit/color-filter-presets.test.ts",
        "tests/unit/import-confirmation-dialog.test.ts",
        "tests/unit/raw-image-metadata.test.ts"
      ]
    },
    {
      "name": "focused-regression-2",
      "startedAt": "2026-10-09T10:59:08.364Z",
      "total": 179,
      "passed": 179,
      "failed": 0,
      "skipped": 0,
      "exitCode": 0,
      "command": "node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/unit/ai-search-planner.test.ts tests/unit/app-update-launcher.test.ts tests/unit/app-update-service.test.ts tests/unit/asset-browse-load-more.test.ts tests/unit/asset-drag-drop.test.ts tests/unit/browse-layout-preview.test.ts tests/unit/browse-pagination-lifecycle.test.ts tests/unit/browse-window-slots.test.ts tests/unit/filter-clause-schema.test.ts tests/unit/folder-browse-tag-filter.test.ts tests/unit/font-color-preferences.test.ts tests/unit/format-filter-presets.test.ts tests/unit/import-confirmation-dialog.test.ts tests/unit/media-formats.test.ts tests/unit/metadata-read-controller.test.ts tests/unit/native-asset-drag-ipc.test.ts tests/unit/native-asset-drag.test.ts tests/unit/pending-app-update.test.ts tests/unit/pending-update-integrity.test.ts tests/unit/preview-poll.test.ts tests/unit/update-native-ui.test.ts tests/unit/update-retention-policy.test.ts tests/unit/viewer-preview-policy.test.ts",
      "files": [
        "tests/unit/ai-search-planner.test.ts",
        "tests/unit/app-update-launcher.test.ts",
        "tests/unit/app-update-service.test.ts",
        "tests/unit/asset-browse-load-more.test.ts",
        "tests/unit/asset-drag-drop.test.ts",
        "tests/unit/browse-layout-preview.test.ts",
        "tests/unit/browse-pagination-lifecycle.test.ts",
        "tests/unit/browse-window-slots.test.ts",
        "tests/unit/filter-clause-schema.test.ts",
        "tests/unit/folder-browse-tag-filter.test.ts",
        "tests/unit/font-color-preferences.test.ts",
        "tests/unit/format-filter-presets.test.ts",
        "tests/unit/import-confirmation-dialog.test.ts",
        "tests/unit/media-formats.test.ts",
        "tests/unit/metadata-read-controller.test.ts",
        "tests/unit/native-asset-drag-ipc.test.ts",
        "tests/unit/native-asset-drag.test.ts",
        "tests/unit/pending-app-update.test.ts",
        "tests/unit/pending-update-integrity.test.ts",
        "tests/unit/preview-poll.test.ts",
        "tests/unit/update-native-ui.test.ts",
        "tests/unit/update-retention-policy.test.ts",
        "tests/unit/viewer-preview-policy.test.ts"
      ]
    }
  ],
  "focusedRegressionTotals": {
    "passedExecutions": 278,
    "uniqueCases": 277,
    "repeatedExecutions": 1
  },
  "staticAndDocumentChecks": {
    "typecheck": "passed",
    "auditFilesEslint": "passed",
    "gitDiffCheck": "passed",
    "documentToolTestsPassed": 5,
    "markdownFiles": 142,
    "localReferences": 567,
    "brokenLocalReferences": 0
  },
  "limitations": [
    "No product behaviour fixes, packaging, release creation or ECS writes",
    "No real user library or installed application mutated",
    "U01 OS trash replaced with owned recoverable fixture moves",
    "U02 real service and engine, in-memory transport only",
    "U04 EXIF and OIIO injected; actual persistence and protocol tested; no original failing photo or real decoder",
    "U05 and U07 production-function unit probes, no real WebDAV MOVE or visual screenshot",
    "No full-suite, NAS/SMB/long-session, macOS or real external-service acceptance"
  ]
}
````

<a id="record-9"></a>

## 9. followup-phase1-evidence-2026-10-09.json — 原始证据

原文件：`docs/reference/followup-phase1-evidence-2026-10-09.json`；Git blob：`de9c03b85bb3948ff22239a42b1e4ea5ea9ab4f4`。以下为完整原始 JSON，字段、旧路径和哈希未替换。

````json
{
  "date": "2026-10-09",
  "baseline": "6dc9ab07eed3b6a0e58c3481397c9823d2bd7bc2",
  "applicationVersion": "2.3.17",
  "schemaVersion": 50,
  "released": false,
  "total": {
    "passed": 692,
    "failed": 0,
    "skipped": 2,
    "files": 42
  },
  "groups": [
    {
      "name": "audit",
      "config": "vitest.serpent-audit.config.ts",
      "passed": 10,
      "failed": 0,
      "skipped": 0,
      "suites": [
        {
          "file": "tests/audit/serpent-followup.test.ts",
          "passed": 10,
          "failed": 0,
          "skipped": []
        }
      ]
    },
    {
      "name": "regression",
      "config": "vitest.config.ts",
      "passed": 362,
      "failed": 0,
      "skipped": 0,
      "suites": [
        {
          "file": "tests/worker/followup-safety.test.ts",
          "passed": 26,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/followup-sync-plan.test.ts",
          "passed": 17,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/image-sequence.test.ts",
          "passed": 16,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/migration-discipline.test.ts",
          "passed": 8,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/schema-compatibility.test.ts",
          "passed": 57,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/schema-downgrade-chain.test.ts",
          "passed": 60,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/sync-engine.test.ts",
          "passed": 9,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/sync-library-integration.test.ts",
          "passed": 6,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/sync-open-remote.test.ts",
          "passed": 1,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/sync-plan.test.ts",
          "passed": 8,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/sync-runner.test.ts",
          "passed": 8,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/sync-two-device.test.ts",
          "passed": 2,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/webdav-driver.test.ts",
          "passed": 10,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/artifact-response.test.ts",
          "passed": 6,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/followup-presentation.test.ts",
          "passed": 26,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/protocol.test.ts",
          "passed": 102,
          "failed": 0,
          "skipped": []
        }
      ]
    },
    {
      "name": "adjacent",
      "config": "vitest.config.ts",
      "passed": 155,
      "failed": 0,
      "skipped": 1,
      "suites": [
        {
          "file": "tests/worker/billfish-import.test.ts",
          "passed": 5,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/import-confirmation.test.ts",
          "passed": 8,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/import-no-conflict.test.ts",
          "passed": 1,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/import-planning.test.ts",
          "passed": 52,
          "failed": 0,
          "skipped": [
            "Windows path hardening (Super-8b5b.7 review) rejects NTFS-forbidden characters in import relative paths"
          ]
        },
        {
          "file": "tests/worker/import-source-stability.test.ts",
          "passed": 20,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/linked-folder-index.test.ts",
          "passed": 1,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/linked-folders.test.ts",
          "passed": 24,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/pending-import-lifecycle.test.ts",
          "passed": 9,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/3d-viewer-pbr-mapping.test.ts",
          "passed": 5,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/color-filter-presets.test.ts",
          "passed": 5,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/image-sequence-import-dialog.test.ts",
          "passed": 3,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/image-sequence-import.test.ts",
          "passed": 4,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/import-confirmation-dialog.test.ts",
          "passed": 1,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/pbr-texture-channel.test.ts",
          "passed": 9,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/raw-image-metadata.test.ts",
          "passed": 2,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/text-media.test.ts",
          "passed": 6,
          "failed": 0,
          "skipped": []
        }
      ]
    },
    {
      "name": "compat",
      "config": "vitest.config.ts",
      "passed": 165,
      "failed": 0,
      "skipped": 1,
      "suites": [
        {
          "file": "tests/worker/database-recovery.test.ts",
          "passed": 10,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/folder-delete.test.ts",
          "passed": 18,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/library-availability.test.ts",
          "passed": 12,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/library-schema-readonly.test.ts",
          "passed": 5,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/library-service.test.ts",
          "passed": 26,
          "failed": 0,
          "skipped": [
            "LibraryService lifecycle does not leave a partial library when the parent is not writable"
          ]
        },
        {
          "file": "tests/worker/palette-artifact.test.ts",
          "passed": 11,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/schema-failure.test.ts",
          "passed": 7,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/worker/schema-lenient-read.test.ts",
          "passed": 27,
          "failed": 0,
          "skipped": []
        },
        {
          "file": "tests/unit/sidebar-commands.test.ts",
          "passed": 49,
          "failed": 0,
          "skipped": []
        }
      ]
    }
  ],
  "sourceSha256": {
    "src/preload/index.ts": "1c37ddac9c4bad5f1839892cca4c1fd243199d49c834ed94d2927c8cb9fa9e39",
    "src/renderer/AssetPreviewModal.tsx": "a4f9891b8813f354781980aba8e5b5262e251d44362b7a1896d82d05fb3e0b25",
    "src/renderer/LibrarySettingsDialog.tsx": "a521f83b5600669110084ceb40e416416a7253e082afa700552c4ccf79d82d9d",
    "src/renderer/TextViewerControls.tsx": "34afa59a6203d73547cc764247c50aad9eac09af858ad6f6b7614c09a1569653",
    "src/renderer/commands/sidebar-commands.ts": "ad4cfaaed61283f70f74d3aa8b14d31a5b74788ad8e1513fddd87117873921a6",
    "src/renderer/i18n/catalogs/en.ts": "86c20285f5b0d8316a4d1c148d6a0e82e1def0d5775a513b0874b35132daa141",
    "src/renderer/i18n/catalogs/zh-CN.ts": "d0b5c09bc35ad2cd176c92bae938e066b8393891eaede6aaebf6b05d98432433",
    "src/renderer/pbr-texture-channel.ts": "fa7a02828886fd592490e5b5ae9882dd5325a95c139be55b3a40d3b62faf86e7",
    "src/shared/color-filter-presets.ts": "c7cc42b307461496239255b424a768a25342c94872fd24c75dfa35f8f2148768",
    "src/shared/library-api.ts": "d62b13635aa150da7415021524e62166b12efec442b957c177fd4a3c9cc2f825",
    "src/shared/protocol/responses.ts": "20126fdebb007f504dd7f853f3c3da83126effa7e9215f5afebb9e9fb1ed4712",
    "src/shared/text-encoding.ts": "1db0c1ff86a8d94d31176cbefca62f7e2e094a063dc6184dfd04c747f93bb029",
    "src/worker/library-service.ts": "e2f1ccc677fc091b3dc546449b56c2b5a35d3ad536fdea3644d092e0e65057d3",
    "src/worker/raw-image-metadata.ts": "39c31b11649fbd01a95bc324cee84ec7c48ab40d63b20294ce8b851ccfb16a46",
    "src/worker/sync/library-port.ts": "e2da94527075ce8d88ea0ca55bd49d5bb8b6da75a6911de3856d398411e20ff0",
    "src/worker/sync/manifest.ts": "e06938852903fc8fb91d78a4f8f7a1a20cbe2122c1395d399191c1ec725d758f",
    "src/worker/sync/remote-storage.ts": "c70866123a4796aa3275e471d0ad3d2a5b4bdc09401ce47a0b654b6d94f0cc11",
    "src/worker/sync/sync-engine.ts": "5445fe416ba3711ac93cd6becddb083992b428fede6f932512683623a5732725",
    "src/worker/sync/sync-plan.ts": "9c7e1e5a24885b7b24387e6297f62bddc72fb02ec986a2b8527351f303d2e288",
    "src/worker/sync/sync-runner.ts": "74a639837df6e0a824e138ad5c52b1746a5f01df24c11a3c1706220db654d071",
    "src/worker/sync/webdav-driver.ts": "d595b17cad3b25cd17b36a0f44d7c68943762b77db7a3046e1cb795534f0004b",
    "tests/audit/serpent-followup.test.ts": "e2debe8cb3fdd6c30dc534791c2156709c2e329b5050deeaf2f954264300b9eb",
    "tests/unit/followup-presentation.test.ts": "94c83f8fbf1cfd8b4950d576b9a9fad700bf026f22b98fb4d87da1e3edf04195",
    "tests/unit/sidebar-commands.test.ts": "cbe4a1478e7c9fcf93680c99ced647c7c6e66f92cb7ce1adc70b3b103c925785",
    "tests/worker/folder-delete.test.ts": "04bd377b78a47bbcac337e46f4b8a8e44b7b616152e1161e2b58b87ed10601d9",
    "tests/worker/followup-safety.test.ts": "e7dda757f34b0da645fb71f6c9fe1a833a680978916c8251f485737c98d059cd",
    "tests/worker/followup-sync-plan.test.ts": "8de01a471751b4134584230b537f0d002716bc4c5eeb682b9e15a9486baffbd5",
    "tests/worker/image-sequence.test.ts": "935039671ef10af4095a884e522d3635364b62116e74494dbc89d8b4b5eb2318",
    "tests/worker/sync-engine.test.ts": "fec2a17050ceef43ee328d05e7975f2b269d25a95aaf78a46c30bfd12bf84d09",
    "tests/worker/sync-plan.test.ts": "4483d7001addcbb93dc9a2b210ad242ea3ed462ab59d684b7b5a5a61e04a9c16",
    "tests/worker/sync-runner.test.ts": "0efc791c1fb7ee0d2b3e32ebf8a7dd287377cf9354efd2006d18a7951296e559",
    "tests/worker/webdav-driver.test.ts": "db84ddb5414aaf13ac2a8a8306dcbd6a0f8cb7cb25ebb08ec855c213548702b1",
    "tests/worker/webdav-fixture-server.ts": "72ea1e9d03178f5007cdfa98376bf61c13b2cbb13e6820777c1e3fa2b228546f"
  },
  "checks": {
    "typecheck": "PASS: tsc --noEmit and extension tsc",
    "changedSourceAndTestEslint": "PASS",
    "gitDiffCheck": "PASS",
    "documentationToolTests": { "passed": 5, "failed": 0 },
    "documentationReferences": { "files": 145, "references": 583, "broken": 0 }
  },
  "limits": [
    "Targeted automated regression, not the complete test suite",
    "No real library, installed application, ECS or real WebDAV service modified",
    "No GUI screenshots or macOS verification in this phase",
    "Historical red audit evidence retained separately"
  ]
}
````

<a id="record-10"></a>

## 10. local-upgrades-evidence-2026-10-10.json — 原始证据

原文件：`docs/reference/local-upgrades-evidence-2026-10-10.json`；Git blob：`ada18c404455bd05e07e7193a0cac303091d0e5a`。以下为完整原始 JSON，字段、旧路径和哈希未替换。

````json
{
  "date": "2026-10-10",
  "baseline": "6dc9ab07eed3b6a0e58c3481397c9823d2bd7bc2",
  "applicationVersion": "2.3.17",
  "schemaVersion": 50,
  "released": false,
  "scope": {
    "F01": "implemented-and-tested",
    "F08": "partial:appearance-and-hierarchy",
    "remaining": "F02-F14 not fully implemented",
    "F15": "paused by user"
  },
  "reports": [
    {
      "name": "regression",
      "passed": 256,
      "failed": 0,
      "skipped": 0,
      "files": 14,
      "success": true,
      "startTime": "2026-10-10T01:43:02.036Z",
      "reportPath": "tmp/local-upgrades-regression-serial-20261010.json",
      "reportSha256": "ff59f9b26e4c110252fc0aebafdf1cf31c0e1a98b447b669d80eed265a5c8f3b",
      "testFiles": [
        "tests/worker/folder-organize.test.ts",
        "tests/worker/followup-safety.test.ts",
        "tests/worker/followup-sync-plan.test.ts",
        "tests/worker/local-upgrades.test.ts",
        "tests/worker/operation-history.integration.test.ts",
        "tests/worker/thumbnails.test.ts",
        "tests/worker/video-exr.test.ts",
        "tests/unit/collection-drag-drop.test.ts",
        "tests/unit/folder-drag-drop.test.ts",
        "tests/unit/followup-presentation.test.ts",
        "tests/unit/format-filter-presets.test.ts",
        "tests/unit/media-formats.test.ts",
        "tests/unit/sidebar-appearance.test.ts",
        "tests/unit/sidebar-emoji-preferences.test.ts"
      ]
    },
    {
      "name": "audit",
      "passed": 10,
      "failed": 0,
      "skipped": 0,
      "files": 1,
      "success": true,
      "startTime": "2026-10-10T01:40:06.224Z",
      "reportPath": "tmp/local-upgrades-audit-20261010.json",
      "reportSha256": "fba4da74b0eeb2a1aca957aa1027909dc8b01f941a53618fade5f0b24ff4af51",
      "testFiles": [
        "tests/audit/serpent-followup.test.ts"
      ]
    }
  ],
  "e2e": {
    "passed": 3,
    "failed": 0,
    "command": "npx playwright test tests/e2e/local-media-formats.test.ts tests/e2e/sidebar-hierarchy.test.ts tests/e2e/sidebar-emoji.test.ts --workers=1",
    "lastRun": {
      "status": "passed",
      "failedTests": []
    },
    "durationSeconds": 15.8
  },
  "checks": {
    "typecheck": true,
    "changedTypeScriptEslint": true,
    "diffWhitespace": true,
    "docsAuditTestsPassed": 5,
    "documentation": {
      "markdownFiles": 148,
      "localReferences": 617,
      "referencedImages": 69,
      "broken": 0
    }
  },
  "limits": [
    "No package, install, Git commit/push, Release or ECS action",
    "No live WebDAV, NAS, AI provider, macOS or matched Serpent benchmark",
    "Native JSON repeat assertions passed but teardown exited 1 with PostQueuedCompletionStatus(6); final serial repeat exited 0"
  ],
  "sourceSha256": {
    "src/renderer/sidebar-appearance-catalog.ts": "59bbbf0dd920063f2133fcba1a955b434e710d254ddbbd8937d3726256723b51",
    "src/renderer/sidebar-appearance-preferences.ts": "7393a291686d34005952a6dd357e141ba6b396ee52fab741b49b65e9598188ca",
    "src/renderer/SidebarEmojiDialog.tsx": "84909b4f735dae45fa0a92cca82548dfc23419f411a12a11b8e8340ab093201c",
    "src/renderer/use-sidebar-emoji.ts": "6c5c6886046e4c115fd6d6a67e0f6f38117d49b915ecd7da557d6049b14c8e74",
    "src/renderer/NavigationSidebar.tsx": "4e3f57d3df79028e8009733a30e28e9a4380d2205d2ae265484360a1205829bc",
    "src/renderer/sidebar-emoji.css": "785ec87e9dd0de95641b32cfd38f348952ee52e1e76ad594f0db46887a09a61b",
    "src/renderer/collection-drag-drop.ts": "42afae4895c6aba020e42b6e7595484d63e8e30227dbcd15c3ec2759e77cf21b",
    "src/renderer/folder-drag-drop.ts": "44206a43a45b90825790e5a444429e1800933ab022465946f0368fdfbae9e28a",
    "src/renderer/use-folder-drag-drop-handlers.ts": "1291fe0d67e798d6b36cc2173585d3612d239e390e65e11ad134940f793262ae",
    "src/renderer/App.tsx": "33f2ae4e5fda07958bdc3269cc4656003b4a5d3ad0047eadd455845b45a213db",
    "src/renderer/i18n/catalogs/zh-CN.ts": "267c9d638ae8ffd9cee97c31ef44c31d6ce16cf9c347c667e989e5264874a449",
    "src/renderer/i18n/catalogs/en.ts": "7fef68388359cf39c436874680a0447f8414c45c52ab3fad9e7fa470345b9b59",
    "src/shared/library-api.ts": "454e7e7bc36d98a57a39ede768a63fda9f3523d72b6ee01bf0f64ba32d9e138b",
    "src/shared/media-formats.ts": "6a4696d101679a8fb6aa3a20bf50c009c77550a870262711d0db93e9a4b3493b",
    "src/preload/index.ts": "609d0c773c9132609022eadc501d50f4d6266caf50715b2cfaf3383b25e2fe0c",
    "src/main/index.ts": "5f2f18859994dc69898066b2bebf6c1bde8b36ad53b6ecb57aca2976553e7511",
    "src/worker/library-service.ts": "03e108a78345df37548d4c0ce757e8eb1cb9ee44a4cc852a20add1cb675c3d9c",
    "tests/unit/sidebar-appearance.test.ts": "b3c6ca05701906aaf599659e1894836bd898eef20b3d562706f8772e9d434064",
    "tests/unit/sidebar-emoji-preferences.test.ts": "9a946a841cc9fd4e7b19cc6d46e6a4ebcaa8836d86b8689bc484a0453f46a3c5",
    "tests/unit/collection-drag-drop.test.ts": "68bc695fc61f22c555569ec1be884cf09f61eb78354d38d1fe2db6fe0135388e",
    "tests/unit/folder-drag-drop.test.ts": "b5e04fb65a103e92f05fc13f5383170af49e97a4df941db56053a16b8f6105aa",
    "tests/unit/media-formats.test.ts": "d12c2ade8ec88c5b51a25185364d359ba0fc2442a2c9370e4cae40fb830dbf9c",
    "tests/worker/local-upgrades.test.ts": "1b94c548d3d220d2fc76ad057ed3896eaf3eba9bd263f06ddf47fa72a8b673fe",
    "tests/worker/video-exr.test.ts": "9b3e52de4649e5a8969e82e637feeedc4a5a12dd01651927cd5edce15734976a",
    "tests/e2e/sidebar-emoji.test.ts": "1ebc188681ea170f1812555ae5b930696e9f8575662d751314a29a413bfcec1d",
    "tests/e2e/sidebar-hierarchy.test.ts": "eaa32185fb43a54dcc4013c95ab7fb1c153117b1b5593a69520befa17234ed2b",
    "tests/e2e/local-media-formats.test.ts": "692a277f5b75fc0864653b6a8c1a5915247851795f6fa57ad8026eb6e2480dc3"
  },
  "builtGraphSha256": {
    ".vite/build/main.js": "ee98557ca86a56dbda713a8d3d1d3042aed1974d681e1a3d43f34d0c16bb772b",
    ".vite/build/index.js": "2a4a45c28517b9ac9bf1984b1e096fb03769ff4ab276e84be9f0cc01a573b84f",
    ".vite/build/library_worker.js": "107b74d306c562648adadd5f2bf29d84cbadefb067373893de9da86526f78d38",
    ".vite/renderer/main_window/assets/main_window-CtXhbAFM.js": "d232111947ca2ea5da25e97c56ece7b72006684aa096445a8c9baa0248c3728f"
  },
  "screenshots": [
    {
      "file": "docs/assets/ui/local-upgrades-20261010/emoji-dark.png",
      "bytes": 131800,
      "sha256": "ef24e13a7ef0440a07950afe0ea73fc4ef3a12f1a2d67f21bcc33ccdfa53fbcb"
    },
    {
      "file": "docs/assets/ui/local-upgrades-20261010/emoji-light.png",
      "bytes": 149014,
      "sha256": "73bdbe7a8e67728e77ca8dd8549e66b2cb857110f9b62286b86d2b13a8b48cf9"
    },
    {
      "file": "docs/assets/ui/local-upgrades-20261010/sidebar-promoted.png",
      "bytes": 79568,
      "sha256": "cdcfc38db2d124546d554e844ccb1dc104cc81852f8556ff4af773828fb6bcae"
    }
  ],
  "commands": {
    "regression": "node scripts/run-vitest-with-electron.mjs tests/worker/folder-organize.test.ts tests/worker/followup-safety.test.ts tests/worker/followup-sync-plan.test.ts tests/worker/local-upgrades.test.ts tests/worker/operation-history.integration.test.ts tests/worker/thumbnails.test.ts tests/worker/video-exr.test.ts tests/unit/collection-drag-drop.test.ts tests/unit/folder-drag-drop.test.ts tests/unit/followup-presentation.test.ts tests/unit/format-filter-presets.test.ts tests/unit/media-formats.test.ts tests/unit/sidebar-appearance.test.ts tests/unit/sidebar-emoji-preferences.test.ts --maxWorkers=1 --reporter=json --outputFile=tmp/local-upgrades-regression-serial-20261010.json",
    "audit": "node scripts/run-vitest-with-electron.mjs --config vitest.serpent-audit.config.ts tests/audit/serpent-followup.test.ts --reporter=json --outputFile=tmp/local-upgrades-audit-20261010.json",
    "typecheck": "npm run typecheck",
    "documentationTests": "node --test scripts/docs/audit-docs.test.mjs"
  }
}
````

<a id="record-11"></a>

## 11. THIRD_PARTY_NOTICES.md — 移出或中性化前的原始段落

原文件：`THIRD_PARTY_NOTICES.md`；Git blob：`f79b25157b9009914e9d14061c7de86a17211ce0`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
本软件从 [dolag233/Serpent](https://github.com/dolag233/Serpent) 0.1.4 接力开发，保留 MIT 版权和许可。本轮侧栏 Emoji 分类目录另借鉴其 0.2.9 固定快照 `f58701a6` 的 `src/shared/entity-appearance.ts`；图形复用 Super 已有 Icon，未复制远程 SVG 或上游整个外观迁移。主 [LICENSE](LICENSE) 同时保留 Serpent / Super contributors 的版权。
````

<a id="record-12"></a>

## 12. docs/POST_DEVELOPMENT_DECISIONS.md — 移出或中性化前的原始段落

原文件：`docs/POST_DEVELOPMENT_DECISIONS.md`；Git blob：`5322c847e17a72a2fe19af8707000e7e87247bbe`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
Super Lib 在原开源项目 [dolag233/Serpent](https://github.com/dolag233/Serpent) 的基础上进行借鉴与接力开发。最初接手的 Serpent 版本为 0.1.4；此版本不计入后来独立编号的 Super 发行序列。后续改名、图标、资源库标识和独立仓库维护，不代表全部代码由后续开发者从零创作。

**当前决定：本软件保持 MIT 开源。** 根目录 [LICENSE](../LICENSE) 同时保留原项目的 `Copyright (c) 2026 Serpent contributors` 和后续的 `Copyright (c) 2026 Super contributors`，使用完整 MIT 许可正文；`package.json` 和根 `package-lock.json` 的许可元数据统一为 `MIT`。原项目声明的核对依据为[上游 LICENSE 固定快照](https://github.com/dolag233/Serpent/blob/f58701a6c06a41c075ef8fe8c6f48b7a6305f498/LICENSE)。

| 序号 | 议题 | 早期方向 | 后续选择/实施 | 当前结论 | 状态 | 对话依据 | 重要限制 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 产品/品牌 | Serpent → Super → Super Lib | .super格式、新Logo与独立仓库；核心本地功能免费 | 品牌与免费定位保留 | 已实施 | C024–C041；C060–C067；C219–C230 | 不把旧项目Serpent 0.1.4算成Super发行。 |
| 2 | AI / RAG | 引入Anvil式RAG、完整云助手 | 用户要求停止堆叠、恢复modelzero；后续采用受约束素材分析/检索 | RAG原型撤回；现有素材AI保留 | 已撤回 / 边界保留 | C042–C059；C104–C119；C160、C161 | 云向量库、完整聊天与混合召回没有交付证据。 |
| 3 | 账号与付费 | 曾讨论全软件激活、云身份和管理后台 | 改为核心免费、仅可选AI插件可能需要授权 | 账号/付费插件仍是方案 | 未实施 | C050–C056；C275–C278 | 不能写成所有用户已必须注册或收费。 |
| 4 | 合集 | 链接目录加入合集 | 资产关系快照、可选递归、重复去重 | 不复制源文件、不自动持续同步 | 已实施 | C016–C023 | 合集目录分类只显示已有成员。 |
| 5 | 删除与NAS | 外部文件删除后保持索引一致 | 只有根可访问且确认文件缺失才移除索引 | 离线NAS保护、外部源文件删除权限不变 | 已实施 | C006–C015；C086–C095；C122–C125 | 移除索引 ≠ 物理删除外部文件。 |
| 6 | AI自动分析 | 倾向自动处理与便捷查找 | 文件夹显式选择加入、默认关闭；重复分析先确认 | 前台浏览优先；查找只匹配已分析本地资产 | 已实施 | C104–C119 | LLM生成经过校验的计划，不任意执行SQL。 |
| 7 | 版本号 | 0.1.x跳2.x后曾提回0.2.0/1.0.0 | 语义版本只向前，不发布较小编号做最新版 | 继续2.x递增 | 已采纳；回退撤销 | C120–C127；C196–C199 | 0.0.9未发行；2.0.1本地；2.0.3只有用户实机观察。 |
| 8 | 下载体验 | 早期后台直接下载、可见性不足 | 先征求同意，再下载/进度/取消/稍后与续传 | 用户授权下载和安装边界保留 | 已实施 | C073–C083；C126、C127 | 成功后自动打开不等于未经同意自动安装。 |
| 9 | 更新后启动 | 2.1.2选择完成后手动“启动 Super Lib” | 10/7用户改为进度结束提示完成并直接打开 | 2.3.16起自动拉起并关小窗，失败保留手动重试 | 后续替代；已实施 | C145–C150；C336–C339；C348 | 旧历史总览的手动启动规则已经过时。 |
| 10 | 更新包策略 | 早期产生app.asar增量，但客户端下载仍偏大 | 改解包文件布局，精确来源版本直达最新；无匹配整包回退 | 最多20来源delta、保留baseline | 已实施 | C096–C103；C136–C156；C165–C171；C188–C195 | 不是任意二进制差分；首次布局迁移可能仍较大。 |
| 11 | 服务器保留 | 设定最新5个完整目录+20个直达delta | 2.3.17晋升时保留既有目录，没有执行自动删旧版 | 策略与当次服务器实际状态分别记录 | 策略存在；本次未清理 | C188–C195；C211–C218；C348 | 不要宣称2.3.17发布后服务器恰好只剩5个目录。 |
| 12 | 新建根目录交互 | 顶部空白点击；后改标题栏双击 | 2.3.0改点击侧栏“文件夹”标题，仅重置新建父目录 | 不改当前图片、目录、焦点；系统双击最大化保留 | 多轮替代；终案已实施 | C162–C171；C188–C210；C231–C235 | 拖动窗口不能导航，浏览状态与新建目标分离。 |
| 13 | 默认壁纸 | 2.2.4内置壁纸；2.2.7狐狸图 | 2.3.6用户要求删内置默认壁纸 | 仅移除旧默认，保留用户自定义背景 | 后续撤销；已实施 | C196–C207；C258 | 旧总览“最新默认狐狸图”不可当成当前状态。 |
| 14 | 左下角资源库卡片 | 2.3.3显示路径/信息入口 | 2.3.4只保留库名，删路径与信息按钮 | 简洁卡片保留 | 后续精简；已实施 | C245–C253 | 不把旧截图的路径/信息按钮列为当前设计。 |
| 15 | 提示层 | 右下角全局提示但鼠标提示仍并存 | 2.3.5删局部重复提示 | 只保留统一角落提示，数据变化与通知静音分离 | 已实施 | C236–C242；C254–C257；C348 | 静音不应吞数据刷新。 |
| 16 | 文件类型 | 增加SolidWorks识别与PDF浮窗 | 保持批准范围和系统关联打开 | 文件类型支持，不宣称所有媒体都有浮窗/解析 | 已实施（限定） | C243、C244；C259–C264 | 没有内置SolidWorks解析；未实现视频/音频/3D浮窗。 |
| 17 | 个性化图标 | 最初称remote图标，随后明确emoji | 本库item持久化；入口统一设置文件夹图标、不带emoji前缀 | 文件夹/链接子目录/合集/智能合集可设emoji | 已实施 | C305–C315 | 不等于远程URL图标或跨库导出。 |
| 18 | 菜单重叠 | 2.3.10初轮CSS修复 | 用户复现仍无效；2.3.11深入Windows拖动命中 | 菜单打开屏蔽拖动命中，关闭恢复 | 初修不彻底 → 补修 | C310–C318 | 保留失败反馈，不能表述成2.3.10已彻底解决。 |
| 19 | 全屏预览 | 磁盘/AI完成触发刷新导致退出 | 2.3.12保留预览/选择；2.3.17统一刷新所有权 | 后台刷新不冒充用户导航 | 已实施 | C319–C321；C345–C348 | 用户主动切换/关闭仍按原逻辑退出。 |
| 20 | 导入根因 | 用户怀疑中文或方括号目录名不支持 | 日志显示源文件变化与Worker积压；合法字符路径测试通过 | 稳定文件复核、有限重试、异步暂存/哈希 | 猜测被否定；已修复 | C322–C327 | 聊天图片/旧Billfish库动态写入是线索，不逐个文件武断定因。 |
| 21 | 导入确认 | 出现待处理导入已失效 | 2.3.14锁定确认流程并实现幂等；2.3.17处理TTL清理故障 | 确认操作/清理生命周期可验证 | 已实施 | C328、C330；C345–C348 | 过期后清理失败不使导入重新有效。 |
| 22 | ECS迁移与成本 | 尝试41GiB→40GiB、99元方案 | 演练不等于镜像生成；用户释放SMC，暂停迁移 | 旧ECS更新源维护另有授权，不能恢复迁移 | 迁移暂停 / 更新源保留 | C277–C304；C308；C315；C335；C348 | 最终到期2026-11-04 23:59:59；免费快照截止10/22。 |
| 23 | 网站备份 | Docker由GitHub Actions重建 | 保留数据库、上传、配置与必要密钥；不下载可再生镜像缓存 | 先区分持久数据再备份 | 方案；未据此宣称已完整备份 | C293–C296 | my-gemini-app是网站仓库；不要与aimtowin/Super混淆。 |
| 24 | 提醒 | 邮件提醒、Windows日程讨论 | 用户说算了自己记住 | 没有创建提醒/自动化 | 已放弃 | C300–C303 | 用户贴出的11/4到期更正此前11/7估计。 |
| 25 | 软件工作暂停 | 曾暂停全部软件开发等待ECS | 9/27用户明确回归软件；之后允许维护旧ECS更新源 | 软件继续，ECS迁移仍暂停 | 新授权替代旧暂停 | C277、C278；C304；C308；C348 | 不要用早期暂停阻止已明确授权的软件工作。 |
| 26 | 2.3.16渠道 | 用户要求打包发布 | 实际GitHub正式；ECS仅本地dry-run未同步 | ECS由2.3.15直接晋升2.3.17 | 渠道差异已核对 | C336–C339；C348 | 不能写成2.3.16已在ECS上线。 |
| 27 | 架构阶段 | 专业结构图、完整计划与清单 | 用户要求真正动手；A阶段实施收尾后才发行 | A完成；B/C、账号服务与迁移未启动 | A已完成；B/C未实施 | C340–C348 | 百分比仅阶段A清单，不能等同全产品100%。 |
| 28 | 2.3.17验收 | 冻结源码、成品回归与双源发布 | 1152通过+1跳过；成品4项；46附件；ECS22binary原子晋升 | GitHub/ECS正式发布；未执行事项保留 | 已发布（限定验收） | C348 | 公网完整约199MB ZIP两次有界下载未完成；服务器完整SHA、公开分段和完整delta通过。 |
| 29 | 兼容与测量 | 优化不能损坏原功能 | schema49/事务/租约/FULL持久性、用户数据与依赖保持 | 不宣称未做的NAS/大库/RSS或真实安装验收 | 保护保留；性能基准未运行 | C331–C348 | 小型回归通过不推出实际速度提升百分比。 |
| 30 | 未来范围 | 主题导入导出、混合语义召回、云账号/AI付费插件 | 保留方向，不混进本次已完成清单 | 继续需新的明确范围和验收 | 未实施 | C128–C131；C160、C161；C275–C278；C340–C348 | 本报告只整理历史，不开启这些开发。 |

| 序号 | 版本 | 阶段日期 | 用户选择 | 实际修复/优化 | 渠道/状态 | 后续更正/限制 | 来源证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.0.1 | 2026-08-28 | 重命名、独立仓库和新资源库标识 | Super 品牌、Logo、.super、基础工程与媒体本地化 | Git提交 / 本地构建；早期分发以会话为据 | 旧 Serpent 0.1.4 不与新版本号混算。 | 会话 2026-08-28 16:20:27；JSONL 行 1728；终答行 1749；阶段对话 C024–C041；7b47348 / 16c2822 |
| 2 | 0.0.2 | 2026-08-29 | Super Lib 安装体验与明确确认更新 | Windows 安装/归档 API、快捷方式及更新链路 | Git标签；GitHub（会话） | 旧私有发布的404需手动升级衔接。 | 会话 2026-08-29 08:32:07；JSONL 行 4893；终答行 4940；阶段对话 C060–C067; v0.0.2 → 7816777a7475 |
| 3 | 0.0.3 | 2026-08-29 | 先修资产异常，再接 ECS 自动更新 | 未知元数据容错，音频0×0保护；显式 SSH 身份文件 | Git标签；ECS（会话） | 无新增政策替代记录。 | 会话 2026-08-29 09:32:18；JSONL 行 5983；终答行 6020；阶段对话 C068–C072; v0.0.3 → a742505266c2 |
| 4 | 0.0.4 | 2026-08-29 | 测试跨版本升级 | 更新真实版本及下载状态试跑 | Git标签；ECS（会话） | 暴露缺少下载可见进度，继续迭代。 | 会话 2026-08-29 10:03:50；JSONL 行 6444；终答行 6449；阶段对话 C073–C075; v0.0.4 → 6554507507b1 |
| 5 | 0.0.5 | 2026-08-29 | 下载前同意、可取消/稍后 | 进度、下次启动安装、更新完成说明 | Git标签；ECS（会话） | 无新增政策替代记录。 | 会话 2026-08-29 10:20:32；JSONL 行 6765；终答行 7101；阶段对话 C076; v0.0.5 → bd4151247a13 |
| 6 | 0.0.6 | 2026-08-29 | 隐藏命令交接窗口 | wscript式交接替换可见cmd/ping窗口 | Git标签；ECS（会话） | 无新增政策替代记录。 | 会话 2026-08-29 10:35:13；JSONL 行 7107；终答行 7214；阶段对话 C077; v0.0.6 → 37b71bfde18f |
| 7 | 0.0.7 | 2026-08-29 | 首次更新也可靠 | 创建缺失更新缓存目录 | Git标签；ECS（会话） | 无新增政策替代记录。 | 会话 2026-08-29 10:43:35；JSONL 行 7220；终答行 7387；阶段对话 C078; v0.0.7 → 7006e794becd |
| 8 | 0.0.8 | 2026-08-29 | 缓存清理不误删待安装文件 | 产物所有权、缓存清理和历史包保留 | Git标签；ECS（会话） | 无新增政策替代记录。 | 会话 2026-08-29 10:53:53；JSONL 行 7393；终答行 7430；阶段对话 C079、C080; v0.0.8 → 6341ddc0d130 |
| 9 | 0.1.0 | 2026-08-29 | 收束并双渠道发行 | 含未发行0.0.9的品牌/状态/完成标记改动 | Git标签；GitHub + ECS（会话） | 无新增政策替代记录。 | 会话 2026-08-29 11:22:39；JSONL 行 7812；阶段对话 C084、C085; v0.1.0 → 604bc1185775 |
| 10 | 0.1.1 | 2026-08-29 | 大库链接/移除不删源文件 | 目录聚合、取消与索引；后台挤压初轮优化 | Git标签；ECS（会话） | 移除仍阻塞，0.1.2继续修复。 | 会话 2026-08-29 15:24:56；JSONL 行 8030；终答行 8069；阶段对话 C086–C092; v0.1.1 → 204d0e674030 |
| 11 | 0.1.2 | 2026-08-29 | 批量移除可暂停、恢复 | 128条批处理、进度持久化、链接首次加载/层级 | Git标签；ECS（会话） | 无新增政策替代记录。 | 会话 2026-08-29 20:44:21；JSONL 行 9757；终答行 10259；阶段对话 C093–C095; v0.1.2 → 93cc38fee9bc |
| 12 | 0.1.3 | 2026-08-30 | 智能合集编辑稳定；探索精确增量 | 条件草稿、导航与早期文件增量产物 | Git标签；ECS（会话） | 增量产物生成和客户端实际选中是两件事；后续2.1.0补全。 | 会话 2026-08-30 10:13:16；JSONL 行 11103；终答行 11508；阶段对话 C096–C103; v0.1.3 → 2e0d8e9ba4c6 |
| 13 | 0.1.4 | 2026-08-30 | 根据重复反馈再修跳转 | 智能合集编辑不重入/不跳转，AI筛选迭代 | Git标签；ECS（会话） | 无新增政策替代记录。 | 会话 2026-08-30 11:28:16；JSONL 行 11736；终答行 11912；阶段对话 C096–C103; v0.1.4 → fc4bcf9aa92c |
| 14 | 2.0.0 | 2026-08-31 | AI本地受约束查找与可选分析 | 分析状态、筛选、临时智能合集、模型JSON校验 | Git标签；ECS（会话） | 语义版本跳号后决定不降版。 | 会话 2026-08-31 00:50:03；JSONL 行 14242；终答行 14282；阶段对话 C120、C121; v2.0.0 → b2d73ceec16d |
| 15 | 2.0.1 | 2026-08-31 | 只移除确认缺失资产 | 根目录可访问校验、离线NAS不误删索引 | 本地构建；未发布 ECS | 随后由2.0.2覆盖，不列作在线正式最新。 | 会话 2026-08-31 01:07:57；JSONL 行 14558；终答行 14563；阶段对话 C122–C125；ed70fcf（无正式发行标签） |
| 16 | 2.0.2 | 2026-08-31 | 保持递增编号；下载可续传 | Range / If-Range、SHA校验与回退 | Git标签；ECS，随后 GitHub（会话） | 0.2.0回退提案取消。 | 会话 2026-08-31 09:38:38；JSONL 行 14942；终答行 14951；阶段对话 C126、C127; v2.0.2 → 85e5010e49a1 |
| 17 | 2.1.0 | 2026-09-01 | 真正降低小改动升级成本 | 解包文件布局、精确delta、SQL分批、代表色索引；后同版重发加载提示 | ECS（会话）；后由6ad35fe收束 | 首次从asar布局切换下载可较大；不是二进制补丁。 | 会话 2026-09-01 13:28:25；JSONL 行 16963；阶段对话 C136–C141；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 18 | 2.1.1 | 2026-09-01 | 核实小增量并排查重启 | 约2.26MB增量；更新交接故障继续定位 | ECS（会话）；后由6ad35fe收束 | 并非此版一次性解决所有安装器问题。 | 会话 2026-09-01 15:00:36；JSONL 行 17385；终答行 17514；阶段对话 C144；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 19 | 2.1.2 | 2026-09-01 | 完成后由用户手动启动 | 独立可见进度窗、完成状态与启动按钮 | ECS（会话）；后由6ad35fe收束 | 2.3.16明确改为成功后自动打开。 | 会话 2026-09-01 15:14:17；JSONL 行 17520；终答行 17782；阶段对话 C145、C146；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 20 | 2.1.3 | 2026-09-01 | 恢复安装器前台可见 | 隐藏/呈现和窗口恢复 | ECS（会话）；后由6ad35fe收束 | 无新增政策替代记录。 | 会话 2026-09-01 15:33:41；JSONL 行 17954；终答行 18145；阶段对话 C147、C148；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 21 | 2.1.4 | 2026-09-01 | 避免静默安装模态错误 | 可见窗口模态非法创建的处理 | ECS（会话）；后由6ad35fe收束 | 无新增政策替代记录。 | 会话 2026-09-01 16:04:40；JSONL 行 18416；终答行 18495；阶段对话 C149、C150；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 22 | 2.1.5 | 2026-09-01 | 稳定安装交接；内部拖入不走外部导入 | 稳定relay路径、Inno窗口重复、空文件夹拖入遮罩 | ECS（会话）；后由6ad35fe收束 | 无新增政策替代记录。 | 会话 2026-09-01 19:18:44；JSONL 行 18516；阶段对话 C151–C155；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 23 | 2.1.6 | 2026-09-01 | 更新器无白边且原窗及时退出 | 深色玻璃界面、退出时机、安全整包回退 | ECS（会话）；后由6ad35fe收束 | 无新增政策替代记录。 | 会话 2026-09-01 19:41:02；JSONL 行 19089；终答行 19094；阶段对话 C156–C159；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 24 | 2.1.7 | 2026-09-01 | 顶部空白帮助新建根目录 | 启动按钮、重置新建目标的初版交互 | ECS（会话）；后由6ad35fe收束 | 后续发现影响浏览和窗口拖动，2.3.0终案替代。 | 会话 2026-09-01 20:17:29；JSONL 行 19338；终答行 19375；阶段对话 C162–C164；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 25 | 2.1.8 | 2026-09-01 | 首屏不等全量扫描或计数 | 分页、缓存、封面批处理、限制布局读取、侧栏后补 | ECS（会话）；后由6ad35fe收束 | 直达多版本增量在后续窗口策略完善。 | 会话 2026-09-01 23:43:23；JSONL 行 19659；终答行 19801；阶段对话 C165–C171；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 26 | 2.2.0 | 2026-09-10 | 目录与全部资产同样快速首显 | 目录首屏、ZIP/EXE/APK后缀缩略图和主题适配 | ECS（会话）；后由6ad35fe收束 | 无新增政策替代记录。 | 会话 2026-09-10 19:45:09；JSONL 行 20500；终答行 20613；阶段对话 C172–C176；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 27 | 2.2.1 | 2026-09-10 | 托盘久置恢复不阻塞 | watcher与reconciliation积压初修 | ECS（会话）；后由6ad35fe收束 | 后续仍有超长读取反馈。 | 会话 2026-09-10 21:23:27；JSONL 行 21416；终答行 21513；阶段对话 C177、C178；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 28 | 2.2.2 | 2026-09-11 | 按复现再修后台与更新器 | 长时间读取、恢复和焦点虚线 | ECS（会话）；后由6ad35fe收束 | 无新增政策替代记录。 | 会话 2026-09-11 12:28:07；JSONL 行 22218；终答行 22348；阶段对话 C179–C182；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 29 | 2.2.3 | 2026-09-11 | 异步可取消对账；更新可移植 | 按库串行恢复、前台优先、归因日志、部署/迁移参考 | ECS（会话）；后由6ad35fe收束 | 无新增政策替代记录。 | 会话 2026-09-11 17:16:09；JSONL 行 23565；终答行 23633；阶段对话 C183–C187；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 30 | 2.2.4 | 2026-09-13 | 内置默认背景；拒绝降到1.0.0 | 随发行打包默认壁纸 | ECS（会话）；后由6ad35fe收束 | 2.3.6删除旧内置默认背景，保留自定义。 | 会话 2026-09-13 09:50:40；JSONL 行 24788；终答行 24844；阶段对话 C196–C199；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 31 | 2.2.5 | 2026-09-13 | 只调整应用字体大小 | 1–4字体档位 | ECS（会话）；后由6ad35fe收束 | 无新增政策替代记录。 | 会话 2026-09-13 10:20:04；JSONL 行 25209；终答行 25392；阶段对话 C200、C201；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 32 | 2.2.6 | 2026-09-13 | 数字化档位并验证资源 | 字体数字标签、媒体资源和lint范围 | ECS（会话）；后由6ad35fe收束 | 无新增政策替代记录。 | 会话 2026-09-13 10:49:23；JSONL 行 25548；终答行 25553；阶段对话 C202–C206；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 33 | 2.2.7 | 2026-09-13 | 用户选择狐狸默认图 | 随包替换狐狸插画 | ECS（会话）；后由6ad35fe收束 | 2.3.6取消内置默认图。 | 会话 2026-09-13 13:36:26；JSONL 行 26040；终答行 26272；阶段对话 C207；连续版本证据为会话；Git边界仅6ad35fe基线 |
| 34 | 2.2.8 | 2026-09-13 | 拖窗不导航；统一可追溯基线 | 标题交互、源码/测试/文档治理和构建清理约60.7GiB | Git标签；GitHub + ECS | 当时双击重置新建目标，2.3.0改为侧栏标题；6ad35fe收束2.1.x–2.2.x。 | 会话 2026-09-13 21:07:40；JSONL 行 26279；阶段对话 C208–C210; v2.2.8 → 8757098815f3 |
| 35 | 2.3.0 | 2026-09-13 | 新建父目录与浏览分离 | 侧栏“文件夹”标题重置根目录；保留当前视图/焦点和系统最大化 | Git标签；GitHub + ECS（版本记录/会话） | 此前顶部双击方案被替代；历史全量门禁失败保留。 | 会话 2026-09-13 23:12:21；JSONL 行 28125；阶段对话 C231–C235; v2.3.0 → 1e34f457ef4c; docs/releases/v2.3.0.md; v2.3.0-validation.md |
| 36 | 2.3.1 | 2026-09-14 | 图片浮窗与右下角提示 | 置顶浮图、拖动缩放、主窗恢复；统一提示位置/对比 | Git标签；GitHub + ECS（版本记录/会话） | 局部重复提示后由2.3.5去掉。 | 会话 2026-09-14 22:12:55；JSONL 行 28810；终答行 29188；阶段对话 C236–C242; v2.3.1 → 984c4c83e4df; docs/releases/v2.3.1.md; v2.3.1-validation.md |
| 37 | 2.3.2 | 2026-09-15 | PDF浮窗在批准范围内 | PDF浮动、super://已批准资源路径 | Git标签；GitHub + ECS（版本记录/会话） | 音频/视频/3D浮窗不在本版。 | 会话 2026-09-15 21:35:36；JSONL 行 29919；阶段对话 C243、C244; v2.3.2 → 8d26d2f6e857; docs/releases/v2.3.2.md; v2.3.2-validation.md |
| 38 | 2.3.3 | 2026-09-15 | 左下角资源库卡片 | Obsidian式入口、亚克力、路径/关于/信息、无库启动 | Git标签；GitHub + ECS（版本记录/会话） | 随后2.3.4精简信息。 | 会话 2026-09-15 22:15:18；JSONL 行 30551；终答行 30572；阶段对话 C245–C249; v2.3.3 → 57c93f664010; docs/releases/v2.3.3.md |
| 39 | 2.3.4 | 2026-09-15 | 卡片仅库名 | 隐藏路径、删除信息按钮 | Git标签；GitHub + ECS（版本记录/会话） | 替代2.3.3常驻路径与信息入口。 | 会话 2026-09-15 22:59:06；JSONL 行 31766；阶段对话 C250–C253; v2.3.4 → 9126fd71cbbb; docs/releases/v2.3.4.md |
| 40 | 2.3.5 | 2026-09-15 | 只保留统一全局提示 | 删鼠标旁重复提示，保留右下角和搜索语法提示 | Git标签；GitHub + ECS（版本记录/会话） | 无新增政策替代记录。 | 会话 2026-09-15 23:15:59；JSONL 行 32265；终答行 32472；阶段对话 C254–C257; v2.3.5 → 222290e5d8ab; docs/releases/v2.3.5.md |
| 41 | 2.3.6 | 2026-09-20 | 不要内置默认壁纸 | 清除旧默认图；保留用户背景；字体颜色和对比度 | Git标签；GitHub + ECS（版本记录/会话） | 替代2.2.4/2.2.7壁纸方向。 | 会话 2026-09-20 09:02:09；JSONL 行 32764；终答行 33135；阶段对话 C258; v2.3.6 → 8b362b63b1a2; docs/releases/v2.3.6.md |
| 42 | 2.3.7 | 2026-09-20 | 索引入口名称与SolidWorks类型 | 资源库索引名称；CAD格式识别、筛选、默认图、系统关联打开 | Git标签；GitHub + ECS（版本记录/会话） | 未增加内置SolidWorks模型解析器。 | 会话 2026-09-20 09:25:28；JSONL 行 33142；终答行 33186；阶段对话 C259–C264; v2.3.7 → 9376c73229a8; docs/releases/v2.3.7.md |
| 43 | 2.3.8 | 2026-09-22 | 可跳过引导；保守瘦身 | 快速入门可重开；裁掉未用字体/工具；保留许可和媒体3D | Git标签；GitHub + ECS（版本记录/会话） | 当版安装器体积-17.26%；不是最新版性能基准。 | 会话 2026-09-22 17:45:22；JSONL 行 33982；终答行 33985；阶段对话 C268–C274; v2.3.8 → fcc51cae42ed; docs/releases/v2.3.8.md; v2.3.8-validation.md |
| 44 | 2.3.9 | 2026-09-27 | emoji个性化，不用remoteURL | 文件夹/链接子目录/合集/智能合集emoji；本库持久化 | Git标签；GitHub + ECS（版本记录/会话） | 后续入口文案移除emoji前缀；未承诺导出跨库。 | 会话 2026-09-27 18:39:00；JSONL 行 35221；阶段对话 C305–C308; v2.3.9 → edef69155b0d; docs/releases/v2.3.9.md; v2.3.9-validation.md |
| 45 | 2.3.10 | 2026-09-28 | 菜单命名和文本筛选异常 | “设置文件夹图标”；紧凑筛选协议；初轮CSS重叠点击 | Git标签；GitHub + ECS（版本记录/会话） | 用户复现重叠仍在，2.3.11补原生命中修复。 | 会话 2026-09-28 10:47:20；JSONL 行 35769；终答行 35819；阶段对话 C310–C315; v2.3.10 → 63d764b4be2a; docs/releases/v2.3.10.md; v2.3.10-validation.md |
| 46 | 2.3.11 | 2026-09-28 | 菜单重叠需原生层修复 | 打开菜单时禁用相应标题拖动命中，关闭再恢复 | Git标签；GitHub + ECS（版本记录/会话） | 纠正2.3.10仅CSS的不足。 | 会话 2026-09-28 13:31:35；JSONL 行 36839；终答行 36901；阶段对话 C317、C318; v2.3.11 → 2e75283c1ba9; docs/releases/v2.3.11.md; v2.3.11-validation.md |
| 47 | 2.3.12 | 2026-09-28 | 后台变化不关闭全屏预览 | 保留选择/筛选/草稿/全屏；刷新不等于导航 | Git标签；GitHub + ECS（版本记录/会话） | 主动关闭和切换行为保持。 | 会话 2026-09-28 16:09:47；JSONL 行 37249；终答行 37449；阶段对话 C319–C321; v2.3.12 → 2759f5fc145f; docs/releases/v2.3.12.md; v2.3.12-validation.md |
| 48 | 2.3.13 | 2026-09-28 | 导入依赖源文件稳定，而非禁止中文/括号 | 稳定快照、有限重试、异步暂存与流式哈希；排队诊断 | Git标签；GitHub + ECS（版本记录/会话） | 字符不支持的假设被测试否定；旧Billfish库动态写入须区分。 | 会话 2026-09-28 17:14:33；JSONL 行 37683；阶段对话 C322–C327; v2.3.13 → 449c72ccecee; docs/releases/v2.3.13.md; v2.3.13-validation.md |
| 49 | 2.3.14 | 2026-09-28 | 重复确认可靠且幂等 | 锁定取消/Esc与提交；同操作结果复用；事务外让步/历史合并 | Git标签；GitHub + ECS（版本记录/会话） | 对应“待处理导入已失效”新反馈。 | 会话 2026-09-28 18:00:32；JSONL 行 38229；终答行 38248；阶段对话 C328、C330; v2.3.14 → 1c5a840b2319; docs/releases/v2.3.14.md; v2.3.14-validation.md |
| 50 | 2.3.15 | 2026-10-07 | 性能优化不改原功能/数据库 | 合并轮询/刷新、有界缓存、版本失效、受影响更新、异步对账；2万资产局部结果读取约70→14ms | Git标签；GitHub + ECS（版本记录/会话） | 局部读取测量不等于整次导入或真实NAS同倍提速。 | 会话 2026-10-07 13:27:01；JSONL 行 38645；终答行 38744；阶段对话 C331–C335; v2.3.15 → 3c755cd5aa40; docs/releases/v2.3.15.md; v2.3.15-validation.md |
| 51 | 2.3.16 | 2026-10-07 | 筛选一致；更新成功自动打开软件 | 包含/排除/反选、键盘/摘要/主题；完成通知、自动拉起/关窗、失败手动重试 | Git标签；GitHub正式；ECS未同步 | 替代2.1.2手动启动政策；本版ECS未同步，只dry-run。 | 会话 2026-10-07 16:56:52；JSONL 行 40781；终答行 40877；阶段对话 C336–C339; v2.3.16 → ac4c244edd30; docs/releases/v2.3.16.md; v2.3.16-validation.md |
| 52 | 2.3.17 | 2026-10-09 | 阶段A完整收尾并双渠道发布 | 所有权/并发/刷新、TTL/RPC/暂存/下载预算；构建来源与门禁；保留schema49 | GitHub 10/09 11:40:13；ECS 11:42:49 | 仅阶段A；B/C、真实安装、大库/NAS基准未运行；公网完整ZIP下载未完成。 | 会话 2026-10-08 19:48:46；JSONL 行 46259；终答行 47347；阶段对话 C348; v2.3.17 → 4516e0a2928e; docs/releases/v2.3.17.md; v2.3.17-validation.md |

品牌由 Serpent 改为 Super，再面向用户显示 Super Lib；新 Logo、安装器/快捷方式、独立仓库与 `.super` 标识逐步落实。用户当时要求去 Serpent 化和去掉旧兼容识别，这属于品牌/格式政策，不是抹掉上游版权的依据；当前 MIT 及来源说明按第 1 节的新决定保留。

| 节点 | 实际操作与结果 | 保留边界 / 未完成 |
| --- | --- | --- |
| 2026-10-09 仓库文档治理，提交 fcf074d | 隔离 2.3.17 桌面实例采集 64 张真实截图；功能指南 12 大类、53 子节；审查 138 Markdown / 422 本地引用，零断链；与 GitHub main 及图片 blob 核对 | 没有新应用版本、ECS写入或运行用户安装器；外部服务截图不等于端到端通过 |
| 旧 UI 素材清理 | 34 个不再引用的旧图先移至仓库外可恢复备份，再从当前 Git 树清理；新图约10.23 MiB | 历史提交可追溯，源码/用户资源/发行包/baseline不删；私人 HTML 不发布 |
| 实拍新发现 | 成品脚本 UtilityProcess 报 Cannot find module 'typescript' / RUNTIME_PROCESS_EXITED，已在指南和审查中披露 | **未修复**；不因此前基础成品测试通过而隐瞒，不注入依赖制作假成功截图 |
| 本次 MIT 与历史记录续写 | README 末尾加上游链接；独立本文保留52版/30决策/349对话索引；MIT元数据与版权统一 | 仅文档及许可元数据，无版本提升、打包或远端操作；本次提交/发布须另有相应操作记录 |

本节保留**先前 MIT/历史整理任务收尾时点**的结果；第 12 节是其后的上游审计、专项测试与 Git 同步范围，不能把下面的“未推送/未跑应用测试”读成整天或所有后续任务均未执行。

包元数据与 HEAD 对比，除根 license 从 UNLICENSED 改为 MIT 外，没有其他版本、依赖或配置变化；版本仍为 2.3.17。README 中英文结尾均有上游链接，根 LICENSE 保留上下游版权与完整 MIT 正文。本次没有运行应用全量测试、安装器、打包、Git 提交/推送或 ECS 部署，不将文档检查记为运行时功能修复。

| 编号 / 时间 / 阶段 | 用户发言摘述 | 阶段决策与限制 | 当轮历史结果摘述（非本次验收） |
| --- | --- | --- | --- |
| C001 2026-08-28 11:17:35 · 需求 / 决策 · 接手基线 | 探索 | 先运行并核对已有能力，不把浏览器构建替代桌面版。 限制：Serpent 0.1.4 是原项目版本，不是 Super 新发行。 | 这是 Serpent：面向设计与影视工作流的跨平台数字资产管理桌面应用（Electron + React + TypeScript），当前版本 `0.1.4`。 核心架构： ```text React Renderer → Preload contextBridge → Electron Main → Library Worker ↓ SQLite + Assets/ + .serpent/art…〔摘述〕 |
| C002 2026-08-28 11:18:48 · 需求 / 决策 · 接手基线 | 尝试在本机运行 | 先运行并核对已有能力，不把浏览器构建替代桌面版。 限制：Serpent 0.1.4 是原项目版本，不是 Super 新发行。 | Serpent 已在本机成功启动并保持运行。 - Renderer 已挂载验证，Library Worker 与浏览器扩展服务均正常。 - 开发服务器监听 `http://localhost:5173`，Electron 进程正在运行。 - 已安装依赖并重建、验证了 Electron ABI 对应的 `better-sqlite3` / FTS5。 - 因系统用户配置目录不支持原子重命名，开发实例…〔摘述〕 |
| C003 2026-08-28 11:34:10 · 需求 / 决策 · 接手基线 | 我如何访问？ | 先运行并核对已有能力，不把浏览器构建替代桌面版。 限制：Serpent 0.1.4 是原项目版本，不是 Super 新发行。 | 直接在桌面上访问：应该已有一个 **Serpent** 窗口打开；若被遮挡，请在任务栏或 `Alt + Tab` 中切换到它。 首次进入时，选择“创建资源库”，挑一个本地文件夹即可开始导入和浏览资产。 `http://localhost:5173` 是开发用的前端服务，不建议直接用浏览器访问；完整功能需要通过 Electron 的 Serpent 桌面窗口使用。 |
| C004 2026-08-28 11:37:50 · 需求 / 决策 · 接手基线 | 本软件功能是否全面 | 先运行并核对已有能力，不把浏览器构建替代桌面版。 限制：Serpent 0.1.4 是原项目版本，不是 Super 新发行。 | 总体来说，功能已相当全面，尤其适合作为本地创意素材管理工具；但还不是“企业级全能 DAM”。 已有的核心能力包括： - 导入、拖拽、剪贴板、链接文件夹与浏览器扩展采集 - 文件夹、合集、标签、评分、描述、喜欢、颜色与技术元数据 - 搜索、过滤、排序、瀑布流/平铺浏览 - 图片、视频、音频、文档、3D 模型与序列帧预览 - AI 自动生成描述、标签等内容 - WebDAV 双向同步 - Eagle …〔摘述〕 |
| C005 2026-08-28 12:01:09 · 需求 / 决策 · 接手基线 | 现在再打开一次 | 先运行并核对已有能力，不把浏览器构建替代桌面版。 限制：Serpent 0.1.4 是原项目版本，不是 Super 新发行。 | 已重新打开并验证成功：Serpent 窗口已完成界面挂载，后台 Worker 和扩展服务均正常运行。请在任务栏或 `Alt + Tab` 中找到 Serpent。 |
| C006 2026-08-28 12:04:02 · 需求 / 决策 · 初期修复 | 目前我删除了名为“屏幕截图”的文件夹链接，但是serpent还错误的加载着这些数据，我无法彻底清除 （附图线索） （附件线索，原件留在本机） | 忽略只影响可见性和索引；外部源文件不应随移除索引被删除。 | 这是“链接文件夹的索引记录”仍被保留，不是 Serpent 仍在读取已删除的源目录。它默认保留这些记录，方便你以后用“重新定位”找回；截图中的红色缺失图标正是这个状态。 要彻底清除，请在左侧“文件夹”里找到原来的链接根目录 **“屏幕截图”**，右键它，然后选： **从库中移除** → 确认 这会删除该链接文件夹及其全部资产记录、缩略图索引和元数据记录，但不会操作外部磁盘目录。由于你的源目录已删，…〔摘述〕 |
| C007 2026-08-28 12:05:41 · 需求 / 决策 · 初期修复 | 左侧甚至没有“屏幕截图”文件夹 （附图线索） （附件线索，原件留在本机） | 忽略只影响可见性和索引；外部源文件不应随移除索引被删除。 | 查明了：**“屏幕截图”并未被删除，而是被标记为“忽略”**，所以侧栏不显示。 数据库中仍有： - 链接根目录：`屏幕截图` - 关联记录：1,450 条 - 缺失文件：1,450 条 - 源目录：`〔私人路径省略〕 - 根目录隐藏规则：已启用 这是界面缺陷：根目录被忽略后，侧栏没有提供恢复入口，因此你无法再右键“从库中移除”。 我可以先安全地取消这一个“忽略”标记（不删除任何数据），让“屏幕截图…〔摘述〕 |
| C008 2026-08-28 12:08:41 · 需求 / 决策 · 初期修复 | 执行 | 忽略只影响可见性和索引；外部源文件不应随移除索引被删除。 | 已执行完成：**“屏幕截图”已恢复显示**，Serpent 也已重新启动并完成界面挂载。 我只移除了该链接根目录的“忽略”标记，**尚未删除任何资产记录**。修改前数据库已备份到： 〔私人路径省略〕 现在在左侧找到“屏幕截图”，右键选择 **“从库中移除”** 并确认，即可永久清掉这 1,450 条缺失记录。 |
| C009 2026-08-28 12:11:17 · 分析 / 诊断 · 初期修复 | 为什么会造成这样的情况 | 忽略只影响可见性和索引；外部源文件不应随移除索引被删除。 | 这是两个机制叠加造成的： 1. “屏幕截图”链接根目录被写入了“忽略”规则。 这个规则会让它从左侧文件夹树消失。 2. 该链接目录里的源文件随后被删空。 Serpent 默认不会马上删掉链接资产记录，而是标记为“文件丢失”，以便用户日后重新定位、保留标签和合集等信息。 本机数据库的实际状态是：链接根目录仍存在，路径仍有效但只剩 `desktop.ini`；其下的 1,450 个资产全都缺失。同时，…〔摘述〕 |
| C010 2026-08-28 12:11:33 · 需求 / 决策 · 初期修复 | 如何修复？ | 忽略只影响可见性和索引；外部源文件不应随移除索引被删除。 | 分两层修复。 当前数据的修复： 1. 取消“屏幕截图”链接根目录的忽略标记（已完成）。 2. 在左侧右键“屏幕截图”。 3. 选择“从库中移除”并确认。 这会删除 1,450 条失效索引记录，不会删除外部磁盘文件。 产品本身应修复这个死角： - “已忽略项目”必须有始终可访问的管理入口，不能因文件夹被隐藏就无法取消忽略。 - 左侧“显示已忽略项目”应当能显示被忽略的链接根目录，并提供“取消忽略”。…〔摘述〕 |
| C011 2026-08-28 12:12:23 · 分析 / 诊断 · 初期修复 | 我是本产品的接力开发者，我需要修复这个bug并排查更多bug，然后拓展更多功能 | 忽略只影响可见性和索引；外部源文件不应随移除索引被删除。 | 建议把第一迭代限定为“链接文件夹可靠性”： - 修复隐藏链接根目录后无法管理的问题 - 统一“忽略 / 所有资产 / 侧栏”三处的数据可见性 - 为删除、清空、重新定位和外部文件消失补回归测试 - 输出该模块的风险清单与下一阶段功能建议 你希望我先按这个范围完成第一迭代，还是优先处理另一类功能？ |
| C012 2026-08-28 12:16:31 · 需求 / 决策 · 初期修复 | 帮我理解本软件目前的技术构成、整体结构、成熟度，给我一份简短报告 | 忽略只影响可见性和索引；外部源文件不应随移除索引被删除。 | ## Serpent 技术简报 **定位** Serpent 是面向设计、游戏美术与后期制作的本地数字资产管理软件，目标接近 Eagle / Billfish，并扩展了 AI、WebDAV、插件、脚本与 MCP 自动化。 **技术构成** - 桌面框架：Electron 43、Electron Forge、Vite - 前端：React 19 + TypeScript - 数据层：SQLite /…〔摘述〕 |
| C013 2026-08-28 12:21:03 · 需求 / 决策 · 初期修复 | 数据一致性就是联网？网络资源库吗？刚才遇到的链接文件夹bug怎么修复？ | 忽略只影响可见性和索引；外部源文件不应随移除索引被删除。 | 不是。这里的“数据一致性”首先指**本地状态一致**，不等于联网或网络资源库。 例如同一份资产在四处的状态应一致： ```text 磁盘文件 ↔ SQLite 索引 ↔ Worker 业务状态 ↔ 侧栏/“所有资产”界面 ``` 联网资源库、WebDAV 同步只是另一层：不同设备之间的状态一致性。 这次链接文件夹 bug 的根因是： - `explicit_ignored_paths` 中把“屏幕…〔摘述〕 |
| C014 2026-08-28 12:22:54 · 需求 / 决策 · 初期修复 | 开始处理 | 忽略只影响可见性和索引；外部源文件不应随移除索引被删除。 | 第一项可靠性修复已完成。 变更： - “显示已忽略项目”现在会同时影响链接文件夹侧栏。 - 被忽略的链接根目录在默认状态仍隐藏；开启该开关后会出现，可右键“从库中移除”。 - 资产列表、搜索与忽略规则的现有一致性行为已由回归测试覆盖。 - 实施计划已保存至 2026-08-28-linked-folder-ignore-consistency.md。 验证通过： - `tests/worker/l…〔摘述〕 |
| C015 2026-08-28 12:29:38 · 需求 / 决策 · 初期修复 | 我关闭了进程，帮我重启一下 | 忽略只影响可见性和索引；外部源文件不应随移除索引被删除。 | 已重启开发实例，资源库已自动恢复，Worker、界面和扩展服务均正常启动。 另外日志发现一个不影响启动的 React 警告：`MenuSurface` 列表存在重复 `key`。我会将它纳入后续 bug 排查。 |
| C016 2026-08-28 12:34:30 · 需求 / 决策 · 初期修复 | 链接的资产文件夹如何放入合辑 （附图线索） （附件线索，原件留在本机） | 链接目录加入合集采用资产关系快照，不复制文件；递归可选。 限制：不是持续自动同步合集。 | 当前版本不能把“链接文件夹”本身直接放进合辑；合辑保存的是**资产成员**，不是文件夹引用。 操作方式： 1. 点击左侧链接文件夹，例如“空镜素材库”。 2. 进入实际包含图片/视频的层级。 3. `Ctrl + A` 选中资产。 4. 右键 → **添加到合集** → 选择目标合辑；也可以把选中的资产拖到左侧合辑上。 注意：若当前页面同时有子文件夹卡片，`Ctrl + A` 只会加入可选中的资产…〔摘述〕 |
| C017 2026-08-28 12:35:49 · 需求 / 决策 · 初期修复 | 新增“将链接文件夹全部资产加入合辑（可选递归）”，并在后续新增/删除源文件时明确是否自动同步合辑成员。 | 链接目录加入合集采用资产关系快照，不复制文件；递归可选。 限制：不是持续自动同步合集。 | 推荐采用“快照加入”： - 执行时，将链接文件夹内的当前资产加入目标合辑。 - 可勾选“包含子目录”。 - 之后源文件夹新增、删除、移动文件，**不会自动修改**合辑；合辑成员保持稳定。 - 菜单与提示中明确标注“不会自动同步”，避免用户误以为它是动态映射。 另外两种方案是单向自动同步（新增自动加入）和双向镜像同步（新增加入、删除移除）；两者都容易在整理合辑时产生意外变更，也会增加删除规则与冲突处…〔摘述〕 |
| C018 2026-08-28 12:36:33 · 需求 / 决策 · 初期修复 | 这个方法是否会占用两份磁盘空间？ | 链接目录加入合集采用资产关系快照，不复制文件；递归可选。 限制：不是持续自动同步合集。 | 不会。 “快照加入”只在数据库中记录“这个资产属于这个合辑”的关系，不复制图片、视频或链接文件夹；磁盘上仍只有源文件那一份。新增开销只是少量数据库记录。 只有你主动执行“导入到资源库/复制到资源库”时，Serpent 才会复制文件并占用第二份空间。 |
| C019 2026-08-28 12:36:43 · 需求 / 决策 · 初期修复 | 执行 | 链接目录加入合集采用资产关系快照，不复制文件；递归可选。 限制：不是持续自动同步合集。 | 功能已完成并重启开发实例。 使用方式：右键链接文件夹或其子文件夹 → **将文件夹资产加入合集…** → 选择目标合集 → 选择是否包含子目录 → 加入。 语义已固定： - 只记录合辑成员关系，不复制源文件，不占第二份磁盘空间。 - 只加入当前可用、未被过滤的链接资产。 - 后续源文件夹新增、删除、移动文件时，合辑**不会自动同步**；已加入成员保持不变，源文件消失时会显示为不可用。 - 操作支持…〔摘述〕 |
| C020 2026-08-28 12:52:47 · 需求 / 决策 · 初期修复 | 不会自动同步？那如何同步？ | 链接目录加入合集采用资产关系快照，不复制文件；递归可选。 限制：不是持续自动同步合集。 | 当前的“快照加入”不会自动同步。 要同步新增文件：再次右键同一链接文件夹 → **将文件夹资产加入合集…**。已存在成员会自动跳过，只补充新资产。 要同步删除文件：目前需在合辑中手动移除显示为“不可用/缺失”的资产；源文件删除不会自动把它从合辑删掉。 更适合下一步新增一个 **“与链接文件夹同步合辑”** 操作：先预览“新增 N 项、源文件缺失 N 项”，再由用户确认是否同时移除缺失成员。这样可避…〔摘述〕 |
| C021 2026-08-28 12:53:53 · 需求 / 决策 · 初期修复 | 图二是合集中的显示，分类失效了，请修复 （附图线索） （附件线索，原件留在本机） | 链接目录加入合集采用资产关系快照，不复制文件；递归可选。 限制：不是持续自动同步合集。 | 根因已确认：合集当前只保存资产 ID，进入合集时直接渲染成员列表；链接资产原有的目录路径没有参与合集视图分组，因此分类被“平铺”了。 建议修复为：合集内按资产的**原始链接目录**重新生成分类卡片。这样“空镜素材库 → 空镜置镜”仍会保留 AI、视频素材、自然等分类；点分类卡片后查看对应资产。不同来源的资产则分别分组，不复制文件，也不改变原合辑成员。 是否按这个“保留源目录分类”的方案修复？ |
| C022 2026-08-28 12:54:27 · 确认 / 推进 · 初期修复 | 修复 | 链接目录加入合集采用资产关系快照，不复制文件；递归可选。 限制：不是持续自动同步合集。 | 已修复并重启本机开发版。 现在在“空镜置镜”合辑中会重新显示链接文件夹的分类卡片；双击分类后，只显示该分类下、且已属于该合辑的资产，不会混入源文件夹的其他文件，也不会复制文件或改动合辑成员。 验证已通过：46 项回归测试、类型检查、Lint。实现计划见 collection-linked-source-browse.md。 |
| C023 2026-08-28 13:08:37 · 分析 / 诊断 · 初期修复 | 尝试重命名合集时报错，且无限报错，目标合集一直存在；且发现：当我通过直接拖动外部资产到某合集后，文件会被错误存到随机的路径里，一并排查修复 （附图线索） （附件线索，原件留在本机） | 合集外部拖入应导入资源库根目录，不继承上次浏览位置。 限制：不擅自搬迁此前已导错位置的资产。 | 已修复并重启本机开发版。 - 合集重命名：父合集含子合集时不再误报“目标合集不存在”；失败的内联重命名也会自动关闭，不会无限重试报错。 - 外部文件拖到合集：文件现在固定导入素材库根目录，再加入目标合集，不会继承上次浏览的随机/残留文件夹路径。 - 已有被错误导入的文件未自动移动，避免误迁移；如需，我可以下一步帮你定位并整理这些历史文件。 验证通过：28 项定向测试、类型检查、Lint。计划见 c…〔摘述〕 |
| C024 2026-08-28 16:20:27 · 发布请求 · 0.0.1 | 是否有完整的打包（exe安装包）流水线？ | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 有一条相当完整的“本地发布流水线”，能产出 Windows 安装包： `验证 → 媒体二进制校验 → Electron 打包 → 打包后检查 → 已打包应用 E2E → Forge 制品 → Inno Setup 安装器 → SHA-256 校验和` Windows 上执行： ```powershell npm run release:local ``` 最终安装包为 `out\make\inno…〔摘述〕 |
| C025 2026-08-28 16:22:53 · 需求 / 决策 · 0.0.1 | 我计划为serpent整体改名和更改图标，你有什么建议？ | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 我建议把 Serpent 从“暗黑蛇形工具”转成“本地优先的视觉资产工作台”——更贴合它的素材库、链接文件夹、合辑和创作工作流定位。 我最推荐的命名方向： \| 候选 \| 气质 \| 取舍 \| \|---\|---\|---\| \| **Vistora** \| 专业、国际化、适合视觉资产平台 \| 含义需靠品牌叙事建立 \| \| **Framebase** \| 一眼理解为素材/画面库 \| 较通用，需重点做商标和域…〔摘述〕 |
| C026 2026-08-28 16:28:25 · 需求 / 决策 · 0.0.1 | 改为Super | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 可以，品牌名定为 **Super**。 它简短、有力量，适合“增强创作效率的素材工作台”；但通用度极高，正式发布前必须核验商标、域名和应用商店重名。 我建议对外统一写作： - 产品名：**Super** - 定位：**Super — 本地优先的视觉资产工作台** - 图标：深色圆角方形内的抽象 `S` 轨迹／叠放素材卡片，保留现有蓝色主调。 你希望我现在只改界面显示名称，还是连安装包、应用标识、图…〔摘述〕 |
| C027 2026-08-28 16:32:28 · 分析 / 诊断 · 0.0.1 | 1.把所有原本的serpent标识全改为Super;2.将如图中的关于Super页面信息也进行修改，把版本改为0.0.1，并检查是否真的有内置的检查更新逻辑，且把副标题和下方开源描述删掉，经过我们的协商，新版本不再开源；3.我计划重新设计图标并替换，稍后我会把图标给你；4.保证在这几轮替换后，不要再出现有关旧版本Serpent的信息，而是清一色的Super （附图线索） （附件线索，原件留在本机） | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 已完成 Super 品牌迁移的第一轮。 - 应用名、安装器、扩展名称、原生菜单、托盘、窗口标题改为 **Super**。 - 版本改为 **0.0.1**，产品许可标记为 `UNLICENSED`。 - “关于 Super”只保留图标、名称和版本；已删除副标题、开源描述、GitHub 按钮和检查更新控件。 - 已确认原先存在完整 GitHub 自动更新逻辑；现在没有任何界面入口会访问旧 GitHu…〔摘述〕 |
| C028 2026-08-28 16:53:51 · 需求 / 决策 · 0.0.1 | 重启 | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 已真正重启 Super 开发版，并恢复了最近打开的资源库。启动日志显示 Worker 已就绪、资源库已成功恢复。 |
| C029 2026-08-28 16:57:58 · 需求 / 决策 · 0.0.1 | 连接新GitHub库，并以目前git状态为第一版库“git\@github.com:aimtowin/Super.git”；连接后恢复相应功能和接口 | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 已完成并推送首版： - 远端：`git@github.com:aimtowin/Super.git` - 分支：`main` - 首次提交：`04e5d1a chore: establish Super 0.0.1` - 工作区干净；本机 `.serpent-dev-user-data/` 已排除，未上传任何本地缓存或凭据。 更新功能已恢复并迁移至新仓库： - “关于 Super”可检查、下载、取…〔摘述〕 |
| C030 2026-08-28 17:09:39 · 需求 / 决策 · 0.0.1 | 目前新建资源库的结构命名还会是.serpent吗 （附图线索） （附件线索，原件留在本机） | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 是的。目前新建资源库仍会创建 `.serpent`，截图符合现状。 它是资源库的内部数据目录，存放 `library.db`、缩略图/媒体派生文件、操作记录、插件数据等；创建逻辑仍明确写死在 library-service.ts。 若要彻底改名为 `.super`，不能简单替换：需要同时实现“新库写 `.super`、旧 `.serpent` 库可继续打开、首次打开可安全迁移”的兼容方案，并同步插…〔摘述〕 |
| C031 2026-08-28 17:10:59 · 需求 / 决策 · 0.0.1 | 彻底改名，并一并修改图示文件夹名字，但请确保修改完毕后功能正常 | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 会涉及旧资源库的磁盘结构迁移。请确认采用“首次打开旧库时自动将 `.serpent` 原子迁移为 `.super`，失败则回滚且保留旧库可打开”的方案吗？ |
| C032 2026-08-28 17:12:45 · 确认 / 推进 · 0.0.1 | 可以 | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 已完成并已重启 Super。 - 新资源库统一使用 `.super/`；旧 `.serpent/` 在首次打开时会原子迁移，并同步 `.serpentignore`。 - 已实际验证 `〔私人路径省略〕 均存在，`.serpent` 已不存在。 - 若 `.super` 与 `.serpent` 同时存在，程序会拒绝打开，避免覆盖数据。 - 插件库级数据、导入/导出、恢复记录等已切换到 `.sup…〔摘述〕 |
| C033 2026-08-28 17:36:28 · 需求 / 决策 · 0.0.1 | 目前是不是已经完全迁移了？ | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 资源库层面已完全迁移：`〔私人路径省略〕 已是 `.super/`，数据库与 Assets 正常，旧 `.serpent/` 不存在。 但若“完全”指整个项目中不再有任何 `Serpent` 痕迹，尚未完成。为兼容旧数据，代码仍保留旧目录迁移识别；此外内部协议、`window.serpent` API、同步目录 `.serpent-sync`、Windows App ID 和旧用户数据路径仍有遗留…〔摘述〕 |
| C034 2026-08-28 17:37:40 · 需求 / 决策 · 0.0.1 | 彻底去 Serpent 化 ；并修改所有旧图标为我提供的图标："〔私人路径省略〕 Logo.png" | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 已替换为你提供的 Super 图标，并成功生成应用 PNG、ICO、ICNS、Dock 与浏览器扩展图标。 “彻底去 Serpent 化”的全量命名空间切换已开始，TypeScript 编译通过；但我发现插件运行时代码把 `super` 当作 JavaScript 变量名，而 `super` 是保留字，导致 19 个插件相关单元测试失败。当前不应视为完成，也不建议打包发布。 我会继续将脚本/插件 …〔摘述〕 |
| C035 2026-08-28 17:44:59 · 需求 / 决策 · 0.0.1 | 继续全量替换 | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 已继续完成全量替换并重启开发版。 - 新图标已替换并生成 `app.png`、`app.ico`、`app.icns`、Dock 图标及浏览器扩展图标。 - 外部品牌、协议、MCP 工具命名、插件命名、脚本扩展、打包与媒体构建命名已切至 Super。 - 插件/脚本运行时 API 使用 `superApi`（`super` 是 JavaScript 保留字）；桌面桥保留合法的 `window.su…〔摘述〕 |
| C036 2026-08-28 17:50:35 · 需求 / 决策 · 0.0.1 | 删除.serpent识别 | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 已删除 `.serpent` 识别并重启 Super。 - 旧 `.serpent/`、`.serpentignore` 不再被打开、导入或 ZIP 导入流程识别。 - 仅接受 `.super/library.db`。 - 已移除旧迁移逻辑与相关测试。 - 扫描确认源码和测试中已无旧 `.serpent` 路径识别。 - TypeScript、ESLint 与 82 个资源库关键测试均通过。 注意…〔摘述〕 |
| C037 2026-08-28 17:55:57 · 发布请求 · 0.0.1 | 推送GitHub，把本地代码作为第一标准，覆盖并删除远端代码；打包一个exe发布版本，我要测试 | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 没有独立终答；与后续补充合并处理或仅提供附件。 |
| C038 2026-08-28 21:20:29 · 发布请求 · 0.0.1 | 目前所有的替换工作和打包工作都已经修改好了。现在我需要你参考旧仓库的文档，对新仓库的文档进行迁移。要求：确保旧仓库中尽可能完整的信息被迁移到新仓库，请保证文档中serpent不会出现。修改完成后推送到GitHub，使修改生效。 | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 没有独立终答；与后续补充合并处理或仅提供附件。 |
| C039 2026-08-28 21:20:59 · 发布请求 · 0.0.1 | 目前所有的替换工作和打包工作都已经修改好了。现在我需要你参考旧仓库的文档，对新仓库的文档进行迁移。要求：确保旧仓库中尽可能完整的信息被迁移到新仓库，请保证文档中serpent不会出现。修改完成后推送到GitHub，使修改生效。 | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 已完成并推送到 GitHub。 - 参考旧仓库 `dolag233/Serpent` 的文档结构，完整保留并对齐现有使用手册、扩展手册、产品简报、术语与发行说明。 - 补全了根 README.md 中的功能、安装、构建和文档导航。 - 修复文档索引、截图链接及所有交付文档中的失效内部链接。 - 统一为 Super 的专有发布口径，移除“开源 / MIT”产品描述与旧团队发布入口。 - 已全量扫描 …〔摘述〕 |
| C040 2026-08-28 21:37:43 · 需求 / 决策 · 0.0.1 | 这个图标为啥没换 （附图线索） （附件线索，原件留在本机） | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 确实是文档资源漏换了：README 使用的是独立的旧图片，而应用和安装包图标已经是新蓝色 S。 已将该文档图标替换为当前应用图标源文件，并推送至 GitHub： `80d4065 docs: replace legacy documentation logo` 刷新仓库页面即可看到新图标。 |
| C041 2026-08-28 21:40:02 · 需求 / 决策 · 0.0.1 | 把图一的索引图片改为图二 （附图线索） （附件线索，原件留在本机） | Serpent 改为 Super，采用新 Logo、.super 资源库标识及独立仓库。 限制：当时曾提出闭源；后续 GitHub 发行授权独立记录。 | 已替换并推送。 `docs/assets/ui/super-Preview.png` 现为图二的工作区截图，README 与使用手册会自动使用新图。提交：`419299f`。 |
| C042 2026-08-28 21:47:31 · 需求 / 决策 · modelzero / 原型 | 这是一个由我制作的精度很高的RAG记忆体系，我要把其中有关RAG的部分给接入到super里，再配上一个LLMapi当作一个私人助手，而anvil就是一个已经做好的记忆库，我需要你把这份记忆库接入在super主页面的左下角，用一个2d机器人图标进入页面。 | 借鉴 Anvil 的检索引擎思路，不直接迁移其权威 SQLite 数据。 限制：原型阶段，不视为最终上线能力。 | Anvil 已具备可直接复用的本机 RAG 服务：FastAPI + WebSocket 聊天、证据控制记忆检索、独立的 `.anvil-data` 记忆库与 LLM Provider 配置。最稳妥的集成方式是让 Super 启动并监管 Anvil 作为本机后台服务，主页面左下角放置 2D 机器人入口，打开内嵌助手页；LLM Key 留在 Anvil 侧，Super 前端不接触密钥。 相比直接读取…〔摘述〕 |
| C043 2026-08-28 21:51:24 · 需求 / 决策 · modelzero / 原型 | 不，我理想中的是：super完全接管anvil的RAG功能，不需要依赖anvil | 借鉴 Anvil 的检索引擎思路，不直接迁移其权威 SQLite 数据。 限制：原型阶段，不视为最终上线能力。 | 可以。最终方案应改为： - Super 内置独立的“记忆引擎”：迁移 Anvil 的 Evidence SQLite 权威数据、断言/证据/来源/审计关系与检索规则。 - Anvil 的 Qdrant 向量索引只作为可重建派生数据；Super 首次导入后在自己的数据目录重建索引，不再读取、启动或打包 Anvil。 - 助手在 Super 的主进程与 Worker 内运行；左下角 2D 机器人入口打…〔摘述〕 |
| C044 2026-08-28 21:53:45 · 需求 / 决策 · modelzero / 原型 | 我只需要你迁移anvil的记忆引擎，sqlite的权威数据不要迁移。我的目的是把我精心打造的anvil记忆检索、召回、重排这一整套系统搬给super | 借鉴 Anvil 的检索引擎思路，不直接迁移其权威 SQLite 数据。 限制：原型阶段，不视为最终上线能力。 | 收到：只迁移“记忆引擎”，不迁移 Anvil 的 SQLite 权威数据、历史会话或现有向量索引。 Super 将从空白记忆库启动，但内置 Anvil 的完整方法链： `写入治理 → 证据化记忆 → 混合召回 → 重排 → 证据筛选/覆盖校验 → 受控上下文注入 → 带引用的助手回答` 实现上会把 Anvil 的 Python/FastAPI/Qdrant 依赖改写为 Super 的 TypeSc…〔摘述〕 |
| C045 2026-08-28 21:54:43 · 需求 / 决策 · modelzero / 原型 | 是的 | 借鉴 Anvil 的检索引擎思路，不直接迁移其权威 SQLite 数据。 限制：原型阶段，不视为最终上线能力。 | 已确认：新记忆库默认空白，只接收“私人助手对话 + 用户显式记住”的内容；不会自动扫描资源库，也不会迁移 Anvil 的旧数据。 第一段设计：核心架构 Super 会新增一个本机 `Memory Engine`，由 Library Worker 同级的独立 Electron Worker 承载。它不依赖 Python、FastAPI、Qdrant 或 Anvil 文件，数据保存在 Super 用户…〔摘述〕 |
| C046 2026-08-28 21:56:15 · 需求 / 决策 · modelzero / 原型 | 换架构的话，你是否确定能100%迁移功能而无bug？ | 借鉴 Anvil 的检索引擎思路，不直接迁移其权威 SQLite 数据。 限制：原型阶段，不视为最终上线能力。 | 不能承诺“换架构后 100% 无 Bug”。这不是可靠的工程承诺：Anvil 的检索结果还依赖嵌入模型、向量索引和重排实现，重写为 TypeScript 后即使逻辑一致，也可能出现边界差异。 但可以把风险压到可验证范围，并做到“功能契约完整迁移”： 1. 从 Anvil 提取检索、召回、重排、证据筛选和写入治理的契约与黄金测试集。 2. 先迁移确定性部分：SQLite schema、过滤规则、候选…〔摘述〕 |
| C047 2026-08-28 21:57:31 · 需求 / 决策 · modelzero / 原型 | 开始迁移，迁移前请git备份当前状态，备注为：“modelzero” | 借鉴 Anvil 的检索引擎思路，不直接迁移其权威 SQLite 数据。 限制：原型阶段，不视为最终上线能力。 | 已开始并推送第一阶段迁移。 - 已创建并推送迁移前备份标签：`modelzero`。 - Super 现有独立的空白 SQLite 记忆库，不会读取或迁移 Anvil 数据。 - 已迁移并实现：召回契约、精确/FTS 检索、RRF 融合、授权上下文、审计、隐私模式失败关闭。 - 明确记忆会写入；普通对话仅生成待确认提议，不自动写入。 - 已通过 8 项回归测试与 TypeScript 检查。 - …〔摘述〕 |
| C048 2026-08-28 22:11:27 · 确认 / 推进 · modelzero / 原型 | 继续 | 借鉴 Anvil 的检索引擎思路，不直接迁移其权威 SQLite 数据。 限制：原型阶段，不视为最终上线能力。 | 已继续并推送到 GitHub。 - 左下角已加入 2D 机器人入口和本地记忆工作台。 - 支持“确认记住”与本地检索；数据库路径不会暴露给界面。 - 主进程、预加载桥、界面和 SQLite 记忆引擎均已接通。 - 修复了重复确认同一记忆时断言 ID 不稳定、证据关联可能失效的问题。 - 开发版真实构建、TypeScript 与 10 项记忆回归测试均通过。 最新提交：`6171aec`。下一阶段将…〔摘述〕 |
| C049 2026-08-28 22:21:48 · 需求 / 决策 · modelzero / 原型 | 打开开发版，我要预览 | 借鉴 Anvil 的检索引擎思路，不直接迁移其权威 SQLite 数据。 限制：原型阶段，不视为最终上线能力。 | 开发版已启动，当前正在运行工作区中的最新代码。左下角应可见 2D 机器人入口。 |

| 编号 / 时间 / 阶段 | 用户发言摘述 | 阶段决策与限制 | 当轮历史结果摘述（非本次验收） |
| --- | --- | --- | --- |
| C188 2026-09-13 08:55:57 · 规划 / 说明 · 2.2.3 / 发行策略 | 你认为superlib下一步要进行什么优化、拓展，请简要规划 | 保留 5 个完整发行目录、最多 20 个旧版直达 delta；拖窗不应导航。 限制：2.3.17 本次保留旧目录，未运行自动删除；不是现场恰好只剩5目录。 | 我建议下一步先巩固稳定性，再推进主题和智能检索。此前加载、托盘恢复和更新器问题多次复发，值得先补齐长期验证。 \| 优先级 \| 方向 \| 主要内容 \| \|---\|---\|---\| \| P0 \| 性能与稳定性 \| 测试托盘驻留数小时、休眠恢复、大库切目录、批量文件变动；记录首屏耗时、请求排队时间和超时次数，建立回归基准。 \| \| P0 \| 更新可靠性 \| 增加安装器启动确认、失败后可恢复提示；为多个旧…〔摘述〕 |
| C189 2026-09-13 08:59:49 · 规划 / 说明 · 2.2.3 / 发行策略 | # Response annotations: Each item contains text selected from an earlier Codex response and may include a user comment. Treat items as Annotation 1, Annotation 2, and so on in array order. Use every selection as context and address every comment. For every annotation you address, include its inline directive `:codex-annotation{index="N"}`, where N is its one-based array position (for example, `:codex-annotation{index="1"}`). Do not use unstructur…〔摘述〕 | 保留 5 个完整发行目录、最多 20 个旧版直达 delta；拖窗不应导航。 限制：2.3.17 本次保留旧目录，未运行自动删除；不是现场恰好只剩5目录。 | 可以按“有限支持旧版直升”的方式执行：每次新版本保留完整包，同时为仍有用户的旧版本生成直达新版本的增量包。客户端已有能力会按当前安装版本精确选择对应 delta；没有匹配项时自动下载完整包。:codex-annotation{index="1"} 建议以即将发布的 `v2.2.4` 作为第一次整理点： \| 当前版本 \| v2.2.4 更新策略 \| 原因 \| \|---\|---\|---\| \| 2.2.…〔摘述〕 |
| C190 2026-09-13 09:06:18 · 需求 / 决策 · 2.2.3 / 发行策略 | 目前版本是2.2.3；本地安装包在哪存着？给我地址 | 保留 5 个完整发行目录、最多 20 个旧版直达 delta；拖窗不应导航。 限制：2.3.17 本次保留旧目录，未运行自动删除；不是现场恰好只剩5目录。 | v2.2.3 本地完整安装包在： SuperSetup.exe 增量更新包（v2.2.2 → v2.2.3）在： delta ZIP |
| C191 2026-09-13 09:11:21 · 需求 / 决策 · 2.2.3 / 发行策略 | 我将以2.2.3版本作为基线版本，后续更新的各版本增量包，我认为应该保存20个增量包 | 保留 5 个完整发行目录、最多 20 个旧版直达 delta；拖窗不应导航。 限制：2.3.17 本次保留旧目录，未运行自动删除；不是现场恰好只剩5目录。 | 我同意保留 20 个增量更新窗口，但应采用“最近 20 个源版本直达最新版”的策略，而不是仅保存 20 个历史相邻增量包。 例如： - v2.2.4：`2.2.3 → 2.2.4` - v2.2.5：`2.2.3 → 2.2.5`、`2.2.4 → 2.2.5` - 后续每版：为最近最多 20 个版本，各生成一个“旧版 → 当前最新版”的直达 delta。 这样 v2.2.3 用户在未来升级时，能…〔摘述〕 |
| C192 2026-09-13 09:13:59 · 需求 / 决策 · 2.2.3 / 发行策略 | 完整包只存5个最新版本的，增量包存20个，开始执行 | 保留 5 个完整发行目录、最多 20 个旧版直达 delta；拖窗不应导航。 限制：2.3.17 本次保留旧目录，未运行自动删除；不是现场恰好只剩5目录。 | 已执行完成。 - 完整发行目录已限制为最多 5 个；发布器传入 `SUPER_UPDATE_RETAIN_RELEASES=6` 或更大值会直接拒绝。 - 每个新版本会自动从最近最多 20 个长期基线生成“旧版 → 当前版”的直达 delta，并写入最新 manifest。 - delta 超过完整包 60% 时会自动舍弃，用户改走完整包。 - v2.2.3 首份长期基线已保存：2.2.3.jso…〔摘述〕 |
| C193 2026-09-13 09:34:53 · 需求 / 决策 · 2.2.3 / 发行策略 | 我有一个疑问，假如，2.2.5的用户想要更新到2.2.8，此时是不是没有对应的增量包？ | 保留 5 个完整发行目录、最多 20 个旧版直达 delta；拖窗不应导航。 限制：2.3.17 本次保留旧目录，未运行自动删除；不是现场恰好只剩5目录。 | 会有。 发布 v2.2.8 时，系统会从保留基线中生成直达 v2.2.8 的包，例如： ```text 2.2.3 → 2.2.8 2.2.4 → 2.2.8 2.2.5 → 2.2.8 2.2.6 → 2.2.8 2.2.7 → 2.2.8 ``` 因此 v2.2.5 用户会直接下载 `2.2.5 → 2.2.8`，不会依次下载 2.2.6、2.2.7。 前提是： - v2.2.5 的基线清单已…〔摘述〕 |
| C194 2026-09-13 09:35:53 · 发布请求 · 2.2.3 / 发行策略 | # Response annotations: Each item contains text selected from an earlier Codex response and may include a user comment. Treat items as Annotation 1, Annotation 2, and so on in array order. Use every selection as context and address every comment. For every annotation you address, include its inline directive `:codex-annotation{index="N"}`, where N is its one-based array position (for example, `:codex-annotation{index="1"}`). Do not use unstructur…〔摘述〕 | 保留 5 个完整发行目录、最多 20 个旧版直达 delta；拖窗不应导航。 限制：2.3.17 本次保留旧目录，未运行自动删除；不是现场恰好只剩5目录。 | 是的。每次成功发布新版本时，发布器会在更新 `latest.json` 后自动清理，只保留最新 5 个完整发行目录；第 6 个及更早版本会被删除。:codex-annotation{index="1"} 例如当前保留 `2.1.8` 到 `2.2.3` 共 5 个版本，发布 `2.2.4` 后会自动删除 `2.1.8`，留下： ```text 2.2.0 2.2.1 2.2.2 2.2.3 2.2…〔摘述〕 |
| C195 2026-09-13 09:39:17 · 需求 / 决策 · 2.2.3 / 发行策略 | # Response annotations: Each item contains text selected from an earlier Codex response and may include a user comment. Treat items as Annotation 1, Annotation 2, and so on in array order. Use every selection as context and address every comment. For every annotation you address, include its inline directive `:codex-annotation{index="N"}`, where N is its one-based array position (for example, `:codex-annotation{index="1"}`). Do not use unstructur…〔摘述〕 | 保留 5 个完整发行目录、最多 20 个旧版直达 delta；拖窗不应导航。 限制：2.3.17 本次保留旧目录，未运行自动删除；不是现场恰好只剩5目录。 | 已完成顶部边界栏拖拽修复。 - 路径栏中间的空白区域已恢复为原生窗口拖拽区；搜索、导航、菜单、窗口控制等交互控件仍不可拖拽。 - 真实开始拖动窗口时，会自动退出当前文件夹并回到根目录，后续新建文件夹默认创建在根目录。 - 通过主进程事件处理，避免原生拖拽区吞掉前端鼠标事件。:codex-annotation{index="1"} 改动见 App.tsx、styles.css、window-cont…〔摘述〕 |
| C196 2026-09-13 09:50:40 · 需求 / 决策 · 2.2.4 | 这是目前的外观相关功能，你来看一下，我计划让下一版本的应用背景默认为"〔私人路径省略〕 （附图线索） （附件线索，原件留在本机） | 默认壁纸要随包发布；不把 2.x 重置为 1.0.0。 限制：壁纸政策后来由 2.3.6 移除内置默认图替代。 | 可行。现有外观模块已支持背景图、透明度和 `cover / fill / tile`，但默认值目前是“无背景”；用户背景以本地存储的 Data URL 保存。 建议下一版本改为： - 将图片作为内置资源打包，而非引用桌面绝对路径。 - 新增三种状态：`内置默认背景 / 用户自定义背景 / 不使用背景`，使“移除背景”和“恢复默认背景”语义明确。 - 新装用户默认使用该图；已有用户的自定义背景保持不…〔摘述〕 |
| C197 2026-09-13 09:55:11 · 发布请求 · 2.2.4 | 执行后打包发布新版本 | 默认壁纸要随包发布；不把 2.x 重置为 1.0.0。 限制：壁纸政策后来由 2.3.6 移除内置默认图替代。 | 已发布 Super Lib v2.2.4 到 ECS。 - 新装用户默认启用内置二次元背景；已有自定义背景与“无背景”选择均会保留。 - 外观页支持“恢复默认背景”“使用默认背景”和关闭背景。 - 已生成 2.2.3 → 2.2.4 直达增量包：4.25 MB；完整包约 240.5 MB。 - ECS 已验证 `latest.json` 指向 2.2.4，完整包与增量包均存在。 - 保留策略已生效…〔摘述〕 |
| C198 2026-09-13 10:17:48 · 发布请求 · 2.2.4 | 我计划重置版本号，新打包一个1.0.0作为基线 | 默认壁纸要随包发布；不把 2.x 重置为 1.0.0。 限制：壁纸政策后来由 2.3.6 移除内置默认图替代。 | 不建议在现有更新通道直接发布 `1.0.0`。 已安装的 `2.2.4` 会按语义版本判断：`1.0.0 &lt; 2.2.4`，因此会认定自己已是新版，无法自动更新到 1.0.0。 可选做法： 1. 推荐：保持技术版本递增，例如下一版为 `2.2.5`，但在产品界面、发布说明中标注“Super Lib 1.0 基线版”。这样更新链和增量包都不受影响。 2. 真正重置为 `1.0.0`：必须开新更新通道…〔摘述〕 |
| C199 2026-09-13 10:18:19 · 需求 / 决策 · 2.2.4 | 那算了 | 默认壁纸要随包发布；不把 2.x 重置为 1.0.0。 限制：壁纸政策后来由 2.3.6 移除内置默认图替代。 | 好的，保持现有版本序列即可；当前最新发布仍为 v2.2.4。 |
| C200 2026-09-13 10:20:04 · 需求 / 决策 · 2.2.5 | 我需要你在这个位置加一个自定义字体大小条件的功能，分为1-4四个档位，仅影响本软件的字体大小，不影响系统、页面等 （附图线索） （附件线索，原件留在本机） | 字体档位只作用本应用，不改变 Windows。 | 已完成字体大小设置。 - 外观页新增“应用字体大小”，共 1–4 档：较小 / 标准（默认）/ 较大 / 最大。 - 即时生效并持久化，重启后保留。 - 仅缩放 Super Lib 内的文字；不改系统缩放、窗口尺寸或其他软件。 - 主界面、设置页、弹窗、资源视图及 3D 预览器文字均已纳入统一缩放。 核心改动：设置页、字体偏好存储、主题应用逻辑。 验证已通过：字体偏好单测、ESLint、TypeS…〔摘述〕 |
| C201 2026-09-13 10:37:11 · 发布请求 · 2.2.5 | 打包发布 | 字体档位只作用本应用，不改变 Windows。 | 已打包并发布 ECS：Super Lib v2.2.5。 - 2.2.4 → 2.2.5：增量包 3.8 MB - 2.2.3 → 2.2.5：增量包 4.0 MB - 完整发行目录已保留最新 5 个：2.2.1–2.2.5 - 公共更新清单已验证为 v2.2.5：latest.json 本地安装包：SuperSetup.exe 已通过：应用打包校验、已打包程序启动 E2E（3/3）、Inno 安…〔摘述〕 |
| C202 2026-09-13 10:49:23 · 需求 / 决策 · 2.2.6 | 你认为还有什么要做的吗 | 档位标签仅显示数字；保留必要媒体资源和类型声明。 | 有，建议下一步先补三个“发行稳定性”事项： 1. 修复媒体包下载 404 当前能用本机已验证缓存打包，但全新构建机会在下载媒体依赖时失败；应修正 `bundle-lock.json` 中的远端地址或重新上传对应包。 2. 隔离 ESLint 扫描范围 把 `tmp/`、内部文档里的声明样例排除，避免无关文件阻断完整发行预检。 3. 补齐增量基线历史 20 个增量包策略已生效，但当前只有 2.2.3…〔摘述〕 |
| C203 2026-09-13 10:54:35 · 需求 / 决策 · 2.2.6 | 图一这里填1-4的数字就行了，不用带文字解释；改完后具体说一下媒体包是？ （附图线索） （附件线索，原件留在本机） | 档位标签仅显示数字；保留必要媒体资源和类型声明。 | 已改为仅显示 `1 / 2 / 3 / 4`，保留辅助功能中的档位说明。已通过 ESLint 与 TypeScript 检查。此次尚未重新打包发布。 改动位置：AppSettingsPages.tsx。 媒体包不是用户下载的“更新包”，而是 Super Lib 打包时内置的媒体处理工具集： - `ffmpeg.exe`：视频/音频转码、抽帧、缩略图等。 - `ffprobe.exe`：读取视频/音…〔摘述〕 |
| C204 2026-09-13 11:03:27 · 需求 / 决策 · 2.2.6 | 目前的地址是？ | 档位标签仅显示数字；保留必要媒体资源和类型声明。 | 当前 Windows 媒体包配置地址是： https://github.com/aimtowin/Super/releases/download/media-v0.1.2/super-media-win32-x64.zip 该地址目前返回 404。它记录在 bundle-lock.json 中。 |
| C205 2026-09-13 11:07:26 · 需求 / 决策 · 2.2.6 | 把这个所需文件路径改到我的ecs服务器，并配置相关内容和资源 | 档位标签仅显示数字；保留必要媒体资源和类型声明。 | 已完成 Windows 媒体包迁移与配置切换。 - ECS 文件路径：`/www/wwwroot/resource/data/super-updates/media/media-v0.1.2/super-media-win32-x64.zip` - 新公网地址：super-media-win32-x64.zip - 文件大小：30,070,504 字节 - SHA-256：`4afcbe880aa…〔摘述〕 |
| C206 2026-09-13 11:14:45 · 发布请求 · 2.2.6 | # Response annotations: Each item contains text selected from an earlier Codex response and may include a user comment. Treat items as Annotation 1, Annotation 2, and so on in array order. Use every selection as context and address every comment. For every annotation you address, include its inline directive `:codex-annotation{index="N"}`, where N is its one-based array position (for example, `:codex-annotation{index="1"}`). Do not use unstructur…〔摘述〕 | 档位标签仅显示数字；保留必要媒体资源和类型声明。 | 已完成并发布 v2.2.6 到 ECS。 - ESLint 已排除仅属临时/内部参考的 `tmp/**`、`docs/internal/**`，正式源码、脚本与测试仍全量检查；`npm run lint` 已通过。:codex-annotation{index="1"} - Windows 媒体包已由 ECS 下载并通过完整性、来源与打包前验证。 - 已打包程序 E2E 通过 3/3；安装器、增量…〔摘述〕 |
| C207 2026-09-13 13:36:26 · 发布请求 · 2.2.7 | 把默认背景图改为这个；然后打包发布新版本 （附图线索） （附件线索，原件留在本机） | 使用用户选定的狐狸插画作为当时默认图。 限制：2.3.6 后不再内置该默认图。 | 已发布 v2.2.7。 - 默认背景已替换为你提供的图片；已设自定义背景的用户不受影响。 - 已确认打包产物内背景图与源图哈希一致。 - ECS 最新版本清单、完整包与增量包均可访问。 - 服务端完整版本保留：2.2.3–2.2.7（共 5 个）。 - 2.2.6 → 2.2.7 增量包约 11 MB。 本地安装包：SuperSetup.exe 线上更新清单：latest.json |
| C208 2026-09-13 21:07:40 · 需求 / 决策 · 2.2.8 | 之前我们修改了有关“单击上边界栏返回根目录”的逻辑。测试发现，当一个用户在看一个子文件夹里的一副图时，想拖拽一下本软件的窗口位置，结果拖拽后视口聚焦直接返回了根目录，这个设计是不对的。我们应该修改为拖拽时不会返回根目录，双击后才可以 | 拖动/单击不改当前浏览；当时双击仅重置新建目标。 限制：最终 2.3.0 又恢复标题栏双击的系统最大化行为。 | 没有独立终答；与后续补充合并处理或仅提供附件。 |
| C209 2026-09-13 21:09:02 · 需求 / 决策 · 2.2.8 | 补充：双击后并不是返回根目录，而仅为把左侧鼠标选中切回根目录，视窗保持不变 | 拖动/单击不改当前浏览；当时双击仅重置新建目标。 限制：最终 2.3.0 又恢复标题栏双击的系统最大化行为。 | 已修正交互： - 拖拽整个上边界栏不再改变目录、视窗或预览焦点。 - 单击标题栏空白处不执行任何导航。 - 双击标题栏非交互区域仅将左侧选中/新建文件夹目标切到根目录，当前子文件夹视图保持不变。 - 新建文件夹会在根目录创建，但不会打断正在查看的图片。 已通过类型检查、交互单测和真实 Electron 文件夹场景 E2E（5/5）。本次未打包发布。 |
| C210 2026-09-13 21:15:04 · 发布请求 · 2.2.8 | 打包发布新版本 | 拖动/单击不改当前浏览；当时双击仅重置新建目标。 限制：最终 2.3.0 又恢复标题栏双击的系统最大化行为。 | v2.2.8 已打包并发布至 ECS。 - 已修复标题栏拖拽误触发目录切换。 - 2.2.7 → 2.2.8 增量包：约 2.1 MB。 - 服务端完整包保留 2.2.4–2.2.8 共 5 个版本。 - 已核验线上完整包、增量包和更新清单均可访问。 - ESLint、类型检查、相关单测与 Electron E2E 均通过。 本地安装包：SuperSetup.exe 线上更新清单：latest.j…〔摘述〕 |
| C211 2026-09-13 21:24:09 · 需求 / 决策 · 2.2.8 / 文档 | 现在开始整理本地仓库，帮我理清楚现在的内容 | 清理可再生产物，保留源码、发行 baseline 和必要当前包。 限制：2.1.x–2.2.7 缺逐版提交，不反推精确代码边界。 | 第一轮无损整理已完成。 - 新增仓库地图：REPOSITORY_GUIDE.md - `tmp/` 已加入 .gitignore，大型基准数据不会再出现在 Git 待提交列表。 - 未删除任何本地文件、发布基线或安装包。 当前仓库结构已明确： \| 区域 \| 内容 \| \|---\|---\| \| `src/main` / `preload` / `renderer` / `worker` / `shar…〔摘述〕 |
| C212 2026-09-13 21:28:36 · 需求 / 决策 · 2.2.8 / 文档 | 这些都是什么？ （附图线索） （附件线索，原件留在本机） | 清理可再生产物，保留源码、发行 baseline 和必要当前包。 限制：2.1.x–2.2.7 缺逐版提交，不反推精确代码边界。 | 这些不是素材或缓存，而是 Super Lib 的“项目根目录配置文件”。正常情况下应保留并纳入 Git 管理。 \| 文件 \| 用途 \| \|---\|---\| \| `.gitattributes`（截图首项） \| 统一 Git 的换行、文本属性等规则。 \| \| `.gitignore` \| 声明哪些本地产物不提交，例如 `out/`、`tmp/`、`node_modules/`。 \| \| `.nvmr…〔摘述〕 |
| C213 2026-09-13 21:33:07 · 需求 / 决策 · 2.2.8 / 文档 | 开始释放空间 | 清理可再生产物，保留源码、发行 baseline 和必要当前包。 限制：2.1.x–2.2.7 缺逐版提交，不反推精确代码边界。 | 空间已释放完成，约释放 **60.7 GiB**；C 盘当前可用空间约 **127.6 GiB**。 已删除： - `tmp/`：两套 10k/20k 大型性能基准资料库与临时日志。 - `out/make/zip`：历史 Forge ZIP。 - 旧版本完整安装包：0.x、2.0.x、2.1.x、2.2.0–2.2.7。 - 历史 Delta、旧 smoke 产物、构建缓存、测试结果。 - 开发…〔摘述〕 |
| C214 2026-09-13 21:38:32 · 需求 / 决策 · 2.2.8 / 文档 | 本地git历史是否干净？ | 清理可再生产物，保留源码、发行 baseline 和必要当前包。 限制：2.1.x–2.2.7 缺逐版提交，不反推精确代码边界。 | 不干净，但 Git 仓库本身没有损坏。 - `main` 与 `origin/main` 完全同步（领先/落后均为 0）。 - 工作区有 **70 个已跟踪改动、30 个未跟踪文件**，且没有暂存内容；这些包含近期 2.2.x 的功能、发布脚本、文档和资源变动。 - 发现 3 个旧版发行说明被删除，提交前应确认这是有意清理： `release-notes-0.1.3.md`、`release-no…〔摘述〕 |
| C215 2026-09-13 21:40:24 · 需求 / 决策 · 2.2.8 / 文档 | 执行 | 清理可再生产物，保留源码、发行 baseline 和必要当前包。 限制：2.1.x–2.2.7 缺逐版提交，不反推精确代码边界。 | 已整理并推送完成。 - 恢复了 3 个会导致 README 链接失效的旧发行说明。 - 提交并推送至 `origin/main`： - `6ad35fe feat: deliver Super Lib 2.2.8` - `8757098 docs: record release and repository maintenance` - 已创建并推送标签 `v2.2.8`。 - `main` 与远…〔摘述〕 |
| C216 2026-09-13 21:46:09 · 分析 / 诊断 · 2.2.8 / 文档 | 为什么不删除这三个过期的发行说明？ （附图线索） （附件线索，原件留在本机） | 清理可再生产物，保留源码、发行 baseline 和必要当前包。 限制：2.1.x–2.2.7 缺逐版提交，不反推精确代码边界。 | 已删除三个过期发行说明，并移除了 README 中对应的失效入口： - `release-notes-0.1.3.md` - `release-notes-0.1.4.md` - `release-notes-2.0.0.md` 已确认仓库中不存在对它们的引用，提交 `106b36e` 已推送到 `main`，工作区保持干净。 |
| C217 2026-09-13 21:47:36 · 需求 / 决策 · 2.2.8 / 文档 | 我需要你把最新的2.2.8的安装包和相关文件推到GitHub的release | 清理可再生产物，保留源码、发行 baseline 和必要当前包。 限制：2.1.x–2.2.7 缺逐版提交，不反推精确代码边界。 | GitHub Release 已正式发布：Super Lib v2.2.8。 可直接下载安装包：SuperSetup.exe 已上传并核验： - Windows 安装包与 SHA-256 校验文件 - 2.2.8 完整更新包与校验文件 - 更新清单 - 从 2.2.3 至 2.2.7 直达 2.2.8 的 5 个增量包及校验文件 安装包和完整更新包的 GitHub SHA-256 均与本地一致。E…〔摘述〕 |
| C218 2026-09-13 21:56:55 · 需求 / 决策 · 2.2.8 / 文档 | 从本项目接受到现在，请帮我整理我的每一次决策和版本更迭以及各种修复 | 清理可再生产物，保留源码、发行 baseline 和必要当前包。 限制：2.1.x–2.2.7 缺逐版提交，不反推精确代码边界。 | 已完成整理并提交推送。 文档在：PROJECT_DECISION_AND_RELEASE_HISTORY.md 包含： - 从 0.0.1 至 2.2.8 的版本时间线 - 每次关键产品决策、版本号策略与发布规则 - AI 搜索、资源索引、性能、主题、缩略图、顶部栏交互的演进 - 更新器的架构、错误、修复和包保留策略 - GitHub/ECS 发布状态与仓库治理规则 - 明确区分了 Git 可验证…〔摘述〕 |
| C219 2026-09-13 22:03:00 · 需求 / 决策 · 产品文档 | 你认为，本应用下一步要干什么？我认为应用本身已经很不错了，要开始完善GitHub文档、操作手册，短视频宣发了 | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 我赞同。Super Lib 已经可以把重心从“持续加功能”转到“让用户看懂、用起来、愿意推荐”。下一阶段建议围绕 **2.2.8 建立一套完整的对外展示和入门资料**。 按这个顺序推进： 1. **完善 GitHub 首页与下载入口** 一句话介绍定位，放一张清晰的主界面图和一段操作演示，突出素材浏览、链接文件夹、颜色筛选、AI 分析与智能合集。安装入口要明显，同时说明系统要求、媒体包用途和更新方…〔摘述〕 |
| C220 2026-09-13 22:04:40 · 规划 / 说明 · 产品文档 | 先不管视频素材，你都需要什么主要素材，给我列清单，我帮你完成素材整理后你来完善文档 | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 先准备下面这些即可。可以统一放进一个“SuperLib 文档素材”文件夹，截图尽量使用同一套演示资源库，避开私人文件名、密钥和个人信息。 \| 素材 \| 需要的内容 \| 优先级 \| \| --- \| --- \| --- \| \| 应用 Logo \| 高清 PNG，最好透明底；有 SVG 也一起提供 \| 必需 \| \| 主界面截图 \| 1 张适合作为 GitHub 首页封面的截图，资源丰富、布局完整、文字清…〔摘述〕 |
| C221 2026-09-13 22:09:13 · 需求 / 决策 · 产品文档 | logo："〔私人路径省略〕；主页面截图：“"〔私人路径省略〕；入门流程口述：下载安装后选择一本机磁盘位置创建资产库（建议为固态硬盘），后即可选配置AI功能和自定义外观，即可自由探索各方面功能，产品完全免费，无使用规则，遇到bug可在GitHub提交或社媒平台提交 | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 已使用你提供的 Logo、截图和口述流程，完成并推送： - GitHub 首页：增加下载入口、主界面展示、免费说明与反馈入口。 - 快速上手手册：安装 → 本地建库（推荐 SSD）→ 可选 AI/外观配置 → 导入或链接素材。 - 同步更新英文版，修正安装和 AI 手册中的过时说明。 95 处本地链接与图片引用检查通过，提交为 `1c22a79`。 社媒反馈已写入说明，具体账号链接可后续补充。 |
| C222 2026-09-13 22:17:52 · 需求 / 决策 · 产品文档 | 还差什么？ | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 首页和快速上手已经齐了。接下来主要补这几项，按优先级排列： \| 待完善 \| 需要你提供什么 \| 我来完成什么 \| \| --- \| --- \| --- \| \| 操作步骤配图 \| 创建资产库、导入、链接文件夹的截图 \| 给入门手册补图和操作标注 \| \| AI 使用示例 \| 一组“分析结果 → 输入查询 → 查找结果”的截图，隐藏密钥 \| 写出从配置到实际查找的完整教程 \| \| 外观展示 \| 同一页面的…〔摘述〕 |
| C223 2026-09-13 22:18:45 · 需求 / 决策 · 产品文档 | 你是否可以操作我的电脑自行截图？自行获取所需内容？ | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 可以，而且已实测成功：我启动了独立的 Super Lib 演示实例，完成点击、输入，并截取了创建资产库界面。 以下素材我可以自行获取： - 创建资产库、导入文件、链接目录的操作截图。 - 标签、筛选、合集和资源详情的界面截图。 - 深浅主题、背景、字体大小等外观设置。 - AI 配置界面，以及对照代码核实的操作说明。 后续截图可由我统一完成，不需要你逐张准备。真实 AI 分析示例需要可用的服务配置…〔摘述〕 |
| C224 2026-09-13 22:20:20 · 需求 / 决策 · 产品文档 | 你不能直接操作我已打开的实例吗？ | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 可以。我已识别到你正在运行的 Super Lib 窗口，可以通过 Windows 窗口控制、鼠标键盘模拟和截图来操作它。 当前实例未开启调试接口，无法直接使用网页元素定位；操作时需要根据实际截图确认位置，会占用鼠标和窗口焦点。 之前使用独立实例是为了方便演示，并非必须。接下来可以直接在你打开的实例中浏览、切换设置和截图；涉及修改时会保留原设置并恢复。 |
| C225 2026-09-13 22:24:21 · 需求 / 决策 · 产品文档 | 开始吧 | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 已直接操作你打开的实例，采集了 **10 张可用于文档的真实截图**，涵盖建库、导入/链接入口、调色盘、外观、AI 配置与已有结果。 已补入本地手册： - 快速上手 - 外观设置 - AI 使用说明 窗口已返回“手机相册”，主题恢复为“跟随系统”；没有导入、删除素材或发起新的 AI 请求。文档链接检查通过，本轮修改尚未推送 GitHub。 |
| C226 2026-09-13 22:35:38 · 分析 / 诊断 · 产品文档 | 我没有看到“外观设置”这份文档的入口，且如图的一些文档存在时效性过期问题，请一并检查 （附图线索） （附件线索，原件留在本机） | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 已修正并推送 GitHub 主分支，提交 `79e202e`。 - 补齐“外观设置”入口：首页、文档总目录、使用手册、快速上手均可进入。 - 校正颜色筛选、日志位置、同步行为、浏览器扩展附件等过时说明。 - 中英文手册标明适用版本，旧截图和历史规划明确标注，补充新版截图。 已检查 24 份中英文手册、165 处本地引用，无失效路径。 直接查看：外观设置 · 使用手册 |
| C227 2026-09-13 22:47:42 · 需求 / 决策 · 产品文档 | GitHub的帮助文档目前还差什么 | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 我检查了与 GitHub 主分支一致的文档。**基础使用内容已比较齐全，现在缺的主要是数据安全、异常处理和具体操作案例，不需要重写一整套。** 建议按以下顺序补齐： \| 优先级 \| 待补内容 \| 具体说明 \| \| --- \| --- \| --- \| \| 高 \| **备份、迁移与恢复指南** \| 目前只是提醒备份，缺少“复制哪些目录、是否需要退出应用、换电脑如何打开、链接目录如何处理”的完整步骤。 …〔摘述〕 |
| C228 2026-09-13 22:50:14 · 需求 / 决策 · 产品文档 | # WebDAV 云同步和浏览器扩展两份文档中仍存在旧的内容，webdev中的图片存在旧的软件命名serpent，浏览器拓展无实际作用 | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 没有独立终答；与后续补充合并处理或仅提供附件。 |
| C229 2026-09-13 22:53:05 · 需求 / 决策 · 产品文档 | # 自动化功能文档中也存在旧的截图，请你核查这些旧截图，并自行获取相关截图进行替换；本地目录：〔私人路径省略〕 | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 已核查并推送 GitHub，提交 `7e0c3ba`。 - 从当前实例重新采集 **9 张截图**，更新自动化/MCP、WebDAV、插件、外部库、AI 菜单和 3D 预览。 - 修正插件文档误用浏览器采集截图的问题，并撤下浏览器扩展功能导航和旧教程。 - 序列帧旧图已撤下，待隔离测试库补拍；没有向你的正式库导入文件。 - 中英文同步更新，171 处本地引用检查通过。 截图保存在 live-2.2…〔摘述〕 |
| C230 2026-09-13 23:05:31 · 需求 / 决策 · 产品文档 | 目前的更新是依赖于ecs，但是受限于ecs的下行带宽，有没有中国网络环境免费的高速仓库？ | 核心本地功能免费；用户真实截图；撤回不可用功能的指南。 限制：新的高速镜像源只是讨论，不等于部署。 | 有免费候选，但**我没有查到能同时保证“长期免费、中国大陆高速、大文件直链、适合自动更新”的无条件方案**。对 Super Lib，要区分“存放安装包”和“稳定分发更新”。 \| 方案 \| 免费情况与限制 \| 对 Super Lib 的适用性 \| \| --- \| --- \| --- \| \| **阿里云 ESA 免费版** \| 流量和请求不计费，但官方明确有峰值带宽、单请求速率限制，且不提供可用性承诺…〔摘述〕 |
| C231 2026-09-13 23:12:21 · 发布请求 · 2.3.0 | 修一个bug：上文提到的双击上边界后自动选中根目录的逻辑不行，因为双击后会全屏，冲突了；所有应该改为：为图中的“文件夹”一行也添加鼠标悬浮后的激活效果和可点击，点击后新建文件夹自动就是根目录，同时保证点击后主窗口焦点不变，还是点击前预览的内容，此点击仅负责新建父级回根目录的逻辑；修复后打包发布2.3.0，并按照自动更新规则同步发行ecs和GitHub （附图线索） （附件线索，原件留在本机） | 点击侧栏“文件夹”标题仅将新建父目录设为根；不动浏览和焦点。 限制：早期全量门禁失败如实保留，不能以局部通过宣称全量绿。 | 没有独立终答；与后续补充合并处理或仅提供附件。 |
| C232 2026-09-13 23:48:43 · 需求 / 决策 · 2.3.0 | 什么情况，怎么改一个简单的逻辑，花费这么久？ | 点击侧栏“文件夹”标题仅将新建父目录设为根；不动浏览和焦点。 限制：早期全量门禁失败如实保留，不能以局部通过宣称全量绿。 | 是我把小修复扩大成了全项目回归，耗时控制不当，抱歉。 现在 **2.3.0 已发布至 ECS 和 GitHub，主分支已同步**： - 点击“文件夹”标题仅重置新建父级，保留当前预览和焦点。 - 已取消标题栏双击重置逻辑。 - 专项及打包实测通过；全量预检仍有未解决项，见验证记录。 - 下载与哈希校验通过；ECS 按规则清理了 2.2.4 旧发行目录，保留最新 5 版。 本地安装包 · GitHu…〔摘述〕 |
| C233 2026-09-13 23:52:15 · 需求 / 决策 · 2.3.0 | 全量验证遇到了什么失败？ | 点击侧栏“文件夹”标题仅将新建父目录设为根；不动浏览和焦点。 限制：早期全量门禁失败如实保留，不能以局部通过宣称全量绿。 | 主要有两类失败。**不能全部解释成“旧测试过期”，其中仍有需要排查的功能风险。** ### 1. 单元／后台测试：39 项失败 4073 项通过、39 项失败、25 项跳过。**这 39 项已全部在未修改的 2.2.8 中复现**，不是本次新增。 \| 分类 \| 数量 \| 实际失败情况 \| \|---\|---:\|---\| \| 数据结构、快照预期不一致 \| 6 \| 迁移快照只到 v45，实现已到 v49…〔摘述〕 |
| C234 2026-09-13 23:56:45 · 需求 / 决策 · 2.3.0 | 影响正常使用吗？ | 点击侧栏“文件夹”标题仅将新建父目录设为根；不动浏览和焦点。 限制：早期全量门禁失败如实保留，不能以局部通过宣称全量绿。 | **目前不能保证完全不影响，但也不是整个软件都不能正常用。** - **已验证正常**：这次“文件夹”标题点击逻辑、保留图片预览和焦点、基本导入、搜索、关闭到托盘，以及更新包下载校验。 - **可能影响特定操作**：大目录滚动加载、文件丢失或移动后的重新链接、批量恢复，以及部分插件操作。这些失败尚未全部确认是实际缺陷还是测试流程过时。 - **通常不直接影响使用**：测试快照漏更新、返回值新增字段…〔摘述〕 |

## 12. 2026-10-09 补充：上游后续修复对照，不以历史完成记录替代当前证据

此节来自 HTML 截止时点之后的新请求，不修改原 HTML 的 349 条编号、52 个版本节点和 30 项决策，也不凭空增加一个应用发行版本。

用户补充明确 Super Lib 从 Serpent **0.1.4** 接力，并要求读取上游 Releases、严格对照当前源码复现，交付真实未修复清单及 Super Lib 相对优势，完成后一并推送。执行范围为诊断/文档/独立审计探针及 Git 同步；不是再次修产品、升级 schema、打包、创建 Release 或更新 ECS。

| 新决策 / 验证里程碑 | 本轮真实结果 | 限制与保留 |
| --- | --- | --- |
| 固定分叉与当前上游基准 | 实取 0.1.4 tag `6aeb146c` 和 0.2.9 `f58701a6` 源码；官方 API 返回 10 个后续公开发行节点 | 0.2.2 已撤回，由 0.2.3 承接；不虚构撤回版本的具体问题 |
| 真实未修复只收录可归因的本地失败 | 8 项：链接目录普通回收移动源文件、暂缺文件同步删远端、灰色误匹配红色、非整数正数 EXIF 污染响应、同哈希改路径不同步、GBK 乱码、文件名强制贴图显示、磁盘对账自动序列成组 | 8 个正确行为断言仍红；没有为了绿灯接受错误行为 |
| 保留更窄、更真实的反证 | 零尺寸探测未破坏协议，安全 `removeLinkedFolder` 与 UTF-8 中文正对照通过 | 不将上游原始照片 Bug 或“所有解除链接都删文件”直接复制到 Super |
| 区分源码、专项通过与平台验收 | 常规两组专项 99+179=278 次通过执行；去重 277 个用例；独立审计 8 FAIL/2 PASS；类型检查、审计文件 ESLint、文档工具 5 项通过，142 份 Markdown/567 处引用零断链 | 未跑本轮全量、真实 NAS/长期运行、macOS 成品或外部服务；原历史失败不自动关闭 |
| 上游已经有的能力不标独有 | AI 搜索、背景、四档字体、Emoji、虚拟化与单源预览均有上游对应实现 | 保留真实优势：参考窗、精确 delta/自动完成更新、目录 AI 开关与审核、CAD 分类、交付 provenance；文字预设/角落提示仅交互变体 |
| 开源与交付范围保持一致 | README 末尾保留原仓库借鉴链接，MIT 版权/元数据与历史文档连同审计产物一起纳入 Git 同步 | 不改应用版本、产品源码或发布标签；Git 推送不意味着缺陷已修或安装包已更新 |

详细证据和范围见[上游修复审计](reference/serpent-followup-audit-2026-10-09.md)、[确认未修复清单](plans/confirmed-unfixed-2026-10-09.md)、[差异化能力](reference/superlib-differentiators-2026-10-09.md)。此补充替代“凭历史修复记录就认定当前没有相关问题”的假设，不撤销或篡改历史当轮结果。

## 13. 2026-10-09 补充：按阶段实施上游审计后的修复与升级

用户授权将本轮确认缺陷修复，并将全部可借鉴新功能纳入分阶段计划。此决定继承 Serpent 0.1.4 分叉和 MIT；不全量合并上游，不自动恢复 ECS/账号后台/官方插件社区，也不包含再次发布。

详细[阶段结果与未完成项](reference/followup-phase1-results-2026-10-09.md)、[机器可读证据](reference/followup-phase1-evidence-2026-10-09.json)、[完整实施计划](plans/2026-10-09-followup-upgrades.md)。本节不增加虚构的应用版本或原 HTML 对话编号。

本轮用户明确 F15 云端官方目录/账号/ECS 继续暂停，仅补齐软件本体；要求借鉴 Serpent 的 Emoji 体验、修正左侧子项落到父项时错误报“已在该位置”，并在 README 下方给出真实功能与性能对照。此补充不篡改原 HTML 的 C001–C349 编号，也不产生新发行版本。

| 真实决策 / 里程碑 | 本轮产物 | 未完成或保留边界 |
| --- | --- | --- |
| 借鉴交互而非整库合并 | 固定 0.2.9 目录的 11 类/200 Emoji、现有 24 图形/8 色、搜索/重置/预览、双语标签、MIT 署名 | 不是上游所有 glyph/workspace 能力；偏好仅本机 |
| 不丢既有 Emoji 设置 | v2 外观偏好只读合并 v1，reset tombstone 防复活，存储错误保留原数据 | 不改文件夹名、不迁移/同步库字段 |
| 侧栏落点与真正目标分开 | 直接父项落点提升一级到父项同级/根；合集同级重排与跨级移动 | 资产卡片仍放入目标文件夹；不改变源保护/冲突/危险删除政策 |
| 真实测试发现相关缺陷继续修正 | 合集单行快照的未变父项恢复、快照内父项先恢复；真实成员/撤销/重做回归 | 不通过丢历史、删成员或吞错误让测试通过 |
| F01 要求真实媒体而非后缀宣传 | JFIF/AVIF sharp、原图 MIME、FLV 海报与显式失败后的按需代理；Worker及 Electron 解码验证 | 不全量预转码、不保证所有容器编码变体 |
| 对比表保留证据边界 | 双语 README 功能表、历史自身性能测量、差异化/继承/未完成分开 | 未做同机 Serpent 基准，不声称 FPS/RSS/整体性能全面超越 |
| 完整新增项按批验收 | 本批 F01 完成、F08 图标/拖放部分完成 | F02–F14 尚未全部补齐；不打包、不提交、不推送、不更新 ECS，版本仍 2.3.17 |

详见[首批实施结果及待办](reference/local-upgrades-results-2026-10-10.md)、[机器可读证据](reference/local-upgrades-evidence-2026-10-10.json)、[执行计划](plans/2026-10-10-local-upgrades.md)。历史阶段 1 的输入哈希与用例计数继续保留，不随本轮变化反向改写。

| 决策 / 里程碑 | 实際产物 | 保留边界 |
| --- | --- | --- |
| 完成本体 F02–F14，保持原功能 | 任意颜色、音频封面/波形偏好、有界 GIF、文本折行/显式转码、字体预览、目录 Inspector、侧栏过滤排序、会话工作区、内嵌生成信息/搜索历史/多标签、忽略预览/批量建目录、分层元数据同步、图片明确写回、大内容分块和 RPC 预算 | 源保护、人工优先、备份、撤销、冲突和所有资源上限保留；不宣布 F15 完成 |
| 不以名义注册代替真实路由 | M4A 内嵌封面、TTF 实载和卸载、GIF 暂停逐帧、4K 工作区缩放恢复、部分建目录、ICC/大图片原字节撤销、空 UTF-16 转码、实际 SQLite 元数据/分块变更保护 | 不将每种字体/坏媒体、真实供应商、NAS 或 macOS 的未测项目标 PASS |
| 全量回归与新问题闭环 | 原生 528 文件/4,881 通过/25 条件跳过；针对同步已移除行、链接元数据、批次重链接残留、迁移重试、占位缩放、预览恢复焦点和字体队列重试补修 | 首轮失败保留，不靠删除真实测试或改数据安全政策过门禁；旧缺失状态用专门历史夹具构造 |
| 重复 UI 验收而非单次截图 | 新增工作区/字体/GIF/批量组合连续五次通过；此前 2/5 失败触发焦点/字体队列修正 | 后续完整门禁/成品及上线事实另记，不把开发场景当成用户安装升级 |
| 当前文档与历史记录分开 | 新[补齐结果](reference/completion-results-2026-10-10.md)、中英对照、指南新入口、旧快照加当前结果链接 | C001–C349、52 个版本、原 HTML、历史统计和来源 SHA 不反向改写；不伪造对话编号 |
| 清理要有证据 | 核对 Git 跟踪文件和文档/图片引用，修订失效当前指引，忽略构建临时产物 | 未发现可确证多余的业务源文件，不删除动态入口、测试、迁移、版权、历史或增量基线 |
| 发布使用既有交付链 | 准备 2.3.18，最终包 provenance/附件门禁；旧 ECS 身份/路径/容量重新核验，新增 staging 逐文件哈希验证和既有版本拒绝覆盖 | 不绕过失败门禁，不覆盖旧 release；仅此前更新卷，整机迁移/其它业务未操作 |

完整实现、测试计数的时点和限制见[本体补齐结果](reference/completion-results-2026-10-10.md)。保留 Serpent 0.1.4 借鉴说明及 MIT；现有性能表依旧只记录 Super 自身历史前后比较，不宣称未经同机实测的全面超越。
````

<a id="record-13"></a>

## 13. docs/README.md — 移出或中性化前的原始段落

原文件：`docs/README.md`；Git blob：`3914d813d3b47b9a0d2f2d9098fb2b3508a7998d`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
| 文档 | 内容 |
| --- | --- |
| [当前 Super 2.3.18 / Serpent 0.2.10 对照](reference/comparison-2.3.18-serpent-0.2.10.md) | 共同基础、增强、上游新差距与待验收项 |
| [性能证据](reference/performance-evidence.md) | 自身测量与未测范围 |
| [当前已知问题](reference/known-issues-2.3.18.md) · [文档审查](reference/documentation-review-2.3.18.md) | 成品 Console 实际失败、验证缺口与修订依据 |
| [2.3.18 更新说明](releases/v2.3.18.md) · [验收记录](releases/v2.3.18-validation.md) | 本轮功能、关联修复、升级边界；已正式发行，保留候选检查点与最终上线证据 |
| [完整图文功能指南](user-guide/features.md) | 2.3.17 安装版实拍与 2.3.18 源码补齐章节，入口、步骤及真实限制 |
| [后续开发决策与优化里程碑](POST_DEVELOPMENT_DECISIONS.md) | 真实决策演变、逐版修复、对话索引、验证限制及待办边界 |
| [阶段 1 历史检查点](reference/followup-phase1-results-2026-10-09.md) · [分阶段升级计划](plans/2026-10-09-followup-upgrades.md) | 当时 8 项修复及验证限制；当前交付事实以顶部补齐结果和发行记录为准 |
| [软件本体升级首批](reference/local-upgrades-results-2026-10-10.md) · [本轮计划](plans/2026-10-10-local-upgrades.md) | 分类 Emoji/图形颜色、父项拖拽提升、合集撤销修正及 JFIF/AVIF/FLV；历史首批检查点；后续补齐见页面顶部当前结果，账号/目录/迁移继续暂停 |
| [修复前确认未修复清单](plans/confirmed-unfixed-2026-10-09.md) | 保留 8 项实际失败复现与已发行 2.3.17 安全提醒，不覆盖历史证据 |
| [上游修复逐项审计](reference/serpent-followup-audit-2026-10-09.md) | Serpent 0.1.4 后十个公开发行节点，源码对照与验证边界 |
| [Super Lib 差异化能力](reference/superlib-differentiators-2026-10-09.md) | 原 0.2.9 / 2.3.17 时点证据；当前结论见新版对照 |
| [快速上手](user-guide/quick-start.md) | 下载安装、创建本地资产库、可选 AI 与外观配置 |
| [外观设置](user-guide/appearance.md) | 深浅主题、背景图片、字体大小与实拍截图 |
| [使用手册](user-guide/README.md) | 安装、导入、浏览、搜索与过滤、标签/合集、查看器、AI 分析、插件/MCP、故障排查（中英双语） |
| [扩展作者手册](manual/README.md) | 插件、脚本、MCP 开发指南与 API 参考 |
| [产品简报（历史规划）](product-brief.md) | 早期产品范围，不作为当前功能清单 |
| [术语表](glossary.md) | 领域术语 |
````

<a id="record-14"></a>

## 14. docs/assets/ui/screenshot-audit-2.2.8.md — 移出或中性化前的原始段落

原文件：`docs/assets/ui/screenshot-audit-2.2.8.md`；Git blob：`2e7e71a7e393807d246c164dd66aaff0e50f6a2c`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
| 原文件 | 核查发现 | 当前处理 |
| --- | --- | --- |
| MCP-settings.png | 文案包含 Serpent，客户端区域布局也已变化 | 替换为 [当前 MCP 设置](https://github.com/aimtowin/Super/blob/e359a291/docs/assets/ui/live-2.2.8/mcp-settings.png) |
| sync-settings.png | 地址示例、用户名中包含旧名称 | 替换为 [当前同步设置](https://github.com/aimtowin/Super/blob/e359a291/docs/assets/ui/live-2.2.8/sync-settings.png) |
| library-sync.png | 旧同步服务器路径含 Serpent | 替换为 [当前库同步设置](https://github.com/aimtowin/Super/blob/e359a291/docs/assets/ui/live-2.2.8/library-sync.png) |
| open-sync-library.png | 旧服务器路径含 Serpent，展示历史测试库 | 替换为 [当前打开同步库入口](https://github.com/aimtowin/Super/blob/e359a291/docs/assets/ui/live-2.2.8/open-sync-library.png) |
| open-external-library.png | 说明文字及按钮仍为 Serpent | 替换为 [当前外部库入口](https://github.com/aimtowin/Super/blob/e359a291/docs/assets/ui/live-2.2.8/open-external-library.png) |
| extension.png | 实际是浏览器采集的树状菜单，被误用为插件管理截图 | 插件手册替换为 [当前插件设置](https://github.com/aimtowin/Super/blob/e359a291/docs/assets/ui/live-2.2.8/plugin-settings.png)；浏览器扩展教程撤下 |
| AI-analyze-menu.png | 早期菜单与布局 | 替换为 [当前资产右键菜单](https://github.com/aimtowin/Super/blob/e359a291/docs/assets/ui/live-2.2.8/ai-context-menu.png) |
| 3D-inspector.png | 早期查看器画面 | 替换为 [当前 FBX 查看器](https://github.com/aimtowin/Super/blob/e359a291/docs/assets/ui/live-2.2.8/model-viewer.png) |
| import-sequence.png | 早期测试序列导入窗口 | 撤下图片、保留操作文字；待隔离测试库采集，不向用户正式库发起导入 |
````

<a id="record-15"></a>

## 15. docs/plans/2026-10-07-architecture-optimization.md — 移出或中性化前的原始段落

原文件：`docs/plans/2026-10-07-architecture-optimization.md`；Git blob：`f3789073eb1d8d16e50b3b03408ff4fbf639c85e`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
审查版本2.3.16，HEAD `67298c17d792070b09adc05d5a3af3cac722ff4f`，发行源码 `ac4c244edd3074b2fc643ddeedf19ab4714fbe65`。所有路径相对 **C:/Users/Administrator/Desktop/Super-main**；用户环境曾指向失效的 Serpent-main，不复用旧cwd。
````

<a id="record-16"></a>

## 16. docs/plans/2026-10-07-architecture-stage-a-decisions.md — 移出或中性化前的原始段落

原文件：`docs/plans/2026-10-07-architecture-stage-a-decisions.md`；Git blob：`e8fe6c3b28f5a35a11b26c82e2ced78aa2d9aaf2`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
本次计划复核日期2026-10-07（Asia/Shanghai）。仓库 `C:/Users/Administrator/Desktop/Super-main`，版本2.3.16，HEAD `67298c17d792070b09adc05d5a3af3cac722ff4f`，未前进；原 inventory 的1,317份源/测试/扩展/脚本SHA-256全部匹配。git status只有既有文档修改和未跟踪文档。不要依赖环境中的旧Serpent-main路径。
````

<a id="record-17"></a>

## 17. docs/plans/2026-10-09-followup-upgrade-design.md — 移出或中性化前的原始段落

原文件：`docs/plans/2026-10-09-followup-upgrade-design.md`；Git blob：`cf01a8c719539fe493c62c2b4dfa4f32c6dadc59`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
用户确认：将全部可借鉴方向纳入计划，分阶段实施；不整体合并 Serpent 新版本。第一阶段先关闭 U01—U08 的确定性缺陷，再进入新增能力。MIT 与上游署名保留，ECS、账号后台和官方插件社区部署继续暂停。

选择“针对 SuperLib 现有边界逐项移植”：Worker 持有文件与 SQLite，纯同步规划器表达事实，Renderer 仅展示与发命令。全量合并上游会覆盖现有 AI 人工审核、更新器、独立悬浮预览和迁移历史；只调超时/隐藏错误不能解决已经复现的数据安全问题。
````

<a id="record-18"></a>

## 18. docs/plans/2026-10-09-followup-upgrades.md — 移出或中性化前的原始段落

原文件：`docs/plans/2026-10-09-followup-upgrades.md`；Git blob：`09a68e4a8d59923b58aef08f13b61d61256cb90f`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.serpent-audit.config.ts
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/sync-plan.test.ts tests/worker/sync-runner.test.ts tests/worker/sync-engine.test.ts tests/worker/sync-library-integration.test.ts tests/worker/schema-compatibility.test.ts tests/worker/migration-discipline.test.ts
npm run typecheck
```
````

<a id="record-19"></a>

## 19. docs/plans/2026-10-10-completion-and-release.md — 移出或中性化前的原始段落

原文件：`docs/plans/2026-10-10-completion-and-release.md`；Git blob：`dac5101e11b26e1c32a4596f4f932985adb2e1d0`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
保留现有未提交阶段 1/首批阶段 2改动；不强推、不修改历史发布、不删除证据。不存在同机 Serpent 性能测试的项目不声称性能超越。
````

<a id="record-20"></a>

## 20. docs/plans/2026-10-10-local-upgrades.md — 移出或中性化前的原始段落

原文件：`docs/plans/2026-10-10-local-upgrades.md`；Git blob：`479f2b79bda568ac6601bc5a4e8658dcc1b47f08`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
**Goal:** 继续补齐 F01–F14，先修复用户新报的图标选择与直接父项拖拽；功能/性能对比仅使用对应版本源码和实测证据。

**Architecture:** 保留 Worker 文件/SQLite 所有权及共享协议；外观借鉴分类、图形和颜色，但兼容 Super 既有 Emoji 存储，不拷入上游迁移历史。拖拽将“落点”和“实际目标父项”分开，保持资源卡片拖放语义。

1. 读取固定 Serpent 0.2.9 图标组件/目录，记录借鉴来源而不是泛称最新上游。
2. 补分类表情、图形/颜色、搜索/空结果、复合 Emoji 与旧偏好迁移测试，运行红灯。
3. 以独立 v2 外观偏好兼容 v1 Emoji，限制图标/颜色白名单；不将任意 SVG/HTML/URL 落到 UI。
4. 分类/搜索/选择/清除/预览/保存均支持键盘、焦点返回、暗亮主题、窗口缩放。链接状态徽章不能被自定义图标覆盖。
5. 跑 unit 和独占临时库 E2E，截取并检查新界面；记录哪些测试/截图真实执行。

### Task 3：F01 媒体格式与当前对比证据

Files: `src/shared/media-formats.ts`、媒体 MIME/代理策略、相关 Worker 分支/预设、真实媒体格式测试、README 对比表、阶段结果文档。

1. 补 JFIF/AVIF/FLV 注册/MIME/代理红灯与真实格式夹具。
2. JFIF 复用 JPEG，AVIF 用真实 sharp 解码路径；FLV 走 FFmpeg 代理，不宣称 Chromium 原播。
3. 验证导入→类型→缩略图→预览链，不仅扩展名列表。
4. README 表按固定版本对照；历史 HTML 只作为决策来源，性能百分比必须有同口径基准，没有则写“未同机实测”。未完成 F02–F14 保持明确待办，不写已补齐。
````

<a id="record-21"></a>

## 21. docs/reference/completion-results-2026-10-10.md — 移出或中性化前的原始段落

原文件：`docs/reference/completion-results-2026-10-10.md`；Git blob：`c68cc145e1218caea4567bf9fb8031a35021df0e`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
本轮接续首批与 U01–U08 修复，用户要求完成剩余软件本体、同步 GitHub 文档、按引用证据清理及打包发布。“ESA”经用户确认指**此前旧 ECS 自动更新源**；不是新增 ESA 项目，也不恢复 F15 账号、官方目录、社区或 ECS 迁移。软件继续 MIT，README 结尾保留 Serpent **0.1.4** 来源说明。

更新 README 中英功能对照、指南新增入口、决策里程碑；历史 HTML、修复前清单和第一批结果保持原时点。对照上游固定 0.2.9 源码 `f58701a6`；历史性能数字是 Super 自身前后对照，没有同机 Serpent 基准，不能宣称整体性能超越。
````

<a id="record-22"></a>

## 22. docs/reference/documentation-inventory-2.3.18.md — 移出或中性化前的原始段落

原文件：`docs/reference/documentation-inventory-2.3.18.md`；Git blob：`4d9520253ee7f5dd7db2b8edd15aac3c0168bd80`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
| 文件 | 用途 / 合理使用边界 | 本轮处理 |
| --- | --- | --- |
| [PRODUCT.md](../../PRODUCT.md) | 当前说明 | 修订 / 新建；引用检查 |
| [README.en.md](../../README.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [README.md](../../README.md) | 当前说明 | 修订 / 新建；引用检查 |
| [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) | 许可 | 保留；引用及用途检查 |
| [docs/POST_DEVELOPMENT_DECISIONS.md](../../docs/POST_DEVELOPMENT_DECISIONS.md) | 历史证据 | 修订 / 新建；引用检查 |
| [docs/PROJECT_DECISION_AND_RELEASE_HISTORY.md](../../docs/PROJECT_DECISION_AND_RELEASE_HISTORY.md) | 历史证据 | 修订 / 新建；引用检查 |
| [docs/README.md](../../docs/README.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/REPOSITORY_GUIDE.md](../../docs/REPOSITORY_GUIDE.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/architecture/2026-10-07-review/README.md](../../docs/architecture/2026-10-07-review/README.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/architecture/2026-10-07-review/adr-proposals.md](../../docs/architecture/2026-10-07-review/adr-proposals.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/architecture/2026-10-07-review/architecture-review.md](../../docs/architecture/2026-10-07-review/architecture-review.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/architecture/2026-10-07-review/codex-plan-prompt.md](../../docs/architecture/2026-10-07-review/codex-plan-prompt.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/architecture/2026-10-07-review/verification.md](../../docs/architecture/2026-10-07-review/verification.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/architecture/2026-10-08-stage-a/README.md](../../docs/architecture/2026-10-08-stage-a/README.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/architecture/2026-10-08-stage-a/compatibility-matrix.md](../../docs/architecture/2026-10-08-stage-a/compatibility-matrix.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/assets/README.md](../../docs/assets/README.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/assets/ui/completion-20261010/README.md](../../docs/assets/ui/completion-20261010/README.md) | 截图证据 | 保留；引用及用途检查 |
| [docs/assets/ui/live-2.2.8/README.md](../../docs/assets/ui/live-2.2.8/README.md) | 截图证据 | 保留；引用及用途检查 |
| [docs/assets/ui/live-2.3.17/README.md](../../docs/assets/ui/live-2.3.17/README.md) | 截图证据 | 保留；引用及用途检查 |
| [docs/assets/ui/local-upgrades-20261010/README.md](../../docs/assets/ui/local-upgrades-20261010/README.md) | 截图证据 | 保留；引用及用途检查 |
| [docs/assets/ui/review-2.3.18/README.md](../../docs/assets/ui/review-2.3.18/README.md) | 截图证据 | 修订 / 新建；引用检查 |
| [docs/assets/ui/screenshot-audit-2.2.8.md](../../docs/assets/ui/screenshot-audit-2.2.8.md) | 截图证据 | 保留；引用及用途检查 |
| [docs/glossary.md](../../docs/glossary.md) | 当前说明 | 保留；引用及用途检查 |
| [docs/manual/README.md](../../docs/manual/README.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/manual/mcp/api-reference.md](../../docs/manual/mcp/api-reference.md) | 当前说明 | 保留；引用及用途检查 |
| [docs/manual/mcp/development.md](../../docs/manual/mcp/development.md) | 当前说明 | 保留；引用及用途检查 |
| [docs/manual/plugins/api-reference.md](../../docs/manual/plugins/api-reference.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/manual/plugins/best-practices.md](../../docs/manual/plugins/best-practices.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/manual/plugins/development.md](../../docs/manual/plugins/development.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/manual/plugins/distribution-and-updates.md](../../docs/manual/plugins/distribution-and-updates.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/manual/scripts/api-reference.md](../../docs/manual/scripts/api-reference.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/manual/scripts/development.md](../../docs/manual/scripts/development.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/plans/2026-08-29-automatic-windows-update-design.md](../../docs/plans/2026-08-29-automatic-windows-update-design.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-08-29-consented-app-update-flow.md](../../docs/plans/2026-08-29-consented-app-update-flow.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-08-29-ecs-update-source.md](../../docs/plans/2026-08-29-ecs-update-source.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-08-30-ai-smart-collections-and-analysis-status.md](../../docs/plans/2026-08-30-ai-smart-collections-and-analysis-status.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-01-content-loading-progress.md](../../docs/plans/2026-09-01-content-loading-progress.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-01-incremental-update-delivery.md](../../docs/plans/2026-09-01-incremental-update-delivery.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-01-palette-filter-design.md](../../docs/plans/2026-09-01-palette-filter-design.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-01-resource-loading-performance.md](../../docs/plans/2026-09-01-resource-loading-performance.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-01-visible-update-installer.md](../../docs/plans/2026-09-01-visible-update-installer.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-10-folder-first-paint-and-filetype-thumbnails.md](../../docs/plans/2026-09-10-folder-first-paint-and-filetype-thumbnails.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-11-tray-watcher-recovery.md](../../docs/plans/2026-09-11-tray-watcher-recovery.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-13-folder-create-root-230.md](../../docs/plans/2026-09-13-folder-create-root-230.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-14-floating-image-preview.md](../../docs/plans/2026-09-14-floating-image-preview.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-22-conservative-package-cleanup.md](../../docs/plans/2026-09-22-conservative-package-cleanup.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-27-sidebar-emoji-icons.md](../../docs/plans/2026-09-27-sidebar-emoji-icons.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-28-import-confirmation-design.md](../../docs/plans/2026-09-28-import-confirmation-design.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-28-import-source-stability.md](../../docs/plans/2026-09-28-import-source-stability.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-09-28-preview-background-refresh.md](../../docs/plans/2026-09-28-preview-background-refresh.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-07-architecture-optimization.md](../../docs/plans/2026-10-07-architecture-optimization.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-07-architecture-stage-a-decisions.md](../../docs/plans/2026-10-07-architecture-stage-a-decisions.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-07-architecture-stage-a-execution.md](../../docs/plans/2026-10-07-architecture-stage-a-execution.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-07-filter-interaction-design.md](../../docs/plans/2026-10-07-filter-interaction-design.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-07-filter-interaction.md](../../docs/plans/2026-10-07-filter-interaction.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-07-performance-first-pass.md](../../docs/plans/2026-10-07-performance-first-pass.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-07-updater-auto-open-design.md](../../docs/plans/2026-10-07-updater-auto-open-design.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-07-updater-auto-open.md](../../docs/plans/2026-10-07-updater-auto-open.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-08-architecture-stage-a-batch-2-execution.md](../../docs/plans/2026-10-08-architecture-stage-a-batch-2-execution.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-08-architecture-stage-a-continuation.md](../../docs/plans/2026-10-08-architecture-stage-a-continuation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-09-followup-upgrade-design.md](../../docs/plans/2026-10-09-followup-upgrade-design.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-09-followup-upgrades.md](../../docs/plans/2026-10-09-followup-upgrades.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-09-repository-docs-refresh.md](../../docs/plans/2026-10-09-repository-docs-refresh.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-10-completion-and-release.md](../../docs/plans/2026-10-10-completion-and-release.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/2026-10-10-local-upgrades.md](../../docs/plans/2026-10-10-local-upgrades.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/plans/README.md](../../docs/plans/README.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/plans/confirmed-unfixed-2026-10-09.md](../../docs/plans/confirmed-unfixed-2026-10-09.md) | 历史证据 | 修订 / 新建；引用检查 |
| [docs/plans/follow-up-fixes.md](../../docs/plans/follow-up-fixes.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/product-brief.md](../../docs/product-brief.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/reference/automatic-update-porting-guide.md](../../docs/reference/automatic-update-porting-guide.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/reference/comparison-2.3.18-serpent-0.2.10.md](../../docs/reference/comparison-2.3.18-serpent-0.2.10.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/reference/completion-results-2026-10-10.md](../../docs/reference/completion-results-2026-10-10.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/reference/documentation-inventory-2.3.18.md](../../docs/reference/documentation-inventory-2.3.18.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/reference/documentation-review-2.3.17.md](../../docs/reference/documentation-review-2.3.17.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/reference/documentation-review-2.3.18.md](../../docs/reference/documentation-review-2.3.18.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/reference/followup-phase1-results-2026-10-09.md](../../docs/reference/followup-phase1-results-2026-10-09.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/reference/known-issues-2.3.18.md](../../docs/reference/known-issues-2.3.18.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/reference/local-upgrades-results-2026-10-10.md](../../docs/reference/local-upgrades-results-2026-10-10.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/reference/performance-evidence.md](../../docs/reference/performance-evidence.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/reference/serpent-followup-audit-2026-10-09.md](../../docs/reference/serpent-followup-audit-2026-10-09.md) | 历史证据 | 修订 / 新建；引用检查 |
| [docs/reference/superlib-differentiators-2026-10-09.md](../../docs/reference/superlib-differentiators-2026-10-09.md) | 历史证据 | 修订 / 新建；引用检查 |
| [docs/reference/user-guide-review-2.2.8.md](../../docs/reference/user-guide-review-2.2.8.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.0-validation.md](../../docs/releases/v2.3.0-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.0.md](../../docs/releases/v2.3.0.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.1-validation.md](../../docs/releases/v2.3.1-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.1.md](../../docs/releases/v2.3.1.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.10-validation.md](../../docs/releases/v2.3.10-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.10.md](../../docs/releases/v2.3.10.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.11-validation.md](../../docs/releases/v2.3.11-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.11.md](../../docs/releases/v2.3.11.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.12-validation.md](../../docs/releases/v2.3.12-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.12.md](../../docs/releases/v2.3.12.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.13-validation.md](../../docs/releases/v2.3.13-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.13.md](../../docs/releases/v2.3.13.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.14-validation.md](../../docs/releases/v2.3.14-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.14.md](../../docs/releases/v2.3.14.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.15-validation.md](../../docs/releases/v2.3.15-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.15.md](../../docs/releases/v2.3.15.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.16-validation.md](../../docs/releases/v2.3.16-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.16.md](../../docs/releases/v2.3.16.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.17-validation.md](../../docs/releases/v2.3.17-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.17.md](../../docs/releases/v2.3.17.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.18-validation.md](../../docs/releases/v2.3.18-validation.md) | 历史证据 | 修订 / 新建；引用检查 |
| [docs/releases/v2.3.18.md](../../docs/releases/v2.3.18.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.2-validation.md](../../docs/releases/v2.3.2-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.2.md](../../docs/releases/v2.3.2.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.3.md](../../docs/releases/v2.3.3.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.4.md](../../docs/releases/v2.3.4.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.5.md](../../docs/releases/v2.3.5.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.6.md](../../docs/releases/v2.3.6.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.7.md](../../docs/releases/v2.3.7.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.8-validation.md](../../docs/releases/v2.3.8-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.8.md](../../docs/releases/v2.3.8.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.9-validation.md](../../docs/releases/v2.3.9-validation.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/releases/v2.3.9.md](../../docs/releases/v2.3.9.md) | 历史证据 | 保留；引用及用途检查 |
| [docs/user-guide/README.en.md](../../docs/user-guide/README.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/README.md](../../docs/user-guide/README.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/ai.en.md](../../docs/user-guide/ai.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/ai.md](../../docs/user-guide/ai.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/appearance.en.md](../../docs/user-guide/appearance.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/appearance.md](../../docs/user-guide/appearance.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/automation.en.md](../../docs/user-guide/automation.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/automation.md](../../docs/user-guide/automation.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/basics.en.md](../../docs/user-guide/basics.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/basics.md](../../docs/user-guide/basics.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/browser-extension.en.md](../../docs/user-guide/browser-extension.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/browser-extension.md](../../docs/user-guide/browser-extension.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/features.md](../../docs/user-guide/features.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/installation.en.md](../../docs/user-guide/installation.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/installation.md](../../docs/user-guide/installation.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/plugins.en.md](../../docs/user-guide/plugins.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/plugins.md](../../docs/user-guide/plugins.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/quick-start.en.md](../../docs/user-guide/quick-start.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/quick-start.md](../../docs/user-guide/quick-start.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/search-and-filters.en.md](../../docs/user-guide/search-and-filters.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/search-and-filters.md](../../docs/user-guide/search-and-filters.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/sync.en.md](../../docs/user-guide/sync.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/sync.md](../../docs/user-guide/sync.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/troubleshooting.en.md](../../docs/user-guide/troubleshooting.en.md) | 当前说明 | 修订 / 新建；引用检查 |
| [docs/user-guide/troubleshooting.md](../../docs/user-guide/troubleshooting.md) | 当前说明 | 修订 / 新建；引用检查 |
| [extension/README.md](../../extension/README.md) | 当前说明 | 修订 / 新建；引用检查 |
| [resources/media-binaries/README.md](../../resources/media-binaries/README.md) | 当前说明 | 修订 / 新建；引用检查 |
| [resources/media-binaries/win32-x64/licenses/FFmpeg-LICENSE.md](../../resources/media-binaries/win32-x64/licenses/FFmpeg-LICENSE.md) | 许可 | 保留；引用及用途检查 |
| [resources/media-binaries/win32-x64/licenses/LICENSE.md](../../resources/media-binaries/win32-x64/licenses/LICENSE.md) | 许可 | 保留；引用及用途检查 |
| [resources/media-binaries/win32-x64/licenses/OpenImageIO-LICENSE.md](../../resources/media-binaries/win32-x64/licenses/OpenImageIO-LICENSE.md) | 许可 | 保留；引用及用途检查 |
| [resources/media-binaries/win32-x64/licenses/OpenImageIO-THIRD-PARTY.md](../../resources/media-binaries/win32-x64/licenses/OpenImageIO-THIRD-PARTY.md) | 许可 | 保留；引用及用途检查 |
| [resources/media-binaries/win32-x64/licenses/RELICENSING.md](../../resources/media-binaries/win32-x64/licenses/RELICENSING.md) | 许可 | 保留；引用及用途检查 |
| [tests/fixtures/fbx/README.md](../../tests/fixtures/fbx/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/derived-field-probe/README.md](../../tests/fixtures/plugins/derived-field-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/hook-blocking-probe/README.md](../../tests/fixtures/plugins/hook-blocking-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/iframe-workspace-probe/README.md](../../tests/fixtures/plugins/iframe-workspace-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/input-capture-probe/README.md](../../tests/fixtures/plugins/input-capture-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/job-probe/README.md](../../tests/fixtures/plugins/job-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/menu-command-probe/README.md](../../tests/fixtures/plugins/menu-command-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/preview-thumbnail-probe/README.md](../../tests/fixtures/plugins/preview-thumbnail-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/standard-host-probe/README.md](../../tests/fixtures/plugins/standard-host-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/trusted-host-probe/README.md](../../tests/fixtures/plugins/trusted-host-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/unrestricted-settings-probe/README.md](../../tests/fixtures/plugins/unrestricted-settings-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
| [tests/fixtures/plugins/view-contract-probe/README.md](../../tests/fixtures/plugins/view-contract-probe/README.md) | 测试说明 | 保留；引用及用途检查 |
````

<a id="record-23"></a>

## 23. docs/reference/documentation-review-2.3.18.md — 移出或中性化前的原始段落

原文件：`docs/reference/documentation-review-2.3.18.md`；Git blob：`b9e6dbf0de51f6634a562b3078ada16ffc177b87`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
重点证据为当前发行附件、最终验收、关键实现及固定上游源码。检查了 Super 的内容读取 Registry/SDK/Worker、图标和侧栏、格式/查看器、元数据同步及更新发布管线；用实际 2.3.18 Windows 成品运行只读 Console 脚本，并保存真实失败截图。没有连接真实 AI/WebDAV/MCP Agent，也没有 SSH 登录 ECS。

Serpent 0.2.10 在复核中更新了同名标签，重新取回后固定到 `782d4e5bcd3ee730c5e689d1e31d2769a513e180`，检查两次快照差异；当前[对照表](comparison-2.3.18-serpent-0.2.10.md)包含新能力差距和运行验证边界。旧 0.2.9 审计保留历史，不冒充当前上游。

| 文档 / 声明 | 判断依据 | 已完成处理 |
| --- | --- | --- |
| 当前指南仍写 2.3.17、最新验证链接指旧版 | 2.3.18 已正式发行，功能与 schema 已变化 | 中英文指南核对头和安装/使用入口更新；原图保留实际版本 |
| “尚未发布/未打包”用于当前成果 | 已有公开 Release、最终 SHA 和服务器上线证据 | 当前入口修正，历史快照加新版状态链接 |
| 下载步骤仍强调私有仓库授权 | GitHub API `private=false` | 改为公开附件；保持 MIT 与 Serpent 0.1.4 借鉴说明 |
| Serpent 对比仍以 0.2.9 为“当前上游” | 0.2.10 已发行，增加 Markdown/ZIP/封面等 | 新建固定版本对照；README 增加实际差距，旧证据明确时点 |
| 性能总体超越暗示 | 没有同机同素材上游数据 | 专门性能文档列自身测量、计算口径、未测范围和后续基准方法 |
| `docs/internal/...` 导航与媒体 `build-required` 现状 | 目录不存在；bundle-lock 两平台均 ready | 改为实际计划/架构/发行入口；媒体说明按 ready 和验收边界修订 |
| 扩展源码说明被理解为可安装成品 | 当前 46 附件无扩展；没有商店/捕获实际验收 | 源码 README 与用户指南统一为内部开发态 |
| readContent 文档仅 maxBytes，遗漏分块契约 | Worker/SDK 已有 offset、revision/sourceToken、单块 1 MiB | 更新脚本与插件 API、分块消费示例、旧 32 MiB 小文件边界；不误写 MCP 公开工具 |
| 图标/媒体/工作区/筛选说明落后 | 本体补齐已有交付记录和实现 | 补分类 Emoji/图形/颜色、格式、工作区、搜索历史/生成信息、显式图片写回和侧栏提升等用法 |
| WebDAV 缺少元数据冲突/取消/链接源说明 | 元数据三路合并和明确删除意图已实现 | 补首轮测试步骤、版本冲突、取消后状态、链接元数据与外部字节区别及真实服务器验收限制 |
| Console 入口被当成成品可执行 | 当前成品只读脚本仍失败，缺 `typescript` | 新建 K01、真实截图、原因/后续验收要求；更新自动化与故障排查，给发行验收补覆盖缺口 |
| 历史对话、旧版失败、架构/计划及原截图 | 有可追溯价值，不应随新版反向改写 | 保留版本、时间和原结果，更新入口，不删除决策或把原失败改记通过 |
| 第三方许可、测试 fixture 说明 | 各自服务许可或测试用途，不是桌面功能页 | 保留正文，分类标记，避免错误统一改成 MIT 或用户教程 |

| 需要 | 文档 |
| --- | --- |
| 图文与操作 | [图文功能指南](../user-guide/features.md) · [中英文手册](../user-guide/README.md) · [同步指南](../user-guide/sync.md) |
| 产品及性能对照 | [Super 2.3.18 / Serpent 0.2.10](comparison-2.3.18-serpent-0.2.10.md) · [性能证据](performance-evidence.md) |
| 真正已知故障与差距 | [当前问题清单](known-issues-2.3.18.md) |
| 扩展与发布参考 | [扩展作者手册](../manual/README.md) · [自动更新迁移参考](automatic-update-porting-guide.md) |
| 决策与版本事实 | [真实决策](../POST_DEVELOPMENT_DECISIONS.md) · [2.3.18 验收](../releases/v2.3.18-validation.md) |
````

<a id="record-24"></a>

## 24. docs/reference/followup-phase1-results-2026-10-09.md — 移出或中性化前的原始段落

原文件：`docs/reference/followup-phase1-results-2026-10-09.md`；Git blob：`b95781a0e2fb5286a3fed5e6065c954dc4e24ccd`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
基线提交：`6dc9ab07eed3b6a0e58c3481397c9823d2bd7bc2`。应用版本仍为 **2.3.17**；以下修改在工作区，**未打包、未安装、未推送、未更新 GitHub Release 或 ECS**。MIT 与 Serpent 0.1.4 借鉴署名保留。未操作真实图库、运行版或真实 WebDAV 数据。

最终结果索引及源文件校验：[机器可读阶段证据](followup-phase1-evidence-2026-10-09.json)。完整本机 Vitest JSON 位于被忽略的 `tmp/followup-final-{audit,regression,adjacent,compat}.json`，不是仓库交付依赖。

`npm run typecheck`、修改源码/测试 ESLint、`git diff --check` 与文档引用检查通过。原审计的 **8 FAIL / 2 PASS** 保留在[历史审计证据](serpent-followup-audit-evidence-2026-10-09.json)，不覆盖当时结果。本轮 U07 断言改为检查实际默认显示策略，分类器和明确材质显示保留各自断言；旧“默认删链接源”和“刷新自动成组”测试更新为新安全契约，而不是接受错误行为来造绿灯。
````

<a id="record-25"></a>

## 25. docs/reference/known-issues-2.3.18.md — 移出或中性化前的原始段落

原文件：`docs/reference/known-issues-2.3.18.md`；Git blob：`3f0dd799e995d67b217a9fbb2839245604b136b8`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
核对日期：2026-10-10。本页区分真实失败、已确认能力差距及尚未运行的专项场景。历史 U01–U08 的原复现记录保留在 [修复前快照](../plans/confirmed-unfixed-2026-10-09.md)，2.3.18 的已交付修复见 [验收记录](../releases/v2.3.18-validation.md)。本页不是穷尽所有可能缺陷的承诺。

## 能力差距和待验收项

| 类型 | 范围 | 当前结论 |
| --- | --- | --- |
| 已确认能力差距 | G01–G07：Markdown 渲染、ZIP 成员预览、自选目录封面、全局隐藏缺失链接、统一选择器目录记忆、视频 25% 取帧、统一近边工具栏设置 | 对照固定上游源码已记录；详见 [当前功能对比](comparison-2.3.18-serpent-0.2.10.md) |
| 需要专项运行 | 全屏上一张/下一张、查看器删除、链接重复内容/新序列行为 | 不列为已确认缺陷，未在本轮完成同操作运行验证 |
| 外部服务验收缺口 | 真实多设备/多写者 WebDAV、NAS 离线重连、真实 AI 供应商、第三方插件及 MCP Agent | 本地/Mock 通过不能自动扩展为所有服务通过 |
| 平台/交付范围 | macOS 成品；浏览器商店/可直接安装扩展附件 | 当前 GitHub 2.3.18 发行附件为 Windows x64；扩展保留内部开发态 |
| 暂停范围 | F15 账号、官方插件目录与社区、ECS 迁移 | 用户指示暂停，不列为已实现 |
````

<a id="record-26"></a>

## 26. docs/reference/local-upgrades-results-2026-10-10.md — 移出或中性化前的原始段落

原文件：`docs/reference/local-upgrades-results-2026-10-10.md`；Git blob：`09345d8d4ca1a547844436db42b7ad6cf6414250`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
基线提交 `6dc9ab07eed3b6a0e58c3481397c9823d2bd7bc2`；[阶段 1 证据](followup-phase1-evidence-2026-10-09.json)保持其原时点，不能因本轮源码哈希变化被冒认为当前输入。历史 HTML 的 349 对话/52 版本/30 决策见[后开发决策](../POST_DEVELOPMENT_DECISIONS.md)；本轮不伪造新的 HTML 编号或发行版本。

| 项目 | 实际改动 | 验证与保留边界 |
| --- | --- | --- |
| 用户问题 1：图标选择 | 借鉴 Serpent 0.2.9 `f58701a6` 的 11 类、200 个 Emoji；支持分类、分类/图形名称搜索、24 个现有内置图形和 8 个颜色、即时预览/空结果/重置 | 手动粘贴复合 Emoji、肤色/旗帜保留；图形/颜色白名单；不用任意远程 SVG。仅本机偏好，不声称等于上游全部图形或 workspace 外观 |
| 旧图标兼容 | 新 v2 外观偏好合并只读 v1 Emoji；按库/条目隔离，重置墓碑防止旧图标复活 | 不删除/改写 v1，不改物理文件名/库表；存储失败显示错误，旧偏好保留 |
| 用户问题 2：文件夹提升层级 | 左侧直接子项落到父项→提升一级；父项顶层→根目录；批次直接子项采用同一规则 | 仅侧栏启用，资产网格原“放入该文件夹”不变；继续走 Worker 的移动/冲突/历史管线。自项/后代/未知 ID 拒绝；坏循环事实不会让检查无限循环 |
| 合集层级 | 接通已有 `parentId` 协议→Preload→Main→Worker，直接父项提升、其他跨级移动；合集标题可作根级落点；同级继续重排 | 资产拖入合集仍为加入资产，不混作合集移动；Worker 防自项/后代循环，历史可撤销/重做 |
| 相关撤销缺陷 | 子合集的单行快照没有未修改的父项，原恢复算法错误要求其也在快照；现在读取同库已有父项，快照内父项必须先恢复 | 真实提升/撤销/重做、成员保留通过；不靠删成员/删历史绕过错误 |
| F01：JFIF / AVIF / FLV | 共享注册/MIME/格式筛选、缩略图队列和 AI 视频可视路径统一；JFIF 用 JPEG 解码、AVIF 用 sharp，FLV 走视频海报与现有按需代理回退 | 不预转码所有视频；真实文件 Worker→缩略图→预览及 Electron 原图/FLV 回退解码通过。不是支持任意 AVIF/FLV 编码变体的保证 |
| README 对照 | 中英 README 下方新增功能与性能表，署名仍放结尾；固定版本对比，继承功能/差异化增强/未完成分开 | 69.7→13.7 ms、17.26% 瘦身与一次 delta 数据为 Super 历史自身对照；未测同机 Serpent 性能，不写全面超越 |

- 本批扩大原生 Vitest：14 文件 **256/256 通过**；单独上游审计轨道 **10/10 通过**。两个轨道用例分开列，不与阶段 1 的历史 692 项重复累加。
- 当前源码真实 Electron：**3/3 通过**。图标分类、搜索、颜色、复合 Emoji、重开持久化、重置、焦点循环/返回、Escape 和暗亮主题；文件夹/合集直接父项到根级；JFIF/AVIF 原图解码、FLV 自动回退到可解码代理。不是仅查扩展名或一个可见 DOM。
- 类型检查与所修改 TypeScript 的 ESLint 通过。Vite 保留大 chunk 提示；App/LibraryService 仍为大文件，本轮不把它们当作已拆分。
- 文档审查脚本 5/5 通过；包含新增未提交文件的 148 份 Markdown、617 个本地引用、69 个图片引用核对为 0 断链。未执行要求进 Git index 的发布门禁，因为本轮未提交/推送。
- JSON 复测曾在所有 256 断言通过后，于 Windows 原生退出阶段报 `PostQueuedCompletionStatus(6)` 并退出 1；没有当成整条命令成功。随后 14 文件串行原生复测仍为 256/256，并干净退出 0；保留此环境退出不稳定记录，不宣称修复了原生运行时。
- 测试初轮发现合集撤销失败后真正修复；真实 FLV 夹具不能用本机 FFmpeg 缺少的 lavfi，改用真实 PNG 输入；RAW 回归断言仍是 v1 generator，而阶段 1 修复已升 v2，更新断言并保留尺寸/元数据检查。
- 媒体 E2E 初次未配置专用导入夹具、随后误选隐藏占位图；修正测试实例输入与实际原图选择器，未改产品或弱化解码/原图/代理断言。侧栏 E2E 的打开库按钮在工作区不存在，改为重载仅测试 Renderer 获取其自建条目。
- 未操作真实 WebDAV/NAS/AI 服务、用户数据、已安装程序或 ECS。未测上游同机 FPS/RSS、慢盘峰值、macOS、所有编码变体、真实发布安装。
- 偏好为本机存储，不随库同步；图形颜色不重新染色系统彩色 Emoji；图库 schema v50 是阶段 1 追加迁移，本批未追加/改写数据库迁移。

机器可读[验证与输入证据](local-upgrades-evidence-2026-10-10.json)；截图来源见[图片说明](../assets/ui/local-upgrades-20261010/README.md)。
````

<a id="record-27"></a>

## 27. docs/releases/v2.3.18-validation.md — 移出或中性化前的原始段落

原文件：`docs/releases/v2.3.18-validation.md`；Git blob：`aba3310ba7eeacbe15f2384b14eba6340a438dac`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
补齐软件本体 F01–F14，保留 U01–U08 的源保护和修复，继续 MIT 开源及
Serpent 0.1.4 借鉴说明。用户确认更新 GitHub `aimtowin/Super` Release
及此前旧 ECS 自动更新源；F15 账号、官方目录、社区及 ECS 迁移仍暂停。
具体功能、限制与修复见[本体补齐结果](../reference/completion-results-2026-10-10.md)。
````

<a id="record-28"></a>

## 28. docs/user-guide/README.en.md — 移出或中性化前的原始段落

原文件：`docs/user-guide/README.en.md`；Git blob：`91f39c558f112107008c31cec78ca395079856a3`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
Current evidence: [2.3.18 acceptance](../releases/v2.3.18-validation.md), [known issues](../reference/known-issues-2.3.18.md), [Serpent 0.2.10 comparison](../reference/comparison-2.3.18-serpent-0.2.10.md). The catalogue labels 2.3.18 development captures separately. Packaged Console execution is currently blocked; ordinary import, browsing and viewing do not require it.
````

<a id="record-29"></a>

## 29. docs/user-guide/README.md — 移出或中性化前的原始段落

原文件：`docs/user-guide/README.md`；Git blob：`b8cdb64e23417031a37834981eaa6ec93f23a240`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
当前状态：[2.3.18 验收](../releases/v2.3.18-validation.md) · [当前已知问题](../reference/known-issues-2.3.18.md) · [Serpent 0.2.10 对照](../reference/comparison-2.3.18-serpent-0.2.10.md)。图文指南还包含明确标注的 2.3.18 开发进程配图；当前自动化 Console 成品执行受阻，普通导入、浏览和预览无需该功能。
````

<a id="record-30"></a>

## 30. docs/user-guide/features.md — 移出或中性化前的原始段落

原文件：`docs/user-guide/features.md`；Git blob：`9d80e82ffa9ff4ae263bfe6e5daeee15ff0b6249`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````markdown
1. [安装、引导与资源库](#安装引导与资源库)
2. [导入、冲突与原位链接](#导入冲突与原位链接)
3. [文件夹、标签、合集与图标](#文件夹标签合集与图标)
4. [浏览、选择与资产属性](#浏览选择与资产属性)
5. [搜索、筛选、排除与反选](#搜索筛选排除与反选)
6. [媒体查看器与悬浮预览](#媒体查看器与悬浮预览)
7. [文件操作、回收站与撤销](#文件操作回收站与撤销)
8. [AI 分析与自然语言查找](#ai-分析与自然语言查找)
9. [脚本、插件与 MCP](#脚本插件与-mcp)
10. [WebDAV 同步](#webdav-同步)
11. [外观、交互与通用设置](#外观交互与通用设置)
12. [后台任务、诊断与更新](#后台任务诊断与更新)
13. [2.3.18 本体补齐](#2318-软件本体补齐)
14. [当前已知问题](../reference/known-issues-2.3.18.md) · [与 Serpent 0.2.10 对照](../reference/comparison-2.3.18-serpent-0.2.10.md)
````

<a id="record-31"></a>

## 31. src/renderer/sidebar-appearance-catalog.ts — 移出或中性化前的原始段落

原文件：`src/renderer/sidebar-appearance-catalog.ts`；Git blob：`90354d1ba37d1033c1d6eee1342ab83d87680cb0`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````typescript
// Emoji grouping adapted from dolag233/Serpent v0.2.9 (MIT), f58701a6.
// Uses existing Super icon artwork; does not execute or embed remote SVG.
import type { IconName } from "./Icons";
export interface SidebarAppearanceGroup<T extends string = string> { readonly id: string; readonly labelKey: string; readonly items: readonly T[]; }
export const SIDEBAR_EMOJI_GROUPS: readonly SidebarAppearanceGroup[] = [
  {
    id: 'faces',
    labelKey: 'sidebarEmoji.group.faces',
    items: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '😉', '😍', '🥰', '😘', '😋', '😜', '🤓', '😎', '🥳',
      '🤔', '😐', '🙄', '😏', '😴', '😪', '🥺', '😢', '😭', '😤',
      '😡', '🤬', '🤯', '😈', '💀', '💩', '🤡', '👻', '👽', '😺',
    ],
  },
  {
    id: 'gestures',
    labelKey: 'sidebarEmoji.group.gestures',
    items: [
      '👋', '🤚', '✋', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👍',
      '👎', '✊', '👊', '👏', '🙌', '🤝', '🙏', '💪', '🫶', '👀',
    ],
  },
  {
    id: 'mood',
    labelKey: 'sidebarEmoji.group.mood',
    items: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '💕', '💖', '💗', '💘', '💝', '❣️', '💞', '💓', '✨', '🌟',
      '💫', '💯', '💢', '💤',
    ],
  },
  {
    id: 'symbols',
    labelKey: 'sidebarEmoji.group.symbols',
    items: [
      '✅', '❌', '❓', '❗', '⭕', '🚫', '⚠️', '💬',
      '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪',
    ],
  },
  {
    id: 'media',
    labelKey: 'sidebarEmoji.group.media',
    items: [
      '🎨', '🖼️', '🎬', '🎥', '📷', '📹', '🎞️', '📺', '🎵', '🎶',
      '🎧', '🎤', '🎹', '🎸', '🥁', '📻', '📡', '🔦', '💡', '🕯️',
    ],
  },
  {
    id: 'design',
    labelKey: 'sidebarEmoji.group.design',
    items: [
      '✏️', '🖊️', '🖌️', '📐', '📏', '✂️', '📎', '📌', '📍', '🔑',
      '🔒', '💎',
    ],
  },
  {
    id: 'tech',
    labelKey: 'sidebarEmoji.group.tech',
    items: [
      '💻', '🖥️', '📱', '⌨️', '🎮', '🕹️', '🎲', '🧩', '🎯', '🏆',
      '⚔️', '🛡️', '🚀', '🤖', '👾', '💾',
    ],
  },
  {
    id: 'nature',
    labelKey: 'sidebarEmoji.group.nature',
    items: [
      '🌲', '🌸', '🌻', '🍀', '🍁', '🌙', '☀️', '⭐', '🌈', '🔥',
      '💧', '❄️', '🌊', '⛰️', '🏝️', '🌍',
    ],
  },
  {
    id: 'animals',
    labelKey: 'sidebarEmoji.group.animals',
    items: [
      '🐶', '🐱', '🦊', '🐻', '🐼', '🐯', '🦁', '🐸', '🐧', '🦋',
      '🐝', '🐙',
    ],
  },
  {
    id: 'places',
    labelKey: 'sidebarEmoji.group.places',
    items: [
      '🏠', '🏢', '🏭', '🏰', '🚗', '✈️', '🚢', '🚂', '⛺', '🎒',
      '💼', '🎁', '👑', '📦', '🛒', '🏷️',
    ],
  },
  {
    id: 'people',
    labelKey: 'sidebarEmoji.group.people',
    items: [
      '👤', '👥', '🧙', '🧚', '🦸', '🥷', '👷', '👶',
    ],
  },
];
````

<a id="record-32"></a>

## 32. tests/audit/serpent-followup.test.ts — 移出或中性化前的原始段落

原文件：`tests/audit/serpent-followup.test.ts`；Git blob：`4e08fde90342b4c64e73aaf2fea5a0baaec1375b`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````typescript
function fixture(options: ConstructorParameters<typeof LibraryService>[0] = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'super-serpent-audit-'));
  ownedRoots.push(root);
  const service = new LibraryService(options);
  services.push(service);
  const library = service.createLibrary({ displayName: 'Audit', selectedParentPath: root });
  return { root, service, library };
}

afterEach(() => {
  for (const service of services.splice(0)) service.closeAll();
  if (initialOiioPath === undefined) delete process.env['SUPER_OIIO_PATH'];
  else process.env['SUPER_OIIO_PATH'] = initialOiioPath;
  for (const root of ownedRoots.splice(0)) {
    // Only roots returned by our own mkdtemp, outside the repository/library.
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('super-serpent-audit-')) {
      throw new Error('Refusing to clean a non-owned audit fixture');
    }
    rmSync(root, { recursive: true, force: true });
  }
});

describe('Serpent post-0.1.4 audit — desired behaviour, known failures stay red', () => {
  it('U01 linked-folder trash must not move external sources', async () => {
    const calls: string[] = [];
    const { root, service, library } = fixture({ trashItem: async (source) => {
      calls.push(source);
      const recovery = path.join(root, 'fake-os-trash');
      mkdirSync(recovery, { recursive: true });
      const relative = path.relative(root, source);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Non-owned trash target');
      renameSync(source, path.join(recovery, `${calls.length}-${path.basename(source)}`));
    } });
    const source = path.join(root, 'external');
    mkdirSync(source);
    writeFileSync(path.join(source, 'indexed.txt'), 'keep');
    writeFileSync(path.join(source, '.unindexed-private'), 'keep this too');
    const link = service.importFolderAsLinked({ libraryId: library.libraryId, sourceRootPath: source });
    const result = await service.deleteLinkedFolderSubtree({ libraryId: library.libraryId, linkedFolderId: link.folderId, relativePath: '', deleteFromDisk: false });
    expect(result.failedCount).toBe(0);
    expect({ sourceExists: existsSync(source), sourceTrashCalls: calls.length }).toEqual({ sourceExists: true, sourceTrashCalls: 0 });
  });
````

<a id="record-33"></a>

## 33. vitest.serpent-audit.config.ts — 移出或中性化前的原始段落

原文件：`vitest.serpent-audit.config.ts`；Git blob：`39074e0301e5a5b4884776fd3cdb27a62b052b30`。以下为变更涉及的原始段落，按原顺序保留（未改动段落仍在其独立文档中）。

````typescript
// Deliberately separate from the normal green regression suite. These probes
// assert desired behaviour, not the continued existence of a known bug.
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 120_000,
    include: ['tests/audit/serpent-followup.test.ts'],
    fileParallelism: false,
  },
});
````
