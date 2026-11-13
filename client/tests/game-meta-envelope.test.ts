import { test } from 'node:test';
import assert from 'node:assert/strict';
import client from '../src/api/client.ts';
import { fetchGameMeta } from '../src/api/games.ts';

// 2026-11-13 真机事故：建局页校区下拉对所有真实用户永远只有「请选择校区」。
// 根因：响应拦截器解析出的是服务端信封 {code, message, data}，auth.ts 等
// 模块都用 unwrap() 取内层 data，唯独 fetchGameMeta 把信封原样返回，
// CreateGame 读 .campuses 读到 undefined → || [] → 空列表。事故前没有任何
// 测试真正调用过 fetchGameMeta，所以没测出来。
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

const META_ENVELOPE = {
  code: 0,
  message: 'ok',
  data: {
    campuses: [
      { id: 4, school_id: 2, code: 'jlsu-nanling', name: '南岭校区' },
      { id: 5, school_id: 2, code: 'jlsu-linhe', name: '临河校区' },
    ],
    venues: [
      { id: 37, school_id: 2, campus_id: 5, name: '临河校区健身馆', sport_types: ['fitness'] },
      { id: 38, school_id: 2, campus_id: 5, name: '临河校区田径场', sport_types: ['running'] },
    ],
  },
};

test('fetchGameMeta unwraps the server envelope and yields campuses/venues', async () => {
  const originalAdapter = client.defaults.adapter;
  client.defaults.adapter = async (config) => {
    assert.match(config.url ?? '', /\/games\/meta/);
    return { status: 200, statusText: 'OK', headers: {}, config, data: META_ENVELOPE };
  };
  try {
    const meta = await fetchGameMeta();
    assert.deepEqual(
      meta.campuses?.map((c) => c.name),
      ['南岭校区', '临河校区'],
    );
    assert.deepEqual(
      meta.venues?.map((v) => v.name),
      ['临河校区健身馆', '临河校区田径场'],
    );
  } finally {
    client.defaults.adapter = originalAdapter;
  }
});
