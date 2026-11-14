# 测试（`src/test/`）

放判定表与 vitest 用例，两者同目录维护，不拆开。

| 文件 | 内容 |
|---|---|
| `判定表.md` | 104 条用例：输入、期望、反例（T-S / T-P / T-E / T-N / T-A / T-H / T-C） |
| `sorting.test.ts` | 排序断言，用例名引用判定表编号 |
| `pathfinding.test.ts` | 寻路断言，同上 |
| `parser.test.ts` | 表达式回归用例，同上 |
| `formula.test.ts` | 比较/分段与粘贴规范化（v0.2 新增） |
| `analysis.test.ts` | 零点/极值与分享编码（v0.3 新增） |

运行：`pnpm test`（vitest run）。口径与证据见 `../../docs/600001-测试策略与判定表.md`。

约定：新增行为先补判定表、再写用例；用例名必须带编号，失败信息才能直接对照表。
