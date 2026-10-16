import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStoredSession } from '../src/services/stored-session';
const jwt = (sub: unknown) => 'header.' + Buffer.from(JSON.stringify({ sub })).toString('base64url') + '.signature';

test('storage sync accepts a coherent user and token without treating it as server authentication', () => {
  assert.deepEqual(readStoredSession(jwt(2), '{"id":2,"nickname":"member"}'), { token: jwt(2), user: { id: 2, nickname: 'member' } });
  assert.equal(readStoredSession(jwt('3'), '{"id":3,"nickname":"B"}')?.user.id, 3);
});
test('an account change cannot render a new token with the previous user profile', () => {
  assert.equal(readStoredSession(jwt(3), '{"id":2,"nickname":"A"}'), null);
  assert.equal(readStoredSession(jwt(2), '{"id":3,"nickname":"B"}'), null);
  assert.equal(readStoredSession(jwt(3), '{"id":3,"nickname":"B"}')?.user.id, 3);
});
test('logout, partial storage writes and malformed sessions clear the in-memory account', () => {
  for (const [token, user] of [[null, '{"id":2}'], [jwt(2), null], ['invalid', '{"id":2}'], [jwt(2), 'not-json'], [jwt(null), 'null'], [jwt(0), '{"id":0}']]) assert.equal(readStoredSession(token, user), null);
});
