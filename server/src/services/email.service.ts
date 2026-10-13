import nodemailer from 'nodemailer';
import { config } from '../config';

// QQ 邮箱 SMTP 配置
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

const headerBlock = `
<div style="background:#0F172A;padding:1.2rem;border-radius:12px 12px 0 0;text-align:center">
  <span style="font-size:1.6rem">🏀</span>
  <h1 style="color:#fff;font-size:1.15rem;margin:0.3rem 0 0">搭个局</h1>
  <p style="color:#94A3B8;font-size:0.8rem;margin:0.15rem 0 0">校园约局 · 吉林大学</p>
</div>`;

const footerBlock = `
<div style="text-align:center;padding-top:0.75rem">
  <p style="color:#94A3B8;font-size:0.7rem;margin:0">此邮件由系统自动发送，请勿回复。</p>
</div>`;

export async function sendVerificationCode(to: string, code: string): Promise<void> {
  const html = `
    <div style="max-width:460px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      ${headerBlock}
      <div style="background:#fff;padding:1.25rem;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
        <p style="color:#1A1A2E;font-size:0.9rem;margin:0 0 0.5rem">你的验证码：</p>
        <div style="background:#F8FAFC;padding:0.85rem;border-radius:8px;text-align:center;margin-bottom:0.85rem">
          <span style="font-size:1.8rem;font-weight:800;color:#0F172A;letter-spacing:5px">${code}</span>
        </div>
        <p style="color:#94A3B8;font-size:0.75rem;margin:0">验证码 5 分钟内有效，请勿转发给他人。</p>
        ${footerBlock}
      </div>
    </div>`;

  await transporter.sendMail({
    from: config.smtp.user,
    to,
    subject: '搭个局 - 校园邮箱验证码',
    html,
  });
}

/** 发送活动相关通知邮件 */
export async function sendGameEmail(
  to: string,
  subject: string,
  title: string,
  content: string,
  gameTitle: string,
  timeStr: string,
  locationStr: string,
): Promise<void> {
  // SMTP 未配置时跳过
  if (!config.smtp.user || !config.smtp.pass) return;

  const locationRow = locationStr
    ? `<p style="font-size:0.82rem;color:#0F172A;margin:0.2rem 0 0"><strong>地点：</strong>${locationStr}</p>`
    : '';

  const html = `
    <div style="max-width:460px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      ${headerBlock}
      <div style="background:#fff;padding:1.25rem;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
        <p style="color:#1A1A2E;font-size:1rem;font-weight:700;margin:0 0 0.4rem">${title}</p>
        <p style="color:#475569;font-size:0.85rem;line-height:1.55;margin:0 0 0.6rem">${content}</p>
        <div style="background:#F8FAFC;padding:0.7rem 0.85rem;border-radius:8px;margin-bottom:0.5rem">
          <p style="font-size:0.82rem;color:#0F172A;margin:0"><strong>活动：</strong>${gameTitle}</p>
          <p style="font-size:0.82rem;color:#0F172A;margin:0.2rem 0 0"><strong>时间：</strong>${timeStr}</p>
          ${locationRow}
        </div>
        ${footerBlock}
      </div>
    </div>`;

  try {
    await transporter.sendMail({ from: config.smtp.user, to, subject, html });
  } catch (err) {
    console.error(`[Email] 发送活动通知失败 (to=${to}): ${(err as Error).message}`);
  }
}
