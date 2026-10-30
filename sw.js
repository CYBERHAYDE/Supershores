const C='ss2-v46',SHELL=['./','index.html','styles.css','i18n.js','app.js','boot.js','bridge.js','sync.js','approvals.js','legal.js','manifest.json','assets/logo.png','assets/icon-192.png','assets/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
// App files come straight from the saved set that was installed together, so the app starts fast and files from two versions never mix.
// A new version (new name in C above) installs in the background and is used the next time the app opens. Google Fonts and the code libraries are saved after first load.
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 if(/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$/.test(u.hostname)){e.respondWith(caches.match(e.request).then(m=>m||fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;})));return;}
 if(u.origin!==location.origin)return;
 const nav=e.request.mode==='navigate';   // only a page may fall back to the saved home page; a missing script must fail loudly, never arrive as HTML
 e.respondWith(caches.open(C).then(c=>c.match(e.request,{ignoreSearch:true}).then(m=>m||fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>nav?c.match('index.html'):Response.error()))));});
