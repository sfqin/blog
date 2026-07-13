# 上线实操手册（从零到可访问）

这份文档带你把 `dev@home` 博客部署到一台海外 VPS，让国内外都能访问。
全程大约 30–60 分钟。按顺序做，每一步都有具体命令。

> 术语：**VPS** = 云服务器；**SSH** = 远程登录服务器的命令；`$` 开头的行是命令，
> 在你自己电脑或服务器上粘贴执行（不含 `$`）。

---

## 第 0 步：需要准备的账号（一次性）

| 项目 | 推荐 | 说明 |
|------|------|------|
| VPS | **香港节点**，1 核 1G | 香港对大陆延迟低、**不需要 ICP 备案**。约 5–10 美元/月 |
| 域名 | 任意注册商 | 海外托管不用备案。例：`yourname.com` |
| Cloudflare | 免费版 | 全球 CDN + DNS，让国内外访问都顺 |
| 支付方式 | 卡 / 支付宝 | 看服务商 |

常见可选 VPS 服务商（自行挑一个）：
- 阿里云 / 腾讯云 **香港**地域（中文界面、支付宝付款，最省事）
- 搬瓦工 BandwagonHost（HK CN2 GIA，国内速度好）
- Vultr / DigitalOcean（东京/首尔节点，英文界面）

选系统镜像时选 **Ubuntu 22.04 或 24.04 LTS**。

---

## 第 1 步：拿到服务器，第一次登录

买好 VPS 后，服务商会给你三样东西：**公网 IP**、**root 密码**（或密钥）。

在你自己的 Mac 终端里：

```bash
$ ssh root@你的服务器IP
# 第一次会问 yes/no，输 yes；然后输入 root 密码
```

登录成功后，先更新系统并创建一个专门跑博客的用户：

```bash
$ apt update && apt -y upgrade
$ adduser --system --group --home /opt/s_blog blog   # 服务专用账号（无登录）
$ mkdir -p /opt/s_blog/data /var/log/caddy
$ chown -R blog:blog /opt/s_blog
```

---

## 第 2 步：装 Caddy（自动 HTTPS 反向代理）

Caddy 会自动帮你申请并续期 HTTPS 证书，省去手动配置。在服务器上执行：

```bash
$ apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
$ apt update && apt install -y caddy
```

装好后 `caddy version` 能打印版本号即成功。

---

## 第 3 步：域名解析指向服务器

1. 登录你的**域名注册商** → 把域名的 DNS 服务器改成 **Cloudflare** 给你的两个地址
   （在 Cloudflare 添加站点时会显示，例如 `xxx.ns.cloudflare.com`）。
2. 在 **Cloudflare** 控制台 → DNS → 添加一条记录：
   - 类型 **A**，名称 `@`（或 `blog`），内容 = **你的服务器 IP**
   - 代理状态：**橙色云开启**（走 Cloudflare CDN）
3. 等 DNS 生效（通常几分钟）。用 `ping 你的域名` 能解析到即可。

> 如果用 `blog.yourname.com` 这种子域名，名称就填 `blog`；用裸域名就填 `@`。

---

## 第 4 步：把网站部署上去（在你自己电脑上跑）

回到**你自己的 Mac**，在项目目录 `s_blog` 里。第一次部署分两小步。

### 4a. 上传程序 + 配置文件

```bash
$ cd /Users/bytedance/PycharmProjects/s_blog
$ ./scripts/deploy.sh push blog@你的服务器IP
```

这条命令会：编译出 Linux 单文件程序 → 上传到服务器 `/opt/s_blog/` →
顺带上传 `Caddyfile` 和 `s_blog.service`。
（第一次会因为服务还没装好而在最后一步报错，属正常，下一步安装。）

### 4b. 改两处配置，然后启用服务

先在**本地**改好两个文件再重新 push，或直接在服务器上改：

1. `Caddyfile`：把 `blog.example.com` 改成**你的真实域名**。
2. `s_blog.service`：把 `ADMIN_PASSWORD=CHANGE_ME_ON_FIRST_BOOT` 改成**你自己的强密码**。

改完后在**服务器**上安装并启动：

```bash
$ ssh root@你的服务器IP
$ cp /opt/s_blog/s_blog.service /etc/systemd/system/
$ cp /opt/s_blog/Caddyfile /etc/caddy/Caddyfile
$ systemctl daemon-reload
$ systemctl enable --now s_blog      # 启动博客程序
$ systemctl reload caddy             # 让 Caddy 加载新域名并申请证书
```

检查是否在跑：

```bash
$ systemctl status s_blog --no-pager | head -5    # 应显示 active (running)
$ systemctl status caddy --no-pager | head -5
```

---

## 第 5 步：验证 + 开始发文章

浏览器打开：

- 主页：`https://你的域名/`
- 后台：`https://你的域名/admin/login`
  - 用户名 `admin`，密码 = 你在第 4b 步设的那个

登录后台后就能：改个人资料、加经历/想法/项目、**发文章**、编辑足迹地图。
保存后**刷新主页立刻可见**，无需重新部署。

> 安全提醒：登录成功后，可把 `s_blog.service` 里的 `ADMIN_PASSWORD` 那行删掉再
> `systemctl daemon-reload && systemctl restart s_blog`，密码已存进数据库，不必留在配置里。

---

## 以后更新网站内容 / 代码

- **改文章、页面数据**：直接在 `/admin` 后台操作，即时生效，不用碰服务器。
- **改了代码要重新部署**：在本地跑一条命令即可（自动编译+上传+重启）：
  ```bash
  $ ./scripts/deploy.sh push blog@你的服务器IP
  ```

---

## 常见问题排查

| 现象 | 处理 |
|------|------|
| 打不开、证书报错 | 等几分钟让 Caddy 申请证书；确认 DNS 已指向服务器 IP、80/443 端口没被防火墙挡 |
| `502 Bad Gateway` | 博客程序没起来：`systemctl status s_blog`，看日志 `journalctl -u s_blog -n 50` |
| 忘记后台密码 | 在 `s_blog.service` 里重新设 `ADMIN_PASSWORD=新密码`，`daemon-reload && restart` |
| 国内访问慢 | 确认 Cloudflare 橙色云已开；或后续考虑 HK CN2 GIA 线路的 VPS |
| 想用国内 CDN 加速 | 需要域名 ICP 备案 + 国内 CDN，属可选进阶项 |
