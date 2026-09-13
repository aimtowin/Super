# v2.2.8 帮助手册截图核查

核查范围：中英文用户手册实际引用的旧截图，以及其在 `docs/assets/ui/` 中的原文件。逐张查看画面后，从用户已打开的 Super Lib 实例重新采集。未通过改字、合成或重绘伪造当前界面。

## 旧图处理结果

| 原文件 | 核查发现 | 当前处理 |
| --- | --- | --- |
| MCP-settings.png | 文案包含 Serpent，客户端区域布局也已变化 | 替换为 [当前 MCP 设置](live-2.2.8/mcp-settings.png) |
| sync-settings.png | 地址示例、用户名中包含旧名称 | 替换为 [当前同步设置](live-2.2.8/sync-settings.png) |
| library-sync.png | 旧同步服务器路径含 Serpent | 替换为 [当前库同步设置](live-2.2.8/library-sync.png) |
| open-sync-library.png | 旧服务器路径含 Serpent，展示历史测试库 | 替换为 [当前打开同步库入口](live-2.2.8/open-sync-library.png) |
| open-external-library.png | 说明文字及按钮仍为 Serpent | 替换为 [当前外部库入口](live-2.2.8/open-external-library.png) |
| extension.png | 实际是浏览器采集的树状菜单，被误用为插件管理截图 | 插件手册替换为 [当前插件设置](live-2.2.8/plugin-settings.png)；浏览器扩展教程撤下 |
| AI-analyze-menu.png | 早期菜单与布局 | 替换为 [当前资产右键菜单](live-2.2.8/ai-context-menu.png) |
| 3D-inspector.png | 早期查看器画面 | 替换为 [当前 FBX 查看器](live-2.2.8/model-viewer.png) |
| import-sequence.png | 早期测试序列导入窗口 | 撤下图片、保留操作文字；待隔离测试库采集，不向用户正式库发起导入 |

另外补充 [自动化脚本面板](live-2.2.8/automation-scripts.png)，帮助用户识别实际入口和编辑器。

## 素材保留与发布范围

- 原图保留为历史素材，不再由当前用户手册引用；本轮没有删除素材文件。
- 未被手册引用的其他旧图不作为当前产品截图发布，也不因仍在目录中就视为已通过当前版本核验。
- 中英文手册共用真实中文界面截图，不伪造英文界面。
- WebDAV 截图为空配置状态，未建立远端连接；MCP 服务原已开启，本次未修改开关或创建客户端。
- 未运行脚本、安装插件、发起 AI 请求、修改素材或执行导入。3D 查看器仅打开已有模型。
- 采集后恢复原浏览目录并清除临时搜索与过滤，个人相册画面未纳入公开截图。

## 待后续处理

1. 在隔离测试库补拍序列帧导入窗口。
2. 当前应用常规设置仍有浏览器扩展下载指引，需另行修改应用文案；本轮只调整帮助文档。
3. 后续若恢复浏览器扩展教程，必须先交付实际扩展包并验证安装、连接、保存全流程。
