/* ---------- 7. Audit log: click a row for a plain-English explanation ---------- */
AP.nice = s => String(s || '').replace(/CostPrice/g, 'cost price').replace(/SellingPrice/g, 'selling price').replace(/ReorderThreshold/g, 'reorder level')
  .replace(/CurrentStock/g, 'stock count').replace(/ExpiryDate/g, 'expiry date').replace(/TrackBatches/g, 'batch tracking').replace(/PhotoURL/g, 'photo')
  .replace(/BundleJSON/g, 'bundle contents').replace(/\bKind\b/g, 'type').replace(/\bBarcode\b/g, 'barcode').replace(/\bUnit\b/g, 'unit').replace(/\bCategory\b/g, 'category')
  .replace(/\bBranch\b/g, 'branch').replace(/\bName\b/g, 'name');
// [pattern, title, what it means, optional flag text]. First match wins.
AP.rules = [
  [/^Failed login/i, 'Wrong password tried', 'Someone tried to sign in with a wrong staff ID or password.', 'If this keeps happening for the same ID, reset that person\'s password.'],
  [/^Blocked action/i, 'Action blocked', 'Someone tried to do something their account is not allowed to do. The system stopped it.', 'Worth asking the person what they were trying to do.'],
  [/^Login/i, 'Signed in', 'This person signed in to the app.'],
  [/^Registered sale|^Sale registered/i, 'Sale made', 'A sale was recorded and the stock was reduced.'],
  [/^Printed receipt|^Reprinted receipt|^Printed combined|^Printed invoice/i, 'Receipt or invoice printed', 'A receipt or invoice was printed or shown again. Nothing was changed.'],
  [/^Refunded sale|^Sale voided/i, 'Sale cancelled', 'A sale was cancelled and the items went back into stock.', 'Cancelled sales are worth a quick check.'],
  [/^Discount requested/i, 'Discount asked for', 'A staff member asked for a discount on a sale. It waits for an admin to approve.'],
  [/^Discount approved|^Approved discount/i, 'Discount approved', 'An admin approved a discount. The sale total went down by that amount.'],
  [/^Discount rejected|^Rejected discount/i, 'Discount rejected', 'An admin said no to a discount. The sale stays at full price.'],
  [/^Discount authorized/i, 'Discount approved with admin password', 'An admin approved a discount by entering his password.'],
  [/^Oversold/i, 'Sold more than was in stock', 'Two phones sold the last items at about the same time, so the stock count went below zero.', 'Count the shelf and correct the stock.'],
  [/^Negative stock/i, 'Stock went below zero', 'After this change the stock count is less than zero.', 'Count the shelf and correct the stock.'],
  [/^Cash mismatch|^Closed the day/i, 'Day closed', 'The cash was counted and compared with what the sales say it should be.'],
  [/^Restocked/i, 'Stock added', 'New stock was added to a product.'],
  [/^Item edited|^Edited "/i, 'Product changed', 'Something on a product was changed. The old and new values are shown below.'],
  [/^Edit conflict/i, 'Two people edited the same product', 'Two phones changed the same product before they synced. The later change was kept.', 'Check the product to make sure it looks right.'],
  [/^Item created|^Added new product/i, 'New product added', 'A new product was added to the list.'],
  [/^Item removed|^Deleted product/i, 'Product removed', 'A product was taken off the stock list. Past sales still keep its name.'],
  [/^Item restored/i, 'Product brought back', 'A removed product was put back on the stock list.'],
  [/^Item photo changed|^Business logo changed/i, 'Photo changed', 'A product photo or the business logo was changed.'],
  [/^Imported products/i, 'Products imported from a file', 'Several products were added or restocked from a file in one go.'],
  [/^Expense added|^Logged expense/i, 'Expense recorded', 'Money spent by the business was written down.'],
  [/^Expense reversed|^Deleted expense/i, 'Expense removed', 'An expense was cancelled. The original entry is kept with a reversal beside it.'],
  [/^Customer added|^Added customer/i, 'Customer added', 'A new customer was added to the debtors list.'],
  [/^Debtor payment|^Recorded payment/i, 'Customer paid', 'A customer paid part or all of what they owe.'],
  [/^Staff added/i, 'New staff account', 'A new staff or admin account was created.'],
  [/^Staff deleted/i, 'Staff account deleted', 'A staff account was deleted and can no longer sign in.'],
  [/^Staff deactivated|^Deactivated account/i, 'Account switched off', 'This person can no longer sign in until the account is switched back on.'],
  [/^Staff reactivated|^Reactivated account/i, 'Account switched on', 'This person can sign in again.'],
  [/^Staff edited/i, 'Staff account changed', 'A staff member\'s name or role was changed.'],
  [/^Passcode reset|^Reset password/i, 'Password reset', 'A new password was given to this person. The old one no longer works.'],
  [/^Passcode changed/i, 'Password changed', 'This person changed their own password.'],
  [/^Access changed/i, 'Staff access changed', 'The list of things this staff member is allowed to do was changed.'],
  [/^Setting changed|^Added branch|^Removed branch/i, 'Setting changed', 'A business setting was changed.'],
  [/^Payment receipt submitted/i, 'Subscription payment sent', 'A payment receipt was sent for the app subscription.'],
  [/^Exported/i, 'Data exported', 'Information was downloaded as a file.']
];
AP.explain = a => {
  const text = AP.nice(a).replace(/\(([^()]*?) to ([^()]*?)\)/g, '— changed from $1 to $2'), r = AP.rules.find(x => x[0].test(a));
  const m = /^([^(:]*?)(?: \(([^)]*)\))?(?:: (.*))?$/.exec(text) || [];
  return { title: r ? r[1] : 'Activity', what: r ? r[2] : 'This action was recorded by the system.', flag: r && r[3] || '', headline: (m[1] || text).trim(), extra: [m[2], m[3]].filter(Boolean).join(' · ') };
};
AP.when = e => { const d = e.iso ? new Date(e.iso) : null; return d && !isNaN(d) ? d.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : e.time; };
AP.logAt = i => AP.logList[i];
AP.logOpen = i => {
  const e = AP.logAt(i); if (!e) return;
  const x = AP.explain(e.action), who = String(e.user || '').replace(/\s*\((.*)\)$/, ''), id = (/\((.*)\)$/.exec(e.user || '') || [])[1] || '';
  ssOverlay(`<h3 style="margin-top:0">${esc(x.title)}</h3>
    <p style="margin:6px 0">${esc(x.what)}</p>
    ${x.flag ? `<p style="margin:6px 0;padding:8px;border-radius:8px;background:#fff7dc;color:#5c4400;font-size:13px">⚠ ${esc(x.flag)}</p>` : ''}
    <div class="ap-req"><div><small>Who</small><br><b>${esc(who)}</b>${id ? ` <small>(${esc(id)}, ${e.role === 'admin' ? 'admin' : esc(e.role)})</small>` : ''}</div>
    <div style="margin-top:6px"><small>When</small><br><b>${esc(AP.when(e))}</b></div>
    <div style="margin-top:6px"><small>What was recorded</small><br>${esc(x.headline)}${x.extra ? `<br><span style="color:var(--muted,#666)">${esc(x.extra)}</span>` : ''}</div></div>
    <div class="row"><button class="btn ghost" onclick="ssClose()">Close</button></div>`, true);
};
{
  const _ra = renderActivity;
  renderActivity = function () {
    if (role() !== 'admin') return;
    AP.logList = activityLog.slice().reverse();
    document.getElementById('activityBody').innerHTML = AP.logList.map((e, i) =>
      `<tr style="cursor:pointer" onclick="AP.logOpen(${i})"><td class="mono">${esc(e.time)}</td><td>${esc(e.user)}</td><td><span class="rolebadge ${esc(e.role)}">${esc(e.role)}</span></td><td>${esc(e.action)} <small style="color:var(--muted,#666)">›</small></td></tr>`).join('')
      || '<tr><td colspan="4" style="color:var(--muted);">No activity yet.</td></tr>';
  };
  // keep the full date and time on every entry so the detail card can show it
  const _la = logActivity;
  logActivity = function (a) { _la.apply(this, arguments); const last = activityLog[activityLog.length - 1]; if (last && !last.iso) last.iso = new Date().toISOString(); };
  const _ma = SY.mAudit;
  SY.mAudit = function (rows) {
    _ma.apply(SY, arguments);
    const all = ssGet('ss_audit', []).slice().sort((a, b) => a.t < b.t ? -1 : 1);
    activityLog.forEach((e, i) => { if (all[i]) e.iso = all[i].t; });
  };
}
