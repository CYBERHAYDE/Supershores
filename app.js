/* ================= Config ================= */
/* One-per-organization deployment: this file is handed to a single business, not
   distributed publicly, so this key only ever needs to resist that one business's
   own staff — not the general public. Still, CyberHayde should generate a fresh
   random key per client at setup time (never reuse '4471' across deployments) and
   only tell the actual business owner, not the person doing the install. */
const ADMIN_SETUP_KEY = '';

/* ================= Fictional gadget catalog ================= */
let items = JSON.parse(SSLS.getItem('ch_items') || 'null') || [];
const CATEGORIES = ['General'];

/* Seed sales carry a relative day label ('Mon'/'Tue'/'Today') for display,
   plus a real computed isoDate below so date-range filtering and the future
   estimate are working against genuine dates, not just string labels. */
let sales = JSON.parse(SSLS.getItem('ch_sales') || 'null') || [];
function isoDaysAgo(n){ const d = new Date(); d.setDate(d.getDate()-n); return localIso(d).slice(0,10); }
// Backfill isoDate once per load, whether from seed defaults or a saved localStorage
// copy from before this field existed — never overwrites a sale that already has one
// (e.g. a real sale completed today keeps its real completion date).
sales.forEach(s=>{ if(!s.isoDate) s.isoDate = isoDaysAgo(s.daysAgo||0); });
function nextSaleNo(){ const n=(+SSLS.getItem('ch_sale_counter')||0)+1; SSLS.setItem('ch_sale_counter',n); return String(n).padStart(4,'0'); }

let settings = JSON.parse(SSLS.getItem('ch_settings') || 'null') || {
  name:'Supershores', phone:'', address:'',
  footer:'Thank you for shopping with us.', paper:'Thermal 58mm', wa:'', lockTimeout:60, vatRate:0, btService:'000018f0-0000-1000-8000-00805f9b34fb', btChar:'00002af1-0000-1000-8000-00805f9b34fb',
  brandPrimary:'#1B4F9C', brandAccent:'#F0A63D', logo:window.SS_LOGO||null
};
const DEFAULT_BRAND_PRIMARY = '#1B4F9C', DEFAULT_BRAND_ACCENT = '#F0A63D';
let branches = JSON.parse(SSLS.getItem('ch_branches') || 'null') || ['Main'];
function persistBranches(){ SSLS.setItem('ch_branches', JSON.stringify(branches)); }

/* ================= Debtors (customer credit ledger) ================= */
let debtors = JSON.parse(SSLS.getItem('ch_debtors') || 'null') || [];
function persistDebtors(){ SSLS.setItem('ch_debtors', JSON.stringify(debtors)); }
function findOrCreateDebtor(name, phone){
  let d = debtors.find(x=>x.name.toLowerCase()===name.toLowerCase().trim());
  if(!d){ d = { id:'CU-'+String(Math.max(0,...debtors.map(d=>+String(d.id).replace(/\D/g,'')||0))+1).padStart(3,'0'), name:name.trim(), phone:phone||'', balance:0, history:[] }; debtors.push(d); }
  return d;
}

/* ================= Expenses ================= */
let expenses = JSON.parse(SSLS.getItem('ch_expenses') || 'null') || [];
function persistExpenses(){ SSLS.setItem('ch_expenses', JSON.stringify(expenses)); }

/* ================= Users / auth ================= */
let users = JSON.parse(SSLS.getItem('ch_users') || '[]');
let activityLog = JSON.parse(SSLS.getItem('ch_log') || '[]');
let currentUser = JSON.parse(sessionStorage.getItem('ch_current') || 'null');
let cart = [];
let pendingRegUser = null; // holds a just-registered user awaiting PIN setup
let scanTarget = null; // 'inventory' | 'sale'
let lockTimer = null;
let enteredPin = '';

function persistUsers(){ SSLS.setItem('ch_users', JSON.stringify(users)); }
function persistLog(){ SSLS.setItem('ch_log', JSON.stringify(activityLog)); }
function persistItems(){ SSLS.setItem('ch_items', JSON.stringify(items)); }
function persistSales(){ SSLS.setItem('ch_sales', JSON.stringify(sales)); }
function persistSettings(){ SSLS.setItem('ch_settings', JSON.stringify(settings)); }

