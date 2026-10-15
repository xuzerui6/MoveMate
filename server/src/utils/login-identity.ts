// Reserved operator identity; ordinary registration does not accept this domain.
export const ADMIN_LOGIN_EMAIL = 'admin@movemate.local';
export function loginEmail(value: string): string {
  const account = value.trim().toLowerCase();
  return account === 'admin' ? ADMIN_LOGIN_EMAIL : account;
}
