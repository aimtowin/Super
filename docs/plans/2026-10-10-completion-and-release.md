# Remaining local upgrades and release implementation plan

> 使用本机可用的 Code、writing-plans、executing-plans；不调用不存在的 superpowers 子技能，不委派代理。

**Goal:** 补齐软件本体 F02–F14，保留既有功能与 MIT，完成真实验收后同步源码、文档和发行包。

**Architecture:** 保持 Renderer → Preload → Main → Worker；新增状态/纯函数独立模块，文件写回与同步变更由 Worker 控制。历史迁移、版本证据、增量基线不可删除。

**Tech Stack:** Electron 43、React、TypeScript、SQLite、sharp、FFmpeg、Vitest、Playwright。

## 本轮授权与边界

用户要求完成剩余本体内容、清理无引用/失效仓库文件、同步 GitHub 和发布。发布目标已确认是此前旧 ECS 更新源，并非新 ESA 项目。F15 账号/社区/官方目录与 ECS 迁移继续暂停。服务器目标、身份、路径和容量须再次只读核验。安装版、真实资料库、用户缓存不用于测试。

保留现有未提交阶段 1/首批阶段 2改动；不强推、不修改历史发布、不删除证据。不存在同机 Serpent 性能测试的项目不声称性能超越。

## 实施批次与验收

每项先检查已有等价能力，再补失败断言、实施和验证；不以注册入口代替真实处理。

| 项 | 主要位置 | 验收 |
| --- | --- | --- |
| F02 任意颜色 | shared/color-filter-presets、DimensionFilterBar、Worker 搜索 | 旧预设保留；任意 hex/相似度参数受限，SQL 包含/排除和无色卡 |
| F03 音频 | Worker 音频派生、AudioPlayerControls | 嵌入封面/损坏回退；波形偏好；源先播放与有界派生 |
| F04 多媒体 | gif player、video-player-controls、viewer transforms | GIF 有界解码/暂停；0.25–4倍速；逆转/缩放；不改源 |
| F05 文本 | text-encoding、TextViewerControls、Worker 文本保存 | 折行与提示；明确转码有原字节备份，冲突/截断禁止写 |
| F06 字体 | media-formats、预览路由、字体 viewer | TTF/OTF/WOFF/WOFF2/TTC真实路由，损坏隔离、卸载 |
| F07 目录检查 | FolderInspector、现有列表/搜索 API | 路径/数量/子目录/字节/封面、空/离线、安全异步 |
| F08 侧栏 | NavigationSidebar、纯过滤排序模块 | 名称过滤保留祖先/展开状态，排序偏好不重写库排序 |
| F09 工作区 | App 状态所有权、工作区组件/快照 | 独立导航/过滤/预览/滚动，有限标签、无后台重复重任务 |
| F10 AI/搜索 | shared search、Worker 元信息、Inspector、search-history | AI生成≠AI分析；内嵌信息/逗号标签/有界搜索历史 |
| F11 目录操作 | 忽略 dialog、目录 API、侧栏操作 | 规则预览、批量目录部分失败、实际目录定位与展开 |
| F12 同步 | versioned metadata、sync port/plan/runner、同步设置 | 人工优先、AI来源保留、metadata独立版本、冲突/取消/防抖 |
| F13 图像写回 | Worker、协议、预览操作 | 默认显示；明确确认、原字节备份、原子替换、撤销/冲突 |
| F14 大内容 | Worker client/local RPC、流式内容端口 | 分块有界、背压/取消、慢盘与大内容回归 |

## 验证与发布

1. 执行相关 unit/Worker、原生全量回归、独立审计、typecheck、ESLint、文档审查。
2. 用隔离库/profile 的真实 Electron 验证新增入口并截图；成品运行脚本/更新必须验证，不操作真实用户库。
3. 清理先出候选与引用证据，备份可恢复；保留源/测试/许可证/历史/基线，不能仅凭搜索无结果删动态加载资源。
4. 核对 GitHub 远端 main 与最新 release；按既有 provenance/媒体/gate 流程生成新版本与 SHA256、完整包及增量。
5. 分组审查提交，无强推；发布 Release，ECS staging 哈希验证和原子提升，核验公网 latest 与下载。保留回滚链。
6. 写真实结果和限制，未通过不得标绿、不得发布带已知破坏性失败的版本。

进度和测试证据追加到独立本轮结果文档；历史结果保持原样。
