# P1 最终报告

## 功能概览

P1 在 P0 可信计时、七天滚动计划、正式复盘与专业课结果基线上，增加了英语和政治实际结果、专业课输出训练、Anki 候选、三种执行模式、正式欠账队列、周统计以及 schema 2 今日快照。

- 英语主任务包含单词、阅读两个必做子任务，主任务状态只由两个正式结果推导。
- 政治记录题量、正确数、猜对数与 K/M/L/W/C/G 错因；候选复盘必须人工转换后才进入 `reviewQueue`。
- 专业课输出按一级提纲、详细提纲、核心段、完整论述、模拟分别记录；重写使用 `reviewType=output-rewrite`。
- Anki 只生成候选，人工批准后导出 TSV、CSV 或 JSON，不连接外部服务。
- 正常日、压缩日、保底日只调整今天至未来六天的详细任务，保留原计划且需要确认。
- 欠账按原任务稳定引用去重，超过三天提供安排、完成、拆小、降级、取消操作。
- 周统计按本地周一至周日实时派生，不长期存储聚合结果。

## 数据结构

| 存储键 | 内容 | 唯一性/关联 |
| --- | --- | --- |
| `studyEnglishWordRecords` | 英语单词实际结果 | `date + taskId + words` |
| `studyEnglishReadingRecords` | 英语阅读实际结果 | `date + taskId + reading` |
| `studyPoliticsRecords` | 政治学习、题量、正确率和错因 | `date + taskId` |
| `studyOutputRecords` | 722/844 输出训练 | 日期、任务、科目与题目稳定哈希 |
| `studyAnkiCandidates` | 待审核/已批准/已导出的候选卡 | `subject + normalizedFront` |
| `studyExecutionModes` | 每日执行模式 | 本地日期 |
| `studyDebtQueue` | 正式欠账 | 同一 `sourceTaskId` 只保留一个当前欠账 |

正式复盘继续使用 `reviewQueue`。业务复盘通过 `reviewType` 区分 `spaced`、`short-retest`、`output-rewrite`、`option-trap` 和 `politics-knowledge`。所有业务记录优先使用 `recordId`、`taskId`、`sourceTaskKey`、`knowledgeUnitId`、`sourceRecordId` 或 `businessKey`，标题只用于展示。

实际学习时长始终等于可信专注累计加有效手动补录。英语、政治和输出记录里的分钟仅描述结果，不再计入学习总时长；训练也不进入有效学习时长。

## 版本迁移

| 应用版本 | Schema | 迁移 ID | 内容 |
| --- | --- | --- | --- |
| 8.0.0 | 8.0 | `p1-english-politics-results-v1` | 英语、政治正式结果 |
| 8.1.0 | 8.1 | `p1-output-review-types-v1` | 输出训练与业务复盘类型 |
| 8.2.0 | 8.2 | `p1-anki-candidates-v1` | Anki 候选 |
| 8.3.0 | 8.3 | `p1-execution-debt-v1` | 执行模式与欠账队列 |
| 8.4.0 | 8.4 | `p1-final-integration-v1` | 周统计、schema 2 快照、P1 计划元数据 |

迁移只初始化缺失容器、规范化兼容字段并保留 P0 数据。迁移状态使恢复备份后不会重复生成结果、复盘候选、Anki 候选或欠账。

## 测试结果

- Node 语法检查覆盖 `js/` 与 `tests/` 下全部 JavaScript。
- 自动测试共 108 项，全部通过。
- P0 专注计时 22 项及 P0 最终事实测试 30 项全部通过。
- 七天窗口、导入预览、迁移回滚、取消零写入和私人备份兼容继续通过。
- 私人夹具仅只读计算 SHA256；结果为 `CF174162DD64010F628E721919B6E9AE67F0CDFC35526978CB2E94E0A426010C`。
- 隔离 origin 浏览器已验证页面加载、折叠模块、英语结果保存与主任务推导、Anki 候选生成、周统计展示。390px 窄屏无横向溢出，系统工具保持折叠，Console 无 error/warning。模式确认框出现，但自动接受后的状态读取受浏览器控制超时影响，保留人工验收。

## 已知限制

- 不连接 AnkiConnect；导出后需用户自行导入 Anki。
- 未找到仓库内被 `.gitignore` 排除的正式长期计划 JSON，自动测试使用合成长期计划；正式计划文件导入需要人工验收。
- 浏览器文件选择器、系统剪贴板、真实休眠和跨午夜行为不由本轮自动浏览器测试伪造。
- 周统计只展示真实已记录数据；`null` 显示为“未记录”，不会补零或从计划推断结果。

## 回滚方式

在回滚前先从页面导出完整备份，默认文件名为 `学习面板完整备份-YYYY-MM-DD.json`。

```powershell
git switch --detach p0-stable-7.3.0
git switch -c rollback/p0-stable
```

上述命令从稳定标签建立独立回滚分支，不改写 P1 历史。返回 P1 时执行 `git switch feature/p1-complete`。浏览器数据应通过页面“完整 JSON 恢复”处理，不使用 `localStorage.clear()`。
