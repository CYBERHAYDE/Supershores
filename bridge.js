/* Supershores bridge. Loads after the demo's app.js and replaces only: sign-in, staff management,
   and adds the subscription lock, renewal upload and automatic updates. Every other screen is the demo's own. */
const SS={API:'https://script.google.com/macros/s/AKfycbyR4tyWCQ7OVLSfhe3UUr2vsZRzH_Ywf_5b8AYKhfytYYiy9BocFUBnbXbXKjdmeIjtfA/exec',token:null,lic:null};
SS.api=async(action,body={})=>{const r=await fetch(SS.API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...body})});
 const j=await r.json();if(!j.ok){const e=new Error(j.error);e.code=j.code;throw e;}return j.data;};
/* Loading feedback: a thin bar at the top while something the person tapped is waiting on the server */
{const FG=['login','firstRun','staff.list','staff.add','staff.resetPasscode','staff.setActive','staff.update','staff.delete','changePasscode','authorizeDiscount','payment.submit','data.reset','registerDevice'],raw=SS.api;let pend=0,tm;
 SS.api=async(action,body)=>{const fg=FG.includes(action),bar=document.getElementById('ssTopBar');if(fg){pend++;clearTimeout(tm);tm=setTimeout(()=>{if(pend&&bar)bar.classList.add('on');},200);}
  try{return await raw(action,body);}finally{if(fg){pend--;if(!pend){clearTimeout(tm);if(bar)bar.classList.remove('on');}}}};}
const ssGet=(k,d)=>{try{const v=JSON.parse(SSLS.getItem(k));return v===null?d:v;}catch(e){return d;}},ssSet=(k,v)=>SSLS.setItem(k,JSON.stringify(v));
const ssMoney=n=>'₦'+Number(n||0).toLocaleString('en-NG'),ssRole=r=>r==='owner'?'admin':'staff',ssToday=()=>todayIso();
function ssOverlay(html,closable){const old=document.getElementById('ssOv');if(old)old.remove();const d=document.createElement('div');d.className='ssov';d.id='ssOv';d.innerHTML=`<div class="sscard">${html}</div>`;if(closable)d.onclick=e=>{if(e.target===d)ssClose();};document.body.append(d);return d;}
function ssClose(){const o=document.getElementById('ssOv');if(o)o.remove();if(SS.lic&&SS.lic.locked)ssLock();}   // while expired, closing any box brings the payment wall back
const ssSay=t=>{const e=document.getElementById('ssMsg');if(e)e.textContent=t;};
const ssPassRule=p=>p.length>=6&&p.length<=64&&/\d/.test(p)&&/[^A-Za-z0-9\s]/.test(p),ssPassMsg='Password must be at least 6 characters and include a number and a special character (like @ # ! ?).';
/* Masked input box: use this instead of prompt() whenever a password is typed */
function ssAsk(title,msg,fields,okLabel){return new Promise(res=>{
 const d=document.createElement('div');d.className='ssov';d.id='ssAsk';d.style.zIndex=10000;
 d.innerHTML=`<div class="sscard"><form autocomplete="off"><h3 style="margin-top:0">${esc(title)}</h3><p class="helptext" style="white-space:pre-line">${esc(msg||'')}</p>${fields.map((f,i)=>`<label>${esc(f.label)}</label><input id="ssAskF${i}" type="${f.type||'password'}" ${f.numeric?'inputmode="numeric"':''} ${f.max?`maxlength="${f.max}"`:''} ${f.caps?'autocapitalize="characters"':''} ${f.value!==undefined?`value="${esc(f.value)}"`:''} autocomplete="off">`).join('')}<div class="row"><button type="submit" class="btn gold">${esc(okLabel||'Continue')}</button><button type="button" class="btn ghost" id="ssAskNo">Cancel</button></div></form></div>`;
 const done=v=>{d.remove();res(v);};
 d.querySelector('form').onsubmit=e=>{e.preventDefault();const v=fields.map((f,i)=>d.querySelector('#ssAskF'+i).value);if(v.some(x=>!x))return;done(v);};
 d.querySelector('#ssAskNo').onclick=()=>done(null);
 d.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();done(null);}});
 document.body.append(d);d.querySelector('input').focus();});}

/* ---------- Sign-in (server) ---------- */
async function ssSaveUser(d,pass){const salt=randomSaltHex(),ph=await hashSecret(pass,salt);
 const rec={id:d.user.id,name:d.user.name,role:ssRole(d.user.role),passSalt:salt,passHash:ph,pinHash:ph,pinSalt:salt,active:true,token:d.token};
 const i=users.findIndex(u=>u.id===rec.id);i<0?users.push(rec):users[i]=rec;persistUsers();currentUser=rec;
 ssSet('ss_lic',d.subscription?Object.assign(ssGet('ss_lic',{}),{status:d.subscription.status}):ssGet('ss_lic',{}));}