function nextUserId(role){ const count = users.filter(u=>u.role===role).length + 1; return (role==='admin' ? 'AD-' : 'ST-') + String(count).padStart(3,'0'); }
function logActivity(action){
  const who = currentUser ? `${currentUser.name} (${currentUser.id})` : 'System';
  const roleLabel = currentUser ? currentUser.role : '—';
  activityLog.push({ time: new Date().toLocaleString('en-NG',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'}), user: who, role: roleLabel, action });
  persistLog();
}
function localIso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function todayIso(){ return localIso(new Date()); }
function naira(n){ return '₦' + Number(n||0).toLocaleString('en-NG'); }

/* ---- XSS-safe escaping for any user-supplied text going into innerHTML ---- */
function esc(str){
  return String(str==null?'':str).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

/* ---- Client-side password hashing (SHA-256 + per-user salt via Web Crypto) ----
   NOTE: this is a mitigation, not a fix. Hashing happens in the browser, so it stops
   plaintext passwords sitting in localStorage in the clear (protects against casual
   device access / exported backups), but it can't stop someone reading the app's own
   JS and reproducing the hash function — that class of attack only goes away with a
   real server that verifies passwords and never ships the check to the client. */
async function hashSecret(secret, saltHex){
  const enc = new TextEncoder();
  const data = enc.encode(saltHex + ':' + secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function randomSaltHex(){
  const arr = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ---- Auth gate rendering ---- */
function renderAuthGate(view){
  const card = document.getElementById('authCard');
  const hasAdmin = users.some(u=>u.role==='admin');
  if(!hasAdmin && view!=='registerAdmin') view = 'registerAdmin';
  if(!view) view = hasAdmin ? 'login' : 'registerAdmin';

  if(view==='registerAdmin'){
    card.innerHTML = `
      <div class="amark">A</div>
      <h2>${hasAdmin ? 'Register an Admin account' : 'Welcome — set up the Admin account'}</h2>
      <p class="sub">${hasAdmin ? 'Only someone with the setup key can create another admin account.' : 'This is the first time the app is opening. Create the owner/admin account to get started.'}</p>
      <form autocomplete="on" onsubmit="event.preventDefault(); submitRegisterAdmin();">
        <div class="form-row"><label>Your full name</label><input type="text" id="aName" name="name" autocomplete="name" placeholder="e.g. Full name"></div>
        <div class="form-row"><label>Create a password</label><input type="password" id="aPass" name="new-password" autocomplete="new-password" placeholder="At least 4 characters"></div>
        <div class="form-row"><label>Confirm password</label><input type="password" id="aPass2" name="new-password-confirm" autocomplete="new-password" placeholder="Re-enter password"></div>
        <div class="form-row"><label>Admin setup key</label><input type="password" id="aKey" name="setup-key" autocomplete="off" placeholder="Ask the business owner for this"></div>
        <div class="demohint">Demo setup key: <b class="mono">${ADMIN_SETUP_KEY}</b> — in a real deployment this key is private and only shared by CyberHayde with the actual business owner.</div>
        <div class="errtext" id="authErr"></div>
        <button type="submit" class="btn gold" style="width:100%; margin-top:14px;">Create Admin account</button>
      </form>
      ${hasAdmin ? `<div class="switchline">Already have an account? <a onclick="renderAuthGate('login')">Log in</a></div>` : ''}
    `;
  } else if(view==='registerStaff'){
    card.innerHTML = `
      <div class="amark">A</div>
      <h2>Register as Staff</h2>
      <p class="sub">No setup key needed — an admin can see exactly who registers, and when, in the Activity Log.</p>
      <form autocomplete="on" onsubmit="event.preventDefault(); submitRegisterStaff();">
        <div class="form-row"><label>Your full name</label><input type="text" id="sName" name="name" autocomplete="name" placeholder="e.g. Tunde Balogun"></div>
        <div class="form-row"><label>Create a password</label><input type="password" id="sPass" name="new-password" autocomplete="new-password" placeholder="At least 4 characters"></div>
        <div class="form-row"><label>Confirm password</label><input type="password" id="sPass2" name="new-password-confirm" autocomplete="new-password" placeholder="Re-enter password"></div>
        <div class="errtext" id="authErr"></div>
        <button type="submit" class="btn gold" style="width:100%; margin-top:6px;">Register</button>
      </form>
      <div class="switchline">Already registered? <a onclick="renderAuthGate('login')">Log in</a></div>
    `;
  } else {
    card.innerHTML = `
      <div class="amark">A</div>
      <h2>Log in</h2>
      <p class="sub">Enter the ID you were given when you registered.</p>
      <form autocomplete="on" onsubmit="event.preventDefault(); submitLogin();">
        <div class="form-row"><label>Your ID</label><input type="text" id="lId" name="username" autocomplete="username" placeholder="e.g. ST-001"></div>
        <div class="form-row"><label>Password</label><input type="password" id="lPass" name="password" autocomplete="current-password" placeholder="Your password"></div>
        <div class="errtext" id="authErr"></div>
        <button type="submit" class="btn gold" style="width:100%; margin-top:6px;">Log in</button>
      </form>
      <div class="switchline">New staff member? <a onclick="renderAuthGate('registerStaff')">Register here</a></div>
      <div class="switchline">Setting up as the owner? <a onclick="renderAuthGate('registerAdmin')">Admin setup</a></div>
    `;
  }
}
function showIdConfirm(user){
  const card = document.getElementById('authCard');
  card.innerHTML = `
    <div class="amark">A</div>
    <h2>You're all set, ${esc(user.name.split(' ')[0])}</h2>
    <p class="sub">Save this ID — you'll use it to log in every time after today.</p>
    <div class="yourid"><div class="lbl">Your login ID</div><div class="val">${esc(user.id)}</div></div>
    <button class="btn gold" style="width:100%;" onclick="goToSetPin()">Continue</button>
  `;
}
function goToSetPin(){
  const card = document.getElementById('authCard');
  card.innerHTML = `
    <div class="amark">🔐</div>
    <h2>Set a quick unlock PIN</h2>
    <p class="sub">Used only to unlock the app fast if it locks itself from inactivity — your password still protects full login.</p>
    <form autocomplete="off" onsubmit="event.preventDefault(); submitSetPin();">
      <div class="form-row"><label>4-digit PIN</label><input type="password" maxlength="4" inputmode="numeric" id="setupPin" autocomplete="off" placeholder="e.g. 2468"></div>
      <div class="form-row"><label>Confirm PIN</label><input type="password" maxlength="4" inputmode="numeric" id="setupPin2" autocomplete="off" placeholder="Re-enter PIN"></div>
      <div class="errtext" id="authErr"></div>
      <button type="submit" class="btn gold" style="width:100%;">Finish setup</button>
    </form>
  `;
}
async function submitSetPin(){
  const p1 = document.getElementById('setupPin').value, p2 = document.getElementById('setupPin2').value;
  const err = document.getElementById('authErr');
  if(!/^\d{4}$/.test(p1)){ err.textContent = 'PIN should be exactly 4 digits.'; return; }
  if(p1!==p2){ err.textContent = 'PINs do not match.'; return; }
  const salt = randomSaltHex();
  currentUser.pinSalt = salt;
  currentUser.pinHash = await hashSecret(p1, salt);
  delete currentUser.pin; // legacy plaintext field, if present from an older session
  const idx = users.findIndex(u=>u.id===currentUser.id); users[idx] = currentUser; persistUsers();
  enterApp();
}
async function submitRegisterAdmin(){
  const name = document.getElementById('aName').value.trim();
  const pass = document.getElementById('aPass').value;
  const pass2 = document.getElementById('aPass2').value;
  const key = document.getElementById('aKey').value;
  const err = document.getElementById('authErr');
  if(!name || !pass){ err.textContent = 'Please fill in your name and a password.'; return; }
  if(pass.length<4){ err.textContent = 'Password should be at least 4 characters.'; return; }
  if(pass!==pass2){ err.textContent = 'Passwords do not match.'; return; }
  if(key!==ADMIN_SETUP_KEY){ err.textContent = 'Incorrect setup key — ask the business owner for this.'; return; }
  const salt = randomSaltHex();
  const user = { id: nextUserId('admin'), name, role:'admin', passSalt: salt, passHash: await hashSecret(pass, salt), pinHash:null, pinSalt:null, active:true };
  users.push(user); persistUsers(); currentUser = user;
  logActivity('Registered a new Admin account');
  showIdConfirm(user);
}
async function submitRegisterStaff(){
  const name = document.getElementById('sName').value.trim();
  const pass = document.getElementById('sPass').value;
  const pass2 = document.getElementById('sPass2').value;
  const err = document.getElementById('authErr');
  if(!name || !pass){ err.textContent = 'Please fill in your name and a password.'; return; }
  if(pass.length<4){ err.textContent = 'Password should be at least 4 characters.'; return; }
  if(pass!==pass2){ err.textContent = 'Passwords do not match.'; return; }
  const salt = randomSaltHex();
  const user = { id: nextUserId('staff'), name, role:'staff', passSalt: salt, passHash: await hashSecret(pass, salt), pinHash:null, pinSalt:null, active:true };
  users.push(user); persistUsers(); currentUser = user;
  logActivity('Registered a new Staff account');
  showIdConfirm(user);
}
/* ---- Login lockout: 5 wrong attempts per ID locks that ID out for 5 minutes.
   Stored in localStorage so it survives a page refresh (can't just be beaten by reloading). */
const LOGIN_MAX_ATTEMPTS = 5, LOGIN_LOCK_MS = 5*60*1000;
function getLoginAttempts(){ return JSON.parse(SSLS.getItem('ch_login_attempts')||'{}'); }
function setLoginAttempts(obj){ SSLS.setItem('ch_login_attempts', JSON.stringify(obj)); }
async function submitLogin(){
  const id = document.getElementById('lId').value.trim().toUpperCase();
  const pass = document.getElementById('lPass').value;
  const err = document.getElementById('authErr');
  const attempts = getLoginAttempts();
  const rec = attempts[id];
  if(rec && rec.lockedUntil && rec.lockedUntil>Date.now()){
    const mins = Math.ceil((rec.lockedUntil-Date.now())/60000);
    err.textContent = `Too many wrong attempts. Try again in about ${mins} minute${mins===1?'':'s'}.`;
    return;
  }
  const user = users.find(u=>u.id===id);
  const ok = user && user.passHash===await hashSecret(pass, user.passSalt);
  if(!ok){
    const count = (rec && !rec.lockedUntil ? rec.count : 0) + 1;
    if(count>=LOGIN_MAX_ATTEMPTS){ attempts[id] = { count:0, lockedUntil: Date.now()+LOGIN_LOCK_MS }; err.textContent = `Too many wrong attempts. Locked for 5 minutes.`; }
    else{ attempts[id] = { count, lockedUntil:null }; err.textContent = `ID or password not recognized. (${LOGIN_MAX_ATTEMPTS-count} attempt${LOGIN_MAX_ATTEMPTS-count===1?'':'s'} left before a lockout)`; }
    setLoginAttempts(attempts);
    return;
  }
  delete attempts[id]; setLoginAttempts(attempts);
  if(user.active===false){ err.textContent = 'This account has been deactivated. Contact your admin.'; return; }
  currentUser = user;
  logActivity('Logged in');
  if(!user.pinHash) goToSetPin(); else enterApp();
}
function enterApp(){
  sessionStorage.setItem('ch_current', JSON.stringify(currentUser));
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('whoName').textContent = currentUser.name;
  document.getElementById('whoId').textContent = currentUser.id;
  const rb = document.getElementById('whoRole'); rb.textContent = currentUser.role; rb.className = 'rolebadge ' + currentUser.role;
  applyRoleLocks(); applyI18n(); renderAll(); resetLockTimer();
  maybeShowTour();
}

/* ================= Onboarding tour ================= */
/* Shown once ever per device (not per-user), the first time ANY account
   lands on the app after setup — most useful for the very first Admin, but
   harmless for the first Staff member too since it explains the app either way. */
const TOUR_STEPS = [
  { icon:'👋', titleKey:'tourStep0Title', bodyKey:'tourStep0Body' },
  { icon:'🏠', titleKey:'tourStep1Title', bodyKey:'tourStep1Body' },
  { icon:'📦', titleKey:'tourStep2Title', bodyKey:'tourStep2Body' },
  { icon:'🧾', titleKey:'tourStep3Title', bodyKey:'tourStep3Body' },
  { icon:'📊', titleKey:'tourStep4Title', bodyKey:'tourStep4Body' },
  { icon:'✅', titleKey:'tourStep5Title', bodyKey:'tourStep5Body' }
];
let tourStep = 0;
function maybeShowTour(){
  if(SSLS.getItem('ch_tour_seen')) return;
  tourStep = 0;
  renderTourStep();
  document.getElementById('tourOverlay').classList.add('active');
}
function renderTourStep(){
  const s = TOUR_STEPS[tourStep];
  document.getElementById('tourIcon').textContent = s.icon;
  document.getElementById('tourTitle').textContent = t(s.titleKey);
  document.getElementById('tourBody').textContent = t(s.bodyKey);
  document.getElementById('tourNextBtn').textContent = tourStep===TOUR_STEPS.length-1 ? t('tourGo') : t('tourNext');
}
function nextTourStep(){
  tourStep++;
  if(tourStep>=TOUR_STEPS.length){ endTour(); return; }
  renderTourStep();
}
function skipTour(){ endTour(); }
function endTour(){
  SSLS.setItem('ch_tour_seen','1');
  document.getElementById('tourOverlay').classList.remove('active');
}
function logout(){
  logActivity('Logged out'); currentUser = null; sessionStorage.removeItem('ch_current');
  clearTimeout(lockTimer);
  document.getElementById('authGate').style.display = 'flex';
  renderAuthGate('login');
}

/* ---- Auto-lock ---- */
['mousemove','keydown','click','touchstart'].forEach(ev=>document.addEventListener(ev, ()=>{ if(currentUser) resetLockTimer(); }));
function resetLockTimer(){
  clearTimeout(lockTimer);
  const secs = settings.lockTimeout;
  if(!secs) return;
  lockTimer = setTimeout(showLockScreen, secs*1000);
}
function showLockScreen(){
  if(!currentUser) return;
  enteredPin = ''; pinLockedUntil = 0;
  document.getElementById('lockWho').textContent = `${currentUser.name} (${currentUser.id}) — enter your PIN`;
  document.getElementById('lockGate').style.display = 'flex';
  renderPinDots(); renderNumpad();
}
function renderPinDots(){
  document.getElementById('pinDots').innerHTML = [0,1,2,3].map(i=>`<div class="dot ${i<enteredPin.length?'filled':''}"></div>`).join('');
}
function renderNumpad(){
  const keys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];
  document.getElementById('numpad').innerHTML = keys.map(k=>`<button onclick="pinKey('${k}')" ${pinLockedUntil>Date.now()?'disabled':''}>${k}</button>`).join('');
}
/* ---- PIN lockout: 5 wrong PINs locks the unlock pad for 30s (a stolen/borrowed
   device can't be brute-forced against a 4-digit PIN indefinitely). Falls back to
   full password login via "Not you? Log out" at any time. */
let pinFailCount = 0, pinLockedUntil = 0;
async function pinKey(k){
  const err = document.getElementById('lockErr');
  if(pinLockedUntil>Date.now()) return;
  if(k==='⌫'){ enteredPin = enteredPin.slice(0,-1); err.textContent=''; renderPinDots(); return; }
  if(k==='✓'){ await checkPin(err); return; }
  if(enteredPin.length<4){ enteredPin += k; renderPinDots(); err.textContent=''; }
  if(enteredPin.length===4){ await checkPin(err); }
}
async function checkPin(err){
  const hash = await hashSecret(enteredPin, currentUser.pinSalt);
  if(hash===currentUser.pinHash){ document.getElementById('lockGate').style.display='none'; pinFailCount=0; resetLockTimer(); return; }
  pinFailCount++;
  enteredPin='';
  if(pinFailCount>=5){
    pinLockedUntil = Date.now()+30000;
    err.textContent = 'Too many wrong PINs. Locked for 30 seconds — or log out and use your password.';
    renderNumpad();
    setTimeout(()=>{ pinFailCount=0; pinLockedUntil=0; err.textContent=''; renderNumpad(); }, 30000);
  } else {
    err.textContent = `Incorrect PIN. (${5-pinFailCount} left before a short lockout)`;
  }
  renderPinDots();
}

/* ================= Tabs, bottom nav, role locks ================= */
document.getElementById('tabs').addEventListener('click', e=>{ const btn=e.target.closest('button'); if(!btn||btn.dataset.locked==='1') return; switchView(btn.dataset.view); });
function switchView(name){
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  document.querySelectorAll('#bottomNav button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  renderAll();
}
function openMore(){ document.getElementById('moreSheet').classList.add('active'); }
function closeMore(){ document.getElementById('moreSheet').classList.remove('active'); }
function fromMore(view){ closeMore(); if(document.getElementById('more'+view.charAt(0).toUpperCase()+view.slice(1)).dataset.locked==='1') return; switchView(view); }

function role(){ return currentUser ? currentUser.role : 'staff'; }
function applyRoleLocks(){
  const isStaff = role()==='staff';
  ['tabReports','tabActivity','tabCloseday','tabSettings','tabExpenses'].forEach(id=>document.getElementById(id).dataset.locked = isStaff?'1':'0');
  ['moreReports','moreActivity','moreCloseday','moreSettings','moreExpenses'].forEach(id=>document.getElementById(id).dataset.locked = isStaff?'1':'0');
  document.getElementById('expensesLocked').style.display = isStaff?'block':'none';
  document.getElementById('expensesContent').style.display = isStaff?'none':'block';
  document.getElementById('reportsLocked').style.display = isStaff?'block':'none';
  document.getElementById('reportsContent').style.display = isStaff?'none':'block';
  document.getElementById('activityLocked').style.display = isStaff?'block':'none';
  document.getElementById('activityContent').style.display = isStaff?'none':'block';
  document.getElementById('closedayLocked').style.display = isStaff?'block':'none';
  document.getElementById('closedayContent').style.display = isStaff?'none':'block';
  document.getElementById('settingsLocked').style.display = isStaff?'block':'none';
  document.getElementById('settingsContent').style.display = isStaff?'none':'block';
  document.getElementById('costFieldWrap').style.display = isStaff?'none':'block';
  document.getElementById('staffCostNote').style.display = isStaff?'block':'none';
  document.getElementById('importBtn').style.display = isStaff?'none':'inline-flex';
  const activeTab = document.querySelector('nav.tabs button.active').dataset.view;
  if(isStaff && ['reports','activity','closeday','settings','expenses'].includes(activeTab)) switchView('dashboard');
}

/* ================= Dashboard ================= */
function renderDashboard(){
  const today = sales.filter(s=>s.isoDate===todayIso() && !s.refunded);
  const todaysTotal = today.reduce((s,x)=>s+x.total,0);
  const lowStock = items.filter(i=>i.stock<=i.reorder);
  const stockValue = items.reduce((s,i)=>s+(i.cost||0)*i.stock,0);
  const qtyByItem = {};
  today.forEach(s=>s.lines.forEach(l=>{ qtyByItem[l.name]=(qtyByItem[l.name]||0)+l.qty; }));
  const topSeller = Object.entries(qtyByItem).sort((a,b)=>b[1]-a[1])[0];
  let cards = `
    <div class="card"><div class="k">${t('cardTodaysSales')}</div><div class="v">${naira(todaysTotal)}</div><div class="foot">${t('cardTransactionsFoot',{n:today.length})}</div></div>
    <div class="card" style="cursor:pointer;" onclick="scrollToLowStock()"><div class="k">${t('cardLowStockAlerts')}</div><div class="v ${lowStock.length?'alert':'good'}">${lowStock.length}</div><div class="foot">${t('cardLowStockFoot')}</div></div>
    <div class="card"><div class="k">${t('cardTopSeller')}</div><div class="v" style="font-size:15px;">${topSeller?esc(topSeller[0]):'—'}</div><div class="foot">${topSeller?t('cardSoldFoot',{n:topSeller[1]}):''}</div></div>`;
  cards += role()==='admin'
    ? `<div class="card"><div class="k">${t('cardStockValueCost')}</div><div class="v">${naira(stockValue)}</div><div class="foot">${t('cardAdminOnlyFoot')}</div></div>`
    : `<div class="card"><div class="k">${t('cardStockValue')}</div><div class="v" style="font-size:13px; color:var(--muted);">${t('cardAdminOnly')}</div><div class="foot">${t('cardNotVisibleStaff')}</div></div>`;
  document.getElementById('dashCards').innerHTML = cards;
  document.getElementById('lowStockBody').innerHTML = lowStock.map(i=>`
    <tr><td>${photoCell(i)}</td><td>${esc(i.name)}</td><td>${esc(i.category)}</td><td class="mono">${i.stock} ${esc(i.unit)}</td><td class="mono">${i.reorder}</td><td><span class="pill low">${t('reorderSoonPill')}</span></td></tr>`).join('')
    || `<tr><td colspan="6" style="color:var(--muted);">Nothing needs reordering right now.</td></tr>`;
  const waWrap = document.getElementById('lowStockWaBtn');
  waWrap.innerHTML = (role()==='admin' && lowStock.length) ? `<button class="btn sm ghost" onclick="printLowStock()">🖨 Print</button> <button class="btn sm sage wabtn" onclick="shareLowStockWa()">💬 ${t('waAdminBtn')}</button>` : '';

  // Expiring soon — only shown at all once at least one item in the catalog has
  // an expiry date set. Most gadget items never will; this panel matters far
  // more for pharmacy/cosmetics/food clients using the same underlying app.
  const withExpiry = items.map(i=>({ i, es: expiryStatus(i.expiry) })).filter(x=>x.es && x.es.days<=30).sort((a,b)=>a.es.days-b.es.days);
  const expPanel = document.getElementById('expiringPanel');
  if(withExpiry.length){
    expPanel.style.display = 'block';
    document.getElementById('expiringBody').innerHTML = withExpiry.map(({i,es})=>`
      <tr><td>${photoCell(i)}</td><td>${esc(i.name)}</td><td>${esc(i.category)}</td><td class="mono">${i.stock} ${esc(i.unit)}</td><td><span class="pill low">${es.label}</span></td></tr>`).join('');
  } else { expPanel.style.display = 'none'; }
}
function photoCell(i){ return i.photo ? `<img class="thumb" src="${esc(i.photo)}">` : `<div class="thumb-ph">📦</div>`; }

/* ================= Inventory ================= */
function populateCategoryFilters(){
  const sel = document.getElementById('invCategory');
  if(sel.options.length===1) CATEGORIES.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; sel.appendChild(o); });
  const newSel = document.getElementById('newCategory');
  if(newSel.options.length===0) CATEGORIES.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; newSel.appendChild(o); });
  populateBranchSelects();
}
function populateBranchSelects(){
  const filterSel = document.getElementById('invBranch');
  const formSel = document.getElementById('newBranch');
  [filterSel, formSel].forEach(sel=>{
    if(!sel) return;
    const keep = sel===filterSel ? '' : null; // filter keeps its "All branches" first option
    const startAt = sel===filterSel ? 1 : 0;
    while(sel.options.length>startAt) sel.remove(startAt);
    branches.forEach(b=>{ const o=document.createElement('option'); o.value=b; o.textContent=b; sel.appendChild(o); });
  });
}
function renderBranchList(){
  const wrap = document.getElementById('branchList');
  if(!wrap) return;
  wrap.innerHTML = branches.map(b=>`
    <span class="rolebadge admin" style="display:inline-flex; align-items:center; gap:6px; margin:0 6px 6px 0; padding:5px 10px;">
      ${esc(b)} ${branches.length>1 ? `<a onclick="removeBranch('${esc(b)}')" style="cursor:pointer; font-weight:700;">✕</a>` : ''}
    </span>`).join('');
}
function addBranch(){
  const name = document.getElementById('newBranchName').value.trim();
  if(!name){ return; }
  if(branches.some(b=>b.toLowerCase()===name.toLowerCase())){ alert('That branch already exists.'); return; }
  branches.push(name); persistBranches();
  logActivity(`Added branch "${name}"`);
  document.getElementById('newBranchName').value='';
  populateBranchSelects(); renderBranchList();
}
function removeBranch(name){
  if(items.some(i=>i.branch===name)){ alert(`Can't remove "${name}" — some products are still tagged to it. Reassign them first.`); return; }
  if(!confirm(`Remove branch "${name}"?`)) return;
  branches = branches.filter(b=>b!==name); persistBranches();
  logActivity(`Removed branch "${name}"`);
  populateBranchSelects(); renderBranchList();
}
function renderInventory(){
  populateCategoryFilters();
  renderBranchList();
  const q = document.getElementById('invSearch').value.toLowerCase();
  const branchFilter = document.getElementById('invBranch').value;
  const cat = document.getElementById('invCategory').value;
  const rows = items.filter(i => (!cat || i.category===cat) && (!branchFilter || i.branch===branchFilter) && (i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || (i.barcode||'').includes(q)));
  const isAdmin = role()==='admin';
  document.getElementById('invHead').innerHTML = isAdmin
    ? `<tr><th></th><th>${t('colItem')}</th><th>${t('colCategory')}</th><th>${t('colStock')}</th><th>${t('colCost')}</th><th>${t('colSellPrice')}</th><th>${t('colMargin')}</th><th>${t('colStatus')}</th><th></th></tr>`
    : `<tr><th></th><th>${t('colItem')}</th><th>${t('colCategory')}</th><th>${t('colStock')}</th><th>${t('colSellPrice')}</th><th>${t('colStatus')}</th><th></th></tr>`;
  document.getElementById('invBody').innerHTML = rows.map(i=>{
    const low = (i.bundle ? bundleAvailableStock(i) : i.stock) <= i.reorder;
    const expiryInfo = expiryStatus(i.expiry);
    const status = `<span class="pill ${low?'low':'ok'}">${low?t('lowStockPill'):t('inStockPill')}</span>${expiryInfo ? ` <span class="pill ${expiryInfo.pillClass}">${expiryInfo.label}</span>` : ''}`;
    if(editingItemId===i.id) return renderEditRow(i, isAdmin);
    if(restockingItemId===i.id) return renderRestockRow(i);
    const nameCell = `${esc(i.name)}${i.bundle?` <span class="pill ok">${t('bundlePill')}</span>`:''}${i.trackBatches?` <a onclick="viewBatches(${i.id})" style="cursor:pointer; font-size:10.5px; color:var(--muted);">🏷 ${t('batchesLink')}</a>`:''}${i.supplier ? `<br><span class="stock" style="color:var(--muted);">${t('supplierLabel')}: ${esc(i.supplier)}</span>` : ''}${i.branch ? `<br><span class="stock" style="color:var(--muted);">📍 ${esc(i.branch)}</span>` : ''}`;
    const costCell = i.cost==null ? `<span class="pill pending">${t('pendingCost')}</span>` : `<span class="mono">${naira(i.cost)}</span>`;
    const margin = i.cost==null ? '—' : (((i.price-i.cost)/i.price)*100).toFixed(0)+'%';
    const displayStock = i.bundle ? bundleAvailableStock(i) : i.stock;
    // Editing price/cost is Admin-only, by design — staff get a Restock action
    // (adds stock, optional supplier/expiry) instead of the ability to overwrite
    // price, which is one of the fraud-prevention rules this app is built around.
    const actionBtns = isAdmin
      ? `<button class="btn sm ghost" onclick="startEditItem(${i.id})" title="${t('editTitle')}">✎ ${t('editBtn')}</button> ${i.bundle?'':`<button class="btn sm ghost" onclick="startRestock(${i.id})" title="${t('restockTitle')}">↻ ${t('restockBtn')}</button>`}`
      : (i.bundle ? '' : `<button class="btn sm ghost" onclick="startRestock(${i.id})" title="${t('restockTitle')}">↻ ${t('restockBtn')}</button>`);
    return isAdmin
      ? `<tr><td>${photoCell(i)}</td><td>${nameCell}</td><td>${esc(i.category)}</td><td class="mono">${displayStock} ${esc(i.unit)}</td><td>${costCell}</td><td class="mono">${naira(i.price)}</td><td class="mono">${margin}</td><td>${status}</td><td style="white-space:nowrap;">${actionBtns}</td></tr>`
      : `<tr><td>${photoCell(i)}</td><td>${nameCell}</td><td>${esc(i.category)}</td><td class="mono">${displayStock} ${esc(i.unit)}</td><td class="mono">${naira(i.price)}</td><td>${status}</td><td style="white-space:nowrap;">${actionBtns}</td></tr>`;
  }).join('') || `<tr><td colspan="9" style="color:var(--muted);">No items match that search.</td></tr>`;
}

/* ---- Expiry helper: flags items already expired or expiring within 30 days.
   Purely optional per item — most gadgets never set this field, and nothing
   here fires for items with no expiry date. ---- */
function expiryStatus(expiry){
  if(!expiry) return null;
  const days = Math.ceil((new Date(expiry+'T00:00:00') - new Date(new Date().toDateString())) / 86400000);
  if(days<0) return { label:t('expiredPill'), pillClass:'low', days };
  if(days<=30) return { label:t('expiresInDays',{d:days}), pillClass:'low', days };
  return { label:`Exp. ${expiry}`, pillClass:'ok', days };
}

/* ---- Inline edit of price / stock (and, for Admin, cost) — Admin only ---- */
let editingItemId = null;
function startEditItem(id){ editingItemId = id; restockingItemId = null; renderInventory(); }
function cancelEditItem(){ editingItemId = null; renderInventory(); }

/* ---- Restock: the everyday "stock just arrived" action, available to both
   roles. Unlike Edit, this only ever adds to current stock (never overwrites
   it) and never touches selling price — so staff can keep inventory accurate
   without ever getting a way to change what something sells for. ---- */
let restockingItemId = null;
function startRestock(id){ restockingItemId = id; editingItemId = null; renderInventory(); }
function cancelRestock(){ restockingItemId = null; renderInventory(); }
function renderRestockRow(i){
  const batchField = i.trackBatches ? `<div class="editfield"><label>Batch/serial code</label>
          <input type="text" id="restockBatchCode" placeholder="e.g. BN-2026-04"></div>` : '';
  return `<tr class="editor-row" style="background:#EEF5FB;">
    <td>${photoCell(i)}</td>
    <td><b>${esc(i.name)}</b><br><span class="stock" style="color:var(--muted);">${t('currentlyInStock',{n:i.stock, unit:esc(i.unit)})}</span></td>
    <td>${esc(i.category)}</td>
    <td colspan="${role()==='admin'?4:2}">
      <div class="editfield-row">
        <div class="editfield"><label>${t('qtyReceived')}</label>
          <input type="number" class="mono" id="restockQty" placeholder="0"></div>
        <div class="editfield"><label>${t('supplierOptional')}</label>
          <input type="text" id="restockSupplier" value="${esc(i.supplier||'')}" placeholder="e.g. Alaba Market"></div>
        <div class="editfield"><label>${t('newExpiryOptional')}</label>
          <input type="date" id="restockExpiry" value="${i.expiry||''}"></div>
        ${batchField}
      </div>
    </td>
    <td colspan="2" class="editrow-actions">
      <button class="btn sm gold" onclick="submitRestock(${i.id})">${t('addStock')}</button>
      <button class="btn sm ghost" onclick="cancelRestock()">${t('cancel')}</button>
    </td>
  </tr>`;
}
function submitRestock(id){
  const item = items.find(x=>x.id===id);
  const qty = Number(document.getElementById('restockQty').value);
  const supplier = document.getElementById('restockSupplier').value.trim();
  const expiry = document.getElementById('restockExpiry').value || null;
  if(!qty || qty<=0){ alert('Enter how many units were received.'); return; }
  if(item.trackBatches){
    const code = document.getElementById('restockBatchCode')?.value.trim();
    if(!code){ alert('This product is batch-tracked — enter a batch/serial code.'); return; }
    if(!item.batches) item.batches = [];
    item.batches.push({ code, qty, dateAdded: todayIso(), expiry });
  }
  item.stock += qty;
  const details = [];
  if(supplier && supplier!==item.supplier){ item.supplier = supplier; details.push(`supplier: ${supplier}`); }
  if(expiry!==item.expiry){ item.expiry = expiry; details.push(`expiry: ${expiry||'cleared'}`); }
  persistItems();
  logActivity(`Restocked "${item.name}" — +${qty} ${item.unit}${details.length ? ' ('+details.join(', ')+')' : ''}`);
  restockingItemId = null;
  renderAll();
}
function renderEditRow(i, isAdmin){
  const costInput = isAdmin
    ? `<td><input type="number" class="mono editcell" id="editCost" value="${i.cost==null?'':i.cost}" placeholder="—"></td>`
    : '';
  const marginTd = isAdmin ? `<td class="mono" style="color:var(--muted);">—</td>` : '';
  return `<tr class="editor-row" style="background:#FBF8ED;">
    <td>${photoCell(i)}</td>
    <td><b>${esc(i.name)}</b></td>
    <td>${esc(i.category)}</td>
    <td><input type="number" class="mono editcell editcell-sm" id="editStock" value="${i.stock}"> ${esc(i.unit)}</td>
    ${costInput}
    <td><input type="number" class="mono editcell" id="editPrice" value="${i.price}"></td>
    ${marginTd}
    <td colspan="2" class="editrow-actions">
      <button class="btn sm gold" onclick="saveEditItem(${i.id})">${t('save')}</button>
      <button class="btn sm ghost" onclick="cancelEditItem()">${t('cancel')}</button>
    </td>
  </tr>`;
}
function saveEditItem(id){
  const item = items.find(x=>x.id===id);
  const newPrice = Number(document.getElementById('editPrice').value);
  const newStock = Number(document.getElementById('editStock').value);
  if(!newPrice || newPrice<=0){ alert('Selling price must be greater than zero.'); return; }
  if(newStock<0){ alert('Stock cannot be negative.'); return; }
  const changes = [];
  if(newPrice!==item.price) changes.push(`price ${naira(item.price)} → ${naira(newPrice)}`);
  if(newStock!==item.stock) changes.push(`stock ${item.stock} → ${newStock}`);
  item.price = newPrice; item.stock = newStock;
  if(role()==='admin'){
    const costEl = document.getElementById('editCost');
    if(costEl){
      const newCost = costEl.value==='' ? null : Number(costEl.value);
      if(newCost!==item.cost) changes.push(`cost ${item.cost==null?'—':naira(item.cost)} → ${newCost==null?'—':naira(newCost)}`);
      item.cost = newCost;
    }
  }
  persistItems();
  if(changes.length) logActivity(`Edited "${item.name}" — ${changes.join(', ')}`);
  editingItemId = null;
  renderAll();
}
function toggleAddBox(){ const box=document.getElementById('addBox'); box.classList.toggle('open'); if(box.classList.contains('open')) applyRoleLocks(); }
let pendingPhoto = null;
/* Product photos are stored as base64 inside localStorage, which has a hard ~5-10MB
   quota shared by the whole app — a handful of full-resolution phone photos fills
   it fast and starts silently failing saves. Downscaling + re-compressing every
   photo to a small JPEG before it's stored keeps dozens of products comfortably
   inside quota. This is a mitigation for the localStorage ceiling, not a fix for
   "no real file storage" — that still needs a real backend (see the roadmap note). */
function compressImage(file, maxDim=480, quality=0.72){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        let { width, height } = img;
        if(width>height && width>maxDim){ height = Math.round(height*maxDim/width); width = maxDim; }
        else if(height>maxDim){ width = Math.round(width*maxDim/height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function previewPhoto(){
  const f = document.getElementById('newPhoto').files[0]; if(!f) return;
  try{
    pendingPhoto = await compressImage(f);
    const img=document.getElementById('newPhotoPreview'); img.src=pendingPhoto; img.style.display='block'; document.getElementById('newPhotoPlaceholder').style.display='none';
  }catch(e){ alert('Could not read that image — please try a different photo.'); }
}
/* ================= CSV / Excel import ================= */
/* Column headers are matched loosely against common synonyms (case/spacing-
   insensitive), so a sheet exported from any POS or a hand-made Excel file
   both stand a good chance of importing without the admin having to rename
   columns first. Anything that can't be confidently matched is flagged in
   the preview rather than guessed at. */
const IMPORT_SYNONYMS = {
  name: ['name','product','productname','itemname','item','description'],
  category: ['category','cat','type'],
  unit: ['unit','uom','units'],
  stock: ['stock','qty','quantity','qtyonhand','stockqty','onhand'],
  reorder: ['reorder','reorderlevel','reorderpoint','minstock','minimumstock','reorderthreshold'],
  cost: ['cost','costprice','cp','unitcost','purchaseprice','buyingprice'],
  price: ['price','sellingprice','sp','saleprice','unitprice','retailprice'],
  supplier: ['supplier','vendor','supplierinfo'],
  expiry: ['expiry','expirydate','expdate','expires'],
  barcode: ['barcode','sku','upc','code']
};
function normalizeHeader(h){ return String(h||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function mapImportColumns(headers){
  const map = {};
  headers.forEach((h,idx)=>{
    const norm = normalizeHeader(h);
    for(const field in IMPORT_SYNONYMS){
      if(map[field]!==undefined) continue;
      if(IMPORT_SYNONYMS[field].includes(norm)){ map[field] = idx; break; }
    }
  });
  return map;
}
let pendingImportRows = [];
let libLoadPromises = {};
function loadScriptOnce(url){
  if(libLoadPromises[url]) return libLoadPromises[url];
  libLoadPromises[url] = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = url; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return libLoadPromises[url];
}
async function handleImportFile(){
  const file = document.getElementById('importFile').files[0];
  if(!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  try{
    let headers, rows;
    if(ext==='csv'){
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');
      const text = await file.text();
      const parsed = Papa.parse(text, { skipEmptyLines:true });
      headers = parsed.data[0]; rows = parsed.data.slice(1);
    } else {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type:'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { header:1, raw:false, defval:'' });
      headers = data[0]; rows = data.slice(1);
    }
    processImportRows(headers, rows);
  }catch(e){
    alert("Couldn't read that file. If you're offline, CSV import still works without internet — Excel (.xlsx) import needs internet the first time to load the reader library. Try a .csv export instead, or reconnect and try again.");
  }
  document.getElementById('importFile').value = '';
}
function processImportRows(headers, rows){
  const colMap = mapImportColumns(headers);
  pendingImportRows = rows.filter(r=>r.some(c=>String(c).trim()!=='')).map(r=>{
    const get = f => colMap[f]!==undefined ? String(r[colMap[f]]).trim() : '';
    const name = get('name');
    const price = parseFloat(get('price'));
    const cost = get('cost')!=='' ? parseFloat(get('cost')) : null;
    const existing = items.find(i => (get('barcode') && i.barcode===get('barcode')) || i.name.toLowerCase()===name.toLowerCase());
    let result, resultNote;
    if(!name || isNaN(price)){ result='skip'; resultNote='Missing name or price'; }
    else if(existing){ result='update'; resultNote=`Adds stock to existing "${existing.name}"`; }
    else { result='new'; resultNote = cost==null ? 'New item — cost missing, marked Pending' : 'New item'; }
    return {
      name, category: get('category')||CATEGORIES[0], unit: get('unit')||'piece',
      stock: parseFloat(get('stock'))||0, reorder: parseFloat(get('reorder'))||5,
      cost: isNaN(cost) ? null : cost, price: isNaN(price) ? null : price,
      supplier: get('supplier')||null, expiry: get('expiry')||null, barcode: get('barcode')||null,
      result, resultNote, existingId: existing ? existing.id : null
    };
  });
  const missing = Object.keys(IMPORT_SYNONYMS).filter(f=>colMap[f]===undefined && ['name','price'].includes(f));
  const okCount = pendingImportRows.filter(r=>r.result!=='skip').length;
  const skipCount = pendingImportRows.length - okCount;
  document.getElementById('importSummary').textContent =
    `${pendingImportRows.length} rows found — ${okCount} ready to import, ${skipCount} will be skipped.` +
    (missing.length ? ` Couldn't confidently find a column for: ${missing.join(', ')}.` : '');
  document.getElementById('importPreviewBody').innerHTML = pendingImportRows.slice(0,50).map(r=>`
    <tr>
      <td>${esc(r.name||'—')}</td><td>${esc(r.category)}</td><td>${esc(r.unit)}</td>
      <td class="mono">${r.stock}</td><td class="mono">${r.cost==null?'—':naira(r.cost)}</td><td class="mono">${r.price==null?'—':naira(r.price)}</td>
      <td><span class="pill ${r.result==='skip'?'low':'ok'}">${esc(r.resultNote)}</span></td>
    </tr>`).join('') + (pendingImportRows.length>50 ? `<tr><td colspan="7" style="color:var(--muted);">…and ${pendingImportRows.length-50} more rows</td></tr>` : '');
  document.getElementById('importPanel').style.display = 'block';
  document.getElementById('confirmImportBtn').disabled = okCount===0;
}
function cancelImport(){ pendingImportRows = []; document.getElementById('importPanel').style.display = 'none'; }
function confirmImport(){
  let added=0, updated=0;
  pendingImportRows.forEach(r=>{
    if(r.result==='skip') return;
    if(r.result==='update'){
      const item = items.find(i=>i.id===r.existingId);
      item.stock += r.stock;
      if(r.supplier) item.supplier = r.supplier;
      if(r.expiry) item.expiry = r.expiry;
      updated++;
    } else {
      const id = Math.max(0,...items.map(i=>i.id), 0) + 1 + added;
      items.push({ id, name:r.name, category:r.category, unit:r.unit, cost:r.cost, price:r.price, stock:r.stock, reorder:r.reorder, photo:null, barcode: r.barcode || ('600900'+String(1000000+id)), supplier:r.supplier, expiry:r.expiry });
      added++;
    }
  });
  persistItems();
  logActivity(`Imported products from file — ${added} added, ${updated} updated (stock added to existing items)`);
  cancelImport();
  renderAll();
  alert(`Import complete: ${added} new products added, ${updated} existing products restocked.`);
}

/* ================= Composite / bundle items ================= */
let pendingBundle = [];
function toggleBundleBuilder(){
  const on = document.getElementById('newIsBundle').checked;
  document.getElementById('bundleBuilder').style.display = on ? 'block' : 'none';
  if(on) populateBundleComponentSelect();
}
function populateBundleComponentSelect(){
  const sel = document.getElementById('bundleComponentSelect');
  sel.innerHTML = items.filter(i=>!i.bundle).map(i=>`<option value="${i.id}">${esc(i.name)} (${i.stock} ${esc(i.unit)})</option>`).join('');
}
function addBundleComponent(){
  const itemId = Number(document.getElementById('bundleComponentSelect').value);
  const qty = Number(document.getElementById('bundleComponentQty').value);
  if(!itemId || !qty || qty<=0){ alert('Pick a component and a quantity.'); return; }
  if(pendingBundle.some(c=>c.itemId===itemId)){ alert('That item is already a component.'); return; }
  pendingBundle.push({ itemId, qty });
  document.getElementById('bundleComponentQty').value='';
  renderBundleComponentList();
}
function removeBundleComponent(itemId){ pendingBundle = pendingBundle.filter(c=>c.itemId!==itemId); renderBundleComponentList(); }
function renderBundleComponentList(){
  document.getElementById('bundleComponentList').innerHTML = pendingBundle.map(c=>{
    const item = items.find(i=>i.id===c.itemId);
    return `<div class="add-row"><div>${esc(item?item.name:'?')} × ${c.qty}</div><button class="btn sm ghost" onclick="removeBundleComponent(${c.itemId})">Remove</button></div>`;
  }).join('') || `<p class="helptext">${t('noComponentsYet')}</p>`;
}
function bundleAvailableStock(item){
  if(!item.bundle || !item.bundle.length) return 0;
  return Math.min(...item.bundle.map(c=>{ const comp = items.find(i=>i.id===c.itemId); return comp ? Math.floor(comp.stock/c.qty) : 0; }));
}

/* ================= Batch / serial tracking ================= */
function viewBatches(id){
  const item = items.find(i=>i.id===id);
  if(!item || !item.batches || !item.batches.length){ alert('No batches recorded yet for this product.'); return; }
  const lines = item.batches.map(b=>`${b.code} — ${b.qty} remaining (added ${b.dateAdded}${b.expiry?`, expires ${b.expiry}`:''})`);
  alert(`Batches for ${item.name}:\n\n${lines.join('\n')}`);
}

function submitNewItem(){
  const name = document.getElementById('newName').value.trim();
  const category = document.getElementById('newCategory').value;
  const unit = document.getElementById('newUnit').value.trim() || 'piece';
  const price = Number(document.getElementById('newPrice').value);
  const isBundle = document.getElementById('newIsBundle').checked;
  const stock = isBundle ? 0 : (Number(document.getElementById('newStock').value) || 0);
  const reorder = Number(document.getElementById('newReorder').value) || 5;
  const cost = role()==='admin' ? Number(document.getElementById('newCost').value) : null;
  const supplier = document.getElementById('newSupplier').value.trim();
  const expiry = document.getElementById('newExpiry').value || null;
  const branch = document.getElementById('newBranch').value || null;
  const trackBatches = document.getElementById('newTrackBatches').checked;
  if(!name || !price){ alert('Please add at least a product name and selling price.'); return; }
  if(isBundle && pendingBundle.length<2){ alert('A bundle needs at least 2 component products.'); return; }
  const id = Math.max(0,...items.map(i=>i.id)) + 1;
  items.push({ id, name, category: category||CATEGORIES[0], unit, cost:(cost||cost===0)?cost:null, price, stock, reorder, photo: pendingPhoto,
    barcode: '600900'+String(1000000+id), supplier: supplier||null, expiry, branch,
    bundle: isBundle ? pendingBundle.slice() : null,
    trackBatches, batches: trackBatches ? [] : null });
  persistItems();
  logActivity(`Added new product "${name}"${supplier?` (supplier: ${supplier})`:''}${isBundle?' as a bundle':''}${trackBatches?' (batch-tracked)':''}`);
  pendingPhoto = null; pendingBundle = [];
  ['newName','newUnit','newPrice','newStock','newReorder','newCost','newSupplier','newExpiry'].forEach(id2=>document.getElementById(id2).value='');
  document.getElementById('newPhotoPreview').style.display='none'; document.getElementById('newPhotoPlaceholder').style.display='flex';
  document.getElementById('newIsBundle').checked=false; document.getElementById('newTrackBatches').checked=false;
  document.getElementById('bundleBuilder').style.display='none'; document.getElementById('bundleComponentList').innerHTML='';
  toggleAddBox(); renderAll();
}

/* ================= Register Sale ================= */
function renderSaleSearch(){
  const q = document.getElementById('saleSearch').value.toLowerCase();
  const results = q.length===0 ? [] : items.filter(i=>i.name.toLowerCase().includes(q) || (i.barcode||'').includes(q)).slice(0,6);
  document.getElementById('saleSearchResults').innerHTML = results.map(i=>`
    <div class="add-row"><div class="left">${photoCell(i)}<div class="info"><b>${esc(i.name)}</b><br><span class="stock">${itemAvailable(i)} ${esc(i.unit)} in stock · ${naira(i.price)}</span></div></div>
    <button class="btn sm gold" onclick="addToCart(${i.id})" ${itemAvailable(i)<1?'disabled':''}>Add</button></div>`).join('')
    || (q ? `<p class="helptext">No matches.</p>` : `<p class="helptext">Start typing to find an item…</p>`);
}
function itemAvailable(item){ return item.bundle ? bundleAvailableStock(item) : item.stock; }
/* Consumes stock FIFO from a batch-tracked item's batch list (oldest batch
   first — the standard approach for anything with expiry or warranty
   implications), and always keeps item.stock as the simple source of truth
   for everything else in the app that just reads a plain number. */
function consumeStock(item, qty){
  item.stock -= qty;
  if(item.trackBatches && item.batches && item.batches.length){
    let remaining = qty;
    for(const b of item.batches){
      if(remaining<=0) break;
      const take = Math.min(b.qty, remaining);
      b.qty -= take; remaining -= take;
    }
    item.batches = item.batches.filter(b=>b.qty>0);
  }
}
function addToCart(id){
  const item = items.find(i=>i.id===id); const line = cart.find(c=>c.id===id);
     if(!item || itemAvailable(item)<1){ alert((item?item.name:'This item')+' is out of stock.'); return; }
  if(line){ if(line.qty<itemAvailable(item)) line.qty++; } else cart.push({id:item.id, name:item.name, price:item.price, qty:1});
  renderCart();
}
function changeQty(id, delta){
  const line = cart.find(c=>c.id===id); const item = items.find(i=>i.id===id);
  line.qty += delta;
  if(line.qty<=0) cart = cart.filter(c=>c.id!==id); else if(line.qty>itemAvailable(item)) line.qty = itemAvailable(item);
  renderCart();
}
function renderCart(){
  const list = document.getElementById('cartList');
  list.innerHTML = cart.length===0 ? `<p class="helptext">${t('noItemsYet')}</p>` :
    cart.map(c=>`<div class="cart-row"><div>${esc(c.name)}<br><span class="stock">${naira(c.price)} each</span></div>
      <div class="qty"><button onclick="changeQty(${c.id},-1)">–</button><span>${c.qty}</span><button onclick="changeQty(${c.id},1)">+</button></div></div>`).join('');
  const rawSubtotal = cart.reduce((s,c)=>s+c.price*c.qty,0);
  const discountAmount = appliedDiscount ? Math.min(appliedDiscount.amount, rawSubtotal) : 0;
  document.getElementById('cartTotal').textContent = naira(rawSubtotal - discountAmount);
  document.getElementById('completeSaleBtn').disabled = cart.length===0;
}
document.getElementById('payMethods').addEventListener('change', e=>{
  document.querySelectorAll('#payMethods label').forEach(l=>l.classList.toggle('checked', l.querySelector('input').checked));
  document.getElementById('creditNameRow').style.display = e.target.value==='Credit' ? 'block' : 'none';
});
let lastSale = null;
let appliedDiscount = null; // { amount, reason, authorizedBy, requestedBy }
function toggleDiscountBox(){ document.getElementById('discountBox').classList.toggle('open'); }
function requestDiscount(){
  const type = document.getElementById('discountType').value;
  const value = Number(document.getElementById('discountValue').value);
  const reason = document.getElementById('discountReason').value.trim();
  if(!value || value<=0){ alert('Enter a discount value.'); return; }
  const subtotal = cart.reduce((s,c)=>s+c.price*c.qty,0);
  const amount = type==='percent' ? Math.round(subtotal*value/100) : value;
  pendingDiscountRequest = { amount, reason, type, value };
  if(role()==='admin'){
    appliedDiscount = { amount, reason, authorizedBy: `${currentUser.name} (${currentUser.id})`, requestedBy: `${currentUser.name} (${currentUser.id})` };
    finishDiscountApply();
  } else {
    document.getElementById('discountAuthSub').textContent = `${currentUser.name} is requesting a ${naira(amount)} discount${reason?` (${reason})`:''}. An Admin must approve.`;
    document.getElementById('discAuthId').value=''; document.getElementById('discAuthPass').value=''; document.getElementById('discAuthErr').textContent='';
    document.getElementById('discountAuthOverlay').classList.add('active');
  }
}
async function submitDiscountAuth(){
  const id = document.getElementById('discAuthId').value.trim().toUpperCase();
  const pass = document.getElementById('discAuthPass').value;
  const err = document.getElementById('discAuthErr');
  const admin = users.find(u=>u.id===id && u.role==='admin' && u.active!==false);
  if(!admin){ err.textContent = 'Not a recognized active Admin ID.'; return; }
  const ok = admin.passHash === await hashSecret(pass, admin.passSalt);
  if(!ok){ err.textContent = 'Incorrect password.'; return; }
  appliedDiscount = { amount: pendingDiscountRequest.amount, reason: pendingDiscountRequest.reason, authorizedBy: `${admin.name} (${admin.id})`, requestedBy: `${currentUser.name} (${currentUser.id})` };
  document.getElementById('discountAuthOverlay').classList.remove('active');
  finishDiscountApply();
}
function cancelDiscountAuth(){ document.getElementById('discountAuthOverlay').classList.remove('active'); pendingDiscountRequest = null; }
function finishDiscountApply(){
  document.getElementById('discountAppliedNote').textContent = `−${naira(appliedDiscount.amount)} (${appliedDiscount.authorizedBy})`;
  document.getElementById('discountToggleBtn').style.display = 'none';
  toggleDiscountBox();
  logActivity(`Discount requested by ${appliedDiscount.requestedBy}, authorized by ${appliedDiscount.authorizedBy} — ${naira(appliedDiscount.amount)}${appliedDiscount.reason?` (${appliedDiscount.reason})`:''}`);
  renderCart();
}
function clearDiscount(){
  appliedDiscount = null; pendingDiscountRequest = null;
  document.getElementById('discountAppliedNote').textContent = '';
  document.getElementById('discountToggleBtn').style.display = 'inline-block';
}
let pendingDiscountRequest = null;

function completeSale(){
  const payment = document.querySelector('#payMethods input:checked').value;
  const customer = document.getElementById('creditName').value;
  // Re-check stock at the moment of completion, not just when items were added to
  // the cart — protects against two staff selling the last unit of something from
  // two different sessions on the same device in quick succession.
  for(const c of cart){
    const item = items.find(i=>i.id===c.id);
    if(!item || c.qty>itemAvailable(item)){ alert(`Not enough stock of "${item?item.name:'an item'}" left to complete this sale. Please adjust the cart.`); renderSaleSearch(); renderCart(); return; }
  }
  const rawSubtotal = cart.reduce((s,c)=>s+c.price*c.qty,0);
  const discountAmount = appliedDiscount ? Math.min(appliedDiscount.amount, rawSubtotal) : 0;
  const subtotal = rawSubtotal - discountAmount;
  const vatRate = Number(settings.vatRate)||0;
  const vatAmount = Math.round(subtotal*vatRate/100);
  const total = subtotal + vatAmount;
  cart.forEach(c=>{
    const item = items.find(i=>i.id===c.id);
    if(item.bundle){
      // Bundle sale: decrement each underlying component instead of the
      // bundle itself, which never carries its own stock number.
      item.bundle.forEach(comp=>{ const compItem = items.find(i=>i.id===comp.itemId); if(compItem) consumeStock(compItem, comp.qty*c.qty); });
    } else {
      consumeStock(item, c.qty);
    }
  });
  persistItems();
  const id = (window.SALE_PREFIX||'A')+'-'+nextSaleNo();
  const timeStr = new Date().toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'});
  const record = { id, date:'Today', isoDate: todayIso(), time: timeStr, staff: `${currentUser.name} (${currentUser.id})`, payment, subtotal, vatRate, vatAmount, total, customer, refunded:false,
    discount: appliedDiscount ? { amount: discountAmount, reason: appliedDiscount.reason, authorizedBy: appliedDiscount.authorizedBy, voucher: appliedDiscount.voucher } : null,
    lines: cart.map(c=>({name:c.name, qty:c.qty, price:c.price, itemId:c.id})) };
  sales.push(record); persistSales();
  if(payment==='Credit' && customer){
    const debtor = findOrCreateDebtor(customer);
    debtor.balance += total;
    debtor.history.push({date: todayIso(), type:'sale', amount: total, saleId: id});
    persistDebtors();
  }
  logActivity(`Registered sale ${id} (${naira(total)}, ${payment})${discountAmount?` with ${naira(discountAmount)} discount`:''}`);
  lastSale = record;
  showReceipt(record);
  cart = []; document.getElementById('creditName').value=''; clearDiscount(); renderCart();
}

/* ================= Receipt ================= */
function showReceipt(sale){
  const stampHtml = sale.refunded ? `<div class="stamp credit">REFUNDED</div>` : sale.payment==='Credit' ? `<div class="stamp credit">ON CREDIT</div>` : `<div class="stamp">PAID</div>`;
  const lines = sale.lines.map(l=>`<div class="rline"><span class="nm">${esc(l.name)}</span><span>${naira(l.qty*l.price)}</span></div><div class="rline qp"><span>${l.qty} × ${naira(l.price)}</span><span></span></div>`).join('');
  const vatRow = sale.vatAmount ? `<div class="rmeta"><span>Subtotal</span><span>${naira(sale.subtotal)}</span></div><div class="rmeta"><span>VAT (${sale.vatRate}%)</span><span>${naira(sale.vatAmount)}</span></div>` : '';
  const discountRow = sale.discount ? `<div class="rmeta" style="color:var(--sage);"><span>Discount${sale.discount.reason?` (${esc(sale.discount.reason)})`:''}</span><span>−${naira(sale.discount.amount)}</span></div>` : '';
  document.getElementById('receiptContent').innerHTML = `
    ${stampHtml}${settings.logo?`<div style="text-align:center; margin-bottom:6px;"><img src="${settings.logo}" style="max-height:44px; max-width:120px; object-fit:contain;"></div>`:''}<div class="rlogo">${esc(settings.name)}</div><div class="raddr">${esc(settings.address)}<br>${esc(settings.phone)}</div><hr>
    <div class="rmeta"><span>Receipt #${esc(sale.id)}</span><span>${esc(sale.time)}</span></div>
    <div class="rmeta"><span>Served by</span><span>${esc(sale.staff)}</span></div>
    ${sale.customer ? `<div class="rmeta"><span>Customer</span><span>${esc(sale.customer)}</span></div>` : ''}
    <hr>${lines}<hr>
    ${discountRow}
    ${vatRow}
    <div class="rtotal"><span>TOTAL</span><span>${naira(sale.total)}</span></div>
    <div class="rmeta" style="margin-top:6px;"><span>Payment</span><span>${esc(sale.payment)}</span></div>
    <div class="rfoot">${esc(settings.footer)}<br><span style="opacity:0.6;">Paper: ${esc(settings.paper)}</span></div>`;
  document.getElementById('receiptOverlay').classList.add('active');
}
function closeReceipt(){ document.getElementById('receiptOverlay').classList.remove('active'); renderAll(); }

/* ---- ESC/POS over Web Bluetooth ----
   Real ESC/POS byte commands (not just CSS print), for shops with a cheap BLE
   thermal printer instead of a USB/driver-based one. This is genuinely best-effort:
   Web Bluetooth only exists in Chrome/Edge, and BLE thermal printers don't share one
   standard profile the way USB ESC/POS printers mostly do — the UUIDs in Settings
   cover the most common generic 58mm printers, but this needs a real test against
   whatever printer the shop actually buys, and a fallback to the plain Print button
   always stays available. */
function buildEscPos(sale){
  const enc = new TextEncoder();
  const chunks = [];
  const push = (...bytes)=>chunks.push(new Uint8Array(bytes));
  const text = (s, extra='')=>chunks.push(enc.encode(s.replace(/[^\x00-\x7F]/g,'') + extra));
  push(0x1B,0x40); // init
  push(0x1B,0x61,0x01); // center
  push(0x1B,0x45,0x01); text(settings.name, '\n'); push(0x1B,0x45,0x00); // bold name
  text(`${settings.address}\n${settings.phone}\n`);
  push(0x1B,0x61,0x00); // left align
  text('--------------------------------\n');
  text(`Receipt #${sale.id}   ${sale.time}\n`);
  text(`Served by: ${sale.staff}\n`);
  if(sale.customer) text(`Customer: ${sale.customer}\n`);
  text('--------------------------------\n');
  sale.lines.forEach(l=>{
    text(`${l.name}\n`);
    text(`  ${l.qty} x ${naira(l.price)}`.padEnd(24) + naira(l.qty*l.price) + '\n');
  });
  text('--------------------------------\n');
  if(sale.vatAmount){ text(`Subtotal: ${naira(sale.subtotal)}\n`); text(`VAT (${sale.vatRate}%): ${naira(sale.vatAmount)}\n`); }
  push(0x1B,0x45,0x01); text(`TOTAL: ${naira(sale.total)}\n`); push(0x1B,0x45,0x00);
  text(`Payment: ${sale.payment}\n`);
  push(0x1B,0x61,0x01); text(`\n${settings.footer}\n\n\n`);
  push(0x1D,0x56,0x01); // partial cut (ignored by printers that can't cut)
  const total = chunks.reduce((n,c)=>n+c.length,0);
  const out = new Uint8Array(total); let off=0;
  chunks.forEach(c=>{ out.set(c, off); off+=c.length; });
  return out;
}
async function printEscPosBluetooth(){
  if(!lastSale){ alert('Complete a sale first.'); return; }
  if(!navigator.bluetooth){ alert("This browser doesn't support Web Bluetooth. Use Chrome or Edge on Android/desktop, or use the regular Print button."); return; }
  try{
    const serviceUuid = (settings.btService||'000018f0-0000-1000-8000-00805f9b34fb').toLowerCase();
    const charUuid = (settings.btChar||'00002af1-0000-1000-8000-00805f9b34fb').toLowerCase();
    const device = await navigator.bluetooth.requestDevice({ filters:[{ services:[serviceUuid] }], optionalServices:[serviceUuid] });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(charUuid);
    const data = buildEscPos(lastSale);
    const CHUNK = 20; // conservative BLE write size that works across most devices
    for(let i=0;i<data.length;i+=CHUNK){
      await characteristic.writeValue(data.slice(i, i+CHUNK));
      await new Promise(r=>setTimeout(r, 20));
    }
    logActivity(`Printed receipt ${lastSale.id} via Bluetooth thermal printer`);
  }catch(e){
    alert("Couldn't print to a Bluetooth printer — either none was selected, the printer uses different UUIDs than the ones in Settings, or it doesn't support this profile. The regular Print button still works as a fallback.");
  }
}
if('bluetooth' in navigator){ const b=document.getElementById('btPrintBtn'); if(b) b.style.display='inline-block'; }
function shareReceiptWa(){
  if(!lastSale) return;
  let text = `Receipt ${lastSale.id} — ${settings.name}%0A`;
  lastSale.lines.forEach(l=>{ text += `${l.name} x${l.qty} — ${naira(l.qty*l.price)}%0A`; });
  text += `TOTAL: ${naira(lastSale.total)}%0APayment: ${lastSale.payment}%0A${settings.footer}`;
  window.open(`https://wa.me/?text=${text}`,'_blank');
}
function shareLowStockWa(){
  const lowStock = items.filter(i=>i.stock<=i.reorder);
  let text = `Low stock alert — ${settings.name}%0A`;
  lowStock.forEach(i=>{ text += `${i.name}: ${i.stock} ${i.unit} left (reorder at ${i.reorder})%0A`; });
  window.open(`https://wa.me/${settings.wa||''}?text=${text}`,'_blank');
}

/* ================= Barcode scan ================= */
/* Chrome's native BarcodeDetector isn't available on Safari/iOS at all, so it alone
   would lock a big share of phones out of scanning. ZXing is a pure-JS decoder that
   works in any modern browser off the camera feed — it's loaded from a CDN the first
   time someone scans (small one-time download, then cached by the browser), and we
   fall back to BarcodeDetector, then to plain manual entry, if that load fails (e.g.
   the very first run with no internet yet). */
let zxingLoadPromise = null;
function loadZXing(){
  if(window.ZXing) return Promise.resolve(window.ZXing);
  if(zxingLoadPromise) return zxingLoadPromise;
  zxingLoadPromise = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
    s.onload = ()=> resolve(window.ZXing);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return zxingLoadPromise;
}
let scanStream = null;
let zxingReader = null;
function openScanner(target){
  scanTarget = target;
  document.getElementById('scanOverlay').classList.add('active');
  const body = document.getElementById('scanBody');
  if(!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia){
    body.innerHTML = `<p>Camera not available in this browser.</p><p class="hint">Just type the barcode into search instead.</p>`;
    return;
  }
  body.innerHTML = `<video id="scanVideo" autoplay playsinline muted></video><p class="hint" id="scanHint">Loading scanner…</p>`;
  loadZXing().then(ZXing=>{
    if(!document.getElementById('scanOverlay').classList.contains('active')) return;
    document.getElementById('scanHint').textContent = 'Point the camera at a barcode…';
    zxingReader = new ZXing.BrowserMultiFormatReader();
    zxingReader.decodeFromVideoDevice(null, 'scanVideo', (result, err)=>{
      if(result) handleScanResult(result.getText());
    }).catch(()=>{ body.innerHTML = `<p>Camera permission was not granted.</p><p class="hint">You can still type the barcode into search.</p>`; });
  }).catch(()=>{
    // No internet for the scanner library (first run offline) — fall back to the
    // browser's own detector where available, otherwise manual entry.
    document.getElementById('scanHint').textContent = 'Point the camera at a barcode…';
    navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } }).then(stream=>{
      scanStream = stream;
      const video = document.getElementById('scanVideo'); video.srcObject = stream;
      if('BarcodeDetector' in window){
        const detector = new BarcodeDetector();
        const loop = async ()=>{
          if(!document.getElementById('scanOverlay').classList.contains('active')) return;
          try{ const codes = await detector.detect(video); if(codes.length){ handleScanResult(codes[0].rawValue); return; } }catch(e){}
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } else {
        document.getElementById('scanHint').textContent = "Scanner library needs internet the first time it loads, and this browser has no built-in fallback. Type the barcode into search instead.";
      }
    }).catch(()=>{ body.innerHTML = `<p>Camera permission was not granted.</p><p class="hint">You can still type the barcode into search.</p>`; });
  });
}
function handleScanResult(code){
  closeScanner();
  const match = items.find(i=>i.barcode===code);
  if(scanTarget==='sale'){
    if(match){ addToCart(match.id); switchView('sale'); }
    else { document.getElementById('saleSearch').value = code; switchView('sale'); renderSaleSearch(); }
  } else {
    document.getElementById('invSearch').value = match ? match.name : code;
    switchView('inventory'); renderInventory();
  }
}
function closeScanner(){
  document.getElementById('scanOverlay').classList.remove('active');
  if(scanStream){ scanStream.getTracks().forEach(tr=>tr.stop()); scanStream=null; }
  if(zxingReader){ try{ zxingReader.reset(); }catch(e){} zxingReader=null; }
}

/* ================= Reports ================= */
/* ================= Date range (drives Reports) ================= */
document.getElementById('rangePresets').addEventListener('change', e=>{
  document.querySelectorAll('#rangePresets label').forEach(l=>l.classList.toggle('checked', l.querySelector('input').checked));
  document.getElementById('customRangeRow').style.display = e.target.value==='custom' ? 'flex' : 'none';
  renderReports();
});
function getSelectedRange(){
  const preset = document.querySelector('#rangePresets input:checked')?.value || 'today';
  const today = new Date(); today.setHours(0,0,0,0);
  const iso = d => localIso(d);
  let from, to = iso(today);
  if(preset==='today'){ from = iso(today); }
  else if(preset==='yesterday'){ const y=new Date(today); y.setDate(y.getDate()-1); from=iso(y); to=iso(y); }
  else if(preset==='week'){ const w=new Date(today); w.setDate(w.getDate()-6); from=iso(w); }
  else if(preset==='month'){ const m=new Date(today); m.setDate(m.getDate()-29); from=iso(m); }
  else if(preset==='all'){ from='2000-01-01'; }
  else if(preset==='custom'){
    from = document.getElementById('rangeFrom').value || iso(today);
    to = document.getElementById('rangeTo').value || iso(today);
  }
  return { from, to, preset };
}
function inRange(sale, range){ return sale.isoDate>=range.from && sale.isoDate<=range.to; }

function renderReports(){
  if(role()!=='admin') return;
  const range = getSelectedRange();
  const rangeSales = sales.filter(s=>inRange(s,range) && !s.refunded);
  const grossProfit = rangeSales.reduce((s,sale)=>s + sale.lines.reduce((ls,l)=>{ const item=items.find(i=>i.name===l.name); const cost = item && item.cost!=null ? item.cost : 0; return ls+(l.price-cost)*l.qty; },0),0);
  const revenue = rangeSales.reduce((s,sale)=>s+sale.total,0);
  const expensesInRange = expenses.filter(e=>e.isoDate>=range.from && e.isoDate<=range.to).reduce((s,e)=>s+e.amount,0);
  const netProfit = grossProfit - expensesInRange;
  document.getElementById('reportCards').innerHTML = `
    <div class="card"><div class="k">Revenue</div><div class="v">${naira(revenue)}</div><div class="foot">${range.from} → ${range.to}</div></div>
    <div class="card"><div class="k">Gross Profit</div><div class="v good">${naira(grossProfit)}</div></div>
    <div class="card"><div class="k">${t('cardExpenses')}</div><div class="v alert">${naira(expensesInRange)}</div></div>
    <div class="card"><div class="k">${t('cardNetProfit')}</div><div class="v ${netProfit>=0?'good':'alert'}">${naira(netProfit)}</div><div class="foot">${t('cardNetProfitFoot')}</div></div>
    <div class="card"><div class="k">Transactions</div><div class="v">${rangeSales.length}</div></div>`;

  // Future estimate — simple linear projection off the average daily NET profit
  // within the selected range. Clearly labeled as an estimate, not a promise.
  const daysInRange = Math.max(1, Math.round((new Date(range.to)-new Date(range.from))/86400000)+1);
  const avgDailyProfit = netProfit/daysInRange;
  document.getElementById('futureEstimateCards').innerHTML = `
    <div class="card"><div class="k">Est. next 7 days</div><div class="v good">${naira(avgDailyProfit*7)}</div><div class="foot">at the current daily average</div></div>
    <div class="card"><div class="k">Est. next 30 days</div><div class="v good">${naira(avgDailyProfit*30)}</div><div class="foot">at the current daily average</div></div>`;

  const qtyByItemRange = {};
  rangeSales.forEach(s=>s.lines.forEach(l=>{ qtyByItemRange[l.name]=qtyByItemRange[l.name]||{qty:0,revenue:0}; qtyByItemRange[l.name].qty+=l.qty; qtyByItemRange[l.name].revenue+=l.qty*l.price; }));
  document.getElementById('topSellersBody').innerHTML = Object.entries(qtyByItemRange).sort((a,b)=>b[1].qty-a[1].qty)
    .map(([name,d])=>`<tr><td>${esc(name)}</td><td class="mono">${d.qty}</td><td class="mono">${naira(d.revenue)}</td></tr>`).join('') || `<tr><td colspan="3" style="color:var(--muted);">No sales in this range.</td></tr>`;
  document.getElementById('salesLogBody').innerHTML = sales.filter(s=>inRange(s,range)).slice().reverse().map(s=>`<tr><td class="mono">${esc(s.id)}</td><td>${esc(s.date)} ${esc(s.time)}</td><td>${esc(s.staff)}</td><td>${esc(s.payment)}</td><td class="mono">${naira(s.total)}</td><td>${s.refunded?'<span class="pill low">Refunded</span>':`<button class="btn sm ghost" onclick="refundSale('${s.id}')">Refund</button>`}</td></tr>`).join('');

  // Reorder suggestions — velocity across all non-refunded sales history
  // (deliberately independent of the report date range, since a reorder
  // decision should reflect real overall selling speed, not just a filtered window)
  const nonRefunded = sales.filter(s=>!s.refunded);
  const daysSeen = new Set(nonRefunded.map(s=>s.isoDate));
  const numDays = Math.max(1, daysSeen.size);
  const qtyAllTime = {};
  nonRefunded.forEach(s=>s.lines.forEach(l=>{ qtyAllTime[l.name] = (qtyAllTime[l.name]||0) + l.qty; }));
  const suggestions = Object.entries(qtyAllTime).map(([name,totalQty])=>{
    const item = items.find(i=>i.name===name); if(!item) return null;
    const avgDaily = totalQty/numDays;
    const daysLeft = avgDaily>0 ? Math.floor(item.stock/avgDaily) : null;
    return { name, avgDaily, daysLeft, item };
  }).filter(Boolean).sort((a,b)=>(a.daysLeft??999)-(b.daysLeft??999));
  document.getElementById('reorderBody').innerHTML = suggestions.map(s=>`
    <tr><td>${esc(s.name)}</td><td class="mono">${s.avgDaily.toFixed(1)}/day</td><td class="mono">${s.daysLeft}</td>
    <td>${s.daysLeft<=7 ? `<span class="pill low">${t('reorderSoonPill')}</span>` : `<span class="pill ok">${t('comfortablePill')}</span>`}</td></tr>`).join('')
    || `<tr><td colspan="4" style="color:var(--muted);">Not enough sales history yet.</td></tr>`;
}
/* ---- Refunds: restocks the items, marks the sale, and logs it — kept simple
   (full return workflow with partial-line returns is a good next step, but this
   covers the common "whole sale returned" case at zero extra infrastructure cost). */
function refundSale(id){
  const sale = sales.find(s=>s.id===id);
  if(!sale || sale.refunded) return;
  if(!confirm(`Refund ${sale.id} (${naira(sale.total)}) and return these items to stock?`)) return;
  sale.lines.forEach(l=>{ const item = items.find(i=>i.name===l.name); if(item) item.stock += l.qty; });
  sale.refunded = true;
  persistItems(); persistSales();
  logActivity(`Refunded sale ${sale.id} (${naira(sale.total)}) — items returned to stock`);
  renderAll();
}
function renderActivity(){
  if(role()!=='admin') return;
  document.getElementById('activityBody').innerHTML = activityLog.slice().reverse().map(e=>
    `<tr><td class="mono">${esc(e.time)}</td><td>${esc(e.user)}</td><td><span class="rolebadge ${esc(e.role)}">${esc(e.role)}</span></td><td>${esc(e.action)}</td></tr>`).join('') || `<tr><td colspan="4" style="color:var(--muted);">No activity yet.</td></tr>`;
}

/* ================= Close Day ================= */
/* ================= Debtors ================= */
function toggleAddDebtorBox(){ document.getElementById('addDebtorBox').classList.toggle('open'); }
function submitNewDebtor(){
  const name = document.getElementById('newDebtorName').value.trim();
  const phone = document.getElementById('newDebtorPhone').value.trim();
  if(!name){ alert('Please enter a customer name.'); return; }
  const d = findOrCreateDebtor(name, phone);
  if(phone) d.phone = phone;
  persistDebtors();
  logActivity(`Added customer "${name}" to the debtor ledger`);
  document.getElementById('newDebtorName').value=''; document.getElementById('newDebtorPhone').value='';
  toggleAddDebtorBox();
  renderDebtors();
}
function renderDebtors(){
  const q = (document.getElementById('debtorSearch')?.value||'').toLowerCase();
  const rows = debtors.filter(d=>d.name.toLowerCase().includes(q));
  document.getElementById('debtorsBody').innerHTML = rows.map(d=>`
    <tr><td class="mono">${esc(d.id)}</td><td>${esc(d.name)}</td><td>${esc(d.phone||'—')}</td>
    <td class="mono" style="color:${d.balance>0?'var(--stamp)':'var(--sage)'};">${naira(d.balance)}</td>
    <td style="white-space:nowrap;"><button class="btn sm ghost" onclick="recordPayment('${d.id}')" ${d.balance<=0?'disabled':''}>Record payment</button></td></tr>`).join('')
    || `<tr><td colspan="5" style="color:var(--muted);">${t('noDebtorsYet')}</td></tr>`;
}
function recordPayment(id){
  const d = debtors.find(x=>x.id===id);
  if(!d) return;
  const amt = Number(prompt(`How much did ${d.name} pay? (Outstanding: ${naira(d.balance)})`, ''));
  if(!amt || amt<=0) return;
  d.balance = Math.max(0, d.balance - amt);
  d.history.push({date: todayIso(), type:'payment', amount: amt});
  persistDebtors();
  logActivity(`Recorded payment of ${naira(amt)} from ${d.name} (${d.id})`);
  renderDebtors();
}

/* ================= Expenses ================= */
function submitExpense(){
  const category = document.getElementById('newExpenseCategory').value;
  const amount = Number(document.getElementById('newExpenseAmount').value);
  const isoDate = document.getElementById('newExpenseDate').value || todayIso();
  const note = document.getElementById('newExpenseNote').value.trim();
  if(!amount || amount<=0){ alert('Enter a valid amount.'); return; }
  expenses.push({ id:'EX-'+String(Math.max(0,...expenses.map(e=>+String(e.id).replace(/\D/g,'')||0))+1).padStart(3,'0'), category, amount, isoDate, loggedBy: `${currentUser.name} (${currentUser.id})`, note });
  persistExpenses();
  logActivity(`Logged expense: ${category} — ${naira(amount)}`);
  document.getElementById('newExpenseAmount').value=''; document.getElementById('newExpenseNote').value='';
  renderExpenses(); renderReports();
}
function renderExpenses(){
  if(role()!=='admin') return;
  document.getElementById('expensesBody').innerHTML = expenses.slice().reverse().map(e=>`
    <tr><td>${esc(e.isoDate)}</td><td>${esc(e.category)}</td><td class="mono">${naira(e.amount)}</td><td>${esc(e.loggedBy)}</td><td>${esc(e.note||'—')}</td>
    <td><button class="btn sm ghost" onclick="deleteExpense('${e.id}')">Delete</button></td></tr>`).join('')
    || `<tr><td colspan="6" style="color:var(--muted);">${t('noExpensesYet')}</td></tr>`;
}
function deleteExpense(id){
  const exp = expenses.find(e=>e.id===id); if(!exp) return;
  if(!confirm(`Delete this expense (${exp.category}, ${naira(exp.amount)})?`)) return;
  expenses = expenses.filter(e=>e.id!==id);
  persistExpenses();
  logActivity(`Deleted expense: ${exp.category} — ${naira(exp.amount)}`);
  renderExpenses(); renderReports();
}
function printExpenses(){
  const rows = expenses.slice().reverse().map(e=>[e.isoDate, esc(e.category), naira(e.amount), esc(e.loggedBy), esc(e.note||'—')]);
  showPrintableReport('Expense Log', `${expenses.length} entries`, ['Date','Category','Amount','Logged by','Note'], rows);
}

function renderCloseDay(){
  if(role()!=='admin') return;
  const today = sales.filter(s=>s.isoDate===todayIso() && !s.refunded);
  const total = today.reduce((s,x)=>s+x.total,0);
  const cashTotal = today.filter(s=>s.payment==='Cash').reduce((s,x)=>s+x.total,0);
  const lowStock = items.filter(i=>i.stock<=i.reorder).length;
  document.getElementById('closeCards').innerHTML = `
    <div class="card"><div class="k">${t('cardTotalSalesToday')}</div><div class="v">${naira(total)}</div></div>
    <div class="card"><div class="k">${t('cardCashSalesToday')}</div><div class="v good">${naira(cashTotal)}</div></div>
    <div class="card"><div class="k">${t('cardLowStockItems')}</div><div class="v ${lowStock?'alert':'good'}">${lowStock}</div></div>`;
  document.getElementById('expectedCashNote').textContent = `Expected cash in till from today's Cash sales: ${naira(cashTotal)}`;
  window._expectedCash = cashTotal;
  updateCashDiff();
}
function updateCashDiff(){
  const counted = Number(document.getElementById('countedCash').value)||0;
  const expected = window._expectedCash||0;
  const diff = counted - expected;
  const note = document.getElementById('cashDiffNote');
  if(!document.getElementById('countedCash').value){ note.textContent=''; return; }
  if(diff===0){ note.style.color='var(--sage)'; note.textContent='Matches exactly.'; }
  else if(diff>0){ note.style.color='var(--sage)'; note.textContent=`${naira(diff)} more than expected.`; }
  else{ note.style.color='var(--stamp)'; note.textContent=`${naira(Math.abs(diff))} short — worth checking.`; }
}
function confirmCloseDay(){
  const counted = Number(document.getElementById('countedCash').value)||0;
  const diff = counted - (window._expectedCash||0);
  logActivity(`Closed the day — cash counted ${naira(counted)} (${diff===0?'matched':diff>0?'+'+naira(diff):naira(diff)})`);
  alert('Day closed and logged to the Activity Log.');
}

/* ================= Printable / shareable reports (generic) =================
   One reusable builder used by Close Day, Activity Log, low stock, top
   sellers, sales log, and reorder suggestions — so every report gets the
   same clean printed layout (business header + logo) and the same
   WhatsApp-share option for free, instead of five one-off implementations. */
let lastPrintPlainText = '';
function showPrintableReport(title, subtitleHtml, headers, rows, footerNote){
  const logoHtml = settings.logo ? `<img src="${settings.logo}">` : '';
  document.getElementById('reportPrintContent').innerHTML = `
    <div class="rp-head">${logoHtml}<div><div class="rp-biz">${esc(settings.name)}</div><div class="rp-meta">${esc(settings.address)} · ${esc(settings.phone)}</div></div></div>
    <h4>${esc(title)}</h4>
    <p class="rp-meta">${subtitleHtml}</p>
    <table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${headers.length}" style="color:var(--muted);">No data for this report.</td></tr>`}</tbody></table>
    <div class="rp-foot">${esc(footerNote||'')}<br>Printed ${new Date().toLocaleString('en-NG')} by ${currentUser?esc(currentUser.name):''}</div>`;
  const plainRows = rows.map(r=>r.join(' — ')).join('\n');
  lastPrintPlainText = `${title} — ${settings.name}\n${rows.length} rows\n\n${plainRows}`;
  document.getElementById('reportPrintOverlay').classList.add('active');
}
function closeReportPrint(){ document.getElementById('reportPrintOverlay').classList.remove('active'); }
function shareReportWa(){ window.open(`https://wa.me/?text=${encodeURIComponent(lastPrintPlainText)}`,'_blank'); }

function printCloseDay(){
  const today = sales.filter(s=>s.isoDate===todayIso() && !s.refunded);
  const total = today.reduce((s,x)=>s+x.total,0);
  const cashTotal = today.filter(s=>s.payment==='Cash').reduce((s,x)=>s+x.total,0);
  const counted = Number(document.getElementById('countedCash').value)||0;
  const lowStockCount = items.filter(i=>i.stock<=i.reorder).length;
  showPrintableReport('Close-Day Report', `${todayIso()} · ${today.length} transactions`,
    ['Figure','Amount'],
    [
      ['Total sales today', naira(total)],
      ['Cash sales today', naira(cashTotal)],
      ['Cash counted in till', counted ? naira(counted) : '—'],
      ['Difference vs expected', counted ? naira(counted-cashTotal) : '—'],
      ['Low stock items', lowStockCount]
    ], 'Generated from the Close Day screen.');
}
function printActivityLog(){
  showPrintableReport('Activity Log', `${activityLog.length} recorded actions`,
    ['Time','User','Role','Action'],
    activityLog.slice().reverse().map(e=>[esc(e.time), esc(e.user), esc(e.role), esc(e.action)]),
    'Every action is traced to a real registered account.');
}
function printReorderSuggestions(){
  const rows = Array.from(document.querySelectorAll('#reorderBody tr')).map(tr=>Array.from(tr.children).map(td=>td.textContent.trim()));
  showPrintableReport('Reorder Suggestions', 'Based on real sales velocity', ['Item','Avg. daily sales','Days left','Status'], rows);
}
function printTopSellers(){
  const rows = Array.from(document.querySelectorAll('#topSellersBody tr')).map(tr=>Array.from(tr.children).map(td=>td.textContent.trim()));
  const range = getSelectedRange();
  showPrintableReport('Top Sellers', `${range.from} → ${range.to}`, ['Item','Qty sold','Revenue'], rows);
}
function printSalesLog(){
  const range = getSelectedRange();
  const rows = sales.filter(s=>inRange(s,range)).slice().reverse().map(s=>[s.id, `${s.date} ${s.time}`, esc(s.staff), s.payment, naira(s.total)]);
  showPrintableReport('Sales Log', `${range.from} → ${range.to}`, ['Receipt #','Time','Staff','Payment','Total'], rows);
}
function printLowStock(){
  const low = items.filter(i=>i.stock<=i.reorder);
  showPrintableReport('Low Stock List', `${low.length} items at or below reorder point`,
    ['Item','Category','In stock','Reorder at'],
    low.map(i=>[esc(i.name), esc(i.category), `${i.stock} ${esc(i.unit)}`, i.reorder]),
    'Share this with a supplier or keep for your own records.');
}
function scrollToLowStock(){ document.getElementById('lowStockPanel').scrollIntoView({behavior:'smooth', block:'start'}); }

/* ================= CSV export ================= */
function downloadCSV(filename, rows){
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}
function exportCSV(type){
  if(type==='items'){
    const rows = [['Name','Category','Unit','Stock','Reorder','Cost','Price']];
    items.forEach(i=>rows.push([i.name,i.category,i.unit,i.stock,i.reorder, role()==='admin'?(i.cost??''):'', i.price]));
    downloadCSV('inventory.csv', rows);
  } else {
    const rows = [['Receipt','Date','Time','Staff','Payment','Total']];
    sales.forEach(s=>rows.push([s.id,s.date,s.time,s.staff,s.payment,s.total]));
    downloadCSV('sales.csv', rows);
  }
  logActivity(`Exported ${type} as CSV`);
}

/* ================= Settings ================= */
function loadSettingsForm(){
  document.getElementById('setName').value = settings.name; document.getElementById('setPhone').value = settings.phone;
  document.getElementById('setAddress').value = settings.address; document.getElementById('setFooter').value = settings.footer;
  document.getElementById('setWa').value = settings.wa||''; document.getElementById('setLockTimeout').value = settings.lockTimeout;
  document.getElementById('setVat').value = settings.vatRate||0;
  document.getElementById('setBtService').value = settings.btService||'';
  document.getElementById('setBrandPrimary').value = settings.brandPrimary || DEFAULT_BRAND_PRIMARY;
  document.getElementById('setBrandAccent').value = settings.brandAccent || DEFAULT_BRAND_ACCENT;
  const preview = document.getElementById('setLogoPreview'), ph = document.getElementById('setLogoPlaceholder'), rm = document.getElementById('setLogoRemoveBtn');
  if(settings.logo){ preview.src = settings.logo; preview.style.display='block'; ph.style.display='none'; rm.style.display='inline-block'; }
  else { preview.style.display='none'; ph.style.display='flex'; rm.style.display='none'; }
}
let pendingLogo = undefined; // undefined = unchanged, null = explicitly removed, string = new logo
async function previewLogo(){
  const f = document.getElementById('setLogoFile').files[0]; if(!f) return;
  try{
    pendingLogo = await compressImage(f, 240, 0.85);
    const preview = document.getElementById('setLogoPreview'); preview.src = pendingLogo; preview.style.display='block';
    document.getElementById('setLogoPlaceholder').style.display='none';
    document.getElementById('setLogoRemoveBtn').style.display='inline-block';
  }catch(e){ alert('Could not read that image — please try a different file.'); }
}
function removeLogo(){
  pendingLogo = null;
  document.getElementById('setLogoPreview').style.display='none';
  document.getElementById('setLogoPlaceholder').style.display='flex';
  document.getElementById('setLogoRemoveBtn').style.display='none';
  document.getElementById('setLogoFile').value='';
}
function updateBrandMark(){
  const mark = document.getElementById('brandMark');
  if(!mark) return;
  if(settings.logo) mark.innerHTML = `<img src="${settings.logo}" style="width:100%; height:100%; object-fit:cover; border-radius:9px;">`;
  else mark.textContent = 'A';
}
/* ================= Brand colors ================= */
/* Only two colors are picked (primary + accent) — everything else (hover
   shades, the darker gradient tone, soft/tinted variants) is derived
   automatically so an Admin can't accidentally pick a combination that
   makes text unreadable, and doesn't need to understand a whole palette
   system to rebrand the app. Applied via CSS custom properties, so a
   single settings change re-themes the entire app, receipts, and printed
   reports at once — no separate styling per screen. */
function shadeColor(hex, percent){
  const num = parseInt(hex.replace('#',''), 16);
  const amt = Math.round(2.55*percent);
  const r = Math.min(255, Math.max(0, (num>>16)+amt));
  const g = Math.min(255, Math.max(0, ((num>>8)&0x00FF)+amt));
  const b = Math.min(255, Math.max(0, (num&0x0000FF)+amt));
  return '#' + (0x1000000 + r*0x10000 + g*0x100 + b).toString(16).slice(1);
}
function hexToRgb(hex){ const num = parseInt(hex.replace('#',''),16); return `${(num>>16)&255},${(num>>8)&255},${num&255}`; }
function applyBrandColors(){
  const root = document.documentElement.style;
  const primary = settings.brandPrimary || DEFAULT_BRAND_PRIMARY;
  const accent = settings.brandAccent || DEFAULT_BRAND_ACCENT;
  root.setProperty('--ink', primary);
  root.setProperty('--ink-2', shadeColor(primary, -18)); // darker, for the header gradient
  root.setProperty('--gold', accent);
  root.setProperty('--gold-soft', shadeColor(accent, 25)); // lighter, for text-on-dark contexts
  root.setProperty('--shadow', `0 8px 24px rgba(${hexToRgb(primary)},0.10)`);
  root.setProperty('--shadow-lg', `0 20px 60px rgba(${hexToRgb(primary)},0.20)`);
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', primary);
}
function resetBrandColors(){
  document.getElementById('setBrandPrimary').value = DEFAULT_BRAND_PRIMARY;
  document.getElementById('setBrandAccent').value = DEFAULT_BRAND_ACCENT;
}
function saveSettings(){
  settings.name = document.getElementById('setName').value; settings.phone = document.getElementById('setPhone').value;
  settings.address = document.getElementById('setAddress').value; settings.footer = document.getElementById('setFooter').value;
  settings.wa = document.getElementById('setWa').value; settings.paper = document.querySelector('#paperGroup input:checked').value;
  settings.lockTimeout = Number(document.getElementById('setLockTimeout').value);
  settings.vatRate = Math.max(0, Number(document.getElementById('setVat').value)||0);
  settings.btService = document.getElementById('setBtService').value.trim() || '000018f0-0000-1000-8000-00805f9b34fb';
  settings.brandPrimary = document.getElementById('setBrandPrimary').value;
  settings.brandAccent = document.getElementById('setBrandAccent').value;
  if(pendingLogo!==undefined){ settings.logo = pendingLogo; pendingLogo = undefined; }
  persistSettings(); logActivity('Updated receipt settings'); resetLockTimer();
  updateBrandMark();
  applyBrandColors();
  alert('Saved — go complete a sale and print a receipt to see it reflected.');
}
document.getElementById('paperGroup').addEventListener('change', e=>{ document.querySelectorAll('#paperGroup label').forEach(l=>l.classList.toggle('checked', l.querySelector('input').checked)); });

/* ================= Init ================= */
function renderAll(){ renderDashboard(); renderInventory(); renderSaleSearch(); renderCart(); renderReports(); renderActivity(); renderCloseDay(); loadSettingsForm(); renderStaffManagement(); renderDebtors(); renderExpenses(); }

/* ================= Manage Staff (Admin only) =================
   Two things a real business genuinely needs, both free since they're just
   localStorage writes: resetting a forgotten password (Admin sets a fresh
   temporary one, shown once, staff changes it isn't needed for a demo but
   would be a good next step for the real build), and deactivating an
   account the moment someone leaves — so access doesn't quietly linger. */
function renderStaffManagement(){
  if(role()!=='admin') return;
  const body = document.getElementById('staffMgmtBody');
  if(!body) return;
  body.innerHTML = users.map(u=>{
    const isSelf = currentUser && u.id===currentUser.id;
    const statusPill = u.active===false
      ? `<span class="pill low">${t('inactiveStatus')}</span>`
      : `<span class="pill ok">${t('activeStatus')}</span>`;
    const toggleBtn = isSelf
      ? `<span class="helptext">(you)</span>`
      : u.active===false
        ? `<button class="btn sm ghost" onclick="toggleUserActive('${u.id}')">${t('reactivateBtn')}</button>`
        : `<button class="btn sm ghost" onclick="toggleUserActive('${u.id}')">${t('deactivateBtn')}</button>`;
    return `<tr>
      <td class="mono">${esc(u.id)}</td>
      <td>${esc(u.name)}</td>
      <td><span class="rolebadge ${esc(u.role)}">${esc(u.role)}</span></td>
      <td>${statusPill}</td>
      <td style="white-space:nowrap;"><button class="btn sm ghost" onclick="resetUserPassword('${u.id}')">${t('resetPasswordBtn')}</button> ${toggleBtn}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" style="color:var(--muted);">No accounts registered yet.</td></tr>`;
}
async function resetUserPassword(id){
  const user = users.find(u=>u.id===id);
  if(!user) return;
  if(!confirm(`Reset the password for ${user.name} (${user.id})? A new temporary password will be generated.`)) return;
  const tempPass = randomTempPassword();
  const salt = randomSaltHex();
  user.passSalt = salt;
  user.passHash = await hashSecret(tempPass, salt);
  persistUsers();
  logActivity(`Reset password for ${user.name} (${user.id})`);
  alert(`New temporary password for ${user.name} (${user.id}):\n\n${tempPass}\n\nShare this with them directly — it won't be shown again.`);
}
function toggleUserActive(id){
  const user = users.find(u=>u.id===id);
  if(!user) return;
  if(currentUser && user.id===currentUser.id){ alert("You can't deactivate your own account."); return; }
  const goingInactive = user.active!==false;
  if(!confirm(`${goingInactive ? 'Deactivate' : 'Reactivate'} ${user.name} (${user.id})?${goingInactive ? ' They will no longer be able to log in.' : ''}`)) return;
  user.active = !goingInactive;
  persistUsers();
  logActivity(`${goingInactive ? 'Deactivated' : 'Reactivated'} account ${user.name} (${user.id})`);
  renderStaffManagement();
}
function randomTempPassword(){
  // Avoids visually ambiguous characters (0/O, 1/l/I) since this gets read
  // aloud or typed from a screen, not copy-pasted.
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const arr = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(arr).map(b=>chars[b % chars.length]).join('');
}
applyI18n();
updateBrandMark();
applyBrandColors();
if(currentUser){
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('whoName').textContent = currentUser.name; document.getElementById('whoId').textContent = currentUser.id;
  const rb = document.getElementById('whoRole'); rb.textContent = currentUser.role; rb.className = 'rolebadge ' + currentUser.role;
  applyRoleLocks(); renderAll(); resetLockTimer();
} else { renderAuthGate(); }

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{ 0; });
}
