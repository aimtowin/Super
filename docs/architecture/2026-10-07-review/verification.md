# 本轮验证记录

日期2026-10-07；版本2.3.16；HEAD `67298c17d792070b09adc05d5a3af3cac722ff4f`。没有业务代码改动、版本提升、真实安装或服务器操作。

## 本轮实际执行

### 1. 合并专项回归

```powershell
node scripts/run-vitest-with-electron.mjs run tests/unit/app-logger.test.ts tests/unit/worker-client.test.ts tests/unit/serial-poll.test.ts tests/unit/coalesced-refresh.test.ts tests/unit/asset-change-cache.test.ts tests/unit/active-discovery-filters.test.ts tests/unit/update-native-ui.test.ts tests/unit/browse-pagination.test.ts tests/unit/viewport-window.test.ts tests/unit/inspector-multi-edit.test.ts tests/unit/viewer-preview-policy.test.ts tests/unit/dimension-filter-selection.test.ts tests/worker/pending-import-lifecycle.test.ts tests/worker/import-confirmation.test.ts tests/worker/import-source-stability.test.ts tests/worker/library-watcher.test.ts --reporter=json --outputFile=tmp/architecture-review-v2.3.16-tests.json
```

结果：**16文件，162通过，0失败，0跳过**。测试各自使用mock或fresh临时库，没有操作用户图库。原始JSON在忽略的tmp目录，持久摘要为 [verification-summary.json](verification-summary.json)。前面主审/子审的46/73/48计数与最终162有重叠，不能累加。

这些是**旧契约回归**，并未补齐报告中新发现的逆序hook、资源超限、定时器错误、双库事件和延迟cache篡改条件；不能宣称16项发现已修复。

### 2. 静态清点

`node docs/architecture/2026-10-07-review/tools/build-inventory.mjs` 成功。654 TS/TSX模块、2,067本地依赖声明；未解析relative TS引用0。逐文件SHA-256来自读取源字节；运行时IPC/SQL并不包含在import图内。

### 3. 发布collector只读复核

直接调用 `scripts/release/lib.mjs` 的 `collectMakeArtifacts()`（未运行checksum写文件或upload）：本地out/make返回265个二进制，其中235个delta；17份2.3.x full ZIP混在目录内。证明通用collector确实不按targetVersion选择。

v2.3.16先前发布使用专用helper选择22二进制/46附件，远端hash验证事实见已有v2.3.16-validation；本次不连接GitHub重新查询，不以collector发现否定已完成的本版验收。

### 4. 新竞争的模型与纯函数微基准

- readonly mutable-ref序列模型：A旧offset100请求→reset为B新Set→B占位→A finally删除current Set，实际新Set为空，解释R03。不是完整React hook/E2E复现；实施计划A4要求真实hook deterministic red。
- 现columnWindow尾端定位微基准（100次）10k/50k/100k均值约0.074/0.513/1.008ms；仅函数规模增长证据，不是UI FPS/用户卡顿，也不是B3已优化的结果。

## 产物检查

离线总览与SVG/PNG已通过headless Microsoft Edge渲染检查，并人工检查截图无截断/遮挡。两份产物脚本语法及ESLint通过；1,317份清点文件的SHA-256保持一致；42个本地文档/HTML链接存在；相对`v2.3.16`的生产路径diff为空。加载总览时0外部HTTP请求，SVG正常解析，宽1560/高1110，无横向溢出。细节见最终摘要。

Mermaid源图已人工核对节点/连接与代码调用关系，但**没有运行Mermaid引擎渲染或语法解析**；可直接查看的成图是SVG/PNG总览，不把源图当已渲染的6份成图。产物检查没有启动软件、安装更新或运行外部服务。

复验命令（已在当前审查SHA执行；需要原始tmp测试JSON和本地Microsoft Edge）：

```powershell
npx eslint docs/architecture/2026-10-07-review/tools/build-inventory.mjs docs/architecture/2026-10-07-review/tools/verify-artifacts.mjs
node docs/architecture/2026-10-07-review/tools/verify-artifacts.mjs
```

## 未执行 / 限制

本轮没有full unit/Worker suite、全量E2E、新production软件build/package、真实Inno更新、GPU/large-image/长PDF soak、真实NAS/multi-host、依赖CVE或完整安全渗透。旧v2.3.15扩展套件lavfi fixture失败与旧v2.3.0历史问题不可当本轮结果；新范围执行时必须重新分类。

当前审查与计划只说明“哪些需要优先验证与改进”，不承诺一遍静态审查发现所有漏洞或排除所有数据安全风险。
