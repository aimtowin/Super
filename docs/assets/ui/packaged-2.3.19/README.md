# 2.3.19 实际成品截图

日期：2026-10-11，Windows 独立进程、临时演示库，1080×900。不是设计稿，不覆盖用户的已安装软件或真实资源库。

由 `tests/e2e/viewer-library-upgrades.test.ts` 在实际 `out/Super-win32-x64/Super.exe` 内拍摄；打包版组合测试最终为 8 通过、0 失败、0 跳过、0 flaky。该测试同时验证全屏宿主、切图、删除和缺失链接开关；截图仅说明所拍摄入口，不替代测试结果或外部服务验收。

- 构建 ID：`8875945e-c13f-4d39-ab55-c63f2c2c3969`
- 源码：`60b5501cccd848611222be10f4f269e7c32ccc5e`
- 输入指纹：`3dd0dc1a686bb752cbff85806b1ee71315eda7efa94c399fe2313bb8d4b9f7b1`
- 最终程序目录指纹：`3e7d6088e7a1e6e1169f7d08712887e0a962ee3a1eddf8f6fd928733127a8355`

| 截图 | 内容 | SHA-256 |
| --- | --- | --- |
| [markdown-rendered.png](markdown-rendered.png) | GFM 查看器与结构检查器；危险链接仅作为文本显示 | `1b9aa5232cf84abbc32b4b04c1bb4e5bc25eb63462a829d727f9049b863c6ff7` |
| [zip-readonly.png](zip-readonly.png) | ZIP 只读成员浏览与文本预览 | `b4160e6aca361e23b1ad9544917eb3b67ab382e529fe9a8b231f8983a38a5b77` |
| [folder-cover.png](folder-cover.png) | 从库内图片选择文件夹封面 | `736fc2b434da775c23f3de8b53d67edd7c26442e713cae0faabd49a7081ed122` |

图文入口：[全功能介绍](../../../user-guide/features.md#2319-查看器与资源组织)。[发行验收](../../../releases/v2.3.19-validation.md)记录发布结果和限制。
