import { test } from 'node:test';
import assert from 'node:assert/strict';
import client from '../src/api/client.ts';
import { fetchBootstrap, getMe, getPublicUser, login, register, sendVerifyCode, updateProfile, verifyStudentCode } from '../src/api/auth.ts';
import {
  createGame,
  fetchEndSummary,
  fetchFriendsFeed,
  fetchGameDetail,
  fetchGames,
  fetchMyGames,
  fetchShareLink,
  inviteToGame,
  removeMyGame,
  setFillOpen,
} from '../src/api/games.ts';
import * as gamesApi from '../src/api/games.ts';
import { fetchMessages } from '../src/api/messages.ts';
import { fetchNotifications, fetchUnreadCount } from '../src/api/notifications.ts';
import { fetchLeaderboard } from '../src/api/users.ts';
import {
  acceptFriendRequest,
  blockUser,
  createReport,
  deleteFriend,
  fetchBlocks,
  fetchFriends,
  fetchIncomingRequests,
  fetchMyInvite,
  fetchRecentPartners,
  fetchSocialSettings,
  previewInvite,
  rejectFriendRequest,
  sendFriendRequest,
  unblockUser,
  updateSocialSettings,
} from '../src/api/social.ts';
import { confirmParticipation, createFight, fetchFight, fetchFightLatency, joinFight, leaveFight, linkSession, recordSegment, saveRecordNote, setReady, settleSegments, startFight } from '../src/api/bossFight.ts';

// API 契约测试（2026-11-14，Codex 交叉评审提案落地）：
// 用真实 axios client + 自定义 adapter（模式沿用 auth-recovery.test.ts），
// adapter 一律返回完整服务端信封 {code, message, data}，再逐个调用真实
// api 函数，断言解析值满足它各自消费方的契约。
//
// 本仓的信封约定是混合制（Codex 2026-11-13 审计结论，不是统一约定）：
// - auth / notifications / users / social / bossFight 以及 games 的社交期
//   新增函数：在 api 层内解包，消费方直接读内层字段；
// - games 的老函数（fetchGames / fetchGameDetail / createGame /
//   fetchMyGames 等）与 messages.fetchMessages：原样透传信封，消费方用
//   res.data || res 自行解包。这些消费方真正依赖的是载荷的包装形状
//   （{games, pagination} / {game, members} / {game} / {messages} /
//   裸数组），对「信封还是载荷」本身反而宽容（res.data || res 两头
//   都吃）。本文件对透传族的断言锁的是：当前透传行为（表征）+ 包装
//   形状不许变（回归保护）——把包装拆掉（createGame 只剩 {game}、
//   fetchMessages 只剩裸数组）会立刻打坏消费方的提取链，这才是要防的
//   （Codex 2026-11-14 复核订正了初版「消费方要求信封原样」的说法）。
// 所以本文件按每个函数自己的消费方契约断言，不按一把尺子量。
//
// fetchGameMeta 与 rebookGame 已由 game-meta-envelope.test.ts 覆盖
// （2026-11-13 事故的回归锁），这里不重复。

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
  configurable: true,
});
Object.defineProperty(globalThis, 'window', {
  value: { location: { pathname: '/train', href: '' } },
  configurable: true,
});

interface CapturedRequest {
  method: string;
  url: string;
  params: Record<string, unknown> | undefined;
  body: any;
}

let captured: CapturedRequest[] = [];
let handler: ((req: CapturedRequest) => unknown) | null = null;

function installAdapter() {
  captured = [];
  const originalAdapter = client.defaults.adapter;
  client.defaults.adapter = async (config) => {
    let body: any = config.data;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { /* 保持原样 */ }
    }
    const req: CapturedRequest = {
      method: (config.method ?? 'get').toLowerCase(),
      url: config.url ?? '',
      params: config.params as Record<string, unknown> | undefined,
      body,
    };
    captured.push(req);
    if (!handler) throw new Error('api-contract: no handler installed');
    const payload = handler(req);
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { code: 0, message: 'success', data: payload },
    };
  };
  return () => {
    client.defaults.adapter = originalAdapter;
    handler = null;
  };
}

function route(method: string, pattern: RegExp, payload: unknown) {
  return (req: CapturedRequest) => {
    if (req.method === method && pattern.test(req.url)) return payload;
    throw new Error(`api-contract: unexpected request ${req.method} ${req.url}`);
  };
}

/** 依次匹配多条路由的 handler */
function routes(...rs: Array<(req: CapturedRequest) => unknown>) {
  return (req: CapturedRequest) => {
    let lastError: unknown;
    for (const r of rs) {
      try { return r(req); } catch (e) { lastError = e; }
    }
    throw lastError;
  };
}

