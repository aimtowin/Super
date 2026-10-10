# 2.3.18 成品控制台复核实拍

时间：2026-10-10 20:07:52（北京时间）。来源：已打包 Windows x64 `Super.exe`，运行身份 `version=2.3.18`、`packaged=true`。独立临时 userData 与空演示库；只批准一次只读脚本运行确认。没有调用 AI、WebDAV、ECS 或用户真实库。

| 文件 | 尺寸 | SHA-256 | 场景 |
| --- | --- | --- | --- |
| `console-runtime-error.png` | 1440×900 | `b9a540648709ff6d46af13b0beba7c48408d8964f4fb55fdb4b3102c67dfbf80` | `assets.search` 返回 RUNTIME_PROCESS_EXITED；保留真实失败画面 |

原始诊断位于 Git 忽略的临时目录；已公开的故障摘要与重现步骤见[当前 K01](../../../reference/known-issues-2.3.18.md)。图片来自进程截取，不是生成图或界面设计稿。此复核没有修复二进制，运行失败仍需后续修复验收。
