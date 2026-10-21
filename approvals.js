/* Supershores approvals + sales log tools. Loads after sync.js. It adds:
   1. Discount requests: staff send a discount for approval. The sale is saved at full price as "pending", a receipt
      prints, and the admin approves or rejects from his own account. No admin password is typed on a staff phone.
   2. Reprint a receipt for any sale in the Sales log.
   3. Select mode in the Sales log: tick several sales, print one combined receipt or one invoice. */
const AP = window.AP = { sel: new Set(), selMode: false, pending: [], pd: null, shown: [] };

/* ---------- small helpers ---------- */
AP.toast = msg => {
  const d = document.createElement('div');
  d.textContent = msg;
  d.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:10050;background:#1f2a44;color:#fff;padding:10px 16px;border-radius:10px;font:600 13px sans-serif;max-width:88vw;box-shadow:0 4px 16px rgba(0,0,0,.25)';
  document.body.append(d); setTimeout(() => d.remove(), 5000);
};
AP.nowTime = () => new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
AP.fmtDate = iso => receiptDate({ isoDate: iso });
AP.byId = id => sales.find(s => s.id === id);
AP.disc = s => (s.discount ? +s.discount.amount || 0 : 0);
AP.gross = s => (+s.subtotal || 0) + AP.disc(s);          // line total before any discount
(function css() {
  const st = document.createElement('style');
  st.textContent = '.ap-c{display:none}.ap-on .ap-c{display:table-cell;width:28px}#salesLogBody td{vertical-align:top}#apBar{gap:6px;flex-wrap:wrap;align-items:center}#apChip{position:fixed;left:8px;bottom:104px;z-index:61;font:600 12px sans-serif;padding:6px 12px;border-radius:99px;border:1px solid #c9a227;background:#fff7dc;color:#5c4400;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)}.ap-req{border:1px solid var(--paper-line,#ddd);border-radius:10px;padding:10px;margin:8px 0;text-align:left}.ap-req small{color:var(--muted,#666)}';
  document.head.append(st);
})();

/* ---------- 1. Staff: send a discount for approval ---------- */
{
  const _req = requestDiscount, _clear = clearDiscount, _complete = completeSale, _toggle = toggleDiscountBox;
  requestDiscount = function () {
    if (role() === 'admin') return _req();              // admins still apply their own discounts directly
    const type = document.getElementById('discountType').value;
    const value = Number(document.getElementById('discountValue').value);
    const reason = document.getElementById('discountReason').value.trim();
    if (!value || value <= 0) return alert('Enter a discount value.');
    const raw = cart.reduce((s, c) => s + c.price * c.qty, 0);
    if (!raw) return alert('Add items to the cart first.');
    const amount = type === 'percent' ? Math.round(raw * value / 100) : value;
    if (amount <= 0 || amount > raw) return alert('That discount is bigger than the sale.');
    AP.pd = { amount, reason };
    document.getElementById('discountAppliedNote').textContent = `Discount ${naira(amount)} will wait for admin approval. The sale is saved at full price.`;
    document.getElementById('discountToggleBtn').style.display = 'none';
    document.getElementById('discountBox').classList.remove('open');
    logActivity(`Discount requested by ${currentUser.name} (${currentUser.id}) — ${naira(amount)}${reason ? ` (${reason})` : ''}`);
  };
  clearDiscount = function () { AP.pd = null; _clear(); };
  toggleDiscountBox = function () {
    _toggle();
    const b = document.querySelector('#discountBox button.gold');
    if (b) b.textContent = role() === 'admin' ? 'Apply discount' : 'Send for admin approval';
  };
  completeSale = function () {
    const pd = AP.pd, before = sales.length;
    if (pd) {
      const raw = cart.reduce((s, c) => s + c.price * c.qty, 0);
      if (pd.amount > raw) { alert('The cart changed and the requested discount is now bigger than the sale. Request it again.'); clearDiscount(); return; }
    }
    _complete();
    if (pd && sales.length > before) {
      const s = sales[sales.length - 1];
      s.pendingDiscount = { amount: pd.amount, reason: pd.reason };
      s.discountStatus = 'Pending';
      persistSales();                                   // sync reads these two fields when it queues the sale
      lastSale = s; showReceipt(s);
    }
  };
}