// ---------------------------------------------------------------------------
// Fixtures（形状照服务端真实返回：server/src/routes + services）
// ---------------------------------------------------------------------------

const rawUser = {
  id: 7,
  nickname: '泽瑞',
  avatar_url: 'https://cdn.example/avatar7.png',
  email: 'xuzerui@jlu.example',
  campus_verified: true,
  school_id: 2,
  campus_id: 5,
  school_name: '吉林体育学院',
  campus_name: '临河校区',
  reward_points: 120,
  reward_level: 3,
  sport_preferences: ['fitness'],
};

const gameFixture = (id: number) => ({
  id,
  host_id: 7,
  sport_type: 'fitness',
  status: 'recruiting',
  campus_id: 5,
  venue_id: 37,
  start_time: '2026-11-15T10:00:00.000Z',
  max_players: 6,
  current_players: 2,
});

const snapshotFixture = {
  id: 'fight-1',
  game_id: 9,
  boss_id: 'aoye_yanshi',
  boss_name: '熬夜魇狮',
  movement: 'squat',
  status: 'gathering',
  max_hp: 100,
  hp: 100,
  version: 1,
  duration_sec: 300,
  created_by: 7,
  created_at: '2026-11-13T15:00:00.000Z',
  started_at: null,
  ends_at: null,
  ended_at: null,
  server_ts: 1763040000000,
  participants: [
    { user_id: 7, nickname: '泽瑞', avatar: '', ready: false, status: 'joined', has_session: false },
  ],
  my_reward: null,
};

// ---------------------------------------------------------------------------
// auth：api 层解包 + 用户归一化（消费方 authStore 直接解构 {token, user}）
// ---------------------------------------------------------------------------

test('contract: login unwraps the envelope and normalizes the user', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/auth\/login$/, { token: 'tok-1', user: rawUser });
  try {
    const session = await login({ email: 'xuzerui@jlu.example', password: 'pw' } as any);
    assert.equal(session.token, 'tok-1');
    assert.equal(session.user.id, '7'); // 归一化：数字 id 转字符串
    assert.equal(session.user.avatar, 'https://cdn.example/avatar7.png'); // avatar_url 兜底
    assert.equal(session.user.school_name, '吉林体育学院');
    assert.equal((session as any).code, undefined); // 信封字段不许漏出
    assert.equal((session.user as any).avatar_url, undefined);
  } finally { restore(); }
});

test('contract: register returns the same normalized session shape', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/auth\/register$/, { token: 'tok-2', user: rawUser });
  try {
    const session = await register({ email: 'a@b.example', password: 'pw', nickname: '泽瑞' } as any);
    assert.equal(session.token, 'tok-2');
    assert.equal(session.user.id, '7');
    assert.equal(session.user.nickname, '泽瑞');
  } finally { restore(); }
});

test('contract: getMe unwraps a bare user payload and normalizes it', async () => {
  const restore = installAdapter();
  handler = route('get', /^\/users\/me$/, rawUser); // 服务端 data 直接是 profile
  try {
    const me = await getMe();
    assert.equal(me.id, '7');
    assert.equal(me.campus_name, '临河校区');
    assert.equal(me.reward_points, 120);
  } finally { restore(); }
});

test('contract: updateProfile unwraps the {user} wrapper before normalizing', async () => {
  const restore = installAdapter();
  // 服务端 PUT /users/me 返回 data: { user }（user.routes.ts 实测）
  handler = route('put', /^\/users\/me$/, { user: { ...rawUser, nickname: '新名字' } });
  try {
    const me = await updateProfile({ nickname: '新名字' });
    assert.equal(me.id, '7');
    assert.equal(me.nickname, '新名字');
  } finally { restore(); }
});

test('contract: updateProfile maps request fields (avatar→avatar_url, preferences→JSON string)', async () => {
  const restore = installAdapter();
  handler = route('put', /^\/users\/me$/, { user: rawUser });
  try {
    await updateProfile({
      nickname: '泽瑞',
      avatar: 'https://cdn.example/new.png',
      campus_id: 5,
      qq_email: '123@qq.example',
      sport_preferences: ['fitness', 'running'],
    });
    const body = captured[0].body;
    assert.equal(body.nickname, '泽瑞');
    assert.equal(body.avatar_url, 'https://cdn.example/new.png'); // avatar 改名 avatar_url
    assert.equal(body.campus_id, 5);
    assert.equal(body.qq_email, '123@qq.example');
    assert.equal(body.sport_preferences, '["fitness","running"]'); // 数组序列化成 JSON 字符串
    assert.equal(body.avatar, undefined);
  } finally { restore(); }
});

