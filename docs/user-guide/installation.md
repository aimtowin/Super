# 安装

> 核对版本：Super Lib v2.3.17（2026-10-09）；安装包可用性以发行附件为准。

Super Lib 完全免费。在 [Super Releases](https://github.com/aimtowin/Super/releases/latest) 下载最新版。首次使用建议同时阅读[快速上手](quick-start.md)。

GitHub 仓库为私有时，需要登录有权限的账户下载附件；应用内更新使用已配置的 HTTPS 更新源，不代表 GitHub 匿名下载可用。

## 系统要求

- Windows：64 位 Windows 10 或 Windows 11
- 建议在本机固态硬盘创建资产库；素材与预览缓存另占空间

Windows 安装包和版本说明以 [Super Releases](https://github.com/aimtowin/Super/releases) 为准。

## 其他平台

当前 `v2.3.17` 的发行附件提供 Windows x64 安装包。其他平台是否提供可下载版本，以 Release 实际附件为准。

## Windows

1. 下载 [SuperSetup.exe](https://github.com/aimtowin/Super/releases/latest/download/SuperSetup.exe)。
2. 运行安装程序并按提示完成。

未签名开发包可能触发 SmartScreen，请核对来源后选择「更多信息 → 仍要运行」。通过系统「设置 → 应用」卸载。

## 升级

可以通过应用内更新提示下载更新，也可以运行新版 `SuperSetup.exe` 覆盖安装。存在匹配版本的增量包时优先选用，否则使用完整包。先确认下载，再确认“重启并完成更新”；独立更新窗口显示真实进度。安装成功后显示“更新完成”，短暂展示后自动启动 Super Lib 并关闭更新窗口，无需再点击启动。若启动失败，窗口保留可读错误及手动启动/关闭入口，不会无限重试。自动检查不会擅自下载或退出应用。

资源库目录和用户配置独立于应用安装目录；升级前建议备份资源库。完整更新 ZIP、delta 增量 ZIP 和 SHA-256 文件是更新与校验附件，首次安装无需逐个下载。
