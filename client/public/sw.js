const CACHE='movemate-static-v1';
const STATIC=/^\/(?:assets\/|models\/|wasm\/|vision\/|fonts\/)/;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/manifest.webmanifest','/app-icon.svg']))));
// Updates activate on the next navigation, keeping an ongoing training page intact.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('movemate-static-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/uploads/'))return;
 if(req.mode==='navigate')event.respondWith(fetch(req).then(response=>{if(response.ok){const saved=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put('/',saved)));}return response;}).catch(()=>caches.match('/')));
 else if(STATIC.test(url.pathname)||['/manifest.webmanifest','/app-icon.svg'].includes(url.pathname))event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{if(response.ok){const saved=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(req,saved)));}return response;})));
});