/* ---------- 2. Bring approvals back to the phone that made the sale ---------- */
AP.apply = (s, r) => {
  if (r.status === 'Approved') {
    s.discountStatus = 'Approved';
    s.discount = { amount: r.discount, reason: r.reason, authorizedBy: r.authorizedBy };
    s.subtotal = r.subtotal - r.discount; s.vatAmount = r.vat; s.total = r.total;
    delete s.pendingDiscount; return true;
  }
  if (r.status === 'Rejected') { s.discountStatus = 'Rejected'; return true; }
  return false;
};
AP.save = fn => { SY.merging = true; try { fn(); persistSales(); ssSet('ss_snap', SY.shape()); } finally { SY.merging = false; } };
AP.refresh = async () => {
  if (!currentUser || !navigator.onLine) return;
  const ids = sales.filter(s => s.discountStatus === 'Pending').map(s => s.id).slice(0, 50);
  if (!ids.length) return;
  let d; try { d = await SS.api('discount.status', { token: currentUser.token, saleIds: ids }); } catch (e) { return; }
  let ok = 0, no = 0;
  AP.save(() => ids.forEach(id => { const s = AP.byId(id), r = d.sales[id]; if (s && r && AP.apply(s, r)) { r.status === 'Approved' ? ok++ : no++; } }));
  if (ok) AP.toast(`${ok} discount${ok > 1 ? 's were' : ' was'} approved. Reprint the receipt from the Sales log.`);
  if (no) AP.toast(`${no} discount request${no > 1 ? 's were' : ' was'} rejected. The sale stands at full price.`);
  if (ok || no) renderAll();
};
{ // a sale pulled from another phone while still pending must show as pending here too
  const _ms = SY.mSales;
  SY.mSales = function (p) {
    _ms.call(SY, p);
    (p.sales || []).forEach(x => {
      if (x.DiscountStatus !== 'Pending') return;
      const s = AP.byId(x.SaleID);
      if (s && !s.discountStatus) { s.discountStatus = 'Pending'; s.pendingDiscount = { amount: +x.DiscountRequested || 0, reason: x.DiscountReason || '' }; }
    });
  };
}

