# Super 文档

本文档目录随 Super Lib 源码版本维护，覆盖产品使用、扩展开发、产品范围与领域术语。首次使用请从[快速上手](user-guide/quick-start.md)开始；开发计划与历史记录供维护者参考，具体操作以使用手册为准。

## 交付文档

当前正式发行：**2.4.1**，以[2.4.1 验收](releases/v2.4.1-validation.md)和 GitHub／更新服务器实际附件为准；2.4.1 是更新源切换后的自动更新验证版，功能与 2.4.0 相同。[10 月 10 日本体补齐记录](reference/completion-results-2026-10-10.md)保留历史语境。F15 账号/官方目录/社区继续暂停；更新源已于 2.4.0 迁至新服务器 IP 直连，**迁移已完成并宣布**（见[更新源迁移完成公告](releases/2026-10-22-update-source-migration-complete.md)）；2.3.21 及更早版本需手动全量安装一次后才能恢复增量更新。旧域名与旧 ECS 路径只作为历史事实保留，不构成当前部署授权。

| 文档 | 内容 |
| --- | --- |
| [当前已知问题](reference/known-issues-2.3.18.md) · [当前文档审查](reference/documentation-review-2.3.21.md) | 成品 Console 实际失败、构建准备缺口与修订依据 |
| [2.4.1 更新说明](releases/v2.4.1.md) · [验收记录](releases/v2.4.1-validation.md) · [更新公告](releases/v2.4.1-announcement.md) | 更新源迁移后的自动更新验证版（功能同 2.4.0）；增量包约 2 MB |
| [更新源迁移完成公告](releases/2026-10-22-update-source-migration-complete.md) | 宣布迁移完成：完成范围、对用户的影响与后续安排 |
| [磁盘变化同步问题记录（2026-10-22）](reference/disk-sync-issues-2026-10-22.md) | 本轮两个同步提示问题：已修复部分、仍开放的相互阻塞、复现与验证待办 |
| [2.4.0 更新说明](releases/v2.4.0.md) · [验收记录](releases/v2.4.0-validation.md) | 更新源改为服务器 IP 直连；2.3.21 及更早需全量安装一次 |
| [2.3.21 更新说明](releases/v2.3.21.md) · [验收记录](releases/v2.3.21-validation.md) | 画布优先、正确加载状态与目录查询修复（功能基线） |
| [2.3.20 更新说明](releases/v2.3.20.md) · [验收记录](releases/v2.3.20-validation.md) | 此前侧栏独立加载、恢复排序和全库计数修复；保留原发行证据 |
| [2.3.19 更新说明](releases/v2.3.19.md) · [验收记录](releases/v2.3.19-validation.md) | 查看器／资源组织升级及原成品侧栏回归历史，不覆盖旧证据 |
| [2.3.18 更新说明](releases/v2.3.18.md) · [验收记录](releases/v2.3.18-validation.md) | 前轮本体补齐及正式发行证据 |
| [完整图文功能指南](user-guide/features.md) | 2.3.17 安装版实拍、2.3.18 源码补齐及 2.3.19 实际成品新查看器，入口、步骤及真实限制 |
| [后续开发决策与优化里程碑](POST_DEVELOPMENT_DECISIONS.md) | 真实决策演变、逐版修复、对话索引、验证限制及待办边界 |
| [阶段 1 历史检查点](reference/followup-phase1-results-2026-10-09.md) · [分阶段升级计划](plans/2026-10-09-followup-upgrades.md) | 当时 8 项修复及验证限制；当前交付事实以最新发行验收为准 |
| [软件本体升级首批](reference/local-upgrades-results-2026-10-10.md) · [本轮计划](plans/2026-10-10-local-upgrades.md) | 分类 Emoji/图形颜色、父项拖拽提升、合集撤销修正及 JFIF/AVIF/FLV；历史首批检查点；后续交付见最新发行验收，账号/目录/迁移继续暂停 |
| [修复前确认未修复清单](plans/confirmed-unfixed-2026-10-09.md) | 保留 8 项实际失败复现与已发行 2.3.17 安全提醒，不覆盖历史证据 |
| [快速上手](user-guide/quick-start.md) | 下载安装、创建本地资产库、可选 AI 与外观配置 |
| [外观设置](user-guide/appearance.md) | 深浅主题、背景图片、字体大小与实拍截图 |
| [使用手册](user-guide/README.md) | 安装、导入、浏览、搜索与过滤、标签/合集、查看器、AI 分析、插件/MCP、故障排查（中英双语） |
| [扩展作者手册](manual/README.md) | 插件、脚本、MCP 开发指南与 API 参考 |
| [产品简报（历史规划）](product-brief.md) | 早期产品范围，不作为当前功能清单 |
| [术语表](glossary.md) | 领域术语 |

## 构建与交付

构建环境、常用验证命令和 Windows 安装包输出位置见仓库根目录的 [README.md](../README.md)。Super Lib 完全免费，Windows 安装包在 [GitHub Release](https://github.com/aimtowin/Super/releases/latest) 下载。仓库代码许可见 [LICENSE](../LICENSE)。

发布工具的本地耗时、四路有界哈希试验及验证边界见[发布工具耗时复核](reference/release-throughput-2026-10-12.md)。优化源码与诊断 CLI 尚未同步到公开 main；仅同步此记录不使其命令成为干净 checkout 可执行入口。Codex 额度暂停不计入编译耗时，试构建不是新产品发行。

## 文档维护原则

当前已交付修复见[2.3.21 验收](releases/v2.3.21-validation.md)，未关闭问题见[已知问题与边界](reference/known-issues-2.3.18.md)。[本体补齐记录](reference/completion-results-2026-10-10.md)、[阶段 1 结果](reference/followup-phase1-results-2026-10-09.md)、[修复前清单](plans/confirmed-unfixed-2026-10-09.md)和旧[后续修复清单](plans/follow-up-fixes.md)保留当时语境；源码或文档修订不等于新产品已发布，未重新验收的历史项不自动关闭。

使用手册当前版本入口与操作按 2.3.21 源码及既有验收复核，见[2026-10-13 文档核对](reference/documentation-review-2.3.21.md)；2.4.0/2.4.1 只改更新源与打包，未改变界面行为，故仍沿用该结论。[2.3.18 审查](reference/documentation-review-2.3.18.md)与[2.3.17 审查](reference/documentation-review-2.3.17.md)保留原证据；2.3.17／2.3.18／2.3.19 配图仍标实际拍摄版本，本轮没有重新拍摄。`plans/`、产品简报、架构快照与历史验证记录保留当时语境，不代表所有计划已实现或历史失败已消失。外部 AI、WebDAV、MCP Agent 与第三方插件不因截图或本次文档检查而视为验收通过。

- 用户可执行的步骤必须以当前产品界面和已发布能力为准。
- 扩展 API 以 [扩展作者手册](manual/README.md)中的 API 参考为准；示例不得要求访问内部数据库、绝对路径或未公开的运行时句柄。
- 涉及版本迁移、平台差异或大型资源库的内容应同时说明限制与恢复方式，不把开发环境结论写成通用承诺。
