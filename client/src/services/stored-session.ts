/** UI consistency only; the server still verifies JWT signatures and permissions. */
export function readStoredSession(token: string | null, serializedUser: string | null): { token: string; user: { id: string | number; nickname: string } & Record<string, unknown> } | null {
  if (!token || !serializedUser) return null;
  try {
    const user = JSON.parse(serializedUser);
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload));
    // token and user are separate storage writes. Never render a mixed pair
    // while another tab is between those two writes during an account change.
    if (!user || typeof user.nickname !== 'string' || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0 || String(claims.sub) !== String(user.id)) return null;
    return { token, user };
  } catch { return null; }
}
