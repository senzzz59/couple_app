# us. — 网页前端

Expo SDK 57 + Expo Router + Reanimated 4。运行、部署说明见上级目录的 [README](../README.md)。

收藏高德地点：在小红书看到想去的店后，到高德地图找到对应分店，在地点页点「分享 → 复制链接」。回到「收藏一家店」点「粘贴高德地点链接」，确认店名后保存。下次在店铺详情点「高德导航」即可使用保存的坐标导航，无需本网站获取当前位置，也无需配置高德搜索 Key。旧收藏可以在编辑页补上链接。

短链接会由登录后的后端解析，保留原始分享链接；如果链接失效或无法读取坐标，详情按钮显示「打开高德地点」，打开原地点后可在高德点「去这里」。数据库新增可空的 `amap_url` 列，迁移随部署自动执行并保留已有收藏。

```
src/
├── app/            # 页面（Expo Router：每个文件就是一个路由）
│   ├── (tabs)/     # 首页 / 美食 / 动态 / 清单 四个 Tab
│   ├── place/      # 店铺详情、新建 / 编辑
│   ├── visit/      # 记录一次探店
│   ├── moment/     # 发动态
│   ├── todo/       # 新建 / 编辑待办
│   ├── anniversary/# 新建 / 编辑纪念日
│   ├── anniversaries.tsx  question.tsx  roulette.tsx  settings.tsx  viewer.tsx  login.tsx
├── components/     # ui（按压回弹、卡片、按钮…）、motion（数字滚动、爱心粒子、彩带、Toast…）、TabBar 等
├── lib/            # api、实时同步、缓存、日期/农历、地理坐标、提醒通知
└── theme/          # 颜色、字体、圆角、弹簧参数
```

常用命令：

```bash
npm run web          # 浏览器开发
npm run typecheck    # 类型检查
npm run lint         # 代码检查
```

网页版构建：`npm run build:web`，产物在 `dist/`。部署和 master webhook 配置见 [deploy/README.md](../deploy/README.md)。

「我的」资料页支持设置性别：男生使用橙色小芽形象，女生使用粉色蝴蝶结形象；未设置时头像显示昵称首字，上传的照片优先显示。保存后会同步到另一半的页面，首页的两个小人也使用各自保存的性别。

在一起天数按本地日历日期之差计算：开始当天为 0 天，次日为 1 天。百日、520 天等里程碑和提醒使用同一规则。
