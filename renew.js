/* Step 4: renewal reminder + receipt upload with free in-browser OCR. */
const OCR_URL='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const loadOcr=()=>window.Tesseract?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src=OCR_URL;s.onload=ok;s.onerror=()=>no(new Error('Could not load the receipt reader.'));document.head.append(s);});
const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function ymd(y,m,d){y=+y;if(y<100)y+=2000;m=+m;d=+d;return m<1||m>12||d<1||d>31?'':y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function findDate(t){const r=[];let m,x;
 x=/(\d{4})-(\d{2})-(\d{2})/g;while(m=x.exec(t))r.push(ymd(m[1],m[2],m[3]));
 x=/(\d{1,2})(?:st|nd|rd|th)?[\s\-\/,]+([A-Za-z]{3})[a-z]*[\s\-\/,]+(\d{2,4})/g;while(m=x.exec(t)){const o=MON[m[2].toLowerCase()];if(o)r.push(ymd(m[3],o,m[1]));}
 x=/([A-Za-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/g;while(m=x.exec(t)){const o=MON[m[1].toLowerCase()];if(o)r.push(ymd(m[3],o,m[2]));}
 x=/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/g;while(m=x.exec(t))r.push(ymd(m[3],m[2],m[1]));   // Nigerian order: day first
 return r.find(d=>d&&Math.abs(new Date(d)-Date.now())<45*864e5)||'';}
function findAmount(t){const c=[];let m,x=/(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{3,7}\.\d{2})/g;
 while(m=x.exec(t)){const v=parseFloat(m[1].replace(/,/g,''));if(v>=100&&v<1e8)c.push(v);}
 x=/(?:₦|NGN|#)\s?(\d{4,8})(?!\d)/g;while(m=x.exec(t))c.push(+m[1]);
 return c.length?Math.max(...c):0;}
const findRef=t=>{const m=/(?:ref(?:erence)?|session\s*id|transaction\s*(?:no|id|ref)\w*)[^A-Za-z0-9]{0,6}([A-Za-z0-9\-]{8,40})/i.exec(t);return m?m[1]:'';};
async function prep(file){const b=await createImageBitmap(file),sc=Math.min(1,1400/Math.max(b.width,b.height)),c=document.createElement('canvas');c.width=Math.round(b.width*sc);c.height=Math.round(b.height*sc);
 c.getContext('2d').drawImage(b,0,0,c.width,c.height);let q=.75,u=c.toDataURL('image/jpeg',q);while(u.length>590000&&q>.3){q-=.1;u=c.toDataURL('image/jpeg',q);}return{c,u};}
const hashBuf=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');

async function payFlow(){const L=(await kget('lic'))||{},d=document.createElement('dialog');
 d.innerHTML=`<h3 style="margin-top:0">Upload payment receipt</h3><p class="mute">Pay ${money(L.price||0)} to ${esc(L.bank||'')}, ${esc(L.accountName||'')}, ${esc(L.accountNumber||'')}. Then add a clear screenshot or photo of the receipt.</p>
 <input type="file" id="rf" accept="image/*"><p id="rs" class="mute" role="status" aria-live="polite"></p><div id="rb"></div><button class="alt" id="rx" style="margin-top:10px">Close</button>`;
 document.body.append(d);d.showModal();d.querySelector('#rx').onclick=()=>d.remove();
 const say=t=>d.querySelector('#rs').textContent=t;
 d.querySelector('#rf').onchange=async e=>{const f=e.target.files[0];if(!f)return;let img,hash,A=0,D='',R='',note='';
  try{say('Preparing the image...');img=await prep(f);hash=await hashBuf(await f.arrayBuffer());
   try{say('Reading the receipt. This can take up to a minute the first time.');await loadOcr();const r=await Tesseract.recognize(img.c,'eng');const t=r.data.text;A=findAmount(t);D=findDate(t);R=findRef(t);}
   catch(x){note='We could not read the receipt automatically. Please type the details from it.';}
  }catch(x){return say('That image could not be opened. Try another one.');}
  if(!note&&(!A||!D))note='Please check the details below and fill in what we could not read.';
  say(note||'Check these details, then submit.');
  d.querySelector('#rb').innerHTML=`<label class="mute">Amount paid</label><input id="fa" inputmode="decimal" value="${A||''}"><label class="mute">Date of payment (YYYY-MM-DD)</label><input id="fd" value="${esc(D)}"><label class="mute">Reference (optional)</label><input id="fr" value="${esc(R)}"><button class="go" id="fs" style="margin-top:12px">Submit receipt</button>`;
  d.querySelector('#fs').onclick=async()=>{const b=d.querySelector('#fs');b.disabled=true;say('Sending...');
   try{const r=await api('payment.submit',{token:S.token,dataUrl:img.u,amount:+d.querySelector('#fa').value||0,payDate:d.querySelector('#fd').value.trim(),reference:d.querySelector('#fr').value.trim(),imageHash:hash});
    say(r.message);if(r.license&&!r.license.locked){await kset('lic',r.license);setTimeout(()=>location.reload(),1800);}else b.hidden=true;}
   catch(x){say(x.message);b.disabled=false;}};};}

async function remind(){const L=await kget('lic');if(!L||!L.showReminder||L.locked)return;const own=S.user.role==='owner',d=document.createElement('dialog');
 const head=L.state==='grace'?`Your subscription has ended. ${L.graceLeft} grace day${L.graceLeft===1?'':'s'} left`:`Subscription ends in ${L.daysLeft} day${L.daysLeft===1?'':'s'}`;
 d.innerHTML=`<h3 style="margin-top:0">${head}</h3><p>To renew, pay ${money(L.price)} to:<br><b>${esc(L.bank)}<br>${esc(L.accountName)}<br>${esc(L.accountNumber)}</b></p>${own?'':'<p class="mute">Please tell the owner.</p>'}
 <div class="row">${own?'<button class="grow" id="up">Upload receipt</button>':''}<button class="alt ${own?'':'grow'}" id="cl">Later</button></div>`;
 document.body.append(d);d.showModal();d.querySelector('#cl').onclick=()=>d.remove();const u=d.querySelector('#up');if(u)u.onclick=()=>{d.remove();payFlow();};}
