# Super

Super 是面向创意工作的本地优先视觉资产工作台，支持素材导入、检索、标签、合集、预览、链接文件夹、浏览器采集和本地同步。

## 发布状态

Super 为非开源产品。本仓库仅用于授权开发、构建与验证；不提供公开下载、源码分发或公开更新通道。

## 内部构建

需要 Node.js 24（见 `.nvmrc`）。常用验证命令：

```bash
npm run lint
npm run typecheck
npm run test
npm run package
```

Windows 安装包由 `npm run make:inno` 生成，输出为 `out/make/inno/SuperSetup.exe`。
