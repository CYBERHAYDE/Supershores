/* Part 2: stock, money, reports, team. Shares the globals from index.html. */
const V={};
const TABS=()=>[['sell','Sell'],['sales','Sales'],['stock','Stock'],['money','Money']].concat(S.user.role==='owner'?[['reports','Reports'],['team','Team']]:[]);
const isOwner=()=>S.user.role==='owner',today=()=>new Date().toISOString().slice(0,10),br=()=>(S.cfg.Branches||'').split(',')[0].trim();
const sum=(a,f)=>a.reduce((s,x)=>s+(+f(x)||0),0);
function menu(t,o){return new Promise(r=>{const d=document.createElement('dialog');d.innerHTML=`<form method="dialog"><h3 style="margin-top:0">${esc(t)}</h3><div style="display:grid;gap:8px">${o.map((x,i)=>`<button value="${i}" class="${i===o.length-1?'alt':''}">${esc(x)}</button>`).join('')}</div></form>`;document.body.append(d);d.showModal();d.onclose=()=>{const v=d.returnValue;d.remove();r(v===''||+v===o.length-1?-1:+v);};});}
async function op(type,p){await enqueue(type,p);await load();body();sync();}
function searchBox(m,k,view){const i=$('#'+k);i.oninput=()=>{S[k]=i.value;view(m);const n=$('#'+k);n.focus();n.setSelectionRange(n.value.length,n.value.length);};}

/* ---- Stock ---- */
V.stock=m=>{const k=(S.sq||'').toLowerCase(),rows=S.items.filter(i=>!k||i.Name.toLowerCase().includes(k)||String(i.Barcode)===S.sq).slice(0,80),
 lowOf=i=>!i.BundleJSON&&+i.ReorderThreshold>0&&i.CurrentStock<=+i.ReorderThreshold,
 row=i=>`<button class="item" data-i="${i.ItemID}"><span class="grow">${esc(i.Name)}<br><span class="mute">${money(i.SellingPrice)}${isOwner()&&i.CostPrice!==undefined?', cost '+money(i.CostPrice):''}</span></span><b class="${lowOf(i)?'low':''}">${i.BundleJSON?'Bundle':i.CurrentStock}</b></button>`;
 m.innerHTML=`<div class="split"><div class="card"><div class="row"><input id="sq" class="grow" placeholder="Search stock" value="${esc(S.sq||'')}">${isOwner()?'<button id="ni">Add item</button>':''}</div>${rows.map(row).join('')||'<p class="mute">No items yet.</p>'}</div><div class="card"><b>Running low</b>${S.items.filter(lowOf).map(row).join('')||'<p class="mute">Nothing is below its reorder level.</p>'}</div></div>`;
 searchBox(m,'sq',V.stock);m.onclick=e=>{const b=e.target.closest('[data-i],#ni');if(b)b.id==='ni'?newItem():itemMenu(b.dataset.i);};};
async function itemMenu(id){const it=S.items.find(x=>x.ItemID===id),o=it.BundleJSON?(isOwner()?['Edit details','Remove item','Cancel']:['Cancel']):isOwner()?['Add stock','Stock out or correction','Edit details','Remove item','Cancel']:['Add stock','Stock out or correction','Cancel'];
 const a=o[await menu(it.Name,o)];if(!a)return;
 if(a==='Add stock'){const v=await ask('Add stock: '+it.Name,[['qty','Quantity received'],['sup','Supplier (optional)']],'Add');if(v&&+v.qty>0){it.CurrentStock+=+v.qty;await put('items',it);op('stock.in',{itemId:id,qty:+v.qty,supplier:v.sup,branch:br()});}}
 if(a==='Stock out or correction'){const R=[['Damaged','Damage','OUT'],['Returned to supplier','Return','OUT'],['Used in the shop','Internal use','OUT'],['Count correction, reduce','Adjustment','OUT'],['Count correction, increase','Adjustment','IN']],c=await menu('Why is the stock changing?',R.map(r=>r[0]).concat('Cancel'));if(c<0)return;
  const v=await ask(R[c][0]+': '+it.Name,[['qty','Quantity'],['note','Note (optional)']],'Save');if(v&&+v.qty>0){it.CurrentStock+=(R[c][2]==='IN'?1:-1)*+v.qty;await put('items',it);op('stock.out',{itemId:id,qty:+v.qty,reason:R[c][1],direction:R[c][2],note:v.note,branch:br()});}}
 if(a==='Edit details'){const v=await ask('Edit '+it.Name,[['name','Name','text',it.Name],['barcode','Barcode','text',it.Barcode],['price','Selling price','text',it.SellingPrice]].concat(it.BundleJSON?[]:[['cost','Cost price','text',it.CostPrice],['reorder','Reorder level','text',it.ReorderThreshold]]),'Save');if(!v)return;
  const ch={},map={name:'Name',barcode:'Barcode',price:'SellingPrice',cost:'CostPrice',reorder:'ReorderThreshold'};
  for(const k in v)if(String(it[map[k]])!==v[k]){ch[k]=v[k];it[map[k]]=k==='name'||k==='barcode'?v[k]:+v[k];}
  if(Object.keys(ch).length){await put('items',it);op('item.update',{itemId:id,changes:ch,baseUpdatedAt:it.UpdatedAt});}}
 if(a==='Remove item'&&confirm('Remove '+it.Name+' from the shop list? Its history is kept.')){await del('items',id);op('item.setActive',{itemId:id,active:false});}}
