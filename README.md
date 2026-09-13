<div align="center">

[English](README.en.md) | **简体中文**

</div>

# Super

<div align="center">

<img src="docs/assets/ui/super-Logo.png" alt="Super 标志" width="30%" />

</div>

Super 是面向创意工作的本地优先视觉资产工作台。它将素材导入、浏览、检索、标签、合集、预览、链接文件夹、浏览器采集、AI 分析和本地同步集中在一个桌面应用中。

## 发布状态

Super 为专有软件。本仓库用于经授权的开发、构建、验证与版本管理；不构成公开源码分发或公开更新渠道。安装包、扩展包与访问权限由项目团队单独发放。

## 功能概览

- **多类型资产**：管理图片、视频、音频、3D 模型、文本及其他可识别文件；不支持内置预览的文件仍可纳入资源库并通过外部应用打开。
- **组织与发现**：文件夹、标签、评分、喜欢、描述、色卡、合集、过滤、排序和范围内全文检索。
- **本地优先**：托管导入会复制素材进入资源库；链接文件夹则原位引用外部目录。资源库数据保存在本机，可按需使用 WebDAV 在设备间同步。
- **浏览与预览**：缩略图、视频预览、资源信息、查看器和后台派生任务均以不阻塞浏览为原则。
- **自动化与扩展**：支持插件、受控自动化脚本和 MCP 本机连接；所有写入能力受权限、执行计划与风险确认约束。
- **AI 分析**：可对受支持媒体生成描述、标签和结构化信息；仅在用户显式配置并启用后才会向所选服务提交资产。
- **外部资源库与浏览器采集**：可打开符合支持条件的外部资源库；浏览器扩展可把网页图片和视频保存到当前打开的 Super 资源库。

<div align="center">

<img src="docs/assets/ui/super-Preview.png" alt="Super 工作区预览" />

</div>

## 安装与使用

请通过项目团队提供的安装包安装 Super。Windows 构建默认输出 `SuperSetup.exe`；资源库和用户配置独立于安装目录，升级或卸载应用不会自动删除资源库。

详细的安装、导入、浏览、同步、AI、扩展和故障排查说明见[使用手册](docs/user-guide/README.md)。

## 本地构建

需要 Node.js 24（见 `.nvmrc`）。原生开发目标为 macOS arm64 与 Windows x64；不要在 SMB/NAS 挂载目录中构建。

```bash
npm ci --registry=https://registry.npmjs.org
npm run rebuild:native
npm start
```

常用验证与打包命令：

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run package
npm run make:inno
```

`npm run make:inno` 在 Windows 生成 `out/make/inno/SuperSetup.exe`。构建、交付与扩展接口的边界以仓库脚本和[扩展作者手册](docs/manual/README.md)为准。

## 文档

| 文档 | 内容 |
| --- | --- |
| [使用手册](docs/user-guide/README.md) | 安装、导入、浏览、搜索、标签、合集、同步、AI、浏览器扩展与故障排查 |
| [扩展作者手册](docs/manual/README.md) | 插件、自动化脚本和 MCP 的开发指南与 API 参考 |
| [产品简报](docs/product-brief.md) | 产品愿景、范围、术语与交付边界 |
| [术语表](docs/glossary.md) | 资源库、自动化、插件、同步等领域定义 |

第三方组件、媒体运行时和素材的许可信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 及各组件随附的许可文件。