renderAuthGate=function(view){const card=document.getElementById('authCard'),setup=view==='setup'||view==='registerAdmin';
 const logo=`<img src="${window.SS_LOGO}" alt="Supershores" style="width:210px;max-width:80%;display:block;margin:0 auto 12px">`;
 card.innerHTML=setup?`${logo}<h2>Owner setup</h2><p class="sub">Enter the setup code you were given, then choose your name and a password.</p>
  <form autocomplete="off" onsubmit="event.preventDefault();ssSetup();"><div class="form-row"><label>Your full name</label><input type="text" id="aName" autocomplete="name"></div>
  <div class="form-row"><label>Password</label><input type="password" id="aPass" autocomplete="new-password"><p class="helptext">At least 6 characters, with a number and a special character (like @ # ! ?).</p></div>
  <div class="form-row"><label>Confirm password</label><input type="password" id="aPass2" autocomplete="new-password"></div>
  <div class="form-row"><label>Setup code</label><input type="text" id="aKey" autocapitalize="characters" autocomplete="off"></div>
  <div class="errtext" id="authErr"></div><button type="submit" class="btn gold" style="width:100%;margin-top:14px;">Create owner account</button></form>
  <div class="switchline">Already set up? <a onclick="renderAuthGate('login')">Log in</a></div>`
 :`${logo}<h2>Welcome back</h2><p class="sub">Log in with your staff ID and password.</p>
  <form autocomplete="on" onsubmit="event.preventDefault();submitLogin();"><div class="form-row"><label>Staff ID</label><input type="text" id="lId" autocapitalize="characters" autocomplete="username" placeholder="e.g. ST-001"></div>
  <div class="form-row"><label>Password</label><input type="password" id="lPass" autocomplete="current-password"></div>
  <div class="errtext" id="authErr"></div><button type="submit" class="btn gold" style="width:100%;margin-top:14px;">Log in</button></form>
  <div class="switchline">First time setup? <a onclick="renderAuthGate('setup')">Owner setup</a></div>`;
 document.getElementById('authGate').style.visibility='visible';
 if(matchMedia('(hover:hover)').matches)setTimeout(()=>{const f=document.getElementById(setup?'aName':'lId');if(f)f.focus();},60);};
const ssOrigLogin=submitLogin;
submitLogin=async function(){const id=document.getElementById('lId').value.trim().toUpperCase(),pass=document.getElementById('lPass').value,err=document.getElementById('authErr');
 if(!id||!pass){err.textContent='Enter your staff ID and password.';return;}
 try{const d=await SS.api('login',{staffId:id,pin:pass});await ssSaveUser(d,pass);logActivity('Logged in');if(!currentUser.pinHash)goToSetPin();else enterApp();}
 catch(e){if(e.code)err.textContent=e.code==='LICENSE_LOCKED'?'This subscription has expired. Ask the owner to renew.':e.message;
  else{if(!users.some(u=>u.id===id)){err.textContent='No connection. Log in online once on this phone first.';return;}await ssOrigLogin();}}};   // offline: the demo's own local check
submitRegisterAdmin=async function(){const err=document.getElementById('authErr'),name=document.getElementById('aName').value.trim(),p=document.getElementById('aPass').value,p2=document.getElementById('aPass2').value,key=document.getElementById('aKey').value.trim().toUpperCase();
 if(!name||!key){err.textContent='Please fill in your name and the setup code.';return;}if(!ssPassRule(p)){err.textContent=ssPassMsg;return;}if(p!==p2){err.textContent='Passwords do not match.';return;}
 try{const d=await SS.api('firstRun',{setupCode:key,name,pin:p});await ssSaveUser(d,p);logActivity('Created the owner account');showIdConfirm(currentUser);}catch(e){err.textContent=e.message;}};
window.ssSetup=function(){return submitRegisterAdmin();};

/* ---------- Staff (server) ---------- */
renderStaffManagement=async function(){if(role()!=='admin')return;const body=document.getElementById('staffMgmtBody');if(!body)return;
 let list;try{list=await SS.api('staff.list',{token:currentUser.token});}catch(e){body.innerHTML=`<tr><td colspan="5" style="color:var(--muted);">${esc(e.message)} Staff management needs an internet connection.</td></tr>`;return;}
 window.ssStaffList=list;body.innerHTML=list.map(u=>{const self=u.id===currentUser.id,rb=ssRole(u.role),pill=u.active?`<span class="pill ok">${t('activeStatus')}</span>`:`<span class="pill low">${t('inactiveStatus')}</span>`,
  tog=self?'<span class="helptext">(you)</span>':`<button class="btn sm ghost" onclick="toggleUserActive('${u.id}',${u.active})">${u.active?t('deactivateBtn'):t('reactivateBtn')}</button>`;
  return `<tr><td class="mono">${esc(u.id)}</td><td>${esc(u.name)}</td><td><span class="rolebadge ${rb}">${rb}</span></td><td>${pill}</td><td style="white-space:nowrap;"><button class="btn sm ghost" onclick="ssEditStaff('${u.id}')">Edit</button> <button class="btn sm ghost" onclick="resetUserPassword('${u.id}')">${t('resetPasswordBtn')}</button> ${tog} ${self||u.id==='AD-001'?'':`<button class="btn sm ghost" style="color:#b3261e" onclick="ssDeleteStaff('${u.id}')">Delete</button>`}</td></tr>`;}).join('')
  +`<tr><td colspan="5"><div style="display:flex;gap:8px;flex-wrap:wrap;"><input id="ssNewStaff" placeholder="New team member's full name" style="flex:1;min-width:200px;">${currentUser.id==='AD-001'?'<select id="ssNewRole"><option value="staff">Staff</option><option value="owner">Admin</option></select>':''}<button class="btn sm gold" onclick="ssAddStaff()">Add staff member</button></div></td></tr>`;};
