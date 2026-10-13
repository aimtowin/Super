# Super 用户手册：插件、脚本与 MCP

这组手册面向希望为 Super 编写插件、自动化脚本或 MCP 客户端的用户和开发者。它描述的是当前仓库已经提供的开发态接口；实现尚未发布为独立 SDK，示例应在 Super 仓库根目录、Node.js 24 环境中运行。

`docs/manual/` 面向扩展作者；当前仓库的[架构与仓库导航](../REPOSITORY_GUIDE.md)、[开发计划](../plans/README.md)、[真实决策记录](../POST_DEVELOPMENT_DECISIONS.md)及[2.3.21 发行验收](../releases/v2.3.21-validation.md)各自保留对应证据。`docs/internal/` 是被 Git 忽略的本地开发目录，不是公开手册或可从 GitHub 获取的导航入口。

## 从哪里开始

| 目标 | 入门 | API 参考 |
| --- | --- | --- |
| 编写插件 | [插件开发指南](plugins/development.md) · [最佳实践](plugins/best-practices.md) | [插件 API 参考](plugins/api-reference.md) |
| 编写自动化脚本 | [脚本开发指南](scripts/development.md) | [脚本 API 参考](scripts/api-reference.md) |
| 接入 MCP | [MCP 开发指南](mcp/development.md) | [MCP API 参考](mcp/api-reference.md) |

脚本与 MCP 共用 Automation Command Gateway，但实际公开的方法投影不同，不能把 Registry/MCP 的全部命令直接当作 Console API。脚本在 Desktop Console 中运行，MCP 通过 Desktop 内嵌的 loopback Streamable HTTP 服务连接。API 应以本手册及实际 guest 投影为准；当前没有单独交付 SDK 或随安装包提供可下载的 `automation-api.d.ts`。

## 三种扩展方式如何选择

- 需要菜单、设置页、工具栏、查看器入口或插件自己的沙盒 UI：使用插件。
- 需要一次性批处理、可保存的用户脚本或复用现有 Action：使用自动化脚本。
- 需要让外部 Agent 或 MCP Host 调用 Super：使用 MCP。
- 需要执行真实业务操作时，优先寻找现有 Script/MCP Action；插件 UI 负责触发和展示，插件本身不应绕过 Host 直接访问数据库或资源库文件。

## 当前边界

- 脚本运行在 QuickJS 隔离进程中，不提供 Node.js 内置模块、任意文件系统、SQLite、任意网络或 Library Worker 句柄。
- 插件的受限运行模式同样只能使用 Host 暴露的 API；无限制插件可以自行管理外部进程和模型，但 Host 不提供通用 GPU、CPU、内存或 VRAM 调度接口。
- MCP 是 Desktop 内嵌的本机 loopback Streamable HTTP 服务，不是远程服务。服务默认关闭，用户可在设置中启停、设置自动启动、复制客户端配置和撤销 credential；写入能力受本机授权和高风险操作确认共同控制。
- MCP 不假设用户安装 Node.js、npm 或任何命令行启动器；客户端只需使用设置页复制的 endpoint 和 credential 连接正在运行的 Super Desktop。
- 当前发布文档覆盖开发态入口。打包后的 MCP 生命周期、Windows 和跨平台发布旅程仍需以当前 QA 证据为准，不能仅凭本地开发态测试宣称已验证。

## 共同的安全和可靠性约定

1. 不把绝对路径、秘密、数据库句柄或任意原始 IPC 对象放进插件贡献、脚本输出或 MCP 参数。
2. 读取类操作应使用分页和明确上限；批量写入应使用幂等键与执行计划。MCP 可用 `super_execution_status` 追踪结果，Console 使用运行结果和执行日志；Console 当前没有 `superApi.execution` 公共 API。
3. 客户端超时不等于操作失败。对可能已经提交的操作，先查询执行状态，再决定是否重试。
4. 资源库切换、插件停用和 Worker 崩溃都可能使上下文失效；开发者应把 `libraryId`、资产 ID、revision 和执行 ID 当作需要重新校验的边界。
5. 文档中的 API 名称以当前实现和类型声明为准；如果规范文档、旧 Skill 或示例与 [脚本 API 参考](scripts/api-reference.md) 冲突，应优先采用 API 参考并记录问题。

## 相关文档

- [插件分发与更新](plugins/distribution-and-updates.md)：GitHub Release、ZIP、文件夹安装及更新策略。
- [脚本开发指南](scripts/development.md) 与 [脚本 API 参考](scripts/api-reference.md)：脚本运行约束、权限和命令定义。
- [MCP 开发指南](mcp/development.md) 与 [MCP API 参考](mcp/api-reference.md)：本机服务接入、认证和工具契约。

## 文档状态

这些页面是随 Super 源码版本控制的发布文档，不代表已经完成所有平台验收。涉及打包、Windows、完整退出重启或真实桌面操作的声明，必须同时查看项目状态和 QA 文档中的当次证据。

### Clean checkout 的构建准备缺口

当前 `scripts/verify-package.mjs` 会要求工作区存在 `docs/internal/skills/super-automation/automation-api.d.ts`，并检查 API 版本标记与完整 Registry 命令 ID。这个声明被 Git 忽略，不能通过克隆仓库取得；现有 npm 脚本和 Forge hook 也没有生成它的有效 CLI。因此，完成 `npm ci` 不等于已经具备全部打包前置输入。

`command-registry.ts` 中的 `generateAutomationTypeDeclaration()` 不是这份完整门禁声明的生成入口，其当前输出不能满足上述校验。没有有效准备流程前，应将全新 checkout 的打包视为存在阻塞，不跳过门禁、不伪造声明，也不把本机已有私有文件写成公开交付。本轮文档修订没有实现生成器；源码与编辑器接口仍以[脚本 API 参考](scripts/api-reference.md)及实际 guest 投影为准。

## 当前成品执行状态

Windows 成品 Console 的运行依赖缺少 `typescript`，2.3.18 曾实测只读脚本失败；2.3.21 发行没有修复这条运行依赖路径，见[当前 K01](../reference/known-issues-2.3.18.md)及[2.3.21 验收边界](../releases/v2.3.21-validation.md)。各 API 页保留原先的源码核对版本，不因更新总入口而冒充重新完成全部 API 或 Console 成品验收。MCP、插件与 Console 是不同运行路径，不将此失败自动扩展为所有扩展路径失败。
