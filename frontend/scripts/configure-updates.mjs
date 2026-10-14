import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectId = process.argv[2];
if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  console.error('用法：npm run updates:configure -- 你的真实EAS项目ID');
  process.exit(1);
}
const configPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.expo.extra = { ...config.expo.extra, eas: { ...config.expo.extra?.eas, projectId } };
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log('已配置在线更新项目。请重新构建并安装 App，让手机获得更新能力。');
