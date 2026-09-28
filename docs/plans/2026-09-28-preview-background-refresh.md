# 后台刷新导致预览退出：修复记录

状态：修复已纳入 v2.3.12 构建，四项专项回归在成品中通过；发布详情见 [v2.3.12 验证记录](../releases/v2.3.12-validation.md)。

## 根因与修复

- 磁盘 `asset.changed`、AI `ai.analysis.completed` 等事件调用 `reloadCurrentContent`。侧栏水合会替换 `smartCollections` 数组；搜索防抖 effect 依赖整个数组，误认为搜索条件变化，调用 `runSearch` 并关闭预览。改为依赖当前智能合集是否拥有已配置查询这一布尔值，并使用稳定的资源库 ID。
- 智能合集的后台刷新直接调用 `chooseSmartCollection`，触发关闭预览、重置选择、清空筛选和滚动位置等导航操作。提取仅刷新结果的 `refreshSmartCollectionResults`，由后台刷新和显式导航分别调用。
- 草稿智能合集使用当前未保存筛选刷新；没有条件的草稿保持空结果。
- 通知和数据刷新继续工作，显式导航与手动关闭行为保留。

## 验证

- 修复前：真实 Electron 中，搜索结果页和智能合集的全屏图片在收到模拟磁盘变更 IPC 后均卸载，两个回归用例均失败。
- 修复后：`tests/e2e/preview-background-refresh.test.ts` 覆盖全部资产、搜索结果、已配置智能合集、草稿智能合集；通过真实 IPC 发送磁盘变更、AI 完成、AI 内容清除、文本保存通知，验证原查看器 DOM 节点持续挂载且保持浏览器全屏；退出全屏后的普通预览也持续保留，手动关闭及资产选择正常。
- 补充检查空草稿、筛选文本保留、合集选中状态，以及用户修改/清空搜索词。
- `npm run typecheck`、`npm run lint` 通过；最终源码修改后再次类型检查与针对修改文件的 ESLint 通过。
- 额外运行旧 `organization-search-trash.test.ts` 的首个用例时，被首次快速引导遮挡“导入文件”按钮而超时，未进入搜索验证；不能将此旧用例计为通过。该文件未修改。

复验命令：`node scripts/run-e2e.mjs tests/e2e/preview-background-refresh.test.ts`。
