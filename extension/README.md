# Super Chromium 扩展

这是内部开发态 Chromium 扩展源码，目标是在 Chrome/Edge 中将网页媒体送入本机 Super。当前 2.3.18 的 46 个发行附件不包含可直接安装的浏览器扩展包，也没有在本轮验证商店分发与完整网页捕获。用户操作状态见[浏览器扩展指南](../docs/user-guide/browser-extension.md)。

媒体由浏览器下载后上传到本机 Super；扩展仅连接本机回环地址，桌面应用需保持运行并已打开资源库。

## 内部构建

在 Super 项目根目录运行：

```bash
npm run extension:build
```

构建产物位于 `dist/extension`。在 Chrome 或 Edge 的扩展管理页启用开发者模式后，加载该解压目录。
