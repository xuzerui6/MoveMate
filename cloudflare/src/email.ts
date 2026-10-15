// SMTP is intentionally unconfigured on this deployment. Never report a sent code.
export async function sendVerificationCode(): Promise<never> { throw new Error('邮件服务未配置，请联系管理员'); }
export async function sendGameEmail(): Promise<void> {}
