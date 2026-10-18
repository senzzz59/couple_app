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

export type ReleaseNote = { version: string | null; date: string; title: string; changes: { type: string; text: string }[] };
export type DeployNotice = { version: string | null; commit: string; deployedAt: string; releases: ReleaseNote[] };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const TAG: Record<string, { label: string; bg: string; ink: string }> = {
  new: { label: '新功能', bg: '#FCEAEF', ink: '#DC5378' },
  improve: { label: '优化', bg: '#F2EEEA', ink: '#7D6A5F' },
  fix: { label: '修复', bg: '#FBEBE0', ink: '#99573A' },
};

/** 部署完成通知：版本号、时间、这次带来的更新 */
export function deployMail(n: DeployNotice, tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(n.deployedAt)).map((p) => [p.type, p.value]));
  const when = `${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
  const day = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(5, 7))}月${Number(d.slice(8))}日` : d);
  const version = n.version ? `v${n.version}` : '新版本';
  const subject = `us. 已部署 ${version}${n.releases[0] ? ` · ${n.releases[0].title}` : ''}`;
  const text = [
    `us. 自动部署完成：${version}`,
    `时间：${when}　提交：${n.commit.slice(0, 7)}`,
    '',
    ...(n.releases.length
      ? n.releases.flatMap((r) => [`${r.version ? `v${r.version} ` : ''}${r.title}`, ...r.changes.map((c) => `  · [${TAG[c.type]?.label ?? '更新'}] ${c.text}`), ''])
      : ['这次没有写更新记录（可能是小修小补）。']),
  ].join('\n');
  const releases = n.releases.length
    ? n.releases
        .map(
          (r) => `<div style="border:1px solid #ECE5E5;border-radius:18px;padding:18px 18px 14px;margin-top:14px">
      <div style="font-size:12px;color:#948A8D">${r.version ? `<span style="display:inline-block;background:#F4EFED;color:#5C4E53;border-radius:999px;padding:2px 9px;font-weight:700;margin-right:8px">v${esc(r.version)}</span>` : ''}${esc(day(r.date))}</div>
      <div style="font-size:17px;font-weight:700;color:#2A1F23;margin:10px 0 8px">${esc(r.title)}</div>
      ${r.changes
        .map((c) => {
          const t = TAG[c.type] ?? TAG.improve;
          return `<div style="font-size:14px;line-height:21px;color:#2A1F23;margin:6px 0"><span style="display:inline-block;background:${t.bg};color:${t.ink};border-radius:7px;padding:0 7px;font-size:11px;font-weight:700;margin-right:8px;line-height:20px">${t.label}</span>${esc(c.text)}</div>`;
        })
        .join('')}
    </div>`
        )
        .join('')
    : `<p style="font-size:14px;color:#948A8D;margin-top:16px">这次没有写更新记录（可能是小修小补）。</p>`;
  const html = `<div style="background:#FAF7F5;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif">
  <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:24px;padding:30px 26px;color:#2A1F23">
    <div style="font-family:Georgia,serif;font-style:italic;font-size:30px">us.</div>
    <div style="margin-top:18px;display:inline-block;background:#FCEAEF;color:#DC5378;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700">部署完成</div>
    <div style="font-size:26px;font-weight:800;margin-top:10px">${esc(version)}</div>
    <div style="font-size:13px;color:#948A8D;margin-top:4px">${esc(when)} · 提交 ${esc(n.commit.slice(0, 7))}</div>
    ${releases}
    <p style="font-size:12px;color:#CDC4C6;margin-top:22px">在 us. 的「我的 → 关于」里可以看全部更新记录。不想收到这封邮件：在服务器 backend.env 里把 DEPLOY_NOTIFY_EMAIL 设成 off。</p>
  </div>
</div>`;
  return { subject, text, html };
}

/** 发部署通知；没配置 SMTP 时只打日志 */
export async function sendDeployMail(to: string[], n: DeployNotice, tz: string, log: (msg: string) => void) {
  const mail = deployMail(n, tz);
  if (!transport) {
    log(`[deploy] SMTP 未配置，部署通知没有发出：${mail.subject}`);
    return false;
  }
  await transport.sendMail({ from: env.smtp.from, to: to.join(', '), subject: mail.subject, text: mail.text, html: mail.html });
  return true;
}

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
