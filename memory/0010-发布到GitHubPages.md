# 发布到 GitHub Pages

## 头部信息表

| 项 | 值 |
|---|---|
| 记录时间 | 2026-11-15 02:20（Asia/Shanghai） |
| 素材来源 | 用户问「你自己能完成吗」，确认后由本会话独立完成建仓、推送与发布 |
| 前置条目 | `memory/000009-算法横向对比表.md` |

## 事实与数字

| 项 | 值 |
|---|---|
| 仓库 | <https://github.com/GitHubRise/algoviz>（公开，`master`） |
| 站点 | <https://githubrise.github.io/algoviz/> |
| 首次 workflow | run 43622690246，`completed / success` |
| 站点校验 | HTTP 200，标题 `AlgoViz · 函数与算法的可视化实验室` |
| 推送内容 | `master` @ `88c2ccb`、tag `v0.8.0` |

## 凭据与权限（重要）

| 项 | 状态 |
|---|---|
| 网络 | 经本机代理，`api.github.com` 与 `github.com` 均可达 |
| 身份 | Git Credential Manager 里存有 `GitHubRise` 的 token（`git credential fill` 可取到） |
| token 权限 | `gist, repo, workflow` |
| SSH | 本机 `~/.ssh/id_ed25519` 存在，但**未注册到该账号**（`Permission denied (publickey)`） |
| gh CLI | 未安装 |

因此推送走 HTTPS + GCM 凭据；SSH 那条路当时不通。

## 操作序列（可复现）

1. 写 `.github/workflows/pages.yml`（pnpm install → test → build → upload-pages-artifact → deploy-pages）。
2. `POST /user/repos` 创建公开仓库 `GithubRise/algoviz`。
3. `git remote add origin` + `git push -u origin master`、`git push origin v0.8.0`。
4. `POST /repos/{owner}/{repo}/pages` 传 `{ "build_type": "workflow" }` 启用 Pages。
5. 轮询 `GET /repos/{owner}/{repo}/actions/runs` 直到 `completed/success`（三次轮询，约 20 秒）。
6. `GET https://githubrise.github.io/algoviz/` 校验 200 与标题。

## 踩坑

| 坑 | 现象 | 处理 |
|---|---|---|
| 关闭 credential helper 后探测失败 | `could not read Username ... terminal prompts disabled` | 探测「仓库是否存在」时不要加 `-c credential.helper=`，否则会把 GCM 一并关掉，看不到 404 |
| 推送输出走 stderr | PowerShell 把 `git push` 的进度当错误，`$LASTEXITCODE` 为 1 | 用 `git status -sb`（出现 `## master...origin/master`）与 GitHub API 复核，不看退出码 |
| 首次 `ls-remote` 报 SSL_ERROR_SYSCALL | 网络抖动 | 改用 `api.github.com` 复核分支与 tag，未重试推送 |

## 追加：纯文档改动不再触发部署

`.github/workflows/pages.yml` 加了 `paths-ignore: ['**.md', 'docs/**', 'memory/**']`。
验证（2026-11-15）：

| 提交 | 改动内容 | 是否产生 run |
|---|---|---|
| `797ea90` | 只改 `.github/workflows/pages.yml` | 是，`completed/success` |
| 紧随其后的文档提交 | 只改 `docs/`、`memory/` | **否**（runs 列表最新仍是 797ea90） |

注意：`.github/` 不在忽略列表里，否则改了工作流自己反而得不到验证。

## 遗留待办

- 本机 SSH key 未注册，若想以后免 token 推送，需要把 `id_ed25519.pub` 加到 GitHub。
- 未建 GitHub Release（tag 已推，release 未发）。
- 没有 CI 缓存预热，首次 workflow 的 pnpm install 约 20 秒。

## 相关提交

`88c2ccb chore(ci): 新增 GitHub Pages 自动构建与部署工作流`，以及随后记录本次发布的 docs 提交。
