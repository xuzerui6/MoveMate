const BASE = 'http://localhost:3000/api/v1';

async function post(path: string, data: any, token?: string) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(data) });
  return res.json();
}

async function main() {
  // Register
  const email = `j${Date.now()}@t.com`;
  const reg = await post('/auth/register', { nickname: 'host', email, password: '123456' });
  console.log('Register host:', reg.code === 0 ? 'OK' : reg.message);
  const hostToken = reg.data?.token;
  if (!hostToken) { console.log('No token'); return; }

  // Create game
  const create = await post('/games', { sport_type: 'basketball', location: '东操场', max_players: 5, start_time: '2026-05-30T19:00:00.000Z' }, hostToken);
  console.log('Create:', create.code === 0 ? `Game ${create.data?.game?.id}` : JSON.stringify(create));
  const gameId = create.data?.game?.id;
  if (!gameId) return;

  // Register second user
  const email2 = `j2_${Date.now()}@t.com`;
  const reg2 = await post('/auth/register', { nickname: 'player', email: email2, password: '123456' });
  console.log('Register player:', reg2.code === 0 ? 'OK' : reg2.message);
  const playerToken = reg2.data?.token;
  if (!playerToken) return;

  // Join
  const join = await post(`/games/${gameId}/join`, {}, playerToken);
  console.log('Join:', join.code === 0 ? 'OK' : JSON.stringify(join));
}

main().catch(err => console.error('Error:', err.message));