window.ssAddStaff=async function(){const n=document.getElementById('ssNewStaff').value.trim();if(!n)return alert('Type the staff member\'s full name first.');
 try{const rl=(document.getElementById('ssNewRole')||{value:'staff'}).value,r=await SS.api('staff.add',{token:currentUser.token,name:n,role:rl});logActivity(`Added ${rl==='owner'?'admin':'staff'} ${n} (${r.id})`);alert(`${rl==='owner'?'Admin':'Staff'} ID: ${r.id}\nTemporary password: ${r.passcode}\n\nGive these to them in person. The password is shown only once.`);renderStaffManagement();}catch(e){alert(e.message);}};
window.ssEditStaff=async function(id){const u=(window.ssStaffList||[]).find(x=>x.id===id);if(!u)return;
 const a=await ssAsk('Edit '+id,'Change the name. Use Reset password for the password.',[{label:'Full name',type:'text',value:u.name,max:60}],'Save');if(!a)return;
 const ch={name:a[0].trim()};
 if(currentUser.id==='AD-001'&&id!=='AD-001'){const nr=confirm(`Make ${a[0].trim()} ${u.role==='owner'?'a regular staff member':'an admin'}?\n\nPress OK to change the role, or Cancel to keep it.`);if(nr)ch.role=u.role==='owner'?'staff':'owner';}
 try{await SS.api('staff.update',{token:currentUser.token,staffId:id,changes:ch});logActivity(`Edited staff ${id}`);renderStaffManagement();}catch(e){alert(e.message);}};
window.ssDeleteStaff=async function(id){const u=(window.ssStaffList||[]).find(x=>x.id===id);if(!u)return;
 if(!confirm(`Delete ${u.name} (${id})?\n\nThey will be signed out and removed from this list. Their past sales keep their name.\n\nThis cannot be undone.`))return;
 try{await SS.api('staff.delete',{token:currentUser.token,staffId:id});logActivity(`Removed account ${id}`);renderStaffManagement();}catch(e){alert(e.message);}};
resetUserPassword=async function(id){if(!confirm(`Reset the password for ${id}? A new temporary password will be generated.`))return;
 try{const r=await SS.api('staff.resetPasscode',{token:currentUser.token,staffId:id});logActivity('Reset password for '+id);alert(`New temporary password for ${id}:\n\n${r.passcode}\n\nShared once. They should change it after logging in.`);}catch(e){alert(e.message);}};
toggleUserActive=async function(id,active){if(!confirm(`${active?'Deactivate':'Reactivate'} ${id}?${active?' They will no longer be able to log in.':''}`))return;
 try{await SS.api('staff.setActive',{token:currentUser.token,staffId:id,active:!active});logActivity(`${active?'Deactivated':'Reactivated'} ${id}`);renderStaffManagement();}catch(e){alert(e.message);}};
window.ssChangePass=async function(){if(!navigator.onLine)return alert('Changing your password needs an internet connection.');
 const a=await ssAsk('Change password','',[{label:'Current password'},{label:'New password (6+ characters, a number and a special character)'},{label:'Repeat the new password'}],'Change password');if(!a)return;const[o,n,n2]=a;
 if(!ssPassRule(n))return alert(ssPassMsg);if(n!==n2)return alert('The two new passwords do not match.');
 try{const d=await SS.api('changePasscode',{token:currentUser.token,oldPin:o,newPin:n});await ssSaveUser(d,n);sessionStorage.setItem('ch_current',JSON.stringify(currentUser));logActivity('Changed password');alert('Password changed. Other phones will ask you to log in again.');}catch(e){alert(e.message);}};

/* ---------- Subscription: lock, reminder, renewal ---------- */
SS.localLocked=()=>{const L=ssGet('ss_lic',null);return !!(L&&L.expiry&&ssToday()>=ssAddDays(L.expiry,+L.graceDays||0));};
const ssAddDays=(d,n)=>{const p=d.split('-').map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]+n)).toISOString().slice(0,10);};
SS.gate=async function(){let L=null;
 try{const d=await SS.api('license.status');L=d.license;ssSet('ss_lic',L);ssSet('ss_seen',Date.now());
  const fr=d.forceRefreshVersion,old=ssGet('ss_frv',null);if(fr)ssSet('ss_frv',fr);if(old&&fr&&old!==fr){(await caches.keys()).forEach(k=>caches.delete(k));location.reload();return false;}}
 catch(e){L=ssGet('ss_lic',null);if(Date.now()<ssGet('ss_seen',0)-300000){ssLock('This phone\'s date and time look wrong. Set them correctly to continue.',true);return false;}if(SS.localLocked())L=Object.assign({},L,{locked:true});}
 SS.lic=L;if(L&&L.locked){ssLock();return false;}return true;};
