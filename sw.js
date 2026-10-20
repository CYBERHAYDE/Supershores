const C='ss2-v23',SHELL=['./','index.html','styles.css','i18n.js','app.js','boot.js','bridge.js','sync.js','manifest.json','assets/logo.png','assets/icon-192.png','assets/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
// Same-origin files: the newest copy when the network answers within 2.5 seconds, otherwise the saved copy right away
// (the network keeps going in the background and saves the newest copy for next time). Google Fonts: saved after first load.
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 if(/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)){e.respondWith(caches.match(e.request).then(m=>m||fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;})));return;}
 if(u.origin!==location.origin)return;
 const net=fetch(e.request,{cache:'no-store'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));}return r;});
 e.waitUntil(net.catch(()=>0));
 e.respondWith(caches.match(e.request).then(cached=>{if(!cached)return net.catch(()=>caches.match('index.html'));
  return Promise.race([net.catch(()=>cached),new Promise(res=>setTimeout(()=>res(cached),2500))]);}));});