/* ---------- 3. Admin: approve from his own account ---------- */
AP.loadPending = async () => {
  if (!currentUser || currentUser.role !== 'admin' || !navigator.onLine) return AP.chip();
  try { AP.pending = await SS.api('discount.pending', { token: currentUser.token }); } catch (e) { return; }
  AP.chip();
};
AP.viewActive = () => { const v = document.getElementById('view-approvals'); return !!(v && v.classList.contains('active')); };
AP.badge = (n, admin) => {
  const t = document.getElementById('tabApprovals'), m = document.getElementById('moreApprovals');
  if (t) t.hidden = !admin; if (m) m.hidden = !admin;
  ['apBadgeTab', 'apBadgeMore', 'apBadgeDot'].forEach(id => { const b = document.getElementById(id); if (b) { b.hidden = !(admin && n > 0); b.textContent = n > 9 ? '9+' : n; } });
};
AP.chip = () => {
  let c = document.getElementById('apChip');
  const n = AP.pending.length, admin = !!(currentUser && currentUser.role === 'admin'), show = admin && n > 0 && !AP.viewActive();
  AP.badge(n, admin); AP.renderView();
  if (!show) { if (c) c.hidden = true; return; }
  if (!c) { c = document.createElement('button'); c.id = 'apChip'; c.onclick = () => switchView('approvals'); document.body.append(c); }
  c.hidden = false; c.textContent = `⏳ ${n} discount${n > 1 ? 's' : ''} waiting for you`;
};
AP.open = () => {
  const list = AP.pending;
  if (!list.length) { ssClose(); return AP.toast('No discounts are waiting.'); }
  ssOverlay(`<h3 style="margin-top:0">Discounts waiting for approval</h3>` + list.map(p => `
    <div class="ap-req"><b>${esc(p.saleId)}</b> <small>${esc(AP.fmtDate(String(p.timestamp).slice(0, 10)))} · ${esc(p.staffName)} (${esc(p.staffId)}) · ${esc(p.payment)}</small>
    <div style="margin:6px 0;font-size:13px">${p.lines.map(l => `${esc(l.name)} × ${l.qty}`).join('<br>')}</div>
    <div>Full price <b>${naira(p.subtotal)}</b><br>Discount asked <b>−${naira(p.requested)}</b>${p.reason ? ` <small>(${esc(p.reason)})</small>` : ''}<br>Customer pays <b>${naira(p.subtotal - p.requested)}</b> if approved</div>
    <div class="row" style="margin-top:8px"><button class="btn sm gold" onclick="AP.decide('${esc(p.saleId)}',true,this)">Approve</button><button class="btn sm ghost" onclick="AP.decide('${esc(p.saleId)}',false,this)">Reject</button></div></div>`).join('') +
    `<div class="row"><button class="btn ghost" onclick="ssClose()">Close</button></div>`, true);
};
AP.decide = async (saleId, approve, btn) => {
  if (!navigator.onLine) return alert('You need an internet connection to approve.');
  const p = AP.pending.find(x => x.saleId === saleId);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const r = await SS.api('discount.decide', { token: currentUser.token, saleId, approve });
    const s = AP.byId(saleId);
    if (s) AP.save(() => AP.apply(s, { status: r.status, discount: r.discount, subtotal: r.subtotal, vat: r.vat, total: r.total, reason: p ? p.reason : '', authorizedBy: currentUser.id }));
    logActivity(`${approve ? 'Approved' : 'Rejected'} discount on ${saleId}`);
    AP.toast(approve ? `Approved. ${saleId} is now ${naira(r.total)}.` : `Rejected. ${saleId} stays at full price.`);
    AP.pending = AP.pending.filter(x => x.saleId !== saleId); AP.chip(); AP.after(); renderAll();
  } catch (e) {
    alert(e.message); await AP.loadPending(); AP.after();
  }
};
{ const _pull = SY.pull; SY.pull = async function () { const r = await _pull.apply(SY, arguments); AP.refresh(); AP.loadPending(); return r; }; }
setInterval(() => { if (currentUser && !document.hidden) { AP.refresh(); AP.loadPending(); } }, 90000);

