# Super Lib v2.3.16 架构产物包

日期2026-10-07。本次只读审查与文档/图形产出，没有业务实现、版本变更、提交/发布或ECS操作。

建议顺序：

1. 打开 [离线总览](index.html) 或 [SVG结构图](architecture-overview.svg)；[PNG](architecture-overview.png)方便分享。
2. 阅读 [完整架构审查](architecture-review.md)：运行时/目录/数据所有权、16项发现、已完成优化、未验证边界与NFR。
3. 阅读 [ADR提案](adr-proposals.md)：方案选择/代价/替代方案；全部Proposed。
4. 阅读 [可执行优化计划](../../plans/2026-10-07-architecture-optimization.md)。先在计划模式确认阶段A；阶段B/C条件实施。
5. 复制 [Codex计划模式入口](codex-plan-prompt.md) 的提示词到计划模式；不要把文档当已授权实施或发布。
6. [验证记录](verification.md)、[机器可读验证摘要](verification-summary.json)、[完整inventory](inventory.json)提供复核依据。

## 图与源码清单

- [runtime.mmd](diagrams/runtime.mmd)：进程、组件、通信、信任边界。
- [import-sequence.mmd](diagrams/import-sequence.mmd)：prepare/resolve/stage/lease/commit/cleanup。
- [browse-refresh.mmd](diagrams/browse-refresh.mmd)：query、layout、viewport、selection、viewer、poll与后台事件。
- [domain-storage.mmd](diagrams/domain-storage.mmd)：资产/修订/组织/任务/同步/派生物和文件所有权。
- [release-gates.mmd](diagrams/release-gates.mmd)：default pipeline、v2.3.16手动补验和待补门禁。
- [static-dependencies.mmd](diagrams/static-dependencies.mmd)：AST生成的层间静态声明数；**不是运行时IPC图**。
- [inventory.json](inventory.json)：全部选定源/测试/扩展/脚本文件的path/bytes/physical lines/SHA-256及2,067依赖声明边。

Mermaid源图可在支持Mermaid的编辑器渲染，本轮仅人工核对，未使用Mermaid引擎解析；离线总览不依赖CDN，不自动连接外部服务。SVG/PNG总图已实际渲染、检查，可直接查看。

## 复现源码清点

在仓库根目录：

```powershell
node docs/architecture/2026-10-07-review/tools/build-inventory.mjs
```

只读源码/现有构建文件；写本目录的inventory与static-dependencies源图。不修改业务、安装依赖、构建软件或调用网络。不在未知新HEAD下把再生成清点当2026-10-07原始证据；请保留旧snapshot再生成新日期目录。

## 口径

TS依赖图只统计relative import/export/literal dynamic import，排除package/require、IPC、SQL与插件运行期注入。value/mixed import未必都保留在emit中；物理行数含空行/注释。局部基准不是真实UI/NAS/显卡表现。新增缺口未实施修复；现有相关测试通过不能替代未来red→green复现。
