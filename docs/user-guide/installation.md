# 安装

Super Lib 完全免费。在 [Super Releases](https://github.com/aimtowin/Super/releases/latest) 下载最新版。首次使用建议同时阅读[快速上手](quick-start.md)。

## 系统要求

- Windows：64 位 Windows 10 或 Windows 11
- 建议在本机固态硬盘创建资产库；素材与预览缓存另占空间

Windows 安装包和版本说明以 [Super Releases](https://github.com/aimtowin/Super/releases) 为准。

## 其他平台

当前 `v2.2.8` 的发行附件提供 Windows x64 安装包。其他平台是否提供可下载版本，以 Release 实际附件为准。

## Windows

1. 下载 [SuperSetup.exe](https://github.com/aimtowin/Super/releases/latest/download/SuperSetup.exe)。
2. 运行安装程序并按提示完成。

未签名开发包可能触发 SmartScreen，请核对来源后选择「更多信息 → 仍要运行」。通过系统「设置 → 应用」卸载。

## 浏览器扩展

浏览器扩展包由项目团队随版本交付；安装与使用见[浏览器扩展](browser-extension.md)。

## 升级

可以通过应用内更新提示下载更新，也可以运行新版 `SuperSetup.exe` 覆盖安装。应用内更新会在存在匹配版本的增量包时优先选用，否则使用完整包。下载准备完成后确认安装，在独立更新窗口等待完成，再点击「启动 Super Lib」。

资源库目录和用户配置独立于应用安装目录；升级前建议备份资源库。完整更新 ZIP、delta 增量 ZIP 和 SHA-256 文件是更新与校验附件，首次安装无需逐个下载。