/* ---------- 4. Sales log: reprint + select mode ---------- */
AP.reprint = id => {
  const s = AP.byId(id); if (!s) return;
  lastSale = s; showReceipt(s); logActivity(`Reprinted receipt ${id}`);
};
AP.pick = (id, on) => { on ? AP.sel.add(id) : AP.sel.delete(id); AP.bar(); };
AP.toggleMode = () => { AP.selMode = !AP.selMode; if (!AP.selMode) AP.sel.clear(); AP.renderLog(); };
AP.all = () => { AP.shown.filter(s => !s.refunded).forEach(s => AP.sel.add(s.id)); AP.renderLog(); };
AP.none = () => { AP.sel.clear(); AP.renderLog(); };
AP.bar = () => {
  const b = document.getElementById('apBar'); if (!b) return;
  const n = AP.sel.size;
  b.innerHTML = AP.selMode
    ? `<button class="btn sm gold" onclick="AP.toggleMode()">✔ Done selecting</button><button class="btn sm ghost" onclick="AP.all()">Select all shown</button><button class="btn sm ghost" onclick="AP.none()">Clear</button><span class="helptext" style="margin:0">${n} selected</span><button class="btn sm ghost" ${n ? '' : 'disabled'} onclick="AP.combined()">🧾 Combined receipt</button><button class="btn sm ghost" ${n ? '' : 'disabled'} onclick="AP.invoice()">📄 Invoice</button>`
    : `<button class="btn sm ghost" onclick="AP.toggleMode()">☑ Select sales</button><span class="helptext" style="margin:0">Tick several sales to print one combined receipt or an invoice. Use Receipt on any row to reprint it.</span>`;
};
AP.looksLikeCode = v => /^(I-[A-Za-z0-9]+-\d+(-[A-Za-z0-9]+)?|[A-Z]{1,3}-[A-Z0-9]{6,}|\d{6,})$/.test(String(v == null ? '' : v).trim());
AP.itemName = l => {   // the real item or service name for a sale line, even if the line only holds an ID or barcode
  const raw = String(l.name == null ? '' : l.name).trim();
  if (raw && !AP.looksLikeCode(raw)) return raw;
  const hit = (l.itemId != null && items.find(i => i.id === l.itemId)) || items.find(i => i.sid === raw || String(i.barcode) === raw);
  return (hit && hit.name) ? String(hit.name) : (raw || 'Item');
};
AP.itemsText = s => (s.lines || []).map(l => AP.itemName(l) + (l.qty > 1 ? ' ×' + l.qty : '')).join(', ');
AP.renderLog = () => {
  const body = document.getElementById('salesLogBody'); if (!body) return;
  const table = body.closest('table'), wrap = table.closest('.tablewrap');
  table.classList.toggle('ap-on', AP.selMode);
  const hr = table.querySelector('thead tr');
  if (hr) hr.innerHTML = '<th class="ap-c"></th><th>Receipt #</th><th>Time</th><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th><th>Payment</th><th>Staff</th><th></th>';
  if (!document.getElementById('apBar')) { const bar = document.createElement('div'); bar.id = 'apBar'; bar.className = 'searchbar'; wrap.parentNode.insertBefore(bar, wrap); }
  AP.bar();
  const list = filteredSalesLog().list.slice().reverse(); AP.shown = list;
  body.innerHTML = list.map(s => {
    const pend = s.discountStatus === 'Pending', rej = s.discountStatus === 'Rejected';
    const act = (s.refunded ? '<span class="pill low">Refunded</span>' : `<button class="btn sm ghost" onclick="refundSale('${esc(s.id)}')">Refund</button>`)
      + ` <button class="btn sm ghost" onclick="AP.reprint('${esc(s.id)}')">🖨 Receipt</button>`
      + (pend ? ' <span class="pill low">Discount pending</span>' : rej ? ' <span class="pill low">Discount rejected</span>' : '');
    const L = (s.lines && s.lines.length) ? s.lines : [null], rs = L.length > 1 ? ` rowspan="${L.length}"` : '';
    const lineCells = l => l
      ? `<td style="max-width:240px;white-space:normal;line-height:1.35">${esc(AP.itemName(l))}</td><td style="text-align:right">${l.qty}</td><td class="mono" style="text-align:right">${naira(l.price)}</td>`
      : '<td colspan="3" style="color:var(--muted)">—</td>';
    return `<tr><td class="ap-c"${rs}><input type="checkbox" ${AP.sel.has(s.id) ? 'checked' : ''} ${s.refunded ? 'disabled' : ''} onchange="AP.pick('${esc(s.id)}',this.checked)"></td>`
      + `<td class="mono"${rs}>${esc(s.id)}</td><td${rs}>${esc(saleDay(s))} ${esc(s.time)}</td>${lineCells(L[0])}`
      + `<td class="mono"${rs} style="text-align:right">${naira(s.total)}</td><td${rs}>${esc(s.payment)}</td><td${rs}>${esc(s.staff)}</td><td${rs}>${act}</td></tr>`
      + L.slice(1).map(l => `<tr>${lineCells(l)}</tr>`).join('');
  }).join('') || '<tr><td colspan="10" style="color:var(--muted);">No sales match.</td></tr>';
};
{ const _rsl = renderSalesLogFilter; renderSalesLogFilter = function () { _rsl(); AP.renderLog(); }; }   // the branch and category filters redraw the table through here
{ const _rr = renderReports; renderReports = function () { _rr(); AP.renderLog(); }; }

