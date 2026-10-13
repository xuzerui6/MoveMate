const BASE = 'http://localhost:3000/api/v1';

async function post(path: string, data: any, token?: string) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(data) });
  return res.json();
}

async function get(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Authorization': `Bearer ${token}` } });
  return res.json();
}

async function main() {
  // Register
  const email = `test${Date.now()}@test.com`;
  const reg = await post('/auth/register', { nickname: 'test', email, password: '123456' });
  console.log('Register:', reg.code === 0 ? 'OK' : reg.message);
  const token = reg.data.token;

  // Create game
  const create = await post('/games', { sport_type: 'basketball', location: '东操场', max_players: 5, start_time: '2026-05-30T19:00:00.000Z' }, token);
  console.log('Create:', create.code === 0 ? `Game ${create.data.game.id}` : create.message);
  const gameId = create.data.game.id;

  // Cancel
  const cancel = await post(`/games/${gameId}/cancel`, {}, token);
  console.log('Cancel:', cancel.code === 0 ? 'OK' : JSON.stringify(cancel));

  // Verify
  const detail = await get(`/games/${gameId}`, token);
  console.log('Status:', detail.data?.game?.status || detail.message);
}

main().catch(console.error);
