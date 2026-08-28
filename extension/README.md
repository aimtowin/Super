# Super Chromium 扩展

该扩展可将 Chrome、Edge 等 Chromium 浏览器中的网页图片和视频保存到正在运行的 Super 桌面应用。

媒体由浏览器下载后上传到本机 Super；扩展仅连接本机回环地址，桌面应用需保持运行并已打开资源库。

## 内部构建

在 Super 项目根目录运行：

```bash
npm run extension:build
```

构建产物位于 `dist/extension`。在 Chrome 或 Edge 的扩展管理页启用开发者模式后，加载该解压目录。
