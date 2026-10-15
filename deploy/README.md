# 宝塔部署：前后端分离，一个 master webhook 更新两边

仓库：`git@github.com:senzzz59/couple_app.git`，分支：`master`。已有 Gitee 服务器请先看文末「从 Gitee 切换到 GitHub」。

- `frontend/`：网页前端，独立依赖、构建、产物和发布目录。
- `backend/`：Fastify API，独立依赖和 Docker 服务。
- `deploy/`：Webhook 接收器及部署脚本，不属于业务 API。

外部使用 `https://couple.senfoundry.com`。Nginx 提供前端，并将 `/api/` 和 `/files/` 代理到独立后端；前后端分离不要求使用两个域名。

## 1. 服务器准备

服务器需要 Git、Node.js 24+、npm、Docker Compose v2、宝塔 Nginx。Node 如果由宝塔安装，先确认 `node -v`、`npm -v` 在终端可用。

```sh
mkdir -p /www/couple-app/shared
git clone -b master git@github.com:senzzz59/couple_app.git /www/couple-app/repo
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
- `webhook.env`：将 `WEBHOOK_SECRET` 替换为真实随机密钥，可用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成。GitHub Webhook 的 Secret 填相同值，至少 32 个字符。Secret 只保存于服务器和 GitHub 设置，不提交到 Git。

生产 Compose 只启动 API，使用 Linux host 网络连接宝塔的本机 MySQL，不创建新 MySQL 容器、不重新创建 couple 库。支持你的 MySQL 5.7.44，也兼容 MySQL 8+。couple 用户需要具有该库的建表、改表、索引和读写权限。宝塔中已有数据库的数据仍由宝塔管理；如已有本项目照片，保留并接入固定 uploads 目录。

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

前端构建限制 Metro 使用一个 worker，降低同时打包浏览器和静态页面时的内存占用。若构建报 `npm exited 137`，表示进程被强制结束，可能是服务器或容器内存限制；先检查 `free -h`、`swapon --show` 和 `journalctl -k -n 100 --no-pager` 中是否有 OOM / Killed process 记录。npm 的 Unknown global config 警告本身不会导致此次退出。处理内存不足后重新运行部署命令即可，失败构建不会发布到网站目录。

## 3. 常驻 webhook 接收器

请求分工如下：

```text
couple.senfoundry.com 页面、JS、图片图标
  → Nginx 从 /www/wwwroot/couple.senfoundry.com 提供前端
/api/ 与 /files/
  → Nginx 反向代理到 127.0.0.1:8787 业务后端
/webhooks/github
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

## 4. GitHub 设置

