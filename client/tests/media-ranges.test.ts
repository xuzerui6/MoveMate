import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveByteRange,applyVideoRange} from '../../cloudflare/src/media-ranges';
test('ASSETS without a length uses reviewed file size and still streams a range',async()=>{
 const r=applyVideoRange(new Request('http://test',{headers:{Range:'bytes=2-4'}}),new Response('0123456789',{headers:{'Content-Type':'video/mp4'}}),10);
 assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 2-4/10');assert.equal(await r.text(),'234');
});
test('video ranges support prefix, open-ended and suffix ranges without overrun',()=>{
 assert.deepEqual(resolveByteRange('bytes=0-3',10),{start:0,end:3});assert.deepEqual(resolveByteRange('bytes=7-',10),{start:7,end:9});
 assert.deepEqual(resolveByteRange('bytes=-4',10),{start:6,end:9});assert.deepEqual(resolveByteRange('bytes=3-99',10),{start:3,end:9});
 for(const r of ['bytes=10-','bytes=8-3','bytes=-0','bytes=99999999999999999999999-'])assert.deepEqual(resolveByteRange(r,10),{unsatisfiable:true});
 assert.equal(resolveByteRange('bytes=0-1,3-4',10),null);
});
test('video stream skips earlier chunks, slices exactly and cancels unread bytes',async()=>{
 let cancelled=false,index=0;const parts=['abc','defg','hijk','lmnop'];
 const stream=new ReadableStream({pull(c){if(index===parts.length){c.close();return;}c.enqueue(new TextEncoder().encode(parts[index++]));},cancel(){cancelled=true;}});
 const response=applyVideoRange(new Request('http://test/video',{headers:{Range:'bytes=4-8'}}),new Response(stream,{headers:{'Content-Length':'16','Content-Type':'video/mp4',ETag:'"a"'}}));
 assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 4-8/16');assert.equal(response.headers.get('Content-Length'),'5');assert.equal(await response.text(),'efghi');assert.ok(cancelled);
});
test('unsatisfiable range is 416; If-Range mismatch and HEAD keep full representation',async()=>{
 const full=()=>new Response('0123456789',{headers:{'Content-Length':'10',ETag:'"a"'}});
 const bad=applyVideoRange(new Request('http://test',{headers:{Range:'bytes=20-'}}),full());assert.equal(bad.status,416);assert.equal(bad.headers.get('Content-Range'),'bytes */10');assert.equal(await bad.text(),'');
 for(const validator of ['"old"','W/"a"']){const r=applyVideoRange(new Request('http://test',{headers:{Range:'bytes=2-3','If-Range':validator}}),full());assert.equal(r.status,200);assert.equal(await r.text(),'0123456789');}
 const good=applyVideoRange(new Request('http://test',{headers:{Range:'bytes=-2','If-Range':'"a"'}}),full());assert.equal(await good.text(),'89');
 const head=applyVideoRange(new Request('http://test',{method:'HEAD',headers:{Range:'bytes=2-3'}}),new Response(null,{headers:{'Content-Length':'10'}}));assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),'10');
});
