# us. 情侣网页版

前后端分离，部署到 `https://couple.senfoundry.com`。iPhone 和安卓可直接打开网页，添加到主屏幕后使用。

```
frontend/   网页前端：Expo Router / React Native Web
backend/    API 后端：Fastify / MySQL / WebSocket
deploy/    Gitee webhook 和独立部署脚本
docs/      产品和配置文档
```

**部署从 [deploy/README.md](deploy/README.md) 开始。** 前端、后端各自独立构建和运行；一个 Gitee webhook 在 master 更新时部署两边，后端健康检查通过后再切换前端。真实环境配置、数据库和照片保存在服务器固定目录，不提交到仓库。

生产使用宝塔中已创建的 MySQL `couple` 数据库，支持服务器当前的 MySQL 5.7.44 和 MySQL 8+。字段变更的迁移随代码提交，自动部署先备份、执行迁移，再更新服务；服务器不需要手工改表。生产 Compose 不会创建另一套数据库。

## 本地开发

前端：在 `frontend` 执行 `npm ci`、`npm run web`。本地默认连接 `http://127.0.0.1:8787`；正式网页默认使用同域名 `/api`。

后端：在 `backend` 复制 `.env.example` 为 `.env`，填写数据库和邮箱配置，然后执行 `npm ci`、`npm run dev`。

## 检查和构建

```sh
cd frontend
npm run lint
npm run typecheck
npm run build:web

cd ../backend
npm run typecheck
npm run db:check
npm test
```

前端产物为 `frontend/dist`。需要前后端安装依赖后运行完整测试。部署脚本及 webhook 的测试在 backend/tests 中。

## 当前支持

美食收藏与探店、足迹、纪念日、时光胶囊、动态与评论、共享清单、每日一问、心情、打开网页时的实时戳一戳、邮箱注册登录、主屏幕安装说明、网页更新检查及断网提示。

网页关闭后的系统提醒、离线推送和离线编辑尚未接入。网页发布不需要 EAS 或 Apple 开发者账号；保留的原生配置仅用于以后需要独立 App 时使用。

当前代码已做本地验证，服务器部署和 Gitee webhook 设置由项目所有者完成。
