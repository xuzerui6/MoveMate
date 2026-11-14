import { test } from 'node:test';
import assert from 'node:assert/strict';
import client from '../src/api/client.ts';
import { useGameStore } from '../src/stores/gameStore.ts';

// 消费方边界契约测试（2026-11-14，Codex 交叉评审提案落地之二）：
// api-contract.test.ts 锁的是「api 函数解析值」的契约；本文件再往前一步，
// 把真实 gameStore 串起来：adapter 返回信封化的 {games, pagination}
// （服务端真实形状），调 useGameStore.fetchGames，断言：
// - 存进 store 的就是服务端给的那批局（第一页整表、第二页追加）；
// - hasMore 按「本页条数 >= 每页条数」推导（服务端 pagination 只作参考，
//   store 并不读它——这正是 PaginatedResponse 声明形状与运行时脱节的
//   现场，见 api-contract 文件头注释）；
// - 请求侧 size → page_size 的参数翻译在真实调用链上成立。
//
// Codex 2026-11-14 复核订正：初版断言过 store.games 与 fixture 数组
// 「引用相等」——过度约束。store 现在确实整表赋值，但消费方没有任何
// 一处依赖对象身份；将来 store 做归一化/克隆是正当重构，不该被测试
// 锁死。故这里只断言内容、顺序与条数（深度相等），不断言引用。

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
  value: { location: { pathname: '/', href: '' } },
  configurable: true,
});

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

const page1Games = Array.from({ length: 20 }, (_, i) => gameFixture(i + 1));
const page2Games = [gameFixture(21), gameFixture(22), gameFixture(23)];

const capturedParams: Array<Record<string, unknown> | undefined> = [];
let pageResponder: (page: number) => Array<ReturnType<typeof gameFixture>> =
  (page) => (page === 1 ? page1Games : page2Games);

function installAdapter() {
  const originalAdapter = client.defaults.adapter;
  client.defaults.adapter = async (config) => {
    if ((config.method ?? 'get').toLowerCase() !== 'get' || config.url !== '/games') {
      throw new Error(`game-store-contract: unexpected request ${config.method} ${config.url}`);
    }
    const params = config.params as Record<string, unknown> | undefined;
    capturedParams.push(params);
    const page = Number(params?.page ?? 1);
    const games = pageResponder(page);
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: {
        code: 0,
        message: 'success',
        data: {
          games,
          pagination: { page, page_size: 20, total: 23, total_pages: 2 },
        },
      },
    };
  };
  return () => {
    client.defaults.adapter = originalAdapter;
  };
}

function resetStore() {
  useGameStore.setState({
    games: [],
    filter: { size: 20, scope: 'campus' },
    loading: false,
    error: null,
    hasMore: true,
    page: 1,
  });
}

test('gameStore.fetchGames stores page 1 content, then appends page 2', async () => {
  const restore = installAdapter();
  try {
    capturedParams.length = 0;
    pageResponder = (page) => (page === 1 ? page1Games : page2Games);
    resetStore();

    // 第一页（reset）：store 里存的内容必须就是服务端给的那批局
    await useGameStore.getState().fetchGames(true);
    let state = useGameStore.getState();
    assert.deepEqual(state.games, page1Games);
    assert.equal(state.games.length, 20);
    assert.equal(state.hasMore, true); // 20 >= 每页 20 → 还有下一页
    assert.equal(state.page, 2);
    assert.equal(state.error, null);

    // 请求侧契约：page 透传、size 翻译成 page_size、size 本身不发
    assert.equal(capturedParams[0]?.page, 1);
    assert.equal(capturedParams[0]?.page_size, 20);
    assert.equal(capturedParams[0]?.size, undefined);
    assert.equal(capturedParams[0]?.scope, 'campus');

    // 第二页：追加而不是替换，第一页内容原样保留在前、第二页接在后面
    await useGameStore.getState().fetchGames();
    state = useGameStore.getState();
    assert.equal(state.games.length, 23);
    assert.deepEqual(state.games.slice(0, 20), page1Games);
    assert.deepEqual(state.games.slice(20), page2Games);
    assert.equal(state.hasMore, false); // 3 < 20
    assert.equal(state.page, 3);
    assert.equal(capturedParams[1]?.page, 2);
    assert.equal(capturedParams[1]?.page_size, 20);

    // hasMore 已落下时再拉必须短路，不发请求
    await useGameStore.getState().fetchGames();
    assert.equal(capturedParams.length, 2);
  } finally {
    restore();
  }
});

test('gameStore.fetchGames with an empty first page clears the list and stops pagination', async () => {
  const restore = installAdapter();
  try {
    capturedParams.length = 0;
    pageResponder = () => [];
    resetStore();
    // 先塞一条旧数据，验证 reset 拉到空页时是清空而不是保留
    useGameStore.setState({ games: [gameFixture(99)] as any });

    await useGameStore.getState().fetchGames(true);
    const state = useGameStore.getState();
    assert.deepEqual(state.games, []);
    assert.equal(state.hasMore, false); // 0 < 20 → 没有下一页
    assert.equal(state.error, null);
    assert.equal(capturedParams.length, 1);
  } finally {
    restore();
  }
});
