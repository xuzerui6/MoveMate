import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchOta,pollActivation} from '../src/xiaozhi/ota';
import {createDeviceIdentity} from '../src/xiaozhi/identity';

test('browser OTA uses activation v1 consistently and does not invent hardware authentication',async t=>{
  const original=globalThis.fetch;
  t.after(()=>{globalThis.fetch=original});
  const identity=createDeviceIdentity();
  identity.activation={code:'123456',challenge:'test-challenge',message:'test',expiresAt:Date.now()+60000};
  let status=202,requests=0;
  globalThis.fetch=(async(url,init)=>{
    requests++;
    const headers=new Headers(init?.headers);
    assert.equal(headers.get('Activation-Version'),'1');
    assert.equal(headers.get('Device-Id'),identity.deviceId);
    assert.equal(headers.get('Client-Id'),identity.clientId);
    assert.equal(headers.get('Serial-Number'),null);
    if(String(url).endsWith('/activate')){
      assert.equal(init?.body,'{}');
      return new Response('{}',{status});
    }
    const body=JSON.parse(String(init?.body));
    assert.equal(body.application.version,'2.1.2');
    assert.equal(body.board.type,'web');
    return new Response(JSON.stringify({activation:{code:'123456',challenge:'test-challenge'}}),{status:200});
  }) as typeof fetch;
  assert.equal((await fetchOta(identity)).activation?.code,'123456');
  assert.equal(await pollActivation(identity),'waiting');
  status=200;assert.equal(await pollActivation(identity),'ready');
  status=403;await assert.rejects(pollActivation(identity),/HTTP 403/);
  delete identity.activation;await assert.rejects(pollActivation(identity),/激活挑战已失效/);
  assert.equal(requests,4);
});