async function newItem(){const v=await ask('New item',[['name','Name'],['barcode','Barcode (optional)'],['category','Category','text','General'],['cost','Cost price'],['price','Selling price'],['stock','Opening stock','text','0'],['reorder','Reorder level','text','0']],'Add item');if(!v||!v.name)return;
 if(!(+v.price>0)||!(+v.cost>=0))return toast('Enter a cost and a selling price.',1);
 const n=((await kget('iseq'))||0)+1;await kset('iseq',n);const id='I-'+((await kget('dev'))||'X')+'-'+n,
 p={itemId:id,name:v.name,barcode:v.barcode,category:v.category,cost:+v.cost,price:+v.price,openingStock:+v.stock||0,reorder:+v.reorder||0,branch:br()};
 await put('items',{ItemID:id,Name:p.name,Barcode:p.barcode,Category:p.category,Unit:'piece',CostPrice:p.cost,SellingPrice:p.price,CurrentStock:p.openingStock,ReorderThreshold:p.reorder,BundleJSON:'',Active:'TRUE'});op('item.create',p);}

/* ---- Money: day close, customers who owe, expenses ---- */
V.money=async m=>{const vo=new Set((await kget('voids'))||[]),cash=sum((await all('sales')).filter(s=>String(s.Timestamp).slice(0,10)===today()&&s.PaymentMethod==='Cash'&&!vo.has(s.SaleID)),s=>s.TotalAmount),
 owed=S.debtors.filter(d=>+d.Balance>0).sort((a,b)=>b.Balance-a.Balance),ex=isOwner()?(await all('expenses')).sort((a,b)=>String(b.Date).localeCompare(String(a.Date))).slice(0,30):[];
 m.innerHTML=`<div class="split"><div><div class="card"><b>Close the day</b><p class="mute">Cash sales today: ${money(cash)}</p><button id="cc">Count the cash drawer</button></div>
 <div class="card"><div class="row"><b class="grow">Customers who owe</b><b>${money(sum(owed,d=>d.Balance))}</b></div>${owed.map(d=>`<button class="item" data-d="${d.CustomerID}"><span class="grow">${esc(d.Name)}<br><span class="mute">${esc(d.Phone||'')}</span></span><b>${money(d.Balance)}</b></button>`).join('')||'<p class="mute">Nobody owes anything.</p>'}</div></div>
 ${isOwner()?`<div class="card"><div class="row"><b class="grow">Expenses</b><button id="ae">Add expense</button></div>${ex.map(e=>`<button class="item" data-e="${e.ExpenseID}"><span class="grow">${esc(e.Category)}<br><span class="mute">${esc(e.Date)} ${esc(e.Notes||'')}</span></span><b>${money(e.Amount)}</b></button>`).join('')||'<p class="mute">No expenses recorded.</p>'}</div>`:'<div></div>'}</div>`;
 m.onclick=async e=>{const b=e.target.closest('[data-d],[data-e],#cc,#ae');if(!b)return;
  if(b.id==='cc'){const v=await ask('Count the cash',[['c','Cash in the drawer']],'Close day');if(!v)return;const diff=+v.c-cash;op('cash.close',{date:today(),branch:br(),counted:+v.c});toast(diff===0?'Cash matches.':'Difference of '+money(diff)+'. The owner will see it.',diff!==0);}
  if(b.dataset.d){const d=S.debtors.find(x=>x.CustomerID===b.dataset.d),v=await ask('Payment from '+d.Name,[['a','Amount paid']],'Record');if(v&&+v.a>0&&+v.a<=d.Balance){d.Balance-=+v.a;await put('debtors',d);op('debtor.payment',{customerId:d.CustomerID,amount:+v.a});}else if(v)toast('Enter an amount up to '+money(d.Balance),1);}
  if(b.id==='ae'){const v=await ask('New expense',[['cat','What for'],['amt','Amount'],['note','Note (optional)']],'Save');if(v&&v.cat&&+v.amt>0){const id='E-'+Date.now().toString(36);await put('expenses',{ExpenseID:id,Date:today(),Category:v.cat,Amount:+v.amt,Notes:v.note,ReversesExpenseID:''});op('expense.add',{expenseId:id,date:today(),category:v.cat,amount:+v.amt,notes:v.note});}}
  if(b.dataset.e){const x=await get('expenses',b.dataset.e);if(+x.Amount>0&&!x.ReversesExpenseID&&confirm('Reverse this expense? A reversal entry is added, nothing is deleted.')){const v=await ask('Why?',[['r','Reason']],'Reverse');if(v&&v.r){const rid='E-'+Date.now().toString(36);await put('expenses',{ExpenseID:rid,Date:today(),Category:x.Category,Amount:-x.Amount,Notes:'Reversal: '+v.r,ReversesExpenseID:x.ExpenseID});op('expense.reverse',{expenseId:x.ExpenseID,reversalId:rid,reason:v.r});}}}};};

