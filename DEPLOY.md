# 上线实操手册（本地后台 + Cloudflare Pages 免费部署）

这套方案的核心：**后台只在你自己电脑上跑**，写完文章一键"发布"，静态站被推到
GitHub，**Cloudflare Pages 自动部署**。全程免费，国内外都能访问。

```
你的电脑                                 云端（免费）
┌─────────────────────────┐            ┌────────────────────────┐
│ ./blogbin serve → /admin │            │ GitHub 仓库             │
│   写文章 / 改数据         │  publish   │   （含渲染好的 dist/）   │
│   存进本地 blog.db  ──────┼──────────► │        │                │
│ ./scripts/publish.sh     │  git push  │        ▼                │
│   渲染成 dist/ 并推送     │            │ Cloudflare Pages 自动部署│
└─────────────────────────┘            └───────────┬────────────┘
                                                    ▼
                                        访客访问 https://你的域名
```

> 关键点：`blog.db`（含你的后台密码）**永远只在本地**，不会上传。云端只有渲染好的
> 静态文件。所以后台绝对安全，也不需要一台一直开机的服务器。

---

## 一次性准备

| 项目 | 说明 | 花费 |
|------|------|------|
| GitHub 账号 | 你已有。存代码 + 触发部署 | 免费 |
| Cloudflare 账号 | 免费版即可，负责部署 + 全球 CDN | 免费 |
| 域名 | **可选**。不填就用 Cloudflare 送的 `xxx.pages.dev` 域名 | 0 或约 1–10 美元/年 |
| 本机 Go | 已装（用于渲染静态站） | 免费 |

> 用 Cloudflare 送的 `*.pages.dev` 域名也能在国内访问；想要更正式/更稳可自备域名。

---

## 第 1 步：把代码推到 GitHub（一次性）

在 GitHub 上新建一个仓库（可以是 private，Cloudflare 也能连），然后在本地：

```bash
$ cd /Users/bytedance/PycharmProjects/s_blog
$ git remote add origin git@github.com:<你的用户名>/<仓库名>.git
$ git push -u origin master
```

---

## 第 2 步：本地写第一篇文章

启动本地后台（第一次用 `ADMIN_PASSWORD` 设定登录密码）：

```bash
$ go build -o blogbin .
$ ADMIN_PASSWORD='设一个你自己的密码' ./blogbin serve
# 打开 http://localhost:8080/admin/login ，用户名 admin + 上面的密码
```

在后台把个人资料、经历、项目、足迹、文章都填好。这些都存进本地 `blog.db`。
之后再次启动只需 `./blogbin serve`（密码已存库，不用再带 `ADMIN_PASSWORD`）。

---

## 第 3 步：一键发布

改完内容后，跑发布脚本 —— 它会渲染静态站并推送：

```bash
$ ./scripts/publish.sh
# 或带条说明： ./scripts/publish.sh "post: 我的第一篇文章"
```

它做了三件事：把当前数据渲染成 `dist/` → `git commit` → `git push`。
推送后 Cloudflare 会自动部署（见第 4 步的连接是一次性的）。

---

## 第 4 步：在 Cloudflare Pages 连接仓库（一次性）

1. 登录 Cloudflare → 左侧 **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**，授权并选中你刚推送的仓库。
2. 构建设置这样填（关键）：
   - **Framework preset（框架预设）**：`None`
   - **Build command（构建命令）**：**留空**
   - **Build output directory（输出目录）**：`dist`
   > 因为静态站是本地渲染好并提交进 `dist/` 的，Cloudflare 不需要自己构建。
3. 点 **Save and Deploy**。首次部署完成后，你会得到一个
   `https://<项目名>.pages.dev` 的网址，打开就能看到网站。

以后每次 `./scripts/publish.sh` 推送，Cloudflare 都会自动重新部署，约 1 分钟上线。

---

## 第 5 步（可选）：绑定自己的域名

1. 域名注册商处把 DNS 托管给 Cloudflare（添加站点时会给你两个 NS 地址）。
2. Cloudflare Pages 项目 → **Custom domains** → **Set up a custom domain** →
   输入你的域名，按提示添加记录即可。证书 Cloudflare 自动签发。

---

## 日常使用（记住这一条就够）

```
本地 ./blogbin serve  →  在 /admin 写文章/改数据  →  ./scripts/publish.sh
```

发布后等约 1 分钟，线上就更新了。**本地预览是即时的**，线上是"发布后 ~1 分钟"。

---

## 关于"国内也要能访问"（如实说明）

- Cloudflare Pages 免费版在中国大陆**没有节点**，走的是海外（多为日本/新加坡/香港）
  节点，所以国内能访问、但**速度和稳定性不如**国内 CDN 或香港 VPS，偶有波动属正常。
- 这已经是**免费方案里国内表现最好**的之一，明显好于 GitHub Pages 直连。
- 若将来要国内极致稳定：可换成香港 VPS（本仓库仍保留了 `Caddyfile` /
  `s_blog.service` / `deploy.sh` 动态部署方案），或域名做 ICP 备案 + 国内 CDN。

---

## 常见问题

| 现象 | 处理 |
|------|------|
| `publish.sh` 报 "no git remote" | 先执行第 1 步的 `git remote add origin ...` |
| 打开 pages.dev 样式/JS 丢失 | 确认 Cloudflare 输出目录填的是 `dist`、构建命令留空 |
| 文章点进去 404 | 确认是用 `publish.sh` 发布的（它会生成 `posts/<slug>.html`） |
| 改了内容线上没变 | 确认 `publish.sh` 有 `git push` 成功；到 Cloudflare 看部署日志 |
| 忘记本地后台密码 | 重新 `ADMIN_PASSWORD='新密码' ./blogbin serve` 覆盖即可 |
| 想要 github.io 镜像 | 仓库已含可选的 `.github/workflows/pages.yml`，按里面注释启用 |

---

## 附：另一条路（动态后台，付费香港 VPS）

如果你以后更看重"网页后台随处可访问 + 国内最稳"，本仓库也保留了把整套 Go 服务
部署到服务器的方案，见 `README.md` 的 "Deploying" 一节与 `Caddyfile` /
`s_blog.service` / `scripts/deploy.sh`。两条路的代码是同一套，可随时切换。
