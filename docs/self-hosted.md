# s_blog 自建服务器部署与写作

本指南面向 [sfqin/blog](https://github.com/sfqin/blog) 个人实例（本地目录通常叫 `s_blog`）。开源上游是 [blog_self](https://github.com/sfqin/blog_self)；上游目前没有这个实例的 `SERVER_MODE` 和 Ops 管理网关适配，不能把两个仓库的服务配置混用。

## 已有站点怎么写博客？

当前个人实例入口：

- 公开博客：<https://lvxingzhe.top/>
- 管理平台登录：<https://lvxingzhe.top/ojbk/opq_aaa/login>
- 登录后进入博客模块，点击「写博客」，使用受保护的 `/ojbk/opq_aaa/blog/admin` 后台。

在文章表单里填写标题、slug、日期、标签和 Markdown 正文。未勾选 `published` 的文章是草稿；勾选并保存后，刷新自建站即可看到。个人资料、经历、项目、思考、足迹和瞬间也在同一后台编辑。

公网 `/admin`、`/setup` 返回 404 是预期行为。服务器后台没有 GitHub 一键发布入口；它直接修改服务器数据库。**服务器内容不会自动同步到电脑上的客户端，也不会自动更新 GitHub Pages。**

本项目没有 `.md` 文件目录导入功能。使用外部 Markdown 编辑器时，把正文粘贴到后台，并单独填写文章元数据。

## 先选择静态站还是动态站

| 模式 | 服务器需要什么 | 内容怎样生效 |
| --- | --- | --- |
| 静态站 | Nginx 等静态文件服务 | 本地写作 → 导出 → 上传静态文件；见 [README](../README.md#部署方式二其他静态托管或自己的-nginx) |
| 动态站 | Go 可执行文件、SQLite 数据目录、systemd、Nginx | 读取服务器数据库；已接入鉴权后台时，保存后立即生效 |

下面介绍动态站。程序包含模板、CSS、JavaScript、字体和地图，不需要在服务器运行 npm，也不要求服务器安装 Go。

## 第一次部署动态站

### 1. 从正确的源码编译

开发机需要 Go 1.23+。下面构建 Linux x86_64 服务器使用的程序；ARM 服务器将 `GOARCH` 改为 `arm64`。

```bash
git clone https://github.com/sfqin/blog.git s_blog
cd s_blog

BUILD_DIR="$(mktemp -d)"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags '-s -w' -o "$BUILD_DIR/s_blog" .
go version -m "$BUILD_DIR/s_blog"
shasum -a 256 "$BUILD_DIR/s_blog"
```

`go version -m` 可以检查构建所对应的 Git 提交。个人实例含作者的备案与站点配置，复用到自己的站点前，请调整 `web/templates/public/_partials.html` 中的备案信息，再构建程序。站点资料和文章通过后台编辑。

### 2. 准备用户与数据目录

以下是首次部署示例，在目标服务器以 root 或等价的管理员权限执行；域名、SSH 地址和目录按实际环境替换。

```bash
id blog >/dev/null 2>&1 || \
  useradd --system --create-home --home-dir /opt/s_blog --shell /usr/sbin/nologin blog
install -d -m 0750 -o blog -g blog /opt/s_blog
install -d -m 0700 -o blog -g blog /opt/s_blog/data
```

在开发机上传刚才构建的程序：

```bash
scp "$BUILD_DIR/s_blog" root@your-server:/opt/s_blog/s_blog.new
```

回到服务器安装：

```bash
chown blog:blog /opt/s_blog/s_blog.new
chmod 0755 /opt/s_blog/s_blog.new
mv /opt/s_blog/s_blog.new /opt/s_blog/s_blog
```

如果要迁移本地内容，先按 [README 的备份步骤](../README.md#内容保存在哪里如何备份)取得 SQLite 快照，再在**目标服务停止时**放到 `/opt/s_blog/data/blog.db`，设置所有者为 `blog:blog`、权限为 `0600`。已有服务器更新程序时，不要用本地数据库覆盖服务器数据库。不迁移数据时，首次启动会创建空数据库。

### 3. 配置 systemd 常驻服务

创建 `/etc/systemd/system/s_blog.service`：

```ini
[Unit]
Description=Personal blog
After=network.target

[Service]
Type=simple
User=blog
Group=blog
WorkingDirectory=/opt/s_blog
Environment=ADDR=127.0.0.1:8080
Environment=DB_PATH=/opt/s_blog/data/blog.db
Environment=SERVER_MODE=1
Environment=SECURE_COOKIES=1
# 接入 Ops 管理网关后，再启用与网关匹配的凭据文件：
# Environment=OPS_SERVICE_TOKEN_FILE=/etc/blog/ops-service.token
ExecStart=/opt/s_blog/s_blog serve
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/s_blog/data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now s_blog
systemctl is-active s_blog
curl -fsS http://127.0.0.1:8080/internal/ready
```

`SERVER_MODE=1` 关闭本地模式的空闲退出机制，并关闭裸 `/admin`、`/setup`。**单独开启它不会创建登录系统或可直接访问的写作后台。** 没有管理网关时，这个服务仅用于公开展示；内容可先在本地编辑，再通过停服迁移快照更新。

### 4. 通过 Nginx 对外提供网站

下面是只开放公开博客的路由示例。为自己的域名配置 TLS，正式站通过 HTTPS 访问；不要把 8080 端口直接暴露到公网。

```nginx
server {
    listen 80;
    server_name blog.example.com;

    location = /admin { return 404; }
    location ^~ /admin/ { return 404; }
    location = /setup { return 404; }
    location ^~ /setup/ { return 404; }
    location ^~ /internal/ops/ { return 404; }
    # 尚未配置管理平台时，保留关闭状态。
    location ^~ /ojbk/ { return 404; }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
nginx -t
systemctl reload nginx
```

已部署的个人实例有现成的 HTTPS、管理代理和访问日志配置，更新博客程序时保留这些配置，不要用上面的初始示例覆盖它们。

### 5. 需要在线写作时，接入管理网关

个人实例的在线编辑依赖作者独立维护的私有 Ops 平台，**该平台未随本仓库开源，也不会在启动博客时自动安装**。当前个人站使用现成的登录入口；其他部署者若没有这套平台，可以采用本地写作 + 静态发布，或根据 `internal/server/ops.go` 的接口自行接入带登录鉴权的管理网关。仅复制本仓库不能直接获得作者的在线管理平台。

接入后需要满足：

- Nginx 把 `/ojbk/opq_aaa` 管理路径交给 Ops，由它验证用户登录和博客编辑权限。
- Blog 的 `OPS_SERVICE_TOKEN_FILE` 指向与网关匹配、且 `blog` 用户可读的服务凭据文件。
- Blog 只监听 `127.0.0.1:8080`；管理请求由网关附带服务凭据及账号信息转发。
- 用户通过 Ops 登录页面进入编辑器，服务凭据不是用户登录密码。

当前个人实例已完成接入，直接使用本指南开头的管理入口即可。

## 已有服务器如何更新代码？

**内容数据与程序分开更新。** UI、模板和脚本已经编入二进制，所以拉取源码后还需要重新编译、上传程序并重启服务；只更新服务器上的 CSS 源文件不会生效。

1. 在本地 master 拉取最新代码，完成 `go test ./...`、`go vet ./...`，按上面的命令重新构建 Linux 程序。
2. 核对本地构建的提交与校验和，将程序上传为 `/opt/s_blog/s_blog.new`。
3. 在服务器备份旧程序和数据库，再原子替换程序、重启博客服务。

服务器更新示例（需要 `sqlite3`）：

```bash
RELEASE="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/opt/s_blog/releases/$RELEASE"
install -d -m 0700 "$BACKUP_DIR"
cp -p /opt/s_blog/s_blog "$BACKUP_DIR/s_blog"
sqlite3 'file:/opt/s_blog/data/blog.db?mode=ro' \
  ".backup '$BACKUP_DIR/blog.db'"

# 与开发机的校验和核对一致后继续。
sha256sum /opt/s_blog/s_blog.new
chown blog:blog /opt/s_blog/s_blog.new
chmod 0755 /opt/s_blog/s_blog.new
mv /opt/s_blog/s_blog.new /opt/s_blog/s_blog
systemctl restart s_blog
systemctl is-active s_blog
curl -fsS http://127.0.0.1:8080/internal/ready
```

该流程保留 `/opt/s_blog/data/blog.db`、Nginx 和 systemd 配置。不要使用早期 `scripts/deploy.sh` 中的 Caddy/服务模板去覆盖现有 Ops 接入配置。

发布后检查公开首页、已发布文章、足迹地图、备案链接，以及管理入口的登录跳转。可以用 `journalctl -u s_blog -n 50 --no-pager` 查看日志。

若需回退，在同一服务器会话中使用刚才的 `BACKUP_DIR`（新会话需重新设置为对应备份目录）：

```bash
cp "$BACKUP_DIR/s_blog" /opt/s_blog/s_blog.rollback
chown blog:blog /opt/s_blog/s_blog.rollback
chmod 0755 /opt/s_blog/s_blog.rollback
mv /opt/s_blog/s_blog.rollback /opt/s_blog/s_blog
systemctl restart s_blog
```

回退程序时先保留当前数据库，避免覆盖发布后的写作内容；涉及数据库结构变更时，需要另行确认版本兼容性。

## GitHub Pages、服务器和本地内容的关系

| 操作 | 会更新什么 |
| --- | --- |
| 在服务器后台保存已发布内容 | 自建动态站 |
| 在电脑客户端 / 本地后台保存 | 该进程使用的本地数据库与本地预览 |
| 在本地执行 GitHub Pages 发布 | 从所选数据库导出的静态站 |
| 推送 master | 源码仓库；不会自动替换服务器程序或发布文章 |

如果需要把服务器内容发布到 Pages，应先取得服务器数据库的一致性快照，再在本地明确指定该快照导出；不要假定电脑上的 `blog.db` 与服务器相同。

本实例的 `scripts/publish-all.sh` 默认只发 GitHub Pages，`dist/` 不跟踪在 master 中，Gitee 需要显式开启。发布自己有权限的 `origin` 仓库时，例如：

```bash
DB_PATH=/tmp/blog-snapshot.db SUBPATH=/blog SKIP_GITEE=1 \
  ./scripts/publish-all.sh 'publish: 更新博客内容'
```

这里的 `/tmp/blog-snapshot.db` 必须是事先准备好的内容快照，`SUBPATH` 与目标仓库名一致。程序使用不同的视图参数区分动态与静态：**动态自建站显示实例备案行，静态导出的 GitHub Pages 隐藏备案行**。
