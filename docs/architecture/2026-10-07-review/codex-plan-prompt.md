# 可直接复制到 Codex 计划模式

这是一份用户启动计划模式的输入，不是自动执行命令或发布授权。

```text
请在计划模式审阅并细化 Super Lib 的架构可靠性优化计划。

仓库：C:/Users/Administrator/Desktop/Super-main。
先读 AGENTS.md 及 docs/plans/2026-09-22-development-pause-and-ecs-handoff.md。
再完整读取：
- docs/architecture/2026-10-07-review/architecture-review.md
- docs/architecture/2026-10-07-review/adr-proposals.md
- docs/architecture/2026-10-07-review/verification.md
- docs/plans/2026-10-07-architecture-optimization.md
需要模块/依赖证据时读 inventory.json 和 diagrams/*.mmd。

审查基线是 v2.3.16 / HEAD 67298c1，先确认当前版本、HEAD、dirty worktree。
若代码已前进，重新核对每项问题仍存在及行号；不要重复已经完成的优化。

我的优先级是：不破坏当前良好体验、不丢资产/人工元数据、不改变搜索筛选、
导入冲突/恢复、多选/分页/预览、插件权限、更新自动打开等已有功能。
推荐先计划阶段A（回归/发布清单，以及请求、清理、事件、下载、更新cache ownership）。
阶段B性能优化必须先有同机基准和差分；阶段C仅渐进模块提取，不做全面重写。
保留现进程拓扑、LibraryService façade、typed IPC、schema49和durability。

输出一份决定明确的分阶段计划：
1. 每步确切文件、触发/复现、red→green用例与命令、依赖、验收及回滚。
2. 区分已确认代码缺口、最小逻辑模型、需要真实性能验证的候选。
3. 合并重复方案，避免并发编辑同一大文件；测试/基准/build不要互相污染。
4. 明确用户需要确认的少量事项，不能把missing capability或SKIP算PASS。
5. 默认止于阶段A的可审改动和证据；B/C需再核对收益/范围。

当前只做计划；用户确认实施前不改业务代码。
所有测试都用临时库/隔离userData，不触碰真实安装或用户图库。
保留已有dirty文档，不自动提交、推送、升版本、打包发布。
ECS迁移、自动更新源部署、MUTAI/账号/插件目录服务均不包含；需要另行当次授权。
```
