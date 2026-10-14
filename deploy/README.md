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

- `backend.env`：连接宝塔中已经创建的 `couple` 库，设置 `DB_HOST=127.0.0.1`、`DB_PORT=3306`、`DB_NAME=couple`、`DB_USER=couple`，在 `DB_PASSWORD` 填入真实密码，`DATABASE_URL` 留空。再填写随机 `JWT_SECRET` 和 SMTP 邮件参数。真实密码只在服务器保存，不在 Git 中。照片保存到 `shared/data/uploads`。
- `frontend.env`：默认 API 地址留空，走当前域名的 `/api`；需要地图时填写对应公开 Key。实际文件不要提交到 Git。
- `webhook.env`：将 `WEBHOOK_SECRET` 替换为真实随机密钥，可用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成。Gitee 中填写相同的密码。

生产 Compose 只启动 API，使用 Linux host 网络连接宝塔的本机 MySQL，不创建新 MySQL 容器、不重新创建 couple 库。数据库应为 MySQL 8.0.13+，couple 用户需要具有该库的建表、改表、索引和读写权限。宝塔中已有数据库的数据仍由宝塔管理；如已有本项目照片，保留并接入固定 uploads 目录。

`backend/docker-compose.dev.yml` 才是含 MySQL 容器的本地开发配置，生产部署不会使用它。

## 2. 首次部署

```sh
cd /www/couple-app/repo
node --env-file=/www/couple-app/shared/frontend.env deploy/deploy-all.mjs
```

这会从 `origin/master` 构建前端，检查后端类型及迁移文件，构建 API 镜像。有待执行迁移时，先备份已有 couple 库，再自动迁移；成功后替换 API，等待健康检查通过，最后发布前端。前后端固定使用同一个提交；部署中又收到的新推送将在下一轮执行。

首次执行时会在已经创建的 couple 库中自动建表。后端 API 只监听服务器本机 `8787`。部署状态记录在 `/www/couple-app/state/`。

宝塔网站目录固定为 `/www/wwwroot/couple.senfoundry.com`。脚本让这个路径指向已构建完成的前端版本，所以 Nginx 始终从这个站点目录提供页面；发布时切换软链接，避免用户访问到只上传了一半的文件。真实版本保留在 `/www/couple-app/releases/` 中。首次部署若站点目录已经存在，会保留为同级 `.backup-时间戳` 目录，不删除原文件；如果切换失败会恢复原目录。

宝塔新建 `couple.senfoundry.com` 静态站点：

1. 根目录设置为 `/www/wwwroot/couple.senfoundry.com`。
2. 申请 SSL 证书，开启强制 HTTPS。
3. 在站点 `server {}` 内加入 `deploy/baota-nginx.conf`，替换原来的 `location /`，保留宝塔生成的证书、监听端口和域名配置。
4. 检测并重载 Nginx。打开 `/api/health`，应返回 `{"ok":true}`，然后打开首页。

部署脚本不自动删除旧版本。新版本保留旧的带哈希资源，避免仍打开旧页面的手机加载失败。

## 3. 常驻 webhook 接收器

请求分工如下：

```text
couple.senfoundry.com 页面、JS、图片图标
  → Nginx 从 /www/wwwroot/couple.senfoundry.com 提供前端
/api/ 与 /files/
  → Nginx 反向代理到 127.0.0.1:8787 业务后端
/webhooks/gitee
  → Nginx 反向代理到 127.0.0.1:8790 部署服务
  → 验证 master 推送 → 拉取代码 → 构建并更新前后端
```

Webhook 属于服务器端接口，部署服务独立于业务 API。部署业务后端时接收器不会跟着重启，仍能接收新的推送并排队处理。

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

## 数据表字段自动更新

每次开发字段变化时，同步修改 `backend/src/db/schema.ts`，在 backend 中运行 `npm run db:generate`，把新 SQL 和 drizzle 元数据一同提交。后续由 Codex 实现需求时，`backend/AGENTS.md` 要求完成这一步，你无需自己生成或手工执行 SQL。

服务器的自动部署会执行以下步骤：

1. `npm run db:check` 验证 schema 与已提交迁移一致；遗漏 SQL 就停止。
2. 核对数据库里的 `__drizzle_migrations` 历史，防止已发布 SQL 被改写或迁移缺失。
3. 有新迁移时，使用一次性的官方 mysql:8.4 客户端容器，将现有数据库备份到 `/www/couple-app/shared/backups/before-migration-*.sql`。它仅运行 mysqldump，不启动新的数据库。备份失败就停止，不执行 DDL。
4. 获取数据库迁移锁，按顺序执行尚未执行的 SQL，并记录版本。重复部署跳过已执行的迁移。
5. 迁移成功后更新 API，再切换前端。API 启动时再次检查迁移记录，确保不会重复执行。

字段重命名和数据格式转换会写成明确的迁移，不自动猜测或清空表。涉及 MySQL DDL 的失败可能留下部分表结构变更，应用版本回退不等于数据库逆向回退；旧服务能否继续运行取决于迁移是否向后兼容。备份文件用于需要时恢复，部署过程不自动覆盖数据库。

## 网页更新与提醒

用户重新打开网页会获取当前版本。长时间打开的页面会检查版本，并在「我的」中提供刷新更新；不会强行刷新丢失输入。iPhone 用 Safari 添加到主屏幕，安卓在浏览器中安装或添加到主屏幕。

网页关闭后的定时通知和离线戳一戳尚未实现。离线缓存只保存公开代码、图标、字体和离线提示，不保存私人 API 数据或照片。
