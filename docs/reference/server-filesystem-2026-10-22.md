# 服务器文件系统构成与 Super 资源汇报（2026-10-22）

采集时间：2026-10-22 13:34（CST）。采集方式：SSH 只读命令 + `du/df/docker system df`。不含密钥与登录信息。

## 1. 两台服务器总览

| 项目 | 新服务器 | 旧服务器 |
| --- | --- | --- |
| 公网 IP | 43.142.93.106 | 114.55.170.117 |
| 主机名 | VM-0-8-ubuntu | iZbp100dvvx6r7rg1rm9frZ |
| SSH 用户 | ubuntu（sudo 免密） | root |
| 系统盘 | /dev/vda2 ext4 40 GB | /dev/vda3 ext4 40 GB |
| 已用 / 可用 / 使用率 | 18 GB / 21 GB / **47%** | 31 GB / 7.4 GB / **81%** |
| inode 使用 | 10% | 32% |
| 内存 / Swap | 3.6 GiB（可用 2.7 GiB）/ 1.9 GiB | 1.8 GiB（可用 1.2 GiB）/ 1.0 GiB（已用 468 MiB） |
| 运行时长 / 负载 | 20h55m / 0.13 | 131 天 / 1.31 |
| Web 栈 | Apache 2.4.58（80/443）+ Docker 内 nginx 1.28 与 x-run | Apache（BT 面板，80/443）+ Docker 业务 |
| Docker 容器 | 5 个（xrun-frontend / xrun-app / xrun-egress / my-app） | 1 个 |
| Docker 镜像占用 | 9.02 GB（可回收 **4.99 GB**）+ 构建缓存 1.89 GB（可回收 1.66 GB） | 11.86 GB（可回收 **11.25 GB，94%**） |
| 特殊挂载 | `/worldtong` cosfs 256 TB（已用 0，当前未使用） | 无 |

## 2. 新服务器目录构成

| 路径 | 占用 | 说明 |
| --- | --- | --- |
| `/usr` | 3.5 GB | 系统与运行时 |
| `/www/wwwroot/myblog` | 903 MB | 博客站点 |
| `/www/wwwroot/resource` | 约 0.4 GB（清理后） | 资源站；含 plai-updates 与 super 历史目录 |
| `/var` | 1.1 GB | 其中 /var/www 381 MB、/var/log 38 MB |
| `/opt/x-run` | 736 MB | x-run 控制台（含 ingress 证书与 Apache 模板） |
| `/boot` + `/home` + 其他 | 约 164 MB | — |
| `/worldtong` | 0 | 对象存储挂载，可用于离线备份（需确认计费/权限） |

### Super 相关资源

| 路径 | 占用 | 内容 | 状态 |
| --- | --- | --- | --- |
| `/var/www/super-updates/` | **381 MB** | `latest.json` + `releases/2.4.0/`（安装器、完整包、两个 .sha256） | **在线更新源（IP 直连）** |
| `/www/wwwroot/resource/data/super-updates/` | 29 MB | 仅 `media/`（media-v0.1.2 历史运行时包） | 迁移遗留副本，旧版本目录已于本轮删除 |

## 3. 旧服务器目录构成

| 路径 | 占用 | 说明 |
| --- | --- | --- |
| `/var/lib` | 14 GB | Docker overlay2 与镜像 |
| `/usr` | 5.5 GB | 系统 |
| `/root` | 1.3 GB | 待核查的历史备份/脚本 |
| `/etc` | 928 MB | 面板与站点配置 |
| `/www/wwwroot` | 1.7 GB | myblog 903 MB、ge-mywike 426 MB、resource 351 MB |
| `/var/log` | 687 MB | 需轮转 |
| `/var/backups` | 128 MB | — |
| `super-updates/` | 29 MB | 仅剩 `media/`；releases 与 latest.json 已按指示删除 |

## 4. 保留策略（本轮已改）

| 项目 | 旧值 | 新值 | 落地位置 |
| --- | --- | --- | --- |
| 完整版本目录保留数 | 5（本次发布临时用 1） | **2** | `FULL_RELEASE_RETENTION` |
| 单版增量来源上限 | 20 | 20（不变） | `DELTA_SOURCE_RETENTION` |
| 全服务器增量包文件上限 | 无 | **20，超出按发布时间删除最旧** | `DELTA_PACKAGE_RETENTION` + 发布脚本清理命令 |
| 增量体积门槛 | ≤ 完整包 60% | 不变 | `MAX_DELTA_TO_FULL_RATIO` |

容量估算：完整版本约 470 MB/版 × 2 = 940 MB；增量包约 4–5 MB/个 × 20 ≈ 100 MB；合计约 1 GB，新服务器剩余 21 GB 充裕。

## 5. 可回收空间建议

| 服务器 | 方式 | 预计释放 |
| --- | --- | --- |
| 旧服务器 | `docker image prune -a`（11.25 GB 可回收）+ 日志轮转 | **约 11–12 GB**，使用率 81% → 约 55% |
| 新服务器 | 清理悬空镜像与构建缓存（5.0 GB + 1.66 GB） | 约 6.7 GB |
| 新服务器 | 删除 `/www/wwwroot/resource/data/super-updates/media`（如确认旧运行时包不再使用） | 29 MB |

## 6. 备注

- 新服务器 443 端口由 Apache 的 IP 证书 vhost 提供服务，`/downloads/super/` 已绕过反向代理直出静态文件；配置位于 `/opt/x-run/shared/ingress/apache-ip-ssl.conf`（x-run 托管，重生成可能覆盖）。
- 旧服务器 80/443 与面板（888/8001）仍在运行；Super 更新清单已不可访问（404）。
- 以上为一次快照，容量会随发布与日志变化。