test('contract: sendVerifyCode posts {email} to /verify/send and completes', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/verify\/send$/, {});
  try {
    await sendVerifyCode('xuzerui@jlu.example');
    assert.deepEqual(captured[0].body, { email: 'xuzerui@jlu.example' });
    // 消费方 Profile 只 await 完成与否，不读返回值——不锁解析值形状
    // （函数声明 Promise<void> 却透传信封，是已知的小谎言，归类型清理）
  } finally { restore(); }
});

test('contract: verifyStudentCode returns a normalized session', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/auth\/verify-email$/, { token: 'tok-3', user: rawUser });
  try {
    const session = await verifyStudentCode('123456');
    assert.equal(session.token, 'tok-3');
    assert.equal(session.user.id, '7');
    assert.equal(session.user.campus_verified, true);
  } finally { restore(); }
});

test('contract: getPublicUser returns the public profile payload', async () => {
  const restore = installAdapter();
  const profile = {
    id: 8, nickname: '同学', avatar_url: 'https://cdn.example/a8.png',
    department: '体育教育', sport_preferences: ['running'], reward_streak: 4,
  };
  handler = route('get', /^\/users\/public\/8$/, profile);
  try {
    const result = await getPublicUser('8');
    assert.deepEqual(result, profile);
  } finally { restore(); }
});

