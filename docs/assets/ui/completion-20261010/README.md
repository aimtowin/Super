# 本体补齐截图来源

2026-10-10，Windows / Electron 43.1，2.3.18 工作区源码。由
`tests/e2e/remaining-local-upgrades.test.ts` 启动独占进程、临时库和独立
user-data，通过真实 Renderer → Preload → Main → Worker 操作截取。
不操作 E:/Super 安装版、真实图库、ECS、AI 或 WebDAV。

本组来自开发回归轮次 `architecture-stage-a-07821926-9b48-4c2d-8aee-7089146022cb`。
该组合场景通过，但该轮全套是 69 通过、22 失败、12 条件跳过；配图不作为
整套通过或发行完成的证据。图像是原尺寸副本，不是合成设计稿。
测试样本为自制纯色图片、两帧 GIF、UTF-16 文本和 DejaVu Sans 字体。
截图中的临时路径及导入完成提示属于真实测试现场。

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| custom-color.png | 任意颜色与 HSL 容差、生成标记入口 | 59bb337b36c7b67f4a2f05e2c62e08d0e9e291515ada955ba27dacdfb38eb39b |
| folder-sidebar.png | 侧栏名称过滤、自然排序与索引目录检查器 | 32c83f360ecace624fc64e4e89b500a4f2c8a09282800bff70001ba1161842b2 |
| font-preview.png | 字体加载、预览文字与字号 | cb4098ee5b66758b8e9a32a5b4e60120377e6298b95d4ea298887127f29f139f |
| gif-controls.png | GIF 暂停、帧进度与逐帧 | 44ed2845d25ea076c63fd411b4523215d974408d495ecd4aabb886bf008c743a |
| remaining-batch.png | 批量建目录：成功保留、CON 失败 | 040cc3cbcfbfcdb44dbb564f23cbef72238b19bb3846d8c33c0583e0e5539214 |
| text-wrap.png | UTF-16 只读、折行与显式转码入口 | 3e097a942209886b1d6a45f135e47fd24fd4f2c7848aa3367275ab0b53e9f5cb |
| workspace-preview.png | 独立工作区、4K 图片缩放恢复 | 4c26c54f2f5d392dfc9f608e7b31fa6fc309eb936c3b98410fb995633f43c28e |

[本轮事实与边界](../../../reference/completion-results-2026-10-10.md) ·
[功能介绍](../../../user-guide/features.md)