/* ---------- 5. Combined receipt and invoice ---------- */
AP.chosen = () => {
  const list = sales.filter(s => AP.sel.has(s.id) && !s.refunded).sort((a, b) => ((a.isoDate || '') + a.time) < ((b.isoDate || '') + b.time) ? -1 : 1);
  if (!list.length) { alert('Tick at least one sale first.'); return null; }
  return list;
};
AP.dateLabel = list => {
  const ds = [...new Set(list.map(s => s.isoDate).filter(Boolean))].sort();
  return ds.length <= 1 ? AP.fmtDate(ds[0]) : `${AP.fmtDate(ds[0])} to ${AP.fmtDate(ds[ds.length - 1])}`;
};
AP.sum = list => {
  const disc = list.reduce((a, s) => a + AP.disc(s), 0), vat = list.reduce((a, s) => a + (+s.vatAmount || 0), 0), total = list.reduce((a, s) => a + (+s.total || 0), 0);
  return { disc, vat, total, gross: list.reduce((a, s) => a + AP.gross(s), 0), pend: list.filter(s => s.discountStatus === 'Pending').length };
};
AP.combined = () => {
  const list = AP.chosen(); if (!list) return;
  const t = AP.sum(list), pays = [...new Set(list.map(s => s.payment))], custs = [...new Set(list.map(s => s.customer).filter(Boolean))];
  const idLabel = (ids => ids.slice(0, 3).join(', ') + (ids.length > 3 ? ` +${ids.length - 3} more` : ''))(list.map(s => s.id));
  const comb = { id: idLabel, combined: true, date: AP.dateLabel(list), time: AP.nowTime(), staff: `${currentUser.name} (${currentUser.id})`,
    payment: pays.length === 1 ? pays[0] : 'Mixed', subtotal: t.gross - t.disc, vatAmount: t.vat, vatRate: list[0].vatRate || 0, total: t.total, customer: custs.join(', '),
    refunded: false, discount: t.disc ? { amount: t.disc, reason: '' } : null, lines: list.flatMap(s => s.lines) };
  const parts = list.map(s => `
    <div class="rmeta" style="font-weight:700"><span>#${esc(s.id)}</span><span>${esc(AP.fmtDate(s.isoDate))} ${esc(s.time)}</span></div>
    ${s.lines.map(l => `<div class="rline"><span class="nm">${esc(l.name)}</span><span>${naira(l.qty * l.price)}</span></div><div class="rline qp"><span>${l.qty} × ${naira(l.price)}</span><span></span></div>`).join('')}
    <div class="rmeta" style="opacity:.75"><span>Sale total${s.discountStatus === 'Pending' ? ' (discount pending)' : ''}</span><span>${naira(s.total)}</span></div><hr>`).join('');
  document.getElementById('receiptContent').innerHTML = `
    ${settings.logo ? `<div style="text-align:center;margin-bottom:6px;"><img src="${settings.logo}" style="max-height:44px;max-width:120px;object-fit:contain;"></div>` : ''}
    <div class="rlogo">${esc(settings.name)}</div><div class="raddr">${esc(settings.address)}<br>${esc(settings.phone)}</div><hr>
    <div class="rmeta"><span>Date</span><span>${esc(comb.date)}</span></div>
    <div class="rmeta"><span>Printed</span><span>${esc(AP.fmtDate(todayIso()))} ${esc(comb.time)}</span></div>
    ${comb.customer ? `<div class="rmeta"><span>Customer</span><span>${esc(comb.customer)}</span></div>` : ''}<hr>${parts}
    ${t.disc ? `<div class="rmeta" style="color:var(--sage);"><span>Discounts</span><span>−${naira(t.disc)}</span></div>` : ''}
    ${t.vat ? `<div class="rmeta"><span>VAT</span><span>${naira(t.vat)}</span></div>` : ''}
    <div class="rtotal"><span>TOTAL</span><span>${naira(t.total)}</span></div>
    <div class="rmeta" style="margin-top:6px;"><span>Payment</span><span>${esc(comb.payment)}</span></div>
    ${t.pend ? `<div class="rmeta" style="font-size:11px"><span>${t.pend} sale${t.pend > 1 ? 's have' : ' has'} a discount waiting for admin approval, shown at full price.</span><span></span></div>` : ''}
    <div class="rfoot">${esc(settings.footer)}</div>`;
  lastSale = comb; document.getElementById('receiptOverlay').classList.add('active');
  logActivity(`Printed combined receipt for ${list.map(s => s.id).join(', ')}`);
};
AP.invoice = () => {
  const list = AP.chosen(); if (!list) return;
  const custs = [...new Set(list.map(s => s.customer).filter(Boolean))];
  const bill = prompt('Bill to (customer name). Leave empty to skip:', custs.length === 1 ? custs[0] : '');
  if (bill === null) return;
  const t = AP.sum(list), credit = list.filter(s => s.payment === 'Credit').reduce((a, s) => a + (+s.total || 0), 0);
  const no = `INV-${todayIso().replace(/-/g, '')}-${list[0].id}`;
  const rows = list.flatMap(s => s.lines.map(l => `<tr><td>${esc(s.id)}</td><td>${esc(AP.fmtDate(s.isoDate))}</td><td>${esc(l.name)}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">${naira(l.price)}</td><td style="text-align:right">${naira(l.qty * l.price)}</td></tr>`)).join('');
  const tot = (a, b, bold) => `<tr><td colspan="5" style="text-align:right;${bold ? 'font-weight:700' : ''}">${a}</td><td style="text-align:right;${bold ? 'font-weight:700' : ''}">${b}</td></tr>`;
  document.getElementById('reportPrintContent').innerHTML = `
    <div class="rp-head">${settings.logo ? `<img src="${settings.logo}">` : ''}<div style="flex:1"><div class="rp-biz">${esc(settings.name)}</div><div class="rp-meta">${esc(settings.address)} · ${esc(settings.phone)}</div></div>
      <div style="text-align:right"><div class="rp-biz">INVOICE</div><div class="rp-meta">No. ${esc(no)}<br>Date: ${esc(AP.fmtDate(todayIso()))}</div></div></div>
    ${bill.trim() ? `<p class="rp-meta" style="font-size:13px"><b>Bill to:</b> ${esc(bill.trim())}</p>` : ''}
    <p class="rp-meta">Sales dated ${esc(AP.dateLabel(list))}</p>
    <table><thead><tr><th>Receipt</th><th>Date</th><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit price</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}${tot('Subtotal', naira(t.gross))}${t.disc ? tot('Discount', '−' + naira(t.disc)) : ''}${t.vat ? tot('VAT', naira(t.vat)) : ''}${tot('TOTAL', naira(t.total), true)}</tbody></table>
    <p class="rp-meta" style="font-size:12px">${credit ? `Of this, ${naira(credit)} was sold on credit. The rest was paid at the time of sale.` : 'Paid in full at the time of sale.'}${t.pend ? ` ${t.pend} sale${t.pend > 1 ? 's have' : ' has'} a discount waiting for admin approval, shown at full price.` : ''}</p>
    <div class="rp-foot">${esc(settings.footer || '')}<br>Printed ${new Date().toLocaleString('en-NG')} by ${esc(currentUser.name)}</div>`;
  lastPrintPlainText = `INVOICE ${no} — ${settings.name}\nDate: ${AP.fmtDate(todayIso())}\n${bill.trim() ? 'Bill to: ' + bill.trim() + '\n' : ''}\n` +
    list.flatMap(s => s.lines.map(l => `${s.id} ${AP.fmtDate(s.isoDate)} ${l.name} x${l.qty} = ${naira(l.qty * l.price)}`)).join('\n') + `\n\nTOTAL: ${naira(t.total)}`;
  document.getElementById('reportPrintOverlay').classList.add('active');
  logActivity(`Printed invoice ${no} for ${list.map(s => s.id).join(', ')}`);
};

