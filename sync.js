/* Supershores sync. The demo's screens keep working exactly as before. After any change this file works out
   what happened, queues it, sends it to the server (which re-checks prices, roles and stock), and pulls the
   server's data back so every phone agrees. Also: dynamic categories, discount approval, audit trail. */
const SY={merging:false,busy:false};
const syQ=()=>ssGet('ss_q',[]),syQSave=q=>ssSet('ss_q',q),syDev=()=>ssGet('ss_dev',null);
const syNum=s=>+String(s).replace(/\D/g,'')||0;
SY.shrink=(url,limit=42000)=>new Promise(res=>{const im=new Image();im.onload=()=>{try{for(const max of [360,300,240,180,140]){const k=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*k));c.height=Math.max(1,Math.round(im.height*k));
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);for(const q of [.7,.55,.4]){const u=c.toDataURL('image/jpeg',q);if(u.length<=limit)return res(u);}}res(url.length<=limit?url:null);}catch(e){res(url.length<=limit?url:null);}};im.onerror=()=>res(url.length<=limit?url:null);im.src=url;});   // small enough to live in one Sheet cell
SY.adj={};
SY.q=(type,payload)=>{const q=syQ();q.push({opId:'op-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),type,payload,ts:new Date().toISOString(),by:currentUser.id,token:currentUser.token,offline:!navigator.onLine});syQSave(q);SY.kick();};
SY.kick=()=>{clearTimeout(SY.kt);SY.kt=setTimeout(SY.sync,400);};
SY.chip=m=>{let c=document.getElementById('syChip');if(!c){c=document.createElement('button');c.id='syChip';c.style.cssText='position:fixed;left:8px;bottom:72px;z-index:60;font:600 11px var(--font-sans,sans-serif);padding:3px 10px;border-radius:99px;border:1px solid var(--paper-line,#ccc);background:#fff;color:#333;opacity:.9;cursor:pointer';
  c.onclick=()=>{const f=ssGet('ss_failed',[]);if(!f.length)return alert(SY.lastError&&syQ().length?'Syncing hit a problem and will retry on its own:\n'+SY.lastError:'Everything is in step with the server.');alert('These changes were refused by the server:\n\n'+f.map(x=>`${x.type} ${x.id}: ${x.error}`).join('\n')+'\n\nThe screens now show the server\'s version.');ssSet('ss_failed',[]);SY.chip();};document.body.append(c);}
 const n=syQ().length,f=ssGet('ss_failed',[]).length;c.textContent=m||(f?`${f} refused, tap to see`:!navigator.onLine?`Offline${n?', '+n+' waiting':''}`:n?`${n} waiting to sync`:'Synced');c.style.color=f?'#b3261e':'#333';c.classList.toggle('syncing',m==='Syncing...');c.hidden=!currentUser;};

/* ---- 1. Work out what changed, after every save ---- */
SY.sids=()=>{const d=syDev();items.forEach(i=>{if(!i.sid)i.sid='I-'+d+'-'+i.id;});debtors.forEach(x=>{if(!x.sid)x.sid='C-'+d+'-'+syNum(x.id);});expenses.forEach(e=>{if(!e.sid)e.sid='E-'+d+'-'+syNum(e.id);});};
SY.blob=()=>{const x=Object.assign({},settings);delete x.logo;delete x.logoHave;delete x.logoWant;return JSON.stringify({s:x,branches});};   // the logo travels separately, so the settings stay small
const syLogo=()=>settings.logo&&settings.logo!==window.SS_LOGO?settings.logo.length+':'+settings.logo.slice(-20):'';
const syPh=i=>i.photo?i.photo.length+':'+i.photo.slice(-20):'';
SY.shape=()=>({settings:SY.blob(),logoMark:syLogo(),items:Object.fromEntries(items.map(i=>[i.id,{name:i.name,service:!!i.service,barcode:i.barcode,category:i.category,unit:i.unit,cost:i.cost,price:i.price,reorder:i.reorder,expiry:i.expiry,stock:i.stock,branch:i.branch||'',trackBatches:!!i.trackBatches,bc:(i.batches||[]).map(b=>b.code),ph:syPh(i)}])),
 sales:Object.fromEntries(sales.map(s=>[s.id,!!s.refunded])),debtors:Object.fromEntries(debtors.map(d=>[d.id,d.history.length])),expenses:Object.fromEntries(expenses.map(e=>[e.id,e.sid]))});
SY.sched=()=>{clearTimeout(SY.dt);SY.dt=setTimeout(SY.diff,0);};
const newBatch=(i,o)=>{const b=(i.batches||[]).filter(x=>!(o.bc||[]).includes(x.code)).pop();return b?{code:b.code,expiry:b.expiry||'',dateAdded:b.dateAdded}:{code:'RESTOCK',expiry:'',dateAdded:todayIso()};};
SY.diff=()=>{if(SY.merging||!currentUser||!syDev())return;SY.sids();const old=ssGet('ss_snap',null),now=SY.shape();if(!old){ssSet('ss_snap',now);return;}
 const ops=[],photos=[],byId=id=>items.find(i=>i.id===id),lineItem=l=>byId(l.itemId)||items.find(i=>i.name===l.name),delta={};
 const draw=(l,sign)=>{const x=lineItem(l);if(!x||x.service)return;(x.bundle?x.bundle.map(c=>[c.itemId,c.qty*l.qty]):[[x.id,l.qty]]).forEach(([id,n])=>{delta[id]=(delta[id]||0)+sign*n;});};
 const newSales=sales.filter(s=>old.sales[s.id]===undefined),refunded=sales.filter(s=>old.sales[s.id]===false&&s.refunded);
 newSales.forEach(s=>s.lines.forEach(l=>draw(l,-1)));refunded.forEach(s=>s.lines.forEach(l=>draw(l,1)));
 debtors.forEach(d=>{const n=old.debtors[d.id];if(n===undefined)ops.push(['debtor.add',{customerId:d.sid,name:d.name,phone:d.phone||''}]);else d.history.slice(n).forEach(h=>{if(h.type==='payment')ops.push(['debtor.payment',{customerId:d.sid,amount:h.amount}]);});});
 {const del=ssGet('ss_del',[]);if(del.length){del.forEach(sid=>ops.push(['item.setActive',{itemId:sid,active:false}]));ssSet('ss_del',[]);}}
             items.forEach(i=>{const o=old.items[i.id];
  if(currentUser.role==='admin'&&i.photo&&String(i.photo).startsWith('data:')&&(!o||o.ph!==syPh(i)))photos.push({itemId:i.sid,dataUrl:i.photo});
  if(!o){ops.push(['item.create',{itemId:i.sid,name:i.name,barcode:i.barcode||'',category:i.category||'General',unit:i.unit||'piece',cost:+i.cost||0,price:i.price,kind:i.service?'service':undefined,openingStock:(i.bundle||i.service)?0:(+i.stock||0),reorder:+i.reorder||0,expiry:i.expiry||'',branch:i.branch||'',trackBatches:!!i.trackBatches,batch:i.trackBatches&&!i.bundle&&+i.stock>0?{code:'OPENING',expiry:i.expiry||'',dateAdded:todayIso()}:undefined,bundle:i.bundle?i.bundle.map(c=>({itemId:(byId(c.itemId)||{}).sid,qty:c.qty})):undefined}]);return;}
  const ch={};['name','barcode','category','unit','cost','price','reorder','expiry','branch','trackBatches'].forEach(f=>{const a=f==='trackBatches'?!!i[f]:i[f]??'',b=f==='trackBatches'?!!o[f]:o[f]??'';if(String(a)!==String(b))ch[f]=a;});
  if(o.service!==undefined&&!!i.service!==!!o.service)ch.kind=i.service?'service':'good';   
  if(Object.keys(ch).length)ops.push(['item.update',{itemId:i.sid,changes:ch}]);
  if(!i.bundle&&!i.service){const un=(+i.stock||0)-(+o.stock||0)-(delta[i.id]||0);   // whatever the sales and refunds do not explain was a restock or correction
   if(un<0)SY.adjBatch=SY.adj[i.id];
   if(un>0)ops.push(['stock.in',{itemId:i.sid,qty:un,supplier:i.supplier||'',batch:i.trackBatches?newBatch(i,o):undefined}]);else if(un<0){ops.push(['stock.out',{itemId:i.sid,qty:-un,reason:'Adjustment',direction:'OUT',note:'Changed in the app',batch:i.trackBatches&&SY.adj[i.id]?{code:SY.adj[i.id]}:undefined}]);delete SY.adj[i.id];}}});
 newSales.forEach(s=>{const c=s.payment==='Credit'?debtors.find(d=>d.name.toLowerCase()===String(s.customer||'').toLowerCase().trim()):null,dc=s.discount;
  ops.push(['sale.create',{saleId:s.id,lines:s.lines.map(l=>({itemId:(lineItem(l)||{}).sid,qty:l.qty})),payment:s.payment,customerId:c?c.sid:undefined,voucher:dc&&dc.voucher||undefined,
   discount:dc&&!dc.voucher&&currentUser.role==='admin'?{amount:dc.amount,reason:dc.reason||'Admin discount'}:undefined}]);});
 refunded.forEach(s=>ops.push(['sale.void',{saleId:s.id,reason:'Refunded in the app'}]));
 expenses.forEach(e=>{if(!(e.id in old.expenses))ops.push(['expense.add',{expenseId:e.sid,date:e.isoDate,category:e.category,amount:e.amount,notes:e.note||''}]);});
 Object.keys(old.expenses).forEach(id=>{if(!expenses.some(e=>String(e.id)===id))ops.push(['expense.reverse',{expenseId:old.expenses[id],reversalId:'R-'+old.expenses[id]+'-'+Date.now().toString(36),reason:'Deleted in the app'}]);});
if(currentUser.role==='admin'){const lm=now.logoMark;if(lm&&lm!==(old.logoMark||''))photos.push({itemId:'LOGO',dataUrl:settings.logo,logo:true});
  else if(!lm&&old.logoMark&&settings.logoVer!=='none'){settings.logoVer='none';settings.logoHave='none';persistSettings();now.settings=SY.blob();}}
 if(currentUser.role==='admin'&&old.settings!==now.settings)ops.push(['settings.update',{changes:{AppSettingsJSON:now.settings}}]);
 ssSet('ss_snap',now);ops.forEach(([t,p])=>SY.q(t,p));photos.forEach(p=>SY.q('__photo',p));};
['persistItems','persistSales','persistDebtors','persistExpenses','persistSettings','persistBranches'].forEach(n=>{const o=window[n];window[n]=function(){o();SY.sched();};});
const syClose=confirmCloseDay;confirmCloseDay=function(){const c=Number(document.getElementById('countedCash').value)||0;syClose();SY.q('cash.close',{date:todayIso(),counted:c});};
const syLog=logActivity,COVERED=/^(Registered sale|Added new product|Edited |Restocked|Refunded sale|Logged expense|Deleted expense|Recorded payment|Added customer|Closed the day|Discount requested|Imported products|Logged in|Registered a new|Reset password|Removed account|Added staff|Deactivated|Reactivated|Changed password|Created the owner)/;
logActivity=function(a){syLog(a);if(!SY.merging&&currentUser&&!COVERED.test(a))SY.q('audit.log',{action:String(a).slice(0,150)});};

/* ---- 2. Send, then bring the server's version back ---- */
SY.sync=async()=>{if(SY.busy||!navigator.onLine||!currentUser||(SS.lic&&SS.lic.locked))return;clearTimeout(SY.dt);SY.diff();   // process any change that has not been looked at yet, so a refresh can never skip it
 SY.busy=true;SY.chip('Syncing...');
 try{let q=syQ();q.forEach(o=>{if(o.by===currentUser.id)o.token=currentUser.token;});
  syQSave(q);const n0=q.length;const sendable=q.filter(o=>o.type!=='__photo');
  if(sendable.length){const d=await SS.api('push',{ops:sendable.slice(0,50).map(({by,...o})=>o)}),bad=ssGet('ss_failed',[]);
   d.results.forEach(r=>{const o=q.find(x=>x.opId===r.opId);if(!o)return;
    if(r.status==='ok'||r.status==='duplicate'){q=q.filter(x=>x!==o);if(r.status==='ok'&&o.type==='sale.create')SY.fixSale(o,r.result);}
    else if(r.status==='error'){o.tries=(o.tries||0)+1;if(o.tries>=5){q=q.filter(x=>x!==o);bad.push({type:o.type,error:'The server could not process this after several tries.',id:o.payload.saleId||o.payload.itemId||o.payload.customerId||''});}}
    else if(r.status==='rejected'){q=q.filter(x=>x!==o);bad.push({type:o.type,error:r.error,id:o.payload.saleId||o.payload.name||o.payload.itemId||o.payload.customerId||''});}});
   syQSave(q);ssSet('ss_failed',bad);}
  for(const o of q.filter(x=>x.type==='__photo')){const small=await SY.shrink(o.payload.dataUrl,o.payload.logo?46000:42000);let err=small?null:'The photo could not be made small enough.';
   if(small)try{const r=await SS.api('photo.put',{token:currentUser.token,itemId:o.payload.itemId,dataUrl:small});if(o.payload.logo){settings.logoVer=r.marker;settings.logoHave=r.marker;persistSettings();}else{const it=items.find(i=>i.sid===o.payload.itemId);if(it){it.photoUrl=r.marker;persistItems();}}}catch(e){if(e.code)err=e.message;else break;}
   if(err||small){q=q.filter(z=>z!==o);if(err){const bad=ssGet('ss_failed',[]);bad.push({type:'photo',error:err,id:o.payload.itemId});ssSet('ss_failed',bad);}}}
  syQSave(q);
  if(!q.length)await SY.pull();else if(q.length<n0)setTimeout(SY.sync,400);
 }catch(e){if(e.code==='LICENSE_LOCKED')ssLock();else{SY.lastError=e.message+' @ '+String(e.stack||'').split('\n')[1];console.warn('Sync problem:',SY.lastError);}}
 SY.busy=false;SY.chip(SY.lastError&&syQ().length?'Sync problem, will retry':undefined);};
SY.fixSale=(o,r)=>{const s=sales.find(x=>x.id===o.payload.saleId);if(s&&r&&+s.total!==+r.total){SY.merging=true;s.subtotal=r.subtotal-r.discount;s.vatAmount=r.vat;s.total=r.total;persistSales();ssSet('ss_snap',SY.shape());SY.merging=false;}};
SY.pull=async()=>{const p=await SS.api('pull',{token:currentUser.token,since:ssGet('ss_since',null)});if(p.me&&p.me.perms){currentUser.perms=p.me.perms;const cu=users.find(x=>x.id===currentUser.id);if(cu)cu.perms=p.me.perms;persistUsers();applyRoleLocks();}
 const ep=String((p.settings&&p.settings.DataEpoch)||'0'),mine=ssGet('ss_epoch',null);if(mine===null)ssSet('ss_epoch',ep);else if(mine!==ep){SY.wipeLocal(ep);return SY.pull();}   // the admin reset the data: start clean too
clearTimeout(SY.dt);SY.diff();if(syQ().length)return;
 const before=JSON.stringify([items,debtors,sales.length,expenses,activityLog.length]);SY.merging=true;
 try{SY.mSettings(p.settings);SY.mItems(p.items,p.batches);SY.mDebtors(p.debtors);SY.mLedger(p.debtorLedger||[]);SY.mSales(p);if(p.expenses)SY.mExp(p.expenses);if(p.auditLog&&currentUser.role==='admin')SY.mAudit(p.auditLog);
  persistItems();persistDebtors();persistSales();persistExpenses();persistLog();ssSet('ss_snap',SY.shape());ssSet('ss_since',p.serverTime);}finally{SY.merging=false;}
 await SY.fetchPhotos();populateCategoryFilters();const typing=/INPUT|TEXTAREA|SELECT/.test((document.activeElement||{}).tagName||'');if(before!==JSON.stringify([items,debtors,sales.length,expenses,activityLog.length])&&!typing)renderAll();};
SY.wipeLocal=ep=>{SY.merging=true;try{items=[];sales=[];debtors=[];expenses=[];persistItems();persistSales();persistDebtors();persistExpenses();ssSet('ss_q',[]);ssSet('ss_failed',[]);ssSet('ss_ledger',[]);ssSet('ss_since',null);ssSet('ss_snap',null);ssSet('ss_epoch',String(ep));}finally{SY.merging=false;}populateCategoryFilters();renderAll();SY.chip();};
SY.fetchPhotos=async()=>{if(settings.logoWant){const w=settings.logoWant;if(w==='none'){settings.logo=window.SS_LOGO;settings.logoHave='none';settings.logoWant=null;}
  else{try{const d=await SS.api('photo.get',{token:currentUser.token,itemIds:['LOGO']}),p=d.photos.LOGO;if(p){settings.logo=p.dataUrl;settings.logoHave=p.version;}settings.logoWant=null;}catch(e){}}
  SY.merging=true;try{persistSettings();ssSet('ss_snap',SY.shape());updateBrandMark();}finally{SY.merging=false;}}
 for(let n=0;n<6;n++){const need=items.filter(i=>i.photoWant&&i.photoWant!==i.photoUrl).slice(0,8);if(!need.length)return;
 let d;try{d=await SS.api('photo.get',{token:currentUser.token,itemIds:need.map(i=>i.sid)});}catch(e){return;}
 SY.merging=true;try{need.forEach(i=>{const p=d.photos[i.sid];if(p){i.photo=p.dataUrl;i.photoUrl=p.version;}i.photoWant=null;});persistItems();ssSet('ss_snap',SY.shape());}finally{SY.merging=false;}}};
SY.mItems=(list,batches)=>{const by={};items.forEach(i=>{if(i.sid)by[i.sid]=i;});let nid=Math.max(0,...items.map(i=>+i.id||0))+1;const seen=new Set(),live=list.filter(x=>String(x.Active).toUpperCase()==='TRUE');
 live.forEach(x=>{seen.add(x.ItemID);let i=by[x.ItemID];if(!i){i={id:nid++,sid:x.ItemID,photo:null,supplier:null};items.push(i);by[x.ItemID]=i;}
  Object.assign(i,{name:String(x.Name??''),category:String(x.Category||'General'),unit:x.Unit||'piece',price:+x.SellingPrice,service:String(x.Kind).toLowerCase()==='service',stock:(x.BundleJSON||String(x.Kind).toLowerCase()==='service')?0:+x.CurrentStock,reorder:+x.ReorderThreshold||0,expiry:x.ExpiryDate||null,branch:x.Branch||null,trackBatches:String(x.TrackBatches).toUpperCase()==='TRUE'});
  if(/^ph:/.test(x.PhotoURL||'')&&x.PhotoURL!==i.photoUrl)i.photoWant=x.PhotoURL;
  i.barcode=String(x.Barcode||i.barcode||'')||'600900'+String(1000000+i.id);if(x.CostPrice!==undefined)i.cost=+x.CostPrice;else if(i.cost===undefined)i.cost=null;});
 live.forEach(x=>{const i=by[x.ItemID];if(x.BundleJSON)i.bundle=JSON.parse(x.BundleJSON).map(c=>({itemId:by[c.itemId]?by[c.itemId].id:0,qty:c.qty}));else delete i.bundle;});
 const bb={};(batches||[]).forEach(b=>{const L=bb[b.ItemID]=bb[b.ItemID]||[];let e=L.find(z=>z.code===b.Code);if(!e){e={code:b.Code,qty:0,dateAdded:b.DateAdded,expiry:b.Expiry||null};L.push(e);}e.qty+=+b.Qty;});
 live.forEach(x=>{const i=by[x.ItemID];if(i.trackBatches&&!i.bundle){const L=(bb[x.ItemID]||[]).map(e=>({...e}));let used=Math.max(0,L.reduce((q,e)=>q+e.qty,0)-i.stock);   // sales use the oldest lots first; corrections already reduced their own lot
  L.forEach(e=>{const take=Math.min(Math.max(e.qty,0),used);used-=take;e.qty-=take;});i.batches=L.filter(e=>e.qty>0);}else i.batches=i.trackBatches?[]:null;});
 items=items.filter(i=>!i.sid||seen.has(i.sid));};
SY.mLedger=rows=>{const all=ssGet('ss_ledger',[]),have=new Set(all.map(r=>r.EntryID));rows.forEach(r=>{if(!have.has(r.EntryID))all.push(r);});ssSet('ss_ledger',all);const by={};all.forEach(r=>{(by[r.CustomerID]=by[r.CustomerID]||[]).push(r);});
 debtors.forEach(d=>{const L=by[d.sid];if(!L)return;d.history=L.filter(r=>r.Type!=='VOID').sort((a,b)=>a.Timestamp<b.Timestamp?-1:1).map(r=>({date:String(r.Timestamp).slice(0,10),type:r.Type==='SALE'?'sale':'payment',amount:+r.Amount,saleId:r.LinkedSaleID||undefined}));});};
SY.mSettings=s=>{const raw=s&&s.AppSettingsJSON;if(!raw||raw===SY.blob())return;let o;try{o=JSON.parse(raw);}catch(e){return;}
 const keep=settings.logo;Object.assign(settings,o.s);if(!o.s.logo)settings.logo=keep||window.SS_LOGO;if(Array.isArray(o.branches)&&o.branches.length)branches=o.branches;
 if(!('receiptTpl' in o.s))delete settings.receiptTpl;   // switching back to the standard receipt must reach every phone
 if(o.s.logoVer&&o.s.logoVer!==settings.logoHave)settings.logoWant=o.s.logoVer;
 persistSettings();persistBranches();applyBrandColors();updateBrandMark();};
SY.mDebtors=list=>{const by={};debtors.forEach(d=>{if(d.sid)by[d.sid]=d;});let n=Math.max(0,...debtors.map(d=>syNum(d.id)));
 list.forEach(x=>{let d=by[x.CustomerID];if(!d){d={id:'CU-'+String(++n).padStart(3,'0'),sid:x.CustomerID,history:[]};debtors.push(d);}d.name=x.Name;d.phone=x.Phone||'';d.balance=+x.Balance||0;});};
SY.mSales=p=>{const lines={},cust={},dn={};debtors.forEach(d=>{if(d.sid)cust[d.sid]=d.name;});p.saleItems.forEach(l=>{(lines[l.SaleID]=lines[l.SaleID]||[]).push({name:l.ItemName,qty:+l.Quantity,price:+l.UnitPrice});});
 const day=todayIso();
 p.sales.forEach(x=>{if(sales.some(s=>s.id===x.SaleID))return;const d=new Date(x.Timestamp),iso=localIso(d);
  sales.push({id:x.SaleID,date:iso===day?'Today':d.toLocaleDateString('en-NG',{weekday:'short'}),isoDate:iso,time:d.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'}),staff:`${x.StaffName} (${x.StaffID})`,payment:x.PaymentMethod,
   subtotal:+x.Subtotal-+x.DiscountAmount,vatRate:+(p.settings.VatRate||0),vatAmount:+x.VatAmount,total:+x.TotalAmount,customer:cust[x.CustomerID]||'',refunded:false,
   discount:+x.DiscountAmount>0?{amount:+x.DiscountAmount,reason:x.DiscountReason,authorizedBy:x.DiscountAuthorizedBy}:null,lines:lines[x.SaleID]||[]});});
 p.voids.forEach(v=>{const s=sales.find(x=>x.id===v.SaleID);if(s)s.refunded=true;});};
SY.mExp=list=>{let n=Math.max(0,...expenses.map(e=>syNum(e.id)));
 list.forEach(x=>{if(x.ReversesExpenseID){expenses=expenses.filter(e=>e.sid!==x.ReversesExpenseID);return;}if(expenses.some(e=>e.sid===x.ExpenseID))return;
  expenses.push({id:'EX-'+String(++n).padStart(3,'0'),sid:x.ExpenseID,category:x.Category,amount:+x.Amount,isoDate:x.Date,loggedBy:x.LoggedBy,note:x.Notes});});};
SY.mAudit=rows=>{const all=ssGet('ss_audit',[]).concat(rows.map(r=>({t:r.Timestamp,u:`${r.StaffName} (${r.StaffID})`,r:r.RoleAtTime==='owner'?'admin':(r.RoleAtTime||'—'),a:r.Action+(r.NewValue!==''&&r.OldValue!==''?` (${r.OldValue} to ${r.NewValue})`:r.NewValue!==''?` (${r.NewValue})`:'')+(r.Details?': '+r.Details:'')}))).slice(-600);
 ssSet('ss_audit',all);activityLog=all.slice().sort((a,b)=>a.t<b.t?-1:1).map(x=>({time:new Date(x.t).toLocaleString('en-NG',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'}),user:x.u,role:x.r,action:x.a}));};

/* ---- 3. Categories you can add while registering an item ---- */
const syCats=()=>{const s=new Set(['General']);ssGet('ss_cats',[]).forEach(c=>s.add(c));items.forEach(i=>i.category&&s.add(i.category));return[...s].sort((a,b)=>a.localeCompare(b));};
populateCategoryFilters=function(){const f=document.getElementById('invCategory'),n=document.getElementById('newCategory');if(!f||!n)return;const kf=f.value,kn=n.value,L=syCats();
 CATEGORIES.length=0;L.forEach(c=>CATEGORIES.push(c));f.length=1;L.forEach(c=>f.add(new Option(c,c)));f.value=L.includes(kf)?kf:f.options[0].value;
 n.length=0;L.forEach(c=>n.add(new Option(c,c)));n.add(new Option('+ Add new category...','__new'));n.value=L.includes(kn)?kn:L[0];
 n.onchange=()=>{if(n.value!=='__new')return;const name=(prompt('Name of the new category:')||'').trim();if(name){const have=syCats().find(c=>c.toLowerCase()===name.toLowerCase());if(!have){const l=ssGet('ss_cats',[]);l.push(name);ssSet('ss_cats',l);}populateCategoryFilters();n.value=have||name;}else n.value=syCats()[0];};
 populateBranchSelects();};

/* ---- 4. Discounts are approved by the server, using an admin's ID and password ---- */
submitDiscountAuth=async function(){const id=document.getElementById('discAuthId').value.trim().toUpperCase(),pass=document.getElementById('discAuthPass').value,err=document.getElementById('discAuthErr');
 if(!navigator.onLine){err.textContent='A discount needs an internet connection so the admin can approve it.';return;}
 try{const d=await SS.api('authorizeDiscount',{token:currentUser.token,ownerId:id,ownerPin:pass,amount:pendingDiscountRequest.amount,reason:pendingDiscountRequest.reason});
  appliedDiscount={amount:pendingDiscountRequest.amount,reason:pendingDiscountRequest.reason,authorizedBy:id,requestedBy:`${currentUser.name} (${currentUser.id})`,voucher:d.voucher};
  document.getElementById('discountAuthOverlay').classList.remove('active');finishDiscountApply();}catch(e){err.textContent=e.message;}};

/* ---- start ---- */
const syAfter=SS.afterEnter;SS.afterEnter=async function(){await syAfter();SY.start();};
SY.start=()=>{if(SY.on||!currentUser)return;SY.on=true;populateCategoryFilters();SY.chip();setInterval(SY.sync,30000);addEventListener('online',SY.sync);addEventListener('offline',()=>SY.chip());SY.kick();};
if(currentUser)SY.start();

/* Correcting stock by hand on a batch-tracked item: ask which batch lost the units. */
const syEdit=saveEditItem;
saveEditItem=function(id){const it=items.find(x=>x.id===id),el=document.getElementById('editStock'),ns=el?Number(el.value):NaN,old=it?it.stock:0;let pick='';
 if(it&&it.trackBatches&&it.batches&&it.batches.length>1&&ns<old){const codes=it.batches.map(b=>b.code);pick=(prompt(`Which batch do these ${old-ns} units come from?\nType its code (${codes.join(', ')}), or leave blank to take from the oldest batch first.`)||'').trim();
  if(pick&&!codes.includes(pick)){alert('That batch code was not found, so the oldest batch is used first.');pick='';}if(pick)SY.adj[id]=pick;}
 syEdit(id);
 if(it&&it.trackBatches&&it.batches&&ns<old&&it.stock===ns){let d=old-ns;for(const b of [it.batches.find(x=>x.code===pick),...it.batches]){if(!b||d<=0)continue;const t=Math.min(b.qty,d);b.qty-=t;d-=t;}it.batches=it.batches.filter(b=>b.qty>0);persistItems();}};
