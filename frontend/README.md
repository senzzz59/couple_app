# us. — 网页前端

Expo SDK 57 + Expo Router + Reanimated 4。运行、部署说明见上级目录的 [README](../README.md)。

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
