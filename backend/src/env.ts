import 'dotenv/config';
import path from 'node:path';
import { databaseUrlFrom } from './databaseConfig.ts';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}，请参考 .env.example`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: databaseUrlFrom(process.env),
  jwtSecret: required('JWT_SECRET'),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
  /** 登录有效期 */
  tokenTtl: process.env.TOKEN_TTL ?? '180d',
  /** 你们所在的时区，用来判断时光胶囊“今天”是否解锁 */
  tz: process.env.APP_TZ ?? 'Asia/Shanghai',
  /** 最多允许注册几个账号（这个 App 是两个人用的） */
  maxUsers: Number(process.env.MAX_USERS ?? 2),
  /** 自动部署完成后通知谁（逗号分隔多个；填 off 关闭） */
  deployNotifyEmail: process.env.DEPLOY_NOTIFY_EMAIL?.trim() || '2110901906@qq.com',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? (process.env.SMTP_PORT === '587' ? 'false' : 'true')) === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '',
  },
};