function ssLock(msg,clock){document.body.classList.add('ss-locked');const L=SS.lic||ssGet('ss_lic',{}),own=currentUser&&currentUser.role==='admin';
 ssOverlay(`<img class="lg" src="${SS_LOGO}" alt="Supershores"><h2>${esc(msg||'Subscription expired')}</h2>${clock?'':`<p>To renew, pay ${ssMoney(L.price)} to:<br><b>${esc(L.bank||'')}<br>${esc(L.accountName||'')}<br>${esc(L.accountNumber||'')}</b></p><p class="helptext">Sales already made are saved on this phone and will sync after renewal.</p>`}
  <div class="row">${clock?'':own?'<button class="btn gold" onclick="ssPay()">Upload payment receipt</button>':'<button class="btn gold" onclick="ssOwnerLogin()">Owner log in to renew</button>'}<button class="btn ghost" onclick="location.reload()">Check again</button></div>`);}
window.ssOwnerLogin=function(){ssClose();if(currentUser)logout();else renderAuthGate('login');};
SS.afterEnter=async function(){SS.token=currentUser.token;ssInjectPanels();
 const lb=document.querySelector('[onclick="logout()"]');if(lb&&!document.getElementById('ssChg')){const b=lb.cloneNode(true);b.id='ssChg';b.textContent='Password';b.setAttribute('onclick','ssChangePass()');lb.parentNode.insertBefore(b,lb);}
 if(!SS.dev_)SS.dev_=SS.dev();
 if(!(await SS.gate()))return;const L=SS.lic;
 if(L&&L.showReminder){const own=currentUser.role==='admin',head=L.state==='grace'?`Your subscription has ended. ${L.graceLeft} grace day${L.graceLeft===1?'':'s'} left`:`Subscription ends in ${L.daysLeft} day${L.daysLeft===1?'':'s'}`;
  ssOverlay(`<img class="lg" src="${settings.logo||SS_LOGO}" alt="Supershores"><h2>${head}</h2><p>To renew, pay ${ssMoney(L.price)} to:<br><b>${esc(L.bank)}<br>${esc(L.accountName)}<br>${esc(L.accountNumber)}</b></p>${own?'':'<p class="helptext">Please tell the owner.</p>'}<div class="row">${own?'<button class="btn gold" onclick="ssPay()">Upload receipt</button>':''}<button class="btn ghost" onclick="ssClose()">Later</button></div>`);}};
SS.dev=async function(){if(ssGet('ss_dev',null)){window.SALE_PREFIX=ssGet('ss_dev');return;}if(!navigator.onLine||!SS.token)return;
 try{const d=await SS.api('registerDevice',{token:SS.token,label:navigator.userAgent.slice(0,40)});ssSet('ss_dev',d.deviceCode);window.SALE_PREFIX=d.deviceCode;}catch(e){}};
const ssEnter=enterApp;enterApp=function(){ssEnter();SS.afterEnter();};

