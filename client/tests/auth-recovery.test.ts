import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError } from 'axios';
import client from '../src/api/client';
import { normalizeUser } from '../src/api/auth';
import { useAuthStore } from '../src/stores/authStore';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
}, configurable: true });
Object.defineProperty(globalThis, 'window', { value: { location: { pathname: '/train', href: '' } }, configurable: true });
const user = (id = 2) => normalizeUser({ id, nickname: 'Member ' + id });
const fail = (status?: number) => {
  client.defaults.adapter = async config => { throw new AxiosError('Temporary failure', status ? 'ERR_BAD_RESPONSE' : 'ERR_NETWORK', config, undefined,
    status ? { status, statusText: 'Failure', data: { message: '暂时不可用' }, headers: {}, config } : undefined); };
};
beforeEach(() => {
  values.clear();
  useAuthStore.getState().logout();
  window.location.href = '';
  useAuthStore.getState().setSession(user(), 'account-A');
});

for (const status of [undefined, 503]) test(`session recovery preserves the account on ${status || 'offline'} failure`, async () => {
  fail(status);
  await useAuthStore.getState().hydrateSession();
  assert.equal(useAuthStore.getState().isLoggedIn, true);
  assert.equal(localStorage.getItem('token'), 'account-A');
  assert.ok(useAuthStore.getState().error);
  assert.equal(useAuthStore.getState().loading, false);
  assert.equal(window.location.href, '');
});

test('an explicit 401 still removes an invalid session', async () => {
  fail(401);
  await useAuthStore.getState().hydrateSession();
  assert.equal(useAuthStore.getState().isLoggedIn, false);
  assert.equal(localStorage.getItem('token'), null);
  assert.equal(window.location.href, '/login');
});

test('retry restores server profile and clears the recoverable error', async () => {
  fail(503);
  await useAuthStore.getState().hydrateSession();
  client.defaults.adapter = async config => ({ status: 200, statusText: 'OK', headers: {}, config, data: { data: { id: 2, nickname: 'Recovered' } } });
  await useAuthStore.getState().hydrateSession();
  assert.equal(useAuthStore.getState().user?.nickname, 'Recovered');
  assert.equal(useAuthStore.getState().error, null);
  assert.equal(useAuthStore.getState().loading, false);
});

test('a delayed failure from the old account cannot clear or mark the new account', async () => {
  let reject!: (reason: Error) => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  client.defaults.adapter = config => new Promise((_, no) => { reject = () => no(new AxiosError('offline', 'ERR_NETWORK', config)); started(); });
  const hydration = useAuthStore.getState().hydrateSession();
  await ready;
  useAuthStore.getState().setSession(user(3), 'account-B');
  reject(new Error('offline'));
  await hydration;
  assert.equal(useAuthStore.getState().user?.id, '3');
  assert.equal(useAuthStore.getState().token, 'account-B');
  assert.equal(useAuthStore.getState().error, null);
  assert.equal(useAuthStore.getState().loading, false);
});