test('contract: fetchBootstrap yields schools/campuses without envelope fields', async () => {
  const restore = installAdapter();
  const bootstrap = {
    school: { id: 2, code: 'jlsu', name: '吉林体育学院' },
    schools: [{ id: 1, code: 'jlu', name: '吉林大学' }, { id: 2, code: 'jlsu', name: '吉林体育学院' }],
    campuses: [{ id: 5, school_id: 2, code: 'jlsu-linhe', name: '临河校区' }],
  };
  handler = route('get', /^\/auth\/bootstrap$/, bootstrap);
  try {
    const result = await fetchBootstrap();
    assert.deepEqual(result.campuses, bootstrap.campuses);
    assert.deepEqual(result.schools, bootstrap.schools);
    assert.equal((result as any).code, undefined);
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// client 拦截器守卫：gym 与 Admin 直接吃信封，拦截器不许全局解包
// （这是 Codex 两轮审计都点名的红线——改拦截器先过这条测试）
// ---------------------------------------------------------------------------

test('contract: the shared client resolves with the full envelope (gym/Admin depend on it)', async () => {
  const restore = installAdapter();
  const payload = { list: [{ id: 7, nickname: '泽瑞' }], total: 1, page: 1 };
  handler = route('get', /^\/admin\/users$/, payload);
  try {
    const res = (await client.get('/admin/users')) as any;
    // Admin/UserList 读 r.data.list/total/page；features/gym/api 的
    // request() 读并缓存 response.data——两者都要求拦截器只剥 HTTP
    // 层、把 {code, message, data} 信封原样交出来。
    assert.equal(res.code, 0);
    assert.equal(res.message, 'success');
    assert.deepEqual(res.data, payload);
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// games 老函数：透传信封族（消费方 gameStore / useGameDetail / CreateGame /
// Profile / useChat 用 res.data || res 自行解包）
// ---------------------------------------------------------------------------

test('contract: fetchGames passes the envelope through (store reads .data.games/.data.pagination)', async () => {
  const restore = installAdapter();
  const games = [gameFixture(1), gameFixture(2)];
  const pagination = { page: 1, page_size: 2, total: 5, total_pages: 3 };
  handler = route('get', /^\/games$/, { games, pagination });
  try {
    const res = (await fetchGames({ page: 1, size: 2 })) as any;
    assert.equal(res.code, 0);
    assert.deepEqual(res.data.games, games);
    assert.deepEqual(res.data.pagination, pagination); // 服务端形状 {games, pagination{page,page_size,total,total_pages}}
    // 请求侧：size 必须翻译成 page_size，且不许把 size 原样发出去
    assert.equal(captured[0].params?.page_size, 2);
    assert.equal(captured[0].params?.size, undefined);
    assert.equal(captured[0].params?.page, 1);
  } finally { restore(); }
});

test('contract: fetchGameDetail passes the envelope through (hook reads .data.game/.data.members)', async () => {
  const restore = installAdapter();
  const payload = { game: gameFixture(9), members: [{ user_id: 7, nickname: '泽瑞' }, { user_id: 8, nickname: '同学' }] };
  handler = route('get', /^\/games\/9$/, payload);
  try {
    const res = (await fetchGameDetail('9')) as any;
    assert.equal(res.data.game.id, 9);
    assert.equal(res.data.members.length, 2);
  } finally { restore(); }
});

test('contract: createGame passes the envelope through (page extracts res.data.game.id)', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/games$/, { game: gameFixture(10) });
  try {
    const res = (await createGame({ sport_type: 'fitness', campus_id: 5 } as any)) as any;
    assert.equal(res.data?.game?.id, 10); // CreateGame.tsx 的提取链 res.data?.game || res.data || res 必须落到 game
  } finally { restore(); }
});

test('contract: fetchMyGames — Profile extraction yields the array from the enveloped bare-array payload', async () => {
  const restore = installAdapter();
  const mine = [gameFixture(3), gameFixture(4)]; // 服务端 data 直接是数组（user.routes.ts 实测）
  handler = route('get', /^\/users\/me\/games$/, mine);
  try {
    const res = (await fetchMyGames()) as any;
    const body = res.data || res; // Profile.tsx 的原样解包
    assert.ok(Array.isArray(body));
    assert.deepEqual(body, mine);
  } finally { restore(); }
});

test('contract: game action calls complete and send the right requests (consumers ignore the return value)', async () => {
  const restore = installAdapter();
  handler = routes(
    route('post', /^\/games\/9\/join$/, { game: gameFixture(9), member_count: 3 }), // 服务端真实形状 {game, member_count}
    route('post', /^\/games\/9\/leave$/, { game: gameFixture(9), member_count: 2 }),
    route('post', /^\/games\/9\/check-in$/, { checked_in_at: '2026-11-15T09:55:00.000Z' }),
    route('post', /^\/games\/9\/attendance\/confirm$/, { confirmed: true }),
    route('post', /^\/games\/9\/cancel$/, { game: gameFixture(9) }),
    route('post', /^\/games\/9\/start$/, {}),
    route('post', /^\/games\/9\/complete$/, {}),
    route('delete', /^\/users\/me\/games\/9$/, { game_id: 9 }),
  );
  try {
    // 消费方（useGameDetail / Profile）一律 await 后重拉或改本地状态，
    // 不读返回值形状——契约是「请求发对 + 成功完成」，不是信封形状。
    // 初版曾断言 res.code===0（信封原样），Codex 复核判定为过度约束：
    // 返回值将来收敛为 payload 或 void 同样满足消费方，属类型清理范围，
    // 不在本文件锁死。
    await gamesApi.joinGame('9');
    await gamesApi.leaveGame('9');
    await gamesApi.checkInGame('9');
    await gamesApi.confirmAttendance('9', '8'); // 字符串入参也必须翻译成数字 user_id
    await gamesApi.cancelGame('9');
    await gamesApi.confirmStart('9');
    await gamesApi.confirmEnd('9');
    await removeMyGame('9');
    const confirmReq = captured.find((r) => r.url.includes('/attendance/confirm'));
    assert.deepEqual(confirmReq?.body, { user_id: 8 });
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// games 社交期新增函数：api 层解包族（消费方直接读内层）
// ---------------------------------------------------------------------------

test('contract: fetchFriendsFeed returns the games array itself', async () => {
  const restore = installAdapter();
  const games = [gameFixture(11)];
  handler = route('get', /^\/games\/friends-feed$/, { games });
  try {
    assert.deepEqual(await fetchFriendsFeed(), games);
  } finally { restore(); }
});

test('contract: inviteToGame returns {invited, skipped} and posts {userIds}', async () => {
  const restore = installAdapter();
  const payload = { invited: [8, 9], skipped: [{ user_id: 10, reason: '对方已在局里' }] };
  handler = route('post', /^\/games\/9\/invites$/, payload);
  try {
    assert.deepEqual(await inviteToGame('9', [8, 9, 10]), payload);
    assert.deepEqual(captured[0].body, { userIds: [8, 9, 10] });
  } finally { restore(); }
});

test('contract: setFillOpen returns the inner game', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/games\/9\/fill$/, { game: gameFixture(9) });
  try {
    const game = await setFillOpen('9', true);
    assert.equal((game as any)?.id, 9);
    assert.deepEqual(captured[0].body, { open: true });
  } finally { restore(); }
});

test('contract: fetchShareLink returns the link payload', async () => {
  const restore = installAdapter();
  const payload = { game_id: 9, path: '/game/9', title: '来一起练' };
  handler = route('get', /^\/games\/9\/share-link$/, payload);
  try {
    assert.deepEqual(await fetchShareLink('9'), payload);
  } finally { restore(); }
});

test('contract: removeMember posts an empty body and returns the inner result', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/games\/9\/members\/8\/remove$/, { removed: true });
  try {
    assert.deepEqual(await gamesApi.removeMember('9', 8), { removed: true });
    assert.deepEqual(captured[0].body, {});
  } finally { restore(); }
});

test('contract: fetchEndSummary returns the summary payload', async () => {
  const restore = installAdapter();
  const payload = {
    game: gameFixture(9),
    attendees: [{ user_id: 7, nickname: '泽瑞', avatar_url: '', friendship_status: 'self' }],
    my_stats: { xp: 20, effective_ms: 600000, reps: 30 },
    rebooked_game_id: null,
  };
  handler = route('get', /^\/games\/9\/end-summary$/, payload);
  try {
    assert.deepEqual(await fetchEndSummary('9'), payload as any);
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// messages：透传信封族（useChat 读 response.data.messages 并自行归一化）
// ---------------------------------------------------------------------------

test('contract: fetchMessages passes the envelope through (useChat reads .data.messages)', async () => {
  const restore = installAdapter();
  const messages = [
    { id: 2, game_id: 9, sender_id: 8, content: '第二条', created_at: '2026-11-15 10:01:00' },
    { id: 1, game_id: 9, sender_id: 7, content: '第一条', created_at: '2026-11-15 10:00:00' },
  ];
  handler = route('get', /^\/games\/9\/messages$/, { messages });
  try {
    const res = (await fetchMessages('9')) as any;
    assert.deepEqual(res.data.messages, messages); // 服务端形状 {messages}，不是裸数组
    const res2 = (await fetchMessages('9', '41')) as any;
    assert.deepEqual(res2.data.messages, messages);
    assert.equal(captured[1].params?.before_id, '41'); // 请求侧：before → before_id
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// notifications：api 层解包 + 归一化（消费方 notificationStore 读
// .notifications / .unreadCount / .count）
// ---------------------------------------------------------------------------

test('contract: fetchNotifications normalizes the list and the unread count', async () => {
  const restore = installAdapter();
  const payload = {
    notifications: [
      { id: 3, type: 'game_ready', title: '局要开始了', content: '正文兜底', game_id: 9, is_read: 0, created_at: '2026-11-13 08:30:00' },
    ],
    unread_count: 2,
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
  };
  handler = route('get', /^\/notifications$/, payload);
  try {
    const result = await fetchNotifications(1);
    assert.equal(result.unreadCount, 2); // unread_count → unreadCount
    assert.equal(result.notifications.length, 1);
    const n = result.notifications[0];
    assert.equal(n.id, '3');
    assert.equal(n.type, 'game_starting'); // game_ready 归一为 game_starting
    assert.equal(n.body, '正文兜底'); // body 缺失时用 content 兜底
    assert.equal(n.game_id, '9');
    assert.equal(n.is_read, false);
    assert.equal(n.created_at, '2026-11-13T08:30:00Z'); // 服务端空格时间戳 → ISO Z
  } finally { restore(); }
});

test('contract: fetchUnreadCount maps unread_count to {count}', async () => {
  const restore = installAdapter();
  handler = route('get', /^\/notifications\/unread-count$/, { unread_count: 4 });
  try {
    assert.deepEqual(await fetchUnreadCount(), { count: 4 });
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// users：排行榜（消费方 Leaderboard 读 .rankings / .current_user）
// ---------------------------------------------------------------------------

const leaderboardPayload = (currentUser: unknown) => ({
  rankings: [
    { rank: 1, id: 7, nickname: '泽瑞', avatar_url: 'https://cdn.example/avatar7.png', reward_points: 120, reward_level: 3, reward_streak: 5, completed_games: 9, hosted_completed_games: 2 },
    { rank: 2, id: 8, nickname: '同学', reward_points: 90 },
  ],
  current_user: currentUser,
});

test('contract: fetchLeaderboard normalizes entries and keeps current_user', async () => {
  const restore = installAdapter();
  handler = route('get', /^\/users\/leaderboard$/, leaderboardPayload({ rank: 1, id: 7, nickname: '泽瑞', reward_points: 120 }));
  try {
    const result = await fetchLeaderboard();
    assert.equal(result.rankings.length, 2);
    assert.equal(result.rankings[0].id, '7'); // 归一化：数字 id 转字符串
    assert.equal(result.rankings[0].avatar, 'https://cdn.example/avatar7.png');
    assert.equal(result.rankings[1].reward_level, 1); // 缺省字段补默认
    assert.equal(result.current_user?.rank, 1);
    assert.equal(result.current_user?.id, '7');
  } finally { restore(); }
});

test('contract: fetchLeaderboard preserves current_user: null (not logged / unranked)', async () => {
  const restore = installAdapter();
  handler = route('get', /^\/users\/leaderboard$/, leaderboardPayload(null));
  try {
    const result = await fetchLeaderboard();
    assert.equal(result.current_user, null); // 可空契约：不许被归一化成假条目
    assert.equal(result.rankings.length, 2);
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// social：api 层解包族（消费方 Friends 页 / 各弹窗直接读内层数组与对象）
// ---------------------------------------------------------------------------

test('contract: social list endpoints return the inner arrays', async () => {
  const restore = installAdapter();
  handler = routes(
    route('get', /^\/friends$/, { friends: [{ user_id: 8, nickname: '同学' }] }),
    route('get', /^\/friends\/recent-partners$/, { partners: [{ user_id: 9, nickname: '伙伴' }] }),
    route('get', /^\/friends\/requests$/, { requests: [{ id: 5, from_user_id: 8 }] }),
    route('get', /^\/blocks$/, { blocks: [{ user_id: 10, nickname: '已拉黑' }] }),
  );
  try {
    assert.deepEqual(await fetchFriends(), [{ user_id: 8, nickname: '同学' }]);
    assert.deepEqual(await fetchRecentPartners(), [{ user_id: 9, nickname: '伙伴' }]);
    assert.deepEqual(await fetchIncomingRequests(), [{ id: 5, from_user_id: 8 }]);
    assert.deepEqual(await fetchBlocks(), [{ user_id: 10, nickname: '已拉黑' }]);
  } finally { restore(); }
});

test('contract: fetchMyInvite returns the invite object itself', async () => {
  const restore = installAdapter();
  const invite = {
    invite_code: 'ABC123',
    invite_path: '/invite/ABC123',
    inviter: { id: 7, nickname: '泽瑞', avatar_url: '', department: '运动训练学院' },
  };
  handler = route('get', /^\/users\/me\/invite$/, invite);
  try {
    assert.deepEqual(await fetchMyInvite(), invite);
  } finally { restore(); }
});

test('contract: previewInvite maps the inviter into the public profile shape', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/friends\/invite-preview$/, {
    inviter: { id: 8, nickname: '同学', avatar_url: 'https://cdn.example/a8.png', department: '体育教育', sport_preferences: ['running'] },
  });
  try {
    const profile = await previewInvite('ABC123');
    assert.deepEqual(profile, {
      id: '8', // 归一化：数字 id 转字符串
      nickname: '同学',
      avatar_url: 'https://cdn.example/a8.png',
      department: '体育教育',
      sport_preferences: ['running'],
    });
    assert.deepEqual(captured[0].body, { inviteCode: 'ABC123' });
  } finally { restore(); }
});

test('contract: fetchSocialSettings returns the settings object', async () => {
  const restore = installAdapter();
  handler = route('get', /^\/users\/me\/social-settings$/, { friend_request_scope: 'played_together' });
  try {
    assert.deepEqual(await fetchSocialSettings(), { friend_request_scope: 'played_together' });
  } finally { restore(); }
});

test('contract: sendFriendRequest posts the camel/snake mixed request body the server expects', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/friends\/requests$/, { request: { id: 6 } });
  try {
    await sendFriendRequest({ userId: 8, sourceGameId: 55 });
    assert.equal(captured[0].body.userId, 8);
    // 服务端 zod 两种拼写都收（userId/user_id、inviteCode/invite_code），
    // 唯独 source_game_id 没有驼峰版；本断言锁的是客户端当前发出的线
    // 格式，不是服务端唯一接受的格式（Codex 复核订正初版注释的说法）
    assert.equal(captured[0].body.source_game_id, 55);
    assert.equal(captured[0].body.inviteCode, undefined);
    assert.equal(captured[0].body.greeting, undefined);
  } finally { restore(); }
});

test('contract: sendFriendRequest invite-code path posts inviteCode and greeting', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/friends\/requests$/, { request: { id: 7 } });
  try {
    // InviteFriend 落地页走的是这条路：只有邀请码 + 一句问候，没有 userId
    await sendFriendRequest({ inviteCode: 'ABC123', greeting: '一起练' });
    assert.equal(captured[0].body.inviteCode, 'ABC123');
    assert.equal(captured[0].body.greeting, '一起练');
    assert.equal(captured[0].body.userId, undefined);
    assert.equal(captured[0].body.source_game_id, undefined);
  } finally { restore(); }
});

test('contract: blockUser posts {userId}; updateSocialSettings posts the scope for both values', async () => {
  const restore = installAdapter();
  handler = routes(
    route('post', /^\/blocks$/, {}),
    route('put', /^\/users\/me\/social-settings$/, { friend_request_scope: 'anyone' }),
  );
  try {
    await blockUser(8);
    assert.deepEqual(captured[0].body, { userId: 8 });
    await updateSocialSettings('anyone');
    assert.deepEqual(captured[1].body, { friend_request_scope: 'anyone' });
    await updateSocialSettings('played_together');
    assert.deepEqual(captured[2].body, { friend_request_scope: 'played_together' });
  } finally { restore(); }
});

test('contract: social void actions hit their paths and complete', async () => {
  const restore = installAdapter();
  handler = routes(
    route('post', /^\/friends\/requests\/5\/accept$/, {}),
    route('post', /^\/friends\/requests\/5\/reject$/, {}),
    route('delete', /^\/friends\/8$/, {}),
    route('delete', /^\/blocks\/8$/, {}),
  );
  try {
    // 消费方一律 await 后刷新本地列表，不读返回值——契约是路径与完成
    await acceptFriendRequest(5);
    await rejectFriendRequest(5);
    await deleteFriend(8);
    await unblockUser(8);
    assert.deepEqual(
      captured.map((r) => `${r.method} ${r.url}`),
      ['post /friends/requests/5/accept', 'post /friends/requests/5/reject', 'delete /friends/8', 'delete /blocks/8'],
    );
  } finally { restore(); }
});

test('contract: createReport posts snake_case target fields', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/reports$/, { report: { id: 1 } });
  try {
    await createReport({ targetType: 'user', targetId: 8, reason: '骚扰' });
    assert.deepEqual(captured[0].body, { target_type: 'user', target_id: 8, reason: '骚扰' });
  } finally { restore(); }
});

// ---------------------------------------------------------------------------
// bossFight：api 层解包族（消费方 useBossFight 直接把返回值当快照，
// 经 acceptSnapshot 版本守卫后渲染）
// ---------------------------------------------------------------------------

test('contract: createFight returns the snapshot payload itself', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/games\/9\/boss-fight$/, snapshotFixture);
  try {
    const snap = await createFight(9, { movement: 'squat', bossId: 'aoye_yanshi', durationSec: 300 });
    assert.deepEqual(snap, snapshotFixture as any);
    assert.deepEqual(captured[0].body, { movement: 'squat', bossId: 'aoye_yanshi', durationSec: 300 });
  } finally { restore(); }
});

test('contract: fetchFight returns the snapshot payload itself', async () => {
  const restore = installAdapter();
  handler = route('get', /^\/games\/9\/boss-fight$/, snapshotFixture);
  try {
    assert.deepEqual(await fetchFight(9), snapshotFixture as any);
  } finally { restore(); }
});

test('contract: fight action calls return the updated snapshot', async () => {
  const restore = installAdapter();
  const fighting = { ...snapshotFixture, status: 'fighting', version: 2 };
  handler = routes(
    route('post', /^\/games\/9\/boss-fight\/join$/, fighting),
    route('post', /^\/games\/9\/boss-fight\/link-session$/, fighting),
    route('post', /^\/games\/9\/boss-fight\/ready$/, fighting),
    route('post', /^\/games\/9\/boss-fight\/start$/, fighting),
    route('post', /^\/games\/9\/boss-fight\/leave$/, fighting),
  );
  try {
    assert.deepEqual(await joinFight(9), fighting as any);
    assert.deepEqual(await linkSession(9, 'sess-1'), fighting as any);
    assert.deepEqual(await setReady(9, true), fighting as any);
    assert.deepEqual(await startFight(9), fighting as any);
    assert.deepEqual(await leaveFight(9), fighting as any);
  } finally { restore(); }
});

test('contract: fetchFightLatency returns the latency summary payload', async () => {
  const restore = installAdapter();
  const payload = { fight_id: 'fight-1', samples: 12, processing_ms: { p50: 40, p95: 120, max: 300 } };
  handler = route('get', /^\/games\/9\/boss-fight\/latency$/, payload);
  try {
    assert.deepEqual(await fetchFightLatency(9), payload);
  } finally { restore(); }
});

test('contract: fetchFightLatency preserves a null processing summary (no samples yet)', async () => {
  const restore = installAdapter();
  const payload = { fight_id: null, samples: 0, processing_ms: null };
  handler = route('get', /^\/games\/9\/boss-fight\/latency$/, payload);
  try {
    // 顶层载荷是对象、只有内层 processing_ms 为 null——与 fetchFight 的
    // data:null 不同，这条路径不触发双层剥的回退，原样透传即正确
    assert.deepEqual(await fetchFightLatency(9), payload);
  } finally { restore(); }
});

test('contract: fight action request bodies carry their inputs', async () => {
  const restore = installAdapter();
  handler = routes(
    route('post', /^\/games\/9\/boss-fight\/join$/, snapshotFixture),
    route('post', /^\/games\/9\/boss-fight\/link-session$/, snapshotFixture),
    route('post', /^\/games\/9\/boss-fight\/ready$/, snapshotFixture),
  );
  try {
    await joinFight(9, 'sess-1');
    assert.deepEqual(captured[0].body, { sessionId: 'sess-1' }); // 带 session 时才发
    await joinFight(9);
    assert.deepEqual(captured[1].body, {}); // 不带 session 发空对象
    await linkSession(9, 'sess-2');
    assert.deepEqual(captured[2].body, { sessionId: 'sess-2' });
    await setReady(9, false);
    assert.deepEqual(captured[3].body, { ready: false }); // false 不许被丢掉
  } finally { restore(); }
});

// 回归锁（原 FINDING，2026-11-14 已修复并摘掉 todo）：
// 服务端没人发起打怪时 GET /games/:id/boss-fight 返回 data: null
// （boss-fight.service getFightForGame 实测 return null），消费方
// useBossFight 的契约是 fetchFight 解析为 null（apply(null) 清空快照）。
// 旧 bossFight.ts 的 unwrap 是双层剥：body = res?.data ?? res 先把
// data:null 回退成信封本体，body?.data ?? body 再回退成信封——解析值是
// {code, message, data:null} 而不是 null。useBossFight 会把信封当快照
// 存下（acceptSnapshot(null, 信封) 直接接受），页面随后读 participants
// 等快照字段即出错。这正是打怪页首次打开（还没人发起）的常态路径。
// 与 2026-11-13 fetchGameMeta 同类：接口层自查全过、真页面坏。
// 修复 = unwrap 只剥一层且 null 原样保留（与正式版已上线实现逐字一致）。
test(
  'contract: fetchFight resolves to null when the server has no fight yet',
  async () => {
    const restore = installAdapter();
    handler = route('get', /^\/games\/9\/boss-fight$/, null);
    try {
      assert.equal(await fetchFight(9), null);
    } finally { restore(); }
  },
);

// ---------------------------------------------------------------------------
// bossFight 二期约定段模式：新 api 函数与一期同族——mock 按真实信封
// {code, message, data} 返回，只剥一层、快照原样透传；请求体字段不许丢。
// ---------------------------------------------------------------------------

const segmentSnapshotFixture = {
  ...snapshotFixture,
  movement: '',
  status: 'fighting',
  max_hp: 4,
  hp: 3,
  duration_sec: 0,
  mode: 'segments',
  template_id: 'basketball',
  segment_format: 'minutes10',
  segment_label: '打完一轮 10 分钟的比赛，算一段',
  total_label: '本场共 4 段，打满 4 段就是打赢',
  segments_total: 4,
  segments_done: 1,
  segments: [{ seq: 1, recorded_by: 7, recorded_at: '2026-11-14T03:00:00.000Z', source: 'live' }],
};

test('contract: createFight in segment mode posts the mode fields and returns the snapshot', async () => {
  const restore = installAdapter();
  handler = route('post', /^\/games\/9\/boss-fight$/, segmentSnapshotFixture);
  try {
    const snap = await createFight(9, { mode: 'segments', bossId: 'aoye_yanshi', segmentFormat: 'minutes10' });
    assert.deepEqual(snap, segmentSnapshotFixture as any);
    assert.deepEqual(captured[0].body, { mode: 'segments', bossId: 'aoye_yanshi', segmentFormat: 'minutes10' });
  } finally { restore(); }
});

test('contract: segment actions return the updated snapshot and carry their inputs', async () => {
  const restore = installAdapter();
  handler = routes(
    route('post', /^\/games\/9\/boss-fight\/segment$/, segmentSnapshotFixture),
    route('post', /^\/games\/9\/boss-fight\/settle-segments$/, segmentSnapshotFixture),
    route('post', /^\/games\/9\/boss-fight\/confirm-participation$/, segmentSnapshotFixture),
    route('post', /^\/games\/9\/boss-fight\/record-note$/, segmentSnapshotFixture),
  );
  try {
    assert.deepEqual(await recordSegment(9), segmentSnapshotFixture as any);
    assert.deepEqual(await settleSegments(9, 4), segmentSnapshotFixture as any);
    assert.deepEqual(captured[1].body, { segmentsDone: 4 });
    assert.deepEqual(await confirmParticipation(9), segmentSnapshotFixture as any);
    assert.deepEqual(await saveRecordNote(9, { km: 2.5, minutes: 40 }), segmentSnapshotFixture as any);
    assert.deepEqual(captured[3].body, { km: 2.5, minutes: 40 });
  } finally { restore(); }
});
