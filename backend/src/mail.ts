import nodemailer from 'nodemailer';

import { env } from './env.ts';

export const smtpConfigured = () => !!(env.smtp.host && env.smtp.user && env.smtp.pass);

const transport = smtpConfigured()
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    })
  : null;

const TEXT = {
  register: { subject: '你的注册验证码', lead: '欢迎来到 us.，这是你的注册验证码：' },
  reset: { subject: '重置密码验证码', lead: '你正在重置密码，验证码是：' },
};

/** 发送验证码邮件。没配置 SMTP 时（本地开发）直接打印到控制台。 */
export async function sendCodeMail(to: string, code: string, purpose: 'register' | 'reset', log: (msg: string) => void) {
  const t = TEXT[purpose];
  if (!transport) {
    log(`[dev] SMTP 未配置，${to} 的${purpose === 'register' ? '注册' : '重置'}验证码：${code}`);
    return;
  }
  await transport.sendMail({
    from: env.smtp.from,
    to,
    subject: `us. · ${t.subject} ${code}`,
    text: `${t.lead}${code}\n10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。`,
    html: `<div style="background:#FAF6F0;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:24px;padding:32px 28px;color:#1F1A17">
    <div style="font-family:Georgia,serif;font-style:italic;font-size:32px">us.</div>
    <p style="font-size:15px;color:#4A423C;margin:24px 0 12px">${t.lead}</p>
    <div style="font-size:36px;letter-spacing:10px;font-weight:700;background:#FDE3DF;color:#C9483C;border-radius:16px;padding:16px 0;text-align:center">${code}</div>
    <p style="font-size:13px;color:#8A8079;margin-top:20px">10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。</p>
  </div>
</div>`,
  });
}
