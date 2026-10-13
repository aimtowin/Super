# Super Chromium 扩展

这是 Chromium 扩展源码，目标是在 Chrome/Edge 中将网页媒体送入本机 Super。当前独立扩展包不是 GitHub Release 的交付附件；2.3.21 的应用发行验收不等于验证了浏览器商店分发、所有网页的捕获或所有 Chrome/Edge 版本。用户操作状态见[浏览器扩展指南](../docs/user-guide/browser-extension.md)，应用验证范围见[2.3.21 验收记录](../docs/releases/v2.3.21-validation.md)。

媒体由浏览器下载后上传到本机 Super；扩展仅连接本机回环地址，桌面应用需保持运行并已打开资源库。

## 内部构建

在 Super 项目根目录运行：

```bash
npm run extension:build
```

构建产物位于 `dist/extension`。在 Chrome 或 Edge 的扩展管理页启用开发者模式后，加载该解压目录。Forge 打包也会复制这份构建产物到应用的资源目录，但这不是独立扩展 ZIP 或商店发布，不应把应用安装器当作浏览器扩展包加载。
