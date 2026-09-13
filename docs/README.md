# Super 文档

本文档目录随 Super Lib 源码版本维护，覆盖产品使用、扩展开发、产品范围与领域术语。首次使用请从[快速上手](user-guide/quick-start.md)开始；开发计划与历史记录供维护者参考，具体操作以使用手册为准。

## 交付文档

| 文档 | 内容 |
| --- | --- |
| [快速上手](user-guide/quick-start.md) | 下载安装、创建本地资产库、可选 AI 与外观配置 |
| [外观设置](user-guide/appearance.md) | 深浅主题、背景图片、字体大小与实拍截图 |
| [使用手册](user-guide/README.md) | 安装、导入、浏览、搜索与过滤、标签/合集、查看器、AI 分析、插件/MCP、故障排查（中英双语） |
| [扩展作者手册](manual/README.md) | 插件、脚本、MCP 开发指南与 API 参考 |
| [产品简报（历史规划）](product-brief.md) | 早期产品范围，不作为当前功能清单 |
| [术语表](glossary.md) | 领域术语 |

## 构建与交付

构建环境、常用验证命令和 Windows 安装包输出位置见仓库根目录的 [README.md](../README.md)。Super Lib 完全免费，Windows 安装包在 [GitHub Release](https://github.com/aimtowin/Super/releases/latest) 下载。仓库代码许可见 [LICENSE](../LICENSE)。

## 文档维护原则

使用手册以 `v2.2.8` 为本轮核对基线。`plans/`、产品简报和项目历史保留当时的设计语境，不代表所有计划已实现；发布附件以 GitHub Release 当前列表为准。用户手册的旧版参考图会注明，操作文字优先于参考图。

- 用户可执行的步骤必须以当前产品界面和已发布能力为准。
- 扩展 API 以 [扩展作者手册](manual/README.md)中的 API 参考为准；示例不得要求访问内部数据库、绝对路径或未公开的运行时句柄。
- 涉及版本迁移、平台差异或大型资源库的内容应同时说明限制与恢复方式，不把开发环境结论写成通用承诺。
