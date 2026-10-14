# 宝塔部署：前后端分离，一个 master webhook 更新两边

仓库：`git@gitee.com:sensnow/couple_web.git`，分支：`master`。

- `frontend/`：网页前端，独立依赖、构建、产物和发布目录。
- `backend/`：Fastify API，独立依赖和 Docker 服务。
- `deploy/`：Webhook 接收器及部署脚本，不属于业务 API。

外部使用 `https://couple.senfoundry.com`。Nginx 提供前端，并将 `/api/` 和 `/files/` 代理到独立后端；前后端分离不要求使用两个域名。

## 1. 服务器准备

服务器需要 Git、Node.js 24+、npm、Docker Compose v2、宝塔 Nginx。Node 如果由宝塔安装，先确认 `node -v`、`npm -v` 在终端可用。

```sh
mkdir -p /www/couple-app/shared
git clone -b master git@gitee.com:sensnow/couple_web.git /www/couple-app/repo
cd /www/couple-app/repo
cp backend/.env.example /www/couple-app/shared/backend.env
cp deploy/frontend.env.example /www/couple-app/shared/frontend.env
cp deploy/webhook.env.example /www/couple-app/shared/webhook.env
chmod 600 /www/couple-app/shared/*.env
```

服务器需要有权限拉取该仓库。私有仓库可使用仅能读取此仓库的部署公钥；不要上传个人 SSH 私钥。若使用 HTTPS 克隆，改用仓库页面给出的 HTTPS URL。

在宝塔文件编辑器中设置：

- `backend.env`：真实 `MYSQL_PASSWORD`、随机 `JWT_SECRET` 和 SMTP 邮件参数。新数据库数据会保存在 `/www/couple-app/shared/data/mysql`，照片在 `shared/data/uploads`。
- `frontend.env`：默认 API 地址留空，走当前域名的 `/api`；需要地图时填写对应公开 Key。实际文件不要提交到 Git。
- `webhook.env`：将 `WEBHOOK_SECRET` 替换为真实随机密钥，可用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成。Gitee 中填写相同的密码。

如果服务器已经有此项目的数据，先停止旧的服务，确认数据目录和备份，再将原数据库和照片接到这个固定数据目录。不要在未经确认时覆盖已有数据库。

## 2. 首次部署

```sh
cd /www/couple-app/repo
node --env-file=/www/couple-app/shared/frontend.env deploy/deploy-all.mjs
```

这会从 `origin/master` 构建前端，检查后端并构建 Docker 服务，等待后端健康检查通过，再发布前端。前后端固定使用同一个提交；部署中又收到的新推送将在下一轮执行。

首次执行时 Docker 会创建数据库并自动迁移。后端 API 只监听服务器本机 `8787`。部署状态记录在 `/www/couple-app/state/`；前端文件位于 `releases/`，`frontend-current` 指向当前版本。

宝塔新建 `couple.senfoundry.com` 静态站点：

1. 根目录设置为 `/www/couple-app/frontend-current`。
2. 申请 SSL 证书，开启强制 HTTPS。
3. 在站点 `server {}` 内加入 `deploy/baota-nginx.conf`，替换原来的 `location /`，保留宝塔生成的证书、监听端口和域名配置。
4. 检测并重载 Nginx。打开 `/api/health`，应返回 `{"ok":true}`，然后打开首页。

部署脚本不自动删除旧版本。新版本保留旧的带哈希资源，避免仍打开旧页面的手机加载失败。

## 3. 常驻 webhook 接收器

```sh
cp /www/couple-app/repo/deploy/couple-webhook.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now couple-webhook
systemctl status couple-webhook
```

默认服务使用 `/usr/bin/node`。如果宝塔 Node 安装在其他路径，修改服务的 `ExecStart` 为实际 Node 24 可执行文件，并加一行 `Environment=PATH=实际Node的bin目录:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`，确保子进程能找到 npm。修改后执行 `systemctl daemon-reload` 和 `systemctl restart couple-webhook`。

服务以 root 运行以调用 Docker，使用 www 组让 Nginx 可读前端文件。接收器只监听 `127.0.0.1:8790`，外部通过 Nginx 的 HTTPS 路径访问，不需要另开公网端口。部署凭据只放在服务器的 `shared/` 中。

## 4. Gitee 设置

仓库 → 管理 → WebHooks → 添加：

- URL：`https://couple.senfoundry.com/webhooks/gitee`
- 密码：服务器 `webhook.env` 的 `WEBHOOK_SECRET`
- 勾选 Push；不需要 Tag、Issue、Pull Request 等事件。

接收器会核对密码、仓库名称、`refs/heads/master` 和有效提交。其他分支、标签及删除分支会忽略。收到合法请求时立即返回 `202`，构建在后台运行；`202` 只表示接收，不代表已经上线。

用真实的 `master` 提交验收，并查看日志：

```sh
journalctl -u couple-webhook -f
cat /www/couple-app/state/deployment.json
```

成功日志应包含 `Frontend and backend deployed from master`。如果 Gitee 的“测试”使用了不是 master 的示例数据，会返回 ignored；请用实际 push 验证完整流程。

连续推送会合并待执行任务并串行部署。若前端构建或后端检查失败，不切换前端；若后端更新后无法通过健康检查，存在上一版本时会尝试恢复旧后端服务。数据库迁移不会自动逆向回滚，因此涉及数据库的更改应向后兼容，并提前备份。

## 5. 手动部署和前端回退

```sh
# 前后端一起更新
node --env-file=/www/couple-app/shared/frontend.env /www/couple-app/repo/deploy/deploy-all.mjs

# 仅更新前端（可用 --force 强制按新环境变量构建）
node --env-file=/www/couple-app/shared/frontend.env /www/couple-app/repo/deploy/deploy-frontend.mjs --force

# 仅更新后端
node /www/couple-app/repo/deploy/deploy-backend.mjs

# 切回上一次前端版本，不影响数据库
node /www/couple-app/repo/deploy/rollback-frontend.mjs
```

部署工具自身或 systemd / Nginx 配置改变时，还需要在主克隆目录手动 `git pull --ff-only origin master`，然后按需重启 webhook 或重载 Nginx。业务更新由 webhook 自动构建，不需要在该主克隆中切换工作文件。

## 网页更新与提醒

用户重新打开网页会获取当前版本。长时间打开的页面会检查版本，并在「我的」中提供刷新更新；不会强行刷新丢失输入。iPhone 用 Safari 添加到主屏幕，安卓在浏览器中安装或添加到主屏幕。

网页关闭后的定时通知和离线戳一戳尚未实现。离线缓存只保存公开代码、图标、字体和离线提示，不保存私人 API 数据或照片。