/* receipt reading: free OCR that runs in the browser */
const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const ssYmd=(y,m,d)=>{y=+y;if(y<100)y+=2000;m=+m;d=+d;return m<1||m>12||d<1||d>31?'':y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');};
function ssFindDate(t){const r=[];let m,x;x=/(\d{4})-(\d{2})-(\d{2})/g;while(m=x.exec(t))r.push(ssYmd(m[1],m[2],m[3]));
 x=/(\d{1,2})(?:st|nd|rd|th)?[\s\-\/,]+([A-Za-z]{3})[a-z]*[\s\-\/,]+(\d{2,4})/g;while(m=x.exec(t)){const o=MON[m[2].toLowerCase()];if(o)r.push(ssYmd(m[3],o,m[1]));}
 x=/([A-Za-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/g;while(m=x.exec(t)){const o=MON[m[1].toLowerCase()];if(o)r.push(ssYmd(m[3],o,m[2]));}
 x=/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/g;while(m=x.exec(t))r.push(ssYmd(m[3],m[2],m[1]));return r.find(d=>d&&Math.abs(new Date(d)-Date.now())<45*864e5)||'';}
function ssFindAmount(t){const c=[];let m,x=/(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{3,7}\.\d{2})/g;while(m=x.exec(t)){const v=parseFloat(m[1].replace(/,/g,''));if(v>=100&&v<1e8)c.push(v);}
 x=/(?:₦|NGN|#)\s?(\d{4,8})(?!\d)/g;while(m=x.exec(t))c.push(+m[1]);return c.length?Math.max(...c):0;}
const ssFindRef=t=>{const m=/(?:ref(?:erence)?|session\s*id|transaction\s*(?:no|id|ref)\w*)[^A-Za-z0-9]{0,6}([A-Za-z0-9\-]{8,40})/i.exec(t);return m?m[1]:'';};
const ssAcctMatch=(t,L)=>{const d=String(t).replace(/\D/g,''),num=String(L.accountNumber||'').replace(/\D/g,''),name=String(L.accountName||'').toLowerCase().split(/\s+/).filter(w=>w.length>2);
 return !!num&&(d.includes(num)||(d.includes(num.slice(-4))&&name.some(w=>String(t).toLowerCase().includes(w))));};
const ssLoadOcr=()=>window.Tesseract?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';s.onload=ok;s.onerror=()=>no(new Error('reader'));document.head.append(s);});
async function ssPrep(file){const b=await createImageBitmap(file),sc=Math.min(1,1400/Math.max(b.width,b.height)),c=document.createElement('canvas');c.width=Math.round(b.width*sc);c.height=Math.round(b.height*sc);
 c.getContext('2d').drawImage(b,0,0,c.width,c.height);let q=.75,u=c.toDataURL('image/jpeg',q);while(u.length>590000&&q>.3){q-=.1;u=c.toDataURL('image/jpeg',q);}return{c,u};}
window.ssPay=function(){const L=SS.lic||ssGet('ss_lic',{});
 ssOverlay(`<h2>Upload payment receipt</h2><p class="helptext">Pay ${ssMoney(L.price)} to ${esc(L.bank||'')}, ${esc(L.accountName||'')}, ${esc(L.accountNumber||'')}. Then add a clear screenshot or photo of the receipt.</p>
  <input type="file" id="ssFile" accept="image/*"><p class="helptext" id="ssMsg" role="status"></p><div id="ssBody"></div><button class="btn ghost" onclick="ssClose()">Close</button>`);
 document.getElementById('ssFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;let img,hash,A=0,D='',R='',note='',T='',acct=false;
  try{ssSay('Preparing the image...');img=await ssPrep(f);hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
   try{ssSay('Reading the receipt. This can take up to a minute the first time.');await ssLoadOcr();const r=await Tesseract.recognize(img.c,'eng');T=r.data.text;A=ssFindAmount(T);D=ssFindDate(T);R=ssFindRef(T);acct=ssAcctMatch(T,L);}
   catch(x){note='We could not read the receipt automatically. Please type the details from it.';}}catch(x){return ssSay('That image could not be opened. Try another one.');}
  if(!note&&(!A||!D))note='Please check the details below and fill in what we could not read.';ssSay(note||'Check these details, then submit.');
  document.getElementById('ssBody').innerHTML=`<label>Amount paid</label><input id="ssA" inputmode="decimal" value="${A||''}"><label>Date of payment (YYYY-MM-DD)</label><input id="ssD" value="${esc(D)}"><label>Reference (optional)</label><input id="ssR" value="${esc(R)}"><button class="btn gold" id="ssGo" style="width:100%;margin:6px 0 10px;">Submit receipt</button>`;
  document.getElementById('ssGo').onclick=async()=>{const b=document.getElementById('ssGo');b.disabled=true;ssSay('Sending...');
   try{const r=await SS.api('payment.submit',{token:currentUser.token,dataUrl:img.u,amount:+document.getElementById('ssA').value||0,payDate:document.getElementById('ssD').value.trim(),reference:document.getElementById('ssR').value.trim(),imageHash:hash,ocr:{read:{amount:!!A,date:!!D,ref:!!R,account:acct},edited:(+document.getElementById('ssA').value||0)!==A||document.getElementById('ssD').value.trim()!==D||document.getElementById('ssR').value.trim()!==R}});
    ssSay(r.message);if(r.license&&!r.license.locked){ssSet('ss_lic',r.license);setTimeout(()=>location.reload(),1800);}else b.hidden=true;}catch(x){ssSay(x.message);b.disabled=false;}};};};

/* ---------- Automatic updates ---------- */
if('serviceWorker'in navigator){let had=!!navigator.serviceWorker.controller;
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>{r.update();setInterval(()=>r.update(),30*60*1000);addEventListener('visibilitychange',()=>{if(!document.hidden)r.update();});});
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had){had=true;return;}
  if((typeof cart!=='undefined'&&cart.length)||document.getElementById('ssOv')){if(document.getElementById('ssBar'))return;const b=document.createElement('button');b.id='ssBar';b.className='ssbar';b.textContent='New version ready. Tap to update after this sale';b.onclick=()=>location.reload();document.body.append(b);}else location.reload();});}

/* ---------- Start ---------- */
const ssLogout=logout;logout=function(){SS.token=null;ssLogout();};
if(currentUser){SS.token=currentUser.token;SS.afterEnter();}else renderAuthGate('login');

/* ---------- The app keeps checking the subscription while it is open ---------- */
setInterval(()=>{if(currentUser&&!document.getElementById('ssOv'))SS.gate();},60000);
addEventListener('visibilitychange',()=>{if(!document.hidden&&currentUser&&!document.getElementById('ssOv'))SS.gate();});

/* ---------- Receipt template: the admin uploads an .html layout with {{placeholders}} ---------- */
function ssClean(html){const d=new DOMParser().parseFromString(String(html),'text/html');
 d.querySelectorAll('script,iframe,object,embed,link,meta,base,form,input,button,textarea,select,audio,video,source,frame').forEach(e=>e.remove());
 d.querySelectorAll('*').forEach(e=>{[...e.attributes].forEach(a=>{const n=a.name.toLowerCase(),v=a.value.trim().toLowerCase();
  if(n.startsWith('on')||((n==='src'||n==='href'||n==='xlink:href'||n==='action')&&!/^(data:image\/|#|\{\{)/.test(v)))e.removeAttribute(a.name);
  else if(n==='style'&&/url\(|expression\(|javascript:/.test(v)&&!/url\(\s*['"]?data:image/.test(v))e.removeAttribute(a.name);});});
 d.querySelectorAll('style').forEach(s=>{if(/@import|url\(\s*['"]?(?!data:image)|expression\(|javascript:/i.test(s.textContent))s.remove();});
 return Array.from(d.head.querySelectorAll('style')).map(s=>s.outerHTML).join('')+d.body.innerHTML;}
function ssRender(tpl,sale){const n=naira,e=esc,rows=sale.lines.map(l=>`<tr><td>${e(l.name)}</td><td style="text-align:right;white-space:nowrap">${l.qty} × ${n(l.price)}</td><td style="text-align:right">${n(l.qty*l.price)}</td></tr>`).join('');
 const dsc=sale.discount?+sale.discount.amount:0,M={business_name:e(settings.name),address:e(settings.address||''),phone:e(settings.phone||''),logo_src:settings.logo||'',
  logo:settings.logo?`<img src="${settings.logo}" style="max-height:60px;max-width:160px" alt="">`:'',receipt_no:e(sale.id),date:e(sale.isoDate||sale.date||''),time:e(sale.time||''),cashier:e(sale.staff||''),customer:e(sale.customer||''),
  items:`<table style="width:100%;border-collapse:collapse">${rows}</table>`,subtotal:n((+sale.subtotal||0)+dsc),discount:dsc?n(dsc):'',vat:sale.vatAmount?n(sale.vatAmount):'',total:n(sale.total),
  payment_method:e(sale.payment),status:sale.refunded?'REFUNDED':sale.payment==='Credit'?'ON CREDIT':'PAID',footer:e(settings.footer||'')};
 return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g,(m,k)=>k in M?M[k]:'');}
const ssShowReceipt=showReceipt;
showReceipt=function(sale){if(!settings.receiptTpl)return ssShowReceipt(sale);try{document.getElementById('receiptContent').innerHTML=ssRender(settings.receiptTpl,sale);document.getElementById('receiptOverlay').classList.add('active');}catch(e){ssShowReceipt(sale);}};
const SS_SAMPLE={id:'D1-0001',isoDate:'2026-10-14',time:'10:30',staff:'Sample (ST-001)',customer:'',payment:'Cash',lines:[{name:'Sample item',qty:2,price:1500},{name:'Another item',qty:1,price:850}],subtotal:3850,vatAmount:0,total:3850,discount:null,refunded:false};
const ssTplState=()=>{const s=document.getElementById('ssTplState');if(s)s.textContent=settings.receiptTpl?'Your template is in use on every phone.':'The standard receipt is in use.';};
window.ssTplSave=async function(){const f=document.getElementById('ssTplFile').files[0];if(!f)return alert('Choose your template file first.');const txt=await f.text();
 if(txt.length>20000)return alert('That template is too large. Keep it under 20,000 characters.');const clean=ssClean(txt);
 if(!/\{\{\s*items\s*\}\}/.test(clean)||!/\{\{\s*total\s*\}\}/.test(clean))return alert('Your template needs at least the {{items}} and {{total}} placeholders. Download the sample to see how.');
 settings.receiptTpl=clean;persistSettings();logActivity('Uploaded a receipt template');ssTplState();alert('Template saved. It now appears on receipts on every phone.');};
window.ssTplClear=function(){if(!confirm('Go back to the standard receipt?'))return;delete settings.receiptTpl;persistSettings();logActivity('Went back to the standard receipt');ssTplState();};
window.ssTplPreview=async function(){const f=document.getElementById('ssTplFile').files[0],tpl=f?ssClean(await f.text()):settings.receiptTpl;if(!tpl)return alert('Choose a template file to preview.');
 ssOverlay(`<h3 style="margin-top:0">Preview with sample items</h3><div style="background:#fff;padding:10px;border:1px solid #ddd;max-height:60vh;overflow:auto">${ssRender(tpl,SS_SAMPLE)}</div><div class="row" style="margin-top:10px"><button class="btn ghost" onclick="ssClose()">Close</button></div>`,true);};
window.ssTplSample=function(){const txt=`<!-- Receipt template. Edit the layout and styles, keep the {{placeholders}}. Scripts and outside links are removed for safety. -->
<!-- Placeholders: {{logo}} {{logo_src}} {{business_name}} {{address}} {{phone}} {{receipt_no}} {{date}} {{time}} {{cashier}} {{customer}} {{items}} {{subtotal}} {{discount}} {{vat}} {{total}} {{payment_method}} {{status}} {{footer}} -->
<style>.r{font-family:Arial,sans-serif;font-size:13px;color:#000}.r h2{margin:4px 0;text-align:center}.r .c{text-align:center}.r hr{border:0;border-top:1px dashed #000}.r .t{display:flex;justify-content:space-between;font-weight:bold;font-size:16px}</style>
<div class="r"><div class="c">{{logo}}</div><h2>{{business_name}}</h2><div class="c">{{address}}<br>{{phone}}</div><hr>
<div>Receipt {{receipt_no}}<br>{{date}} {{time}}<br>Served by {{cashier}}</div><hr>{{items}}<hr>
<div>Subtotal: {{subtotal}}</div><div>Discount: {{discount}}</div><div>VAT: {{vat}}</div><div class="t"><span>TOTAL</span><span>{{total}}</span></div>
<div>Paid by {{payment_method}} ({{status}})</div><hr><div class="c">{{footer}}</div></div>`;
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/html'}));a.download='receipt-template-sample.html';a.click();};

/* ---------- Reset inventory data (first admin only) ---------- */
window.ssResetData=async function(){if(currentUser.id!=='AD-001')return alert('Only the first admin can reset the data.');if(!navigator.onLine)return alert('A reset needs an internet connection.');
  const a=await ssAsk('Reset inventory data','This erases ALL items, stock, sales, expenses and customers for this business, on every phone. A backup copy is saved first.',[{label:'Your password'},{label:'Type RESET to confirm',type:'text',caps:true}],'Erase everything');if(!a)return;const pw=a[0];
 if(a[1].trim()!=='RESET')return alert('Reset cancelled. Nothing was erased.');
 try{const r=await SS.api('data.reset',{token:currentUser.token,pin:pw,confirm:'RESET'});SY.wipeLocal(r.epoch);logActivity('Reset all inventory data');alert('All inventory data was erased. A backup copy of the Sheet was saved first.');}catch(e){alert(e.message);}};
function ssInjectPanels(){const sc=document.getElementById('settingsContent');if(!sc)return;
 if(!document.getElementById('ssPanels'))sc.insertAdjacentHTML('beforeend',`<div id="ssPanels"><div class="panel"><h3>Receipt template</h3><p class="helptext">Upload your own receipt layout as an .html file. Use placeholders like {{business_name}}, {{items}} and {{total}}. <a onclick="ssTplSample()" style="cursor:pointer;text-decoration:underline">Download a sample</a> to start from.</p>
  <div class="form-row"><input type="file" id="ssTplFile" accept=".html,.htm,text/html"></div><p class="helptext" id="ssTplState"></p>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm gold" onclick="ssTplSave()">Use this template</button><button class="btn sm ghost" onclick="ssTplPreview()">Preview</button><button class="btn sm ghost" onclick="ssTplClear()">Use the standard receipt</button></div></div>
  <div class="panel" id="ssResetPanel" style="border:1px solid #b3261e"><h3 style="color:#b3261e">Reset inventory data</h3><p class="helptext">Erases every item, stock level, sale, expense and customer for this business on every phone. A backup copy of the whole Sheet is saved first. Staff accounts and settings are kept. Only the first admin can do this.</p>
  <button class="btn sm ghost" style="color:#b3261e" onclick="ssResetData()">Reset inventory data...</button></div></div>`);
 const rp=document.getElementById('ssResetPanel');if(rp)rp.style.display=currentUser&&currentUser.id==='AD-001'?'':'none';ssTplState();}

/* Buttons show what they are doing and cannot be tapped twice */
function ssBusy(fn,label){return async function(...a){const btn=document.querySelector('#authCard button[type=submit]'),t=btn&&btn.textContent;if(btn){btn.disabled=true;btn.textContent=label;}
 try{return await fn.apply(this,a);}finally{if(btn&&document.body.contains(btn)){btn.disabled=false;btn.textContent=t;}}};}
submitLogin=ssBusy(submitLogin,'Signing in...');submitRegisterAdmin=ssBusy(submitRegisterAdmin,'Creating account...');
{const sp=document.getElementById('ssSplash');if(sp){sp.style.transition='opacity .25s';sp.style.opacity='0';setTimeout(()=>sp.remove(),260);}}

/* ---------- Keyboard support ---------- */
(function(){
 const $=id=>document.getElementById(id);
 document.addEventListener('keydown',e=>{
  const t=e.target,k=e.key;if(e.isComposing||$('ssAsk'))return;      // the password box handles its own keys
    if($('lockGate').style.display==='flex')return;                    // the lock screen has its own password box
  if(k==='Escape'){                                                   // Esc closes the top box
   if($('ssOv')&&!document.body.classList.contains('ss-locked')){ssClose();return;}
   for(const [id,fn] of [['discountAuthOverlay',cancelDiscountAuth],['receiptOverlay',closeReceipt],['reportPrintOverlay',closeReportPrint],['scanOverlay',closeScanner],['tourOverlay',skipTour],['moreSheet',closeMore]]){
    const o=$(id);if(o&&o.classList.contains('active')){fn();return;}}
   return;}
  if(k!=='Enter'&&k!==' ')return;
  if((k==='Enter'||k===' ')&&t.matches&&t.matches('a[onclick]')){e.preventDefault();t.click();return;}
  if(k!=='Enter'||t.tagName!=='INPUT'||['checkbox','radio','file','button'].includes(t.type)||t.closest('form'))return;
  if(t.id==='saleSearch'){                                            // scanner gun or keyboard: Enter adds the item
   e.preventDefault();const q=t.value.trim(),ql=q.toLowerCase();if(!q)return;
   let m=items.find(i=>i.barcode&&i.barcode===q);
   if(!m){const r=items.filter(i=>i.name.toLowerCase().includes(ql)||(i.barcode||'').includes(q));if(r.length===1)m=r[0];}
   if(!m)return;
   if(itemAvailable(m)<1)return alert(m.name+' is out of stock.');
   addToCart(m.id);t.value='';renderSaleSearch();t.focus();return;}
  let fn={newExpenseAmount:submitExpense,newExpenseNote:submitExpense,newBranchName:addBranch,bundleComponentQty:addBundleComponent}[t.id];
  if(!fn&&t.closest('#addBox'))fn=submitNewItem;
  if(!fn&&t.closest('#addDebtorBox'))fn=submitNewDebtor;
  if(!fn&&t.closest('#discountBox'))fn=requestDiscount;
  if(fn){e.preventDefault();fn();}
 });
 const tab=()=>document.querySelectorAll('a[onclick]:not([tabindex])').forEach(a=>{a.tabIndex=0;a.setAttribute('role','button');});
 tab();new MutationObserver(tab).observe(document.body,{childList:true,subtree:true});
})();

/* ---------- Lock screen uses the 6 digit password (no separate PIN to set per phone) ---------- */
goToSetPin=function(){if(currentUser&&!currentUser.pinHash){currentUser.pinHash=currentUser.passHash;currentUser.pinSalt=currentUser.passSalt;const i=users.findIndex(u=>u.id===currentUser.id);if(i>=0){users[i]=currentUser;persistUsers();}}enterApp();};
showLockScreen=function(){if(!currentUser)return;enteredPin='';pinLockedUntil=0;
 document.getElementById('lockWho').textContent=`${currentUser.name} (${currentUser.id}) — enter your password`;
 document.getElementById('lockGate').style.display='flex';
 document.getElementById('pinDots').innerHTML='';
 const np=document.getElementById('numpad');np.style.display='block';
 np.innerHTML='<form autocomplete="off" onsubmit="event.preventDefault();ssUnlock();"><input type="password" id="lockPass" autocomplete="current-password" placeholder="Password" style="width:100%;padding:12px;border:1.5px solid var(--paper-line);border-radius:9px;font-size:15px;"><button type="submit" class="btn gold" style="width:100%;margin-top:10px;">Unlock</button></form>';
 setTimeout(()=>{const f=document.getElementById('lockPass');if(f)f.focus();},60);};
window.ssUnlock=async function(){const f=document.getElementById('lockPass'),err=document.getElementById('lockErr');if(!f||pinLockedUntil>Date.now())return;enteredPin=f.value;await checkPin(err);f.value='';};
renderPinDots=function(){};
renderNumpad=function(){const f=document.getElementById('lockPass');if(f){f.disabled=pinLockedUntil>Date.now();if(!f.disabled)f.focus();}};

/* ---------- Expiring-soon banner: stays on screen for every day before expiry ---------- */
SS.calc=function(L){if(!L||!L.expiry)return L;const a=ssToday().split('-').map(Number),b=L.expiry.split('-').map(Number),
 daysLeft=Math.round((Date.UTC(b[0],b[1]-1,b[2])-Date.UTC(a[0],a[1]-1,a[2]))/864e5),g=+L.graceDays||0,r=+L.remindDays||7;
 const state=L.state==='suspended'?'suspended':daysLeft>r?'active':daysLeft>0?'expiring':g+daysLeft>0?'grace':'expired';
 return Object.assign({},L,{daysLeft,state,showReminder:state!=='active',locked:state==='suspended'||state==='expired',graceLeft:daysLeft<=0?Math.max(0,g+daysLeft):g});};
SS.remind=function(){const L=SS.lic;if(!L||!L.showReminder||L.locked||!currentUser)return;const own=currentUser.role==='admin',
 head=L.state==='grace'?`Your subscription has ended. ${L.graceLeft} grace day${L.graceLeft===1?'':'s'} left`:`Subscription ends in ${L.daysLeft} day${L.daysLeft===1?'':'s'}`;
 ssOverlay(`<img class="lg" src="${settings.logo||SS_LOGO}" alt="Supershores"><h2>${head}</h2><p>To renew, pay ${ssMoney(L.price)} to:<br><b>${esc(L.bank)}<br>${esc(L.accountName)}<br>${esc(L.accountNumber)}</b></p>${own?'':'<p class="helptext">Please tell the owner.</p>'}<div class="row">${own?'<button class="btn gold" onclick="ssPay()">Upload receipt</button>':''}<button class="btn ghost" onclick="ssClose()">Close</button></div>`,true);};
SS.banner=function(){const L=SS.lic;let b=document.getElementById('ssExp');
 if(!currentUser||!L||!L.showReminder||L.locked){if(b)b.remove();return;}
 if(!b){b=document.createElement('button');b.id='ssExp';b.style.cssText='position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:9000;border:0;border-radius:99px;padding:7px 16px;font:700 13px/1.2 var(--font-sans,sans-serif);background:#F0A63D;color:#1b1b1b;box-shadow:0 2px 10px #0004;cursor:pointer;max-width:92vw';b.onclick=()=>SS.remind();document.body.append(b);}
 b.textContent=L.state==='grace'?`Subscription ended: ${L.graceLeft} grace day${L.graceLeft===1?'':'s'} left. Tap to renew`:`Subscription ends in ${L.daysLeft} day${L.daysLeft===1?'':'s'}. Tap to renew`;};
{const gate0=SS.gate;SS.gate=async function(){const ok=await gate0();if(!ok)return ok;if(SS.lic&&SS.lic.today!==ssToday())SS.lic=SS.calc(SS.lic);SS.banner();return ok;};   // works offline too, from the saved expiry date
 const out0=logout;logout=function(){const b=document.getElementById('ssExp');if(b)b.remove();out0();};}
