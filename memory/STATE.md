# 状态

## 头部信息表

| 项 | 值 |
|---|---|
| 更新时间 | 2026-11-15 02:25（Asia/Shanghai） |
| 更新来源 | 建仓、推送、GitHub Pages 发布完成 |
| 当前分支 | `master`（`origin/master` 已同步） |
| HEAD | 本轮为发布记录提交，紧随 `88c2ccb` |

## 当前任务

项目已上线：<https://githubrise.github.io/algoviz/>。
仓库 <https://github.com/GitHubRise/algoviz>，`master` + tag `v0.8.0`，Pages 走 GitHub Actions 自动部署。
120 条用例全绿，线上页面已截图核对（控制台无 error）。

## 完成进度（已入库）

| 事项 | 证据 |
|---|---|
| v0.1–v0.8 能力 | `memory/000001`..`000009` |
| 建仓与推送 | `memory/0010`；`git remote -v` 指向 GitHubRise/algoviz |
| Pages 自动部署 | `.github/workflows/pages.yml`；run 43622690246 success |
| 线上校验 | HTTP 200 + 标题匹配 + 浏览器截图 |
| 文档同步 | `000000`、`700001`、`500002`、`500003`、`600001`、README |

## 未完成 / 遗留作业

| 事项 | 状态 | 依据 |
|---|---|---|
| 本机 SSH key 未注册 | 未开始 | 推送依赖 GCM token；见 `memory/0010` |
| GitHub Release | 未开始 | tag 已推，release 未发 |
| 对比表防抖 / Worker | 未做 | n=72 时约 80ms |
| 等高线深度测试 | 未做 | 背面线条会透出 |
| 复变域着色缓存 | 未做 | 拖动时整体重算 |
| 交互自动化测试 | 未开始 | `docs/600001` 覆盖缺口 |

## 工作树状态

- 已修改未提交：本次发布记录（README、000000、700001、memory）。
- 未跟踪：无（`node_modules/`、`dist/`、`temp/` 已忽略）。
- 并行会话：无。

## 调研与规划进度

| 方向 | 状态 |
|---|---|
| 发布方式 | 已定：Actions 构建 dist → deploy-pages，`base: './'` 适配子路径 |
| 凭据 | 已定：HTTPS + GCM；SSH 未注册暂不用 |
| 版本 | tag `v0.8.0` 已推 |

## 下一步建议

1. 把 `~/.ssh/id_ed25519.pub` 加进 GitHub，后续可免 token 推送。
2. 基于 `v0.8.0` 发一个 GitHub Release（写清 7 种函数模式、8 种排序、5 种寻路、对比表）。
3. 技术收尾：对比表防抖、等高线深度测试、域着色缓存。
4. 若要多人协作，考虑把 Pages 部署迁到 `develop` 预发 + `main` 生产。