打开 [senzzz59/couple_app 的 Webhooks 设置](https://github.com/senzzz59/couple_app/settings/hooks)，点击 Add webhook：

- Payload URL：`https://couple.senfoundry.com/webhooks/github`
- Content type：`application/json`（不要使用默认的表单格式）
- Secret：服务器 `/www/couple-app/shared/webhook.env` 中 `WEBHOOK_SECRET` 的实际值，不含引号和变量名。
- SSL verification：保持启用。
- Which events：选择 Just the push event。
- Active：勾选，保存。

接收器按 [GitHub 官方签名规则](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) 使用原始请求内容验证 `X-Hub-Signature-256` 的 HMAC-SHA256 签名，再核对仓库 `senzzz59/couple_app`、`refs/heads/master` 和有效提交。其他分支、标签及删除分支会忽略。GitHub 创建 webhook 时的 `ping` 返回 `200` 和 `pong`，不部署；合法 master push 立即返回 `202`，构建在后台运行。`202` 只表示接收，不代表已经上线。

用真实的 `master` 提交验收，并查看日志：

```sh
journalctl -u couple-webhook -f
cat /www/couple-app/state/deployment.json
```

在 GitHub 的该 webhook → Recent Deliveries 中查看请求和响应：`ping` 应为 `200`，真实 `master` push 应为 `202`。成功日志应包含 `Frontend and backend deployed from master`，且 `deployment.json` 的 `commit` 与 GitHub master 对应。功能分支推送会返回 `200 ignored`，不会上线。

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
3. 有新迁移时，按服务器版本选择一次性的官方客户端容器（5.7 使用 mysql:5.7.44，8+ 使用 mysql:8.4），将现有数据库备份到 `/www/couple-app/shared/backups/before-migration-*.sql`。它仅运行 mysqldump，不启动新的数据库。备份失败就停止，不执行 DDL。
4. 获取数据库迁移锁，按顺序执行尚未执行的 SQL，并记录版本。重复部署跳过已执行的迁移。
5. 迁移成功后更新 API，再切换前端。API 启动时再次检查迁移记录，确保不会重复执行。

字段重命名和数据格式转换会写成明确的迁移，不自动猜测或清空表。涉及 MySQL DDL 的失败可能留下部分表结构变更，应用版本回退不等于数据库逆向回退；旧服务能否继续运行取决于迁移是否向后兼容。备份文件用于需要时恢复，部署过程不自动覆盖数据库。

MySQL 5.7.44 不支持 JSON 数据库默认值，数组默认值由应用写入；时间默认值使用兼容的 CURRENT_TIMESTAMP。首次安装时，迁移器仅对指定哈希的旧迁移适配这两种语法，并保存原始迁移哈希，不修改已提交 SQL。新增迁移直接使用兼容语法，MySQL 8 的现有安装也可正常更新。

## 网页更新与提醒

用户重新打开网页会获取当前版本。长时间打开的页面会检查版本，并在「我的」中提供刷新更新；不会强行刷新丢失输入。iPhone 用 Safari 添加到主屏幕，安卓在浏览器中安装或添加到主屏幕。

网页关闭后的定时通知和离线戳一戳尚未实现。离线缓存只保存公开代码、图标、字体和离线提示，不保存私人 API 数据或照片。

## 从 Gitee 切换到 GitHub（已有服务器）

此过程需要项目所有者在服务器和 GitHub 上操作；仓库中的代码与配置模板更新不会自动替换正在运行的接收器。

### 1. 切换服务器仓库并更新部署接收器

在宝塔终端执行：

```sh
cd /www/couple-app/repo
git status --short
```

若有本地修改，先备份、检查并妥善保存，再执行下面的更新；不要使用强制重置覆盖它们。先用 `git remote -v` 确认地址；若尚未保存旧远程，可用 `git remote add gitee git@gitee.com:sensnow/couple_web.git` 保留备用。

```sh
git remote set-url origin git@github.com:senzzz59/couple_app.git
git ls-remote origin refs/heads/master
git fetch origin master
git switch master
git merge --ff-only origin/master
systemctl restart couple-webhook
systemctl status couple-webhook --no-pager
```

逐条执行，任何一步失败先处理，再继续。若服务器尚未获得 GitHub SSH 读取权限，把服务器已有 SSH 公钥添加到该仓库的 Settings → Deploy keys，只给读取权限；私钥留在服务器。首次连接时按 [GitHub 官方 SSH 指纹](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) 核对主机身份，不能跳过主机密钥校验。若 `--ff-only` 因本地提交分叉而失败，应先合并并保留这些提交，不要强推或重置。

保留现有 systemd 服务中的 Node 路径和服务器 `shared/` 配置；接收器启动日志应显示 `GitHub deployment webhook listening`。只更新部署工具不会立即更新正在运行的业务前后端。

### 2. 添加新的 Nginx 路径

在宝塔 → 网站 → couple.senfoundry.com → 配置文件的现有 `server {}` 内，添加下面这一段，然后检查配置并重载 Nginx。保留现有 `/api/`、`/files/`、静态网站及证书配置。

```nginx
location = /webhooks/github {
    proxy_pass http://127.0.0.1:8790;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 10s;
    client_max_body_size 1m;
}
```

已有的 `/webhooks/gitee` 可在迁移期间保留，但新接收器在这个旧 URL 上也只接受 GitHub 的 SHA-256 签名，不再接受 Gitee 密码。新版 Nginx 示例同时包含两个入口。

### 3. 新建 GitHub Webhook 并验收

按上面第 4 节添加 GitHub webhook。可以沿用服务器现有的 `WEBHOOK_SECRET`；若不足 32 字符，请生成新值，在服务器与 GitHub 中同步更新并重启接收器。无需将密钥发给开发者。

先确认 Recent Deliveries 的 `ping` 是 `200 pong`；再用下一次真实 `master` 推送验收 `202`、成功部署日志与 `deployment.json` 提交号。若当前有一次真实的 master push 投递记录，也可以在更新接收器后 Redeliver；`ping` 和功能分支投递都不会发布业务代码。确认切换完成后，在 Gitee 仓库关闭旧 webhook，避免无效重试。

常见响应：`401` 表示 Secret 不一致、签名缺失或请求内容被代理改写；`400` 表示 JSON 格式错误（检查 Content type）；`404` 表示路径或 Nginx 配置错误；`502` 表示接收器未启动或代理端口不匹配；`200 ignored` 表示事件、仓库或分支不满足部署条件。

GitHub Settings → General → Default branch 应设为已有的 `master`（选择 Switch to another branch，不是重命名分支）。Webhook 仍明确只部署 master。
