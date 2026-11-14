# AlgoViz

> 函数与算法的可视化实验室：把「连续曲线的描迹」和「离散算法的轨迹」放进同一条时间轴。

## 这是什么

一个纯前端、零后端、零框架的可视化工具，三个模块共用同一套「帧 / 时间轴」播放器：

| 模块 | 看什么 | 能操作什么 |
|---|---|---|
| 函数 | y=f(x)、隐函数 F(x,y)=0、极坐标 r(θ)、分段，切线、定积分阴影 | 输入或**粘贴**公式、拖曲线改 a/b、缩放平移、动参 t |
| 排序 | 冒泡/插入/选择/归并/快速的分步状态 | 切算法、调规模、单步回退 |
| 寻路 | BFS/DFS/Dijkstra/A* 的扩展过程与最终路径 | 画墙、拖起终点、生成迷宫 |

## 快速开始

```bash
pnpm install
pnpm dev        # 开发服务器
pnpm build      # 类型检查 + 生产构建（dist/）
pnpm preview    # 预览构建产物
pnpm test       # 68 条判定表用例
pnpm spike      # 探路脚本：解析器 + 帧规模实测
```

依赖安装走本机 Nexus（`127.0.0.1:8081`）；Nexus 未启动时用淘宝镜像：

```bash
pnpm install --registry=https://registry.npmmirror.com
```

## 目录地图

```
algoviz/
├── index.html            # Vite 入口
├── src/main/             # 正式实现
│   ├── core/             # Transport / Surface / DOM / 主题
│   ├── math/             # 词法、Pratt 解析、闭包编译
│   ├── modules/          # functions / sorting / pathfinding
│   └── ui/               # 侧栏控件、播放器
├── src/test/             # 判定表 + vitest 用例
├── src/demo/             # spike 探路脚本（可丢弃）
├── docs/                 # 六位编号文档，入口 000000
└── memory/               # 工作记忆（STATE + 编号条目）
```

## 技术约束

- Vite 6 + TypeScript 5.6 + Canvas 2D，**运行时零依赖**；产物约 57 KB（gzip 21 KB）。
- 不引入 UI 框架：三个模块的 DOM 差异不足以抵消框架的抽象成本。
- 表达式用自写 Pratt 解析器编译成闭包，不使用 `eval` / `new Function`。

## 文档

- 总索引：`docs/000000-全库总索引.md`
- 做了什么、为什么：`docs/100001-项目定位与成功判据.md`
- 架构与帧模型：`docs/300001-总体架构与帧时间轴.md`
- 测试与判定表：`docs/600001-测试策略与判定表.md`

文档规范遵循 `sources/GitHubRise/general-policies/`。
