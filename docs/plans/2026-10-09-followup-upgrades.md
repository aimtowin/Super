# SuperLib Follow-up Fixes and Upgrades Implementation Plan

> 使用本机可用的 Code 流程执行；按阶段设置回归检查点，不启用不存在的 superpowers 子技能或未经授权的子代理。

**Goal:** 修复审计确认的问题，并分阶段评估、补齐全部可借鉴能力，保留 SuperLib 原功能与 MIT。

**Architecture:** Worker 数据安全与派生管线、纯同步规划/执行端口、共享协议、Renderer 交互分层；既有数据库迁移只追加，不重写历史。

**Tech Stack:** Electron / React / TypeScript / better-sqlite3 / Vitest。

---

## 阶段 1：确定性缺陷（源码修复与专项自动化完成，未发布）

结果与限制见[阶段 1 验收](../reference/followup-phase1-results-2026-10-09.md)。42 个测试文件：692 PASS、0 FAIL、2 平台条件跳过。此检查点不代表真实服务/UI/全量回归完成；后续阶段仍未实施。

| 任务 | 改动位置 | 验收 |
| --- | --- | --- |
| U01 默认链接解除引用 | library-service、sidebar-commands、通知文案 | 根/子目录/刷新/未索引文件不碰源；明确硬盘删除仍可用 |
| U02 删除事实与缺失隔离 | 新增 sync 删除意图迁移、snapshot、port、plan、engine | 缺失/离线/对账丢索引不发 DELETE；显式回收/彻底删除传播，恢复撤销；迁移与重开 |
| U05 路径同步 | plan、runner、port、LibraryService | 双向改路径、内容+路径、占用、MOVE 降级、稳定 ID、嵌套路径 |
| U03 中性色边界 | color-filter-presets | 实际 SQLite 红/灰/黑/白及包含/排除 |
| U04 尺寸校验 | raw-image-metadata、持久化、summary/layout | 正整数整对回退；小数/零/单边异常与正常尺寸 |
| U06 安全文本解码 | text-encoding、read/saveTextAsset、协议、文本 UI | UTF-8/BOM/GBK/GB18030/UTF-16、二进制、截断、不静默转码 |
| U07 图像原色显示 | AssetPreviewModal、PBR 默认显示策略 | 普通名字原色，显式材质工具不受影响 |
| U08 显式序列化 | refreshManagedAssets、restoreAssets | 对账/恢复保持独立图片，原导入/手工序列仍正常 |

每项先保留/补充失败断言，再实施，执行相关 Worker/unit 回归；阶段末运行独立审计、typecheck、修改文件 ESLint、迁移纪律和文档检查。

```powershell
node scripts/run-vitest-with-electron.mjs run --config vitest.serpent-audit.config.ts
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/sync-plan.test.ts tests/worker/sync-runner.test.ts tests/worker/sync-engine.test.ts tests/worker/sync-library-integration.test.ts tests/worker/schema-compatibility.test.ts tests/worker/migration-discipline.test.ts
npm run typecheck
```

## 后续阶段：全部借鉴方向（未实施，不计为已完成）

每项实施前先与现有功能逐入口对照；已经具有等价能力时补验收，不重复造入口。以下均为计划，不是发布承诺。

| 阶段 / ID | 能力与对应产物 | 验收门槛 |
| --- | --- | --- |
| 2 / F01 | JFIF / AVIF / FLV 注册、缩略图与原生/代理回退 | 扩展名、真实解码、导入/筛选/预览/外部打开一致；不能只注册即宣称可解码 |
| 2 / F02 | 任意取色、相似度、包含/排除；保留已存预设条件 | 协议与智能合集向后兼容、真实色卡 SQL、键盘/主题/无色卡行为 |
| 2 / F03 | 音频嵌入封面与波形偏好、hover scrub、播放体验 | 有/无封面、损坏封面、派生预算、用户偏好、不重复解码 |
| 2 / F04 | GIF 播放控制、0.25–4 倍速、逆向旋转、4K 缩放策略 | GIF 原帧/播放、视频代理、快捷键、原图不被改写、内存峰值 |
| 2 / F05 | 文本自动折行、编码提示与后续明确编码保存 | 截断只读、原编码备份、版本冲突、安全保存和大文本输入性能 |
| 3 / F06 | 字体资产 TTF/OTF/WOFF/WOFF2/TTC、分类/Inspector/预览 | 不执行源程序，损坏字体隔离，字体卸载、预览样例、真实格式验收 |
| 3 / F07 | 文件夹 Inspector 封面/数量/路径/子目录/字节 | 托管/链接/忽略/空目录/离线；统计异步且不堵 UI |
| 3 / F08 | 图标图形/颜色、合集排序/根级拖放、侧栏名称过滤 | 保留 Emoji、数据持久化、可访问名称、拖放与折叠状态 |
| 3 / F09 | 独立工作区标签及各自历史/预览/筛选/滚动位置 | 明确隔离状态所有权；切标签不关闭/串用预览，大库缓存有界 |
| 3 / F10 | AI 生成内容筛选、内嵌信息、搜索历史、逗号多标签 | “AI 生成”与“AI 已分析”分离；保留人工/AI 标签来源，不误覆盖 |
| 3 / F11 | 忽略规则预览、批量文件夹、跳到所在目录/展开操作 | 当前等价入口先验证；空目录立即显隐、批量部分失败、搜索一致 |
| 4 / F12 | 同步 AI 标签/描述、变更防抖自动上传、状态图标 | 版本化元数据协议、人工字段优先、跨设备冲突、断网/取消/循环防护 |
| 4 / F13 | 图片旋转/翻转明确写回 | 默认只改变显示；明确确认、事务暂存/备份、EXIF/颜色空间、撤销 |
| 4 / F14 | 大内容分块与本地 RPC 队列预算 | 不直接取消资源上限；慢盘/大库压力、取消后不继续写、内存上界 |
| 暂停 / F15 | 官方插件目录、转换器与批量改名一方插件 | 仅规划本地 Host/权限/安装验收；社区/ECS/账号服务需单独恢复授权 |

## 独立待验收轨道

审计 R01—R08：慢盘队列、忽略规则、长期写租约、NAS 资源峰值、原生模态焦点、ZIP/第三方插件、多媒体实机、macOS/恢复。未复现不能包装成“全部修复”；出现确定性失败后另列修复 ID。

## 发布门槛

版本/打包/Git 推送/ECS 均需对应发布指令。历史审计记录保持原样，另写阶段结果与未完成项；发布前对新增迁移做备份与兼容提示，不允许旧版本回退写入新 schema。
