import { test } from 'node:test';
import assert from 'node:assert/strict';
import client from '../src/api/client.ts';
import { rebookGame } from '../src/api/games.ts';

// 2026-11-13 信封类事故（主线版）：响应拦截器解析出的是服务端信封
// {code, message, data}，rebookGame 曾把信封原样返回（服务端载荷是
// {game}），而两个消费者最后都直接读 .id：
//   - GameSummary.tsx：Number(next.id) → NaN，「约下周再练」坏掉；
//   - BossFight.tsx：res.data || res 再 .data || body 只剥到 {game}，
//     next.id 仍是 undefined → 跳 /game/undefined。
// 修法与同文件 setFillOpen 一致：return res.data?.game。
// 注：同类事故的另一个函数 fetchGameMeta 只存在于学校隔离/预览谱系，
// 主线尚无此函数，故主线只锁 rebook 这一条；其信封测试在预览谱系的
// game-meta-envelope.test.ts 里。
// 本测试按 auth-recovery.test.ts 的模式：真实 client + 自定义 adapter，
// adapter 返回完整的真实信封，锁住「信封 → 内层数据」的边界契约。

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
  configurable: true,
});

const REBOOK_ENVELOPE = {
  code: 0,
  message: '下周的局已经约好了',
  data: {
    game: { id: 42, host_id: 7, sport_type: 'fitness', status: 'recruiting' },
  },
};

function installAdapter() {
  const originalAdapter = client.defaults.adapter;
  client.defaults.adapter = async (config) => {
    return { status: 200, statusText: 'OK', headers: {}, config, data: REBOOK_ENVELOPE };
  };
  return () => {
    client.defaults.adapter = originalAdapter;
  };
}

test('rebookGame unwraps the server envelope and yields the new game', async () => {
  const restore = installAdapter();
  try {
    const game = await rebookGame('7');
    assert.equal((game as any)?.id, 42);
    assert.equal((game as any)?.status, 'recruiting');
  } finally {
    restore();
  }
});
