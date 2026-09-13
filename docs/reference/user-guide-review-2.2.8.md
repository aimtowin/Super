# v2.2.8 用户文档复核记录

本轮范围为首页、文档入口及 `docs/user-guide/` 的 24 份中英文页面。依据当前源码、已采集的运行实例截图与 GitHub Release 附件核对；不将本轮文字检查视为所有功能的端到端测试。

| 项目 | 本轮处理 | 核对依据 |
| --- | --- | --- |
| 外观入口 | 首页、文档索引、手册目录及快速上手均可进入中英文外观页 | `appearance.md`、`appearance.en.md`、10 张实拍截图 |
| 颜色筛选 | 修正旧十色和统一过滤按钮描述，说明 18 个色相加黑灰白、AI 状态与喜欢入口 | `src/shared/color-filter-presets.ts`、`src/renderer/DimensionFilterBar.tsx` |
| 建库与文件操作 | 去掉主菜单中并不存在的导出入口描述，修正忽略规则示例的行尾注释 | `src/renderer/main-menu-items.ts`、实际菜单截图 |
| 标题栏行为 | 补充双击仅重置新建目标、拖动不导航 | `src/renderer/App.tsx` 的标题栏双击处理 |
| 预览与加载 | 补充文档类型、默认后缀卡片、分页及不定进度条 | `src/shared/media-formats.ts`、`FileTypeThumbnail.tsx`、浏览代码 |
| AI | 保留代码确认的参数范围，区分手动与自动分析；同步发布上轮补充的重分析确认与查找配图 | `ai-analysis-settings.ts`、`ai-concurrency.ts`、`ai-analysis-image.ts`、已有分析截图 |
| 浏览器扩展 | 写明 2.2.8 Release 没有扩展附件；移除旧版本号门槛与过度绝对的网络说明 | Release 附件列表、扩展下载与本地连接流程 |
| WebDAV | 修正首次同步可能包含拉取、手动与自动失败反馈，以及服务器所需操作 | `sync-auto-scheduler.ts`、`worker/sync/webdav-driver.ts` |
| 故障反馈 | 会话日志改为 Windows 默认应用日志目录；补充托盘恢复与结构化反馈内容 | `src/main/index.ts` 日志初始化、`session-log.ts` |
| 插件与自动化 | 核对插件安装、默认更新开关、卸载及 MCP/脚本入口，保留仍适用说明 | 插件管理与运行时协议、`plugin-package-manager.ts`、现有手册 |
| 历史材料 | 产品简报及 plans 入口标明历史规划，旧截图明确标为参考 | 产品简报、`docs/plans/README.md` |

本轮没有新安装浏览器扩展、连接 WebDAV 服务器、安装插件或发起付费 AI 请求。相关说明属于源码/发行附件复核，不宣称已在用户机器上完成这些功能的实际回归。

后续发布时需同步检查：版本适用说明、下载附件、参数默认值、截图与正文是否一致。历史计划保留原始语境，不应直接充当操作说明。
