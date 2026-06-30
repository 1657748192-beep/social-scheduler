import nodemailer from "nodemailer";
import { config } from "../config";

type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};

function isSmtpConfigured() {
  return Boolean(config.SMTP_HOST && config.SMTP_PORT && config.SMTP_FROM);
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput) {
  if (!isSmtpConfigured()) {
    console.warn(
      `[password-reset] SMTP is not configured. Reset link for ${input.to}: ${input.resetUrl}`
    );
    return { sent: false, reason: "smtp_not_configured" as const };
  }

  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER
      ? {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS
        }
      : undefined
  });

  await transporter.sendMail({
    from: config.SMTP_FROM,
    to: input.to,
    subject: "Social Scheduler 密码重置",
    text: [
      "你正在重置 Social Scheduler 账号密码。",
      `请在 ${input.expiresInMinutes} 分钟内打开下面的链接设置新密码：`,
      input.resetUrl,
      "",
      "如果不是你本人操作，可以忽略这封邮件。"
    ].join("\n"),
    html: [
      "<p>你正在重置 <strong>Social Scheduler</strong> 账号密码。</p>",
      `<p>请在 ${input.expiresInMinutes} 分钟内打开下面的链接设置新密码：</p>`,
      `<p><a href="${input.resetUrl}">${input.resetUrl}</a></p>`,
      "<p>如果不是你本人操作，可以忽略这封邮件。</p>"
    ].join("")
  });

  return { sent: true, reason: null };
}