/* ---------- 6. Type the quantity in the cart ---------- */ AP.setQty = (id, v) => {   const line = cart.find(c => c.id === id), item = items.find(i => i.id === id);   if (!line || !item) return;   const n = Math.floor(Number(v)), max = itemAvailable(item);   if (v === '' || isNaN(n)) return renderCart();   if (n <= 0 || max < 1) cart = cart.filter(c => c.id !== id);   else if (n > max) { line.qty = max; AP.toast(`Only ${max} in stock.`); }   else line.qty = n;   renderCart(); };  /* first look after sign-in */
setTimeout(() => { if (currentUser) { AP.refresh(); AP.loadPending(); } }, 4000);

/* ---------- 6. Approvals tab (admin only) ---------- */
AP.after = () => { if (AP.viewActive()) AP.renderView(); else AP.pending.length ? AP.open() : ssClose(); };
AP.renderView = () => {
  const box = document.getElementById('apList'); if (!box || !AP.viewActive()) return;
  box.innerHTML = AP.pending.length ? AP.pending.map(p => {
    const when = `${AP.fmtDate(String(p.timestamp).slice(0, 10))} ${new Date(p.timestamp).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`;
    return `<div class="ap-req"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${esc(p.saleId)}</b><small>${esc(when)} · ${esc(p.staffName)} (${esc(p.staffId)}) · ${esc(p.payment)}</small></div>
      <div style="margin:8px 0;font-size:13px;line-height:1.5">${p.lines.map(l => `${esc(l.name)} × ${l.qty} <span style="color:var(--muted)">@ ${naira(l.price)}</span>`).join('<br>')}</div>
      <div>Full price <b>${naira(p.subtotal)}</b><br>Discount asked <b>−${naira(p.requested)}</b>${p.reason ? ` <small>(${esc(p.reason)})</small>` : ''}<br>Customer pays <b>${naira(p.subtotal - p.requested)}</b> if approved</div>
      <div class="row" style="margin-top:10px"><button class="btn sm gold" onclick="AP.decide('${esc(p.saleId)}',true,this)">Approve</button><button class="btn sm ghost" onclick="AP.decide('${esc(p.saleId)}',false,this)">Reject</button></div></div>`;
  }).join('') : '<p class="helptext">No discounts are waiting. When a staff member asks for one at the till, it will appear here.</p>';
};
AP.refreshView = async () => {
  if (!navigator.onLine) return AP.toast('You are offline. Connect to the internet to see new requests.');
  await AP.loadPending(); AP.toast(AP.pending.length ? `${AP.pending.length} waiting.` : 'Nothing is waiting.');
};
(function () {
  const st = document.createElement('style');
  st.textContent = '.ap-badge{background:#b3261e;color:#fff;border-radius:99px;padding:1px 7px;font:700 11px sans-serif;margin-left:6px;vertical-align:middle}.ap-badge[hidden]{display:none}#bottomNav button{position:relative}#apBadgeDot{position:absolute;top:2px;right:14%;margin:0}';
  document.head.append(st);
  const tab = document.createElement('button'); tab.id = 'tabApprovals'; tab.dataset.view = 'approvals'; tab.hidden = true;
  tab.innerHTML = 'Approvals <span class="ap-badge" id="apBadgeTab" hidden></span>';
  document.getElementById('tabExpenses').insertAdjacentElement('afterend', tab);
  const more = document.createElement('button'); more.className = 'sheetitem'; more.id = 'moreApprovals'; more.hidden = true; more.setAttribute('onclick', "fromMore('approvals')");
  more.innerHTML = '<span class="ic">✅</span> <span>Approvals</span> <span class="ap-badge" id="apBadgeMore" hidden></span>';
  document.getElementById('moreExpenses').insertAdjacentElement('afterend', more);
  const view = document.createElement('div'); view.className = 'view'; view.id = 'view-approvals';
  view.innerHTML = '<h2 class="viewtitle">Discount approvals</h2><p class="viewsub">Discounts staff asked for at the till. Each sale is already saved at full price. Approve to take the discount off, or reject to keep the full price.</p><div class="row" style="margin-bottom:12px"><button class="btn sm ghost" onclick="AP.refreshView()">↻ Refresh</button></div><div id="apList"></div>';
  document.getElementById('view-expenses').insertAdjacentElement('afterend', view);
  const moreBtn = document.querySelector('#bottomNav button[onclick="openMore()"]');
  if (moreBtn) { const dot = document.createElement('span'); dot.id = 'apBadgeDot'; dot.className = 'ap-badge'; dot.hidden = true; moreBtn.append(dot); }
})();
{ const _sv = switchView; switchView = function (name) { _sv(name); if (name === 'approvals') AP.loadPending(); }; }
{ const _ra = renderAll; renderAll = function () { _ra(); AP.renderView(); }; }
{ const _arl = applyRoleLocks; applyRoleLocks = function () { _arl(); AP.badge(AP.pending.length, !!(currentUser && currentUser.role === 'admin')); }; }
