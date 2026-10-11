# Super Lib 2.3.18 当前已知问题与验证缺口

核对日期：2026-10-10。本页区分真实失败及尚未运行的专项场景。历史 U01–U08 的原复现记录保留在 [修复前快照](../plans/confirmed-unfixed-2026-10-09.md)，2.3.18 的已交付修复见 [验收记录](../releases/v2.3.18-validation.md)。本页不是穷尽所有可能缺陷的承诺。

## 本轮实际复现、仍未修复

| ID | 问题 | 成品结果 | 当前处理 |
| --- | --- | --- | --- |
| K01 | Windows 2.3.18 自动化 Console 缺少运行依赖 `typescript` | 只读 `assets.search` 示例失败，`RUNTIME_PROCESS_EXITED`，子进程退出码 1 | 指南注明执行受阻；本轮没有修复运行代码或重新发行 |

2026-10-10 20:07:52（北京时间），运行本地已验收的 `out/Super-win32-x64/Super.exe`；身份检查为 `version=2.3.18`、`packaged=true`。使用独立 userData 和临时空库，没有接触用户真实库。只批准这一次只读脚本运行确认：

```ts
const page = await superApi.assets.search({ query: null, limit: 20 });
return { count: page.items.length, total: page.total };
```

实际 UI 显示 `The isolated script runtime exited unexpectedly (1).`；会话日志的 `automation.runtime.stderr` 明确为 `Error: Cannot find module 'typescript'`，require stack 指向 `.vite/build/script_runtime_utility.js`。该成品中仍存在 `require("typescript")`，但 `resources/app/node_modules/typescript/package.json` 不存在。此前 2.3.17 的同类失败在当前版仍成立。

![2.3.18 成品只读脚本失败实拍](../assets/ui/review-2.3.18/console-runtime-error.png)

图片来源与校验见 [拍摄记录](../assets/ui/review-2.3.18/README.md)。本地诊断结果保存在被 Git 忽略的 `tmp/docs-review-console-aYje6q/`，公开文档不包含用户真实路径或凭据。

建议后续修复：将运行时转译依赖正确打包或构建时消除该动态依赖；以最终安装目录的成品执行只读脚本、写操作确认、异常、取消和退出重启，再重新发行。现有开发测试及发布门禁通过，没有覆盖这个实际 Console 运行路径；不能用其通过结果关闭 K01。普通导入、浏览和查看器无需 Console。

## 待验收项

| 类型 | 范围 | 当前结论 |
| --- | --- | --- |
| 需要专项运行 | 全屏上一张/下一张、查看器删除、链接重复内容/新序列行为 | 不列为已确认缺陷，未在本轮完成同操作运行验证 |
| 外部服务验收缺口 | 真实多设备/多写者 WebDAV、NAS 离线重连、真实 AI 供应商、第三方插件及 MCP Agent | 本地/Mock 通过不能自动扩展为所有服务通过 |
| 平台/交付范围 | macOS 成品；浏览器商店/可直接安装扩展附件 | 当前 GitHub 2.3.18 发行附件为 Windows x64；扩展保留内部开发态 |
| 暂停范围 | F15 账号、官方插件目录与社区、ECS 迁移 | 用户指示暂停，不列为已实现 |

操作指南入口：[安装](../user-guide/installation.md) · [同步](../user-guide/sync.md) · [自动化](../user-guide/automation.md)。