/* ---- Reports (owner) ---- */
V.reports=async m=>{const n=S.rp||1,from=new Date(Date.now()-(n-1)*864e5).toISOString().slice(0,10),vo=new Set((await kget('voids'))||[]),
 sales=(await all('sales')).filter(s=>String(s.Timestamp).slice(0,10)>=from&&!vo.has(s.SaleID)),ids=new Set(sales.map(s=>s.SaleID)),lines=(await all('saleItems')).filter(l=>ids.has(l.SaleID)),
 exp=sum((await all('expenses')).filter(e=>String(e.Date)>=from),e=>e.Amount),rev=sum(sales,s=>s.Subtotal-s.DiscountAmount),cost=sum(lines,l=>(l.UnitCost||0)*l.Quantity),gp=rev-cost,pay={},top={};
 sales.forEach(s=>pay[s.PaymentMethod]=(pay[s.PaymentMethod]||0)+ +s.TotalAmount);lines.forEach(l=>top[l.ItemName]=(top[l.ItemName]||0)+ +l.Quantity);
 const tops=Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,5),owed=sum(S.debtors,d=>d.Balance),low=S.items.filter(i=>!i.BundleJSON&&+i.ReorderThreshold>0&&i.CurrentStock<=+i.ReorderThreshold).length,
 L=(a,b,c)=>`<div class="row" style="padding:5px 0"><span class="grow">${a}</span><b${c?' class="low"':''}>${b}</b></div>`,
 txt=`${S.cfg.OrgName} report, ${n===1?'today':'last '+n+' days'}\nSales: ${sales.length}\nRevenue: ${money(rev)}\nGross profit: ${money(gp)}\nExpenses: ${money(exp)}\nNet: ${money(gp-exp)}`;
 m.innerHTML=`<div class="split"><div class="card"><div class="seg" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px">${[[1,'Today'],[7,'7 days'],[30,'30 days']].map(p=>`<button data-p="${p[0]}" class="${n===p[0]?'on':''}">${p[1]}</button>`).join('')}</div>${L('Sales made',sales.length)}${L('Revenue',money(rev))}${L('Cost of goods',money(cost))}${L('Gross profit',money(gp))}${L('Expenses',money(exp))}${L('Net profit',money(gp-exp),gp-exp<0)}<button class="alt" id="shr" style="margin-top:8px">Share on WhatsApp</button></div>
 <div class="card"><b>By payment method</b>${Object.entries(pay).map(([k,v])=>L(esc(k),money(v))).join('')||'<p class="mute">No sales in this period.</p>'}<b>Best sellers</b>${tops.map(t=>L(esc(t[0]),t[1]+' sold')).join('')||'<p class="mute">Nothing yet.</p>'}${L('Owed by customers',money(owed))}${L('Items running low',low,low>0)}</div></div>`;
 m.onclick=e=>{const b=e.target.closest('[data-p],#shr');if(!b)return;if(b.id==='shr')open('https://wa.me/?text='+encodeURIComponent(txt));else{S.rp=+b.dataset.p;V.reports(m);}};};

/* ---- Team (owner, needs a connection) ---- */
V.team=async m=>{if(!navigator.onLine){m.innerHTML='<div class="card">Team management needs an internet connection.</div>';return;}
 try{const list=await api('staff.list',{token:S.token});
  m.innerHTML=`<div class="card"><div class="row"><b class="grow">Team</b><button id="as">Add staff</button></div>${list.map(s=>`<button class="item" data-s="${s.id}"><span class="grow">${esc(s.name)}<br><span class="mute">${s.id}, ${s.role}</span></span><span class="tag ${s.active?'ok':'bad'}">${s.active?'Active':'Off'}</span></button>`).join('')}</div>`;
  m.onclick=async e=>{const b=e.target.closest('[data-s],#as');if(!b)return;try{
   if(b.id==='as'){const v=await ask('New staff member',[['n','Name']],'Create');if(!v||!v.n)return;const r=await api('staff.add',{token:S.token,name:v.n,role:'staff'});await menu('ID '+r.id+', passcode '+r.passcode+'. Shown once, hand it over in person.',['Done']);}
   else{const s=list.find(x=>x.id===b.dataset.s),c=await menu(s.name,['Reset passcode',s.active?'Deactivate':'Reactivate','Cancel']);
    if(c===0){const r=await api('staff.resetPasscode',{token:S.token,staffId:s.id});await menu('New passcode for '+s.id+': '+r.passcode+'. Shown once.',['Done']);}
    if(c===1)await api('staff.setActive',{token:S.token,staffId:s.id,active:!s.active});}
   V.team(m);}catch(x){toast(x.message,1);}};}
 catch(x){m.innerHTML='<div class="card">'+esc(x.message)+'</div>';}};
