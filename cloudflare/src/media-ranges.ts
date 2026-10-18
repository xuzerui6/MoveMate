type ByteRange={start:number;end:number}|{unsatisfiable:true}|null;
// Single ranges are sufficient for HTML media. RFC 9110 permits ignoring
// unsupported multi-range syntax and returning the complete representation.
export function resolveByteRange(value:string,size:number):ByteRange{
 const match=/^bytes=(\d*)-(\d*)$/.exec(value.trim());
 if(!match||(!match[1]&&!match[2]))return null;
 const left=match[1]?Number(match[1]):null,right=match[2]?Number(match[2]):null;
 if(!Number.isSafeInteger(size)||size<=0||[left,right].some(n=>n!==null&&!Number.isSafeInteger(n)))return {unsatisfiable:true};
 if(left===null){if(!right||right<=0)return {unsatisfiable:true};return {start:Math.max(0,size-right),end:size-1};}
 if(left>=size||(right!==null&&right<left))return {unsatisfiable:true};
 return {start:left,end:Math.min(right??size-1,size-1)};
}
function ifRangeMatches(value:string|null,headers:Headers){
 if(!value)return true;
 if(value.startsWith('W/'))return false;
 if(value.startsWith('"'))return value===headers.get('ETag');
 const modified=headers.get('Last-Modified');
 return !!modified&&Number.isFinite(Date.parse(value))&&Date.parse(modified)<=Date.parse(value);
}
function sliceStream(body:ReadableStream<Uint8Array>,start:number,end:number){
 const reader=body.getReader();let offset=0;
 return new ReadableStream<Uint8Array>({
  async pull(controller){
   try{while(true){const {done,value}=await reader.read();if(done){controller.close();return;}
    const before=offset;offset+=value.byteLength;
    if(offset<=start)continue;
    const a=Math.max(0,start-before),b=Math.min(value.byteLength,end-before+1);
    if(b>a)controller.enqueue(value.subarray(a,b));
    if(offset>end){controller.close();await reader.cancel().catch(()=>{});}return;
   }}catch(error){controller.error(error);}
  },
  cancel(reason){return reader.cancel(reason);},
 });
}
export function applyVideoRange(request:Request,response:Response,knownBytes?:number){
 // ASSETS bindings can omit Content-Length even when the edge adds it later.
 // Reviewed, content-addressed files have exact lengths in the build manifest.
 if(response.status!==200||(!response.headers.has('Content-Length')&&knownBytes===undefined))return response;
 const size=Number(response.headers.get('Content-Length')??knownBytes),headers=new Headers(response.headers);
 if(!Number.isSafeInteger(size)||size<0||response.headers.has('Content-Encoding'))return response;
 headers.set('Accept-Ranges','bytes');
 headers.set('Content-Length',String(size));
 const raw=request.headers.get('Range');
 if(request.method!=='GET'||!raw||!ifRangeMatches(request.headers.get('If-Range'),headers))return new Response(response.body,{status:response.status,headers});
 const range=resolveByteRange(raw,size);
 if(!range)return new Response(response.body,{status:200,headers});
 if('unsatisfiable' in range){void response.body?.cancel().catch(()=>{});headers.set('Content-Range',`bytes */${size}`);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
 if(!response.body)return response;
 headers.set('Content-Range',`bytes ${range.start}-${range.end}/${size}`);
 headers.set('Content-Length',String(range.end-range.start+1));
 return new Response(sliceStream(response.body,range.start,range.end),{status:206,headers});
}
