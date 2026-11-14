# 状态

## 头部信息表

| 项 | 值 |
|---|---|
| 更新时间 | 2026-11-14 20:07（Asia/Shanghai） |
| 更新来源 | 第 1 轮收尾：补齐 a11y / 对比度 / robots，重跑 Lighthouse 与冒烟 |
| 当前分支 | `master` |
| HEAD | 上一轮合并提交 `e13a543`；本轮修复提交在其之后 |

## 当前任务

AlgoViz 第一版已落地并复查完毕：三模块共用 `Transport` 帧时间轴，46 条用例全绿，构建通过，三页浏览器冒烟正常，Lighthouse Accessibility / Best Practices / SEO 均为 100。
剩余工作不在本仓内：推送远端并发布 GitHub Pages。

## 完成进度（已入库）

| 事项 | 证据 |
|---|---|
| 工程骨架（Vite 6 + TS 5.6 + vitest） | `pnpm build` exit 0；`dist/` 5 个文件 |
| 帧时间轴与模块契约 | `src/main/core/transport.ts`；三模块共用 |
| 表达式解析（Pratt + 闭包编译） | `src/test/parser.test.ts` 16 条通过 |
| 排序可视化（5 算法） | `src/test/sorting.test.ts` 14 条通过 |
| 寻路可视化（4 算法 + 迷宫） | `src/test/pathfinding.test.ts` 16 条通过 |
| 浏览器冒烟 + 可访问性 | 三页截图；Lighthouse a11y/BP/SEO 100（`docs/600001` 第 5 节） |
| 文档 15 篇（六位编号） | `docs/000000-全库总索引.md` |

## 未完成 / 遗留作业

| 事项 | 状态 | 依据 |
|---|---|---|
| 推到 GitHub 远端 | 未开始 | `git remote -v` 为空 |
| GitHub Pages 发布 | 未开始 | 依赖上一项 |
| 交互自动化测试（拖拽/滚轮） | 未开始 | `docs/600001` 覆盖缺口第 1 条 |
| 归并的辅助数组视图 | 未开始 | 同上第 3 条 |
| 表达式判定表未先于实现 | 已知偏差 | `memory/000001`「TDD 偏差」 |
| Chrome Issues 的 1 条 label 启发式提示 | 待确认 | axe 与 a11y 树均判无违规，见 `docs/600001` |

## 工作树状态

- 已修改未提交：本轮 a11y 修复（`app.ts`、`controls.ts`、`theme.ts`、`styles.css`、`functions/module.ts`、`public/`）与文档数字同步。
- 未跟踪：无（`node_modules/`、`dist/`、`temp/` 已忽略）。
- 并行会话：无。

## 调研与规划进度

| 方向 | 状态 |
|---|---|
| 技术栈（Vite + TS + Canvas，零框架） | 已定，见 `docs/300001` 决策表 |
| 时间抽象（归一化进度） | 已定，可推翻条件已写明 |
| 可访问性基线 | 已定：axe 0 违规、对比度 ≥ 4.5:1 |
| 部署方式（静态 Pages） | 已定方案，未执行 |

## 下一步建议

1. `git remote add origin git@github.com:GithubRise/algoviz.git` 后推送 `master` 与标签 `v0.1.0`。
2. 按 `docs/700001` 建 `gh-pages` 并启用 Pages，复核三个标签页。
3. 若要加第 6 种排序算法：先补判定表用例，再实现，再渲染角色码。
4. 若要支持 3 条以上曲线：改 `functions/module.ts` 的 `initial` 与侧栏列表，不动 `PlotView`。
