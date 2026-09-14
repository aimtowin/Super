# 使用手册

面向最终用户的 Super Lib 使用指南。基础手册核对于 `v2.2.8`，已补充 `v2.3.0` 文件夹新建交互及 `v2.3.1` 悬浮预览和提示功能。英文版：[README.en.md](README.en.md)

常用入口：[快速上手](quick-start.md) · [外观设置](appearance.md) · [悬浮图片预览](basics.md#floating-image-preview) · [右下角提示气泡](basics.md#hover-hints) · [AI 分析与查找](ai.md) · [故障排查](troubleshooting.md)

- [快速上手](quick-start.md)——下载安装、创建本地资产库、可选 AI 与外观配置
- [安装](installation.md)——Windows 安装、更新与其他平台说明
- [基本使用](basics.md)——资源库、导入、浏览、标签、合集、文件操作和查看器
- [搜索与过滤](search-and-filters.md)——高级搜索语法、过滤维度和 Shift 多选
- [WebDAV 云同步](sync.md)——服务器配置、资源库绑定、自动同步与打开远端同步库
- [AI 分析与查找](ai.md)——手动/自动分析、重分析确认、自然语言查找与智能合集
- [外观设置](appearance.md)——深浅主题、自定义背景、字体大小和层级效果
- [插件使用](plugins.md)——安装、启用、更新和卸载插件
- [自动化功能](automation.md)——自动化脚本和 MCP 外部客户端连接
- [故障排查](troubleshooting.md)——常见问题与解决

## 快速开始

1. 从 [Release](https://github.com/aimtowin/Super/releases/latest) 下载 `SuperSetup.exe` 并安装。
2. 启动应用，在本机磁盘创建资源库，建议使用固态硬盘。
3. 按需配置「设置 → AI」与「设置 → 外观」，也可以跳过。
4. 导入素材或链接已有文件夹，开始浏览和整理。双击打开查看器，右键查看更多操作。

Super Lib 完全免费，第三方 AI 服务可能另行收费。完整入门步骤见[快速上手](quick-start.md)。

数据保存在本机资源库目录；如需多台电脑间同步，可使用 WebDAV 云同步（见[同步](sync.md)）。

## 界面速览

典型工作区由左侧资源库导航、中部资产画布和右侧 Inspector 组成。Windows 使用左上角「主菜单」承载文件、编辑、窗口、资源库和设置；macOS 还提供同内容的系统菜单。导入、搜索、过滤和排序集中在顶部工具栏。

![Super Lib 资源库总览](../assets/ui/super-workspace-2.2.8.png)

完整流程见[基本使用](basics.md)。

```mermaid
flowchart LR
    A[创建资源库] --> B[导入文件或文件夹]
    B --> C[浏览瀑布流]
    C --> D{组织资产}
    D --> E[标签与合集]
    D --> F[文件夹与元数据]
    C --> G[搜索与过滤]
    C --> H[打开查看器]
    H --> I[检查或编辑元数据]
    C --> J[回收站与恢复]
    C --> K[AI 分析]
```

## 功能状态说明

本目录说明当前版本的用户功能。不同版本的界面和可用功能可能略有变化，请以最新安装包和发行说明为准。

`live-2.2.8/` 下的配图来自当前运行实例；本手册中的旧截图已替换或撤下。截图仅说明当时的界面状态，不代表所有功能均已完成端到端验证。跨平台说明不表示该平台一定有对应发行附件。
