/* Legal, privacy and help pages. Loads after approvals.js.
   DRAFTS: written to match what this app really does. Have a Nigerian lawyer read them before you rely on them,
   and fill in the CONFIG block below. Nothing here is legal advice. */
const LG = window.LG = {
  CONFIG: {
    provider: 'CyberHayde',               // the company that builds and runs the app
    providerEmail: 'umohambrose970@gmail.com',                    // FILL IN: where privacy, deletion and refund requests go
    providerWhatsApp: '2348127784713',                 // FILL IN: digits only with country code, e.g. 2348012345678
    updated: '30 October 2026',
    replyDays: 14,                        // how many days you promise to reply to a request
    refundDays: 14,                       // days to ask for a refund of a duplicate or wrong payment
    priceNoticeDays: 30,                  // how many days of warning you give before a price increase
    policyVersion: '2026-10-30',          // CHANGE THIS whenever you change a policy. Everyone is asked to agree again
    whatsNew: []                          // plain-English bullets shown as "What changed" when the version changes, e.g. ['Pricing: 30 days notice for increases']
  }
};
LG.biz = () => esc(settings.name || 'the business');
LG.lic = () => { try { return ssGet('ss_lic', {}) || {}; } catch (e) { return {}; } };

/* ---------- pages ---------- */
LG.pages = {
  privacy: () => ({ title: 'Privacy Policy', html: `
    <p><small>Last updated: ${LG.CONFIG.updated}. Governed by the Nigeria Data Protection Act 2023.</small></p>
    <h4>Who is responsible for your data</h4>
    <p><b>${LG.biz()}</b> ${settings.address ? '(' + esc(settings.address) + ')' : ''} is the business that decides what is recorded in this app, so it is the data controller. <b>${esc(LG.CONFIG.provider)}</b> builds and runs the app for the business and handles the data only on the business's behalf.</p>
    <h4>What is recorded</h4>
    <ul><li><b>Staff and admins:</b> name, staff ID, role, what you are allowed to do, and an activity record (sign-ins, sales, stock changes, printing). Your password is never stored as typed. Only a scrambled (salted, hashed) version is kept, and the phone keeps a scrambled check value so the lock screen works offline.</li>
    <li><b>Customers on credit (debtors):</b> name, phone number, notes, what they bought on credit and what they paid.</li>
    <li><b>Business records:</b> products and prices, sales, receipts, expenses, cash counts, product photos and the business logo.</li>
    <li><b>Subscription payments:</b> the receipt image the owner uploads, and the amount, date and reference read from it.</li>
    <li><b>On your phone:</b> a copy of the business records so the app works without internet (see Cookies and storage).</li></ul>
    <h4>Why it is recorded</h4>
    <p>To run the shop: sell, track stock, print receipts, keep debtor balances, close the day, and keep an honest trail of who did what. We do not use it for advertising and we do not sell it.</p>
    <h4>Where it is kept and who else touches it</h4>
    <ul><li>The business records live in a Google Sheet owned by the business, and the app's server runs on Google Apps Script and Google Drive. Google therefore processes the data to host it.</li>
    <li>When the app opens, your browser also requests fonts from Google Fonts and code libraries (Excel/CSV export, barcode scanning, receipt reading) from the jsDelivr network. Those services can see your IP address and device type, as any website would.</li>
    <li>If you tap Share on WhatsApp, the text you share goes to WhatsApp. Nothing is sent unless you tap it.</li>
    <li>Barcode scanning uses the camera inside your phone. Photos from the scanner are not uploaded.</li></ul>
    <h4>How long it is kept</h4>
    <p>For as long as the business uses the app, or until the business asks for it to be deleted. ${esc(LG.CONFIG.provider)} keeps weekly backup copies of the Sheet (the newest 8) and a backup before any data reset. Backups made before a reset are not deleted automatically, so ask us in your deletion request if you want them removed too.</p>
    <h4>How it is protected</h4>
    <p>Every action is checked on the server against the person's role, passwords are hashed, sign-in attempts are limited, and sessions expire. No system is perfectly safe. Keep your phone screen-locked, do not share passwords, and sign out on shared devices. The copy stored in a phone's browser is not separately encrypted by the app.</p>
    <h4>Your rights</h4>
    <p>You can ask to see the data held about you, correct it, have it deleted, object to how it is used, or receive a copy. Use <a href="#" onclick="LG.open('delete');return false">Data deletion request</a> or contact the business. If you are not satisfied you can complain to the Nigeria Data Protection Commission.</p>
    <h4>Children</h4><p>The app is for business use by adults and is not meant for children.</p>
    <h4>Changes and contact</h4><p>If this policy changes, the new date shows above. Questions: ${LG.contactLine()}</p>` }),

  terms: () => ({ title: 'Terms of Service', html: `
    <p><small>Last updated: ${LG.CONFIG.updated}.</small></p>
    <h4>1. The service</h4><p>${esc(LG.CONFIG.provider)} provides this inventory and sales app to ${LG.biz()} (“the business”) on a subscription basis. By signing in you agree to these terms.</p>
    <h4>2. Accounts</h4><p>Each person uses their own staff ID and password and is responsible for what is done with them. The first admin manages the other accounts. Tell the first admin straight away if a password is lost or shared.</p>
    <h4>3. Acceptable use</h4><p>Use the app only for the business's lawful trading. Do not try to get around roles, prices or locks, access data you are not allowed to see, or interfere with the service.</p>
    <h4>4. Subscription and fees</h4><p>The plan price, the length of each period and how to pay are shown under <a href="#" onclick="LG.open('pricing');return false">Pricing and fees</a>. Payment is by bank transfer, then uploading the receipt. Nothing renews or is charged automatically. The price may change as running costs change, with ${LG.CONFIG.priceNoticeDays} days' notice and never during a period you have already paid for.</p>
    <h4>5. Expiry and suspension</h4><p>When a subscription runs out (after any grace days) or is suspended, staff are locked out and the owner can still sign in to pay. Data is not deleted because of non-payment.</p>
    <h4>6. Your data</h4><p>The business owns its business data. ${esc(LG.CONFIG.provider)} uses it only to run the service. See the Privacy Policy.</p>
    <h4>7. Accuracy and limits</h4><p>Reports, stock counts and profit projections are calculated from what staff enter and from estimates, so they are only as correct as that information. Offline work saves on the phone and reaches the server when the phone reconnects. Approvals, staff management and payments need internet. We aim to keep the service running but cannot promise it will never be interrupted.</p>
    <h4>8. Liability</h4><p>To the extent the law allows, ${esc(LG.CONFIG.provider)} is not liable for indirect losses such as lost profit, or for losses caused by wrong entries, lost or unlocked devices, or shared passwords. Nothing here limits rights you have under Nigerian law that cannot be limited.</p>
    <h4>9. Ending the service</h4><p>The business can stop at any time (see <a href="#" onclick="LG.open('unsub');return false">Unsubscribe</a>). We may suspend an account that breaks these terms.</p>
    <h4>10. Law and contact</h4><p>These terms are governed by the laws of the Federal Republic of Nigeria. ${LG.contactLine()}</p>` }),

  refund: () => ({ title: 'Refund Policy', html: `
    <p><small>Last updated: ${LG.CONFIG.updated}.</small></p>
    <h4>Subscription payments</h4>
    <ul><li>If you pay twice by mistake, or pay the wrong amount, ask within ${LG.CONFIG.refundDays} days and the extra amount is refunded in full to the account it came from.</li>
    <li>If the service could not be used because of a fault on our side, ask for time to be added back or for a refund of the affected days.</li>
    <li>A period that has started and worked normally is not refunded, except where the law says otherwise.</li>
    <li>If a payment is rejected after review, the time it gave is taken back and the money is returned.</li></ul>
    <h4>How to ask</h4><p>Use the buttons on the <a href="#" onclick="LG.open('unsub');return false">Unsubscribe</a> page or contact us (${LG.contactLine()}). Include the date, amount and reference. We reply within ${LG.CONFIG.replyDays} days.</p>
    <h4>Refunds to the business's own customers</h4><p>Refunds on shop sales are decided by ${LG.biz()}, not by ${esc(LG.CONFIG.provider)}. An admin records them in the Sales log, which puts the items back in stock.</p>` }),

  cookies: () => ({ title: 'Cookies and storage', html: `
    <p><small>Last updated: ${LG.CONFIG.updated}.</small></p>
    <p>This app does <b>not</b> use cookies. It does not use advertising, tracking or analytics tools.</p>
    <h4>What it stores on your phone instead</h4>
    <ul><li><b>Browser storage:</b> a copy of products, sales, expenses, customers and settings, your sign-in session, and changes waiting to sync. This is what lets the app work offline.</li>
    <li><b>App files cache:</b> the app's own files are saved so it opens quickly and without internet.</li></ul>
    <p>These are essential for the app to work, so there is no consent banner. They are removed when you clear the site data in your browser or uninstall the app. Clearing them while changes are waiting to sync loses those changes.</p>
    <h4>Other websites contacted</h4><p>Google Fonts and the jsDelivr network are contacted to load fonts and code. They may record your IP address as any website does. We do not add anything else.</p>` }),

  pricing: () => { const L = LG.lic(), price = +L.price || 0;
    return { title: 'Pricing and fees', html: `
    <p><small>Shown live from the business's subscription settings.</small></p>
    ${price > 0 ? `<div class="ap-req"><b>${naira(price)}</b> for every ${+L.periodDays || 30} days<br><small>${L.expiry ? 'Currently paid up to ' + esc(AP.fmtDate(L.expiry)) : ''}</small></div>` : '<div class="ap-req">The plan price has not been set yet. Ask us before paying anything.</div>'}
    <h4>What you pay</h4>
    <ul><li>The plan price above, once per period, and nothing else from us.</li>
    <li>No setup fee, no charge per sale, per item, per staff member or per device. Any other charge must be agreed with you in writing first.</li>
    <li>Nothing renews automatically. We never hold your card.</li>
    <li>Your own bank may charge a transfer fee. That is between you and your bank.</li></ul>
    <h4>Price changes</h4><p>Running costs can change, so the plan price may go up in future. If it does: we tell you at least ${LG.CONFIG.priceNoticeDays} days before, inside the app and by message; the new price applies only from your next payment period, never to a period you have already paid for; and you can stop before it starts without any penalty.</p>
    ${L.bank ? `<h4>Where to pay</h4><div class="ap-req">${esc(L.bank)}<br>${esc(L.accountName || '')}<br><b>${esc(L.accountNumber || '')}</b></div>` : ''}
    <p>Refunds: see the <a href="#" onclick="LG.open('refund');return false">Refund Policy</a>.</p>` }; },

  help: () => ({ title: 'Help and user guide', html: `
    <p><small>App guide. Tap a heading.</small></p>
    <details open><summary><b>Signing in and roles</b></summary><p>Sign in with your staff ID and password. <b>Admins</b> see everything, approve discounts, refund sales, manage staff and settings. <b>Staff</b> sell, add stock and keep debtor records, as far as the admin has allowed.</p></details>
    <details><summary><b>Registering a sale</b></summary><p>Search or scan an item to add it. Use + and − or type the quantity (it cannot go above what is in stock). Choose the payment method, then complete the sale. A receipt shows with the date. Below the register you see the sales made today.</p></details>
    <details><summary><b>Discounts</b></summary><p>Admins apply discounts directly. Staff tap <i>Send for admin approval</i>. The sale is saved at full price and marked pending, and the receipt says so. The admin approves or rejects it from the Approvals tab on his own phone, and the sale updates when the staff phone next syncs. Approving needs internet.</p></details>
    <details><summary><b>Receipts and invoices</b></summary><p>In Reports, open the Sales log. Tap <i>Receipt</i> on any row to print it again. Tick several sales (or the top box for all shown), then <i>Generate receipt</i> for one combined receipt or <i>Generate invoice</i> for an invoice with an optional Bill-to name. Filtering by branch or category shows only the matching items and their total.</p></details>
    <details><summary><b>Debtors</b></summary><p>Sell on credit to a saved customer, then record payments as they come. A customer who has paid everything leaves the list automatically, and returns the moment they owe again. They stay available when you choose a customer for a credit sale.</p></details>
    <details><summary><b>Expenses and closing the day</b></summary><p>Log expenses as they happen. Close Day compares the cash you count with the expected cash (cash sales minus expenses). Expenses paid that day are listed on screen and in the printed report.</p></details>
    <details><summary><b>Working offline</b></summary><p>Sales, stock, expenses and debtor entries work without internet and sync when the phone reconnects (the sync indicator shows the state). These need internet: discount approvals, staff and password management, payments, resets and restores.</p></details>
    <details><summary><b>Backups</b></summary><p>A copy of the Sheet is saved every Sunday and before any data reset. Ask ${esc(LG.CONFIG.provider)} to restore one if something goes badly wrong.</p></details>
    <details><summary><b>If something looks old or wrong</b></summary><p>Close the app completely and open it again. If it still looks old, clear the site data (only after the sync indicator shows everything is synced). Printing: use <i>Print</i> on the receipt or report screen.</p></details>
    <details><summary><b>Support</b></summary><p>${LG.contactLine()}</p></details>` }),

  delete: () => ({ title: 'Data deletion request', html: `
    <p>Ask for your personal data, or the business's data, to be deleted. This sends a request to a person. It does not delete anything by itself. We reply within ${LG.CONFIG.replyDays} days, and may ask you to confirm who you are first.</p>
    <div class="form-row"><label>Your name</label><input id="lgName" type="text" value="${esc((currentUser && currentUser.name) || '')}"></div>
    <div class="form-row"><label>Staff ID or phone (so we can find you)</label><input id="lgWho" type="text" value="${esc((currentUser && currentUser.id) || '')}"></div>
    <div class="form-row"><label>What should be deleted?</label><select id="lgWhat">
      <option>My staff account and activity</option><option>A customer's details (debtor record)</option>
      <option>All of this business's data</option><option>Something else (explain below)</option></select></div>
    <div class="form-row"><label>Details</label><textarea id="lgDet" rows="3"></textarea></div>
    <label style="display:flex;gap:6px;font-size:13px"><input id="lgBk" type="checkbox"> Also delete backup copies that contain it</label>
    <p class="helptext">Some records may have to be kept for a time where the law requires it (for example sales and tax records). We will tell you if that applies. The first admin can also wipe the business's inventory data from Settings.</p>
    <div class="row"><button class="btn gold" onclick="LG.sendDelete()">Send request</button></div>` }),

  unsub: () => ({ title: 'Unsubscribe', html: `
    <p>We do not send marketing emails or texts from this app. Renewal reminders appear only inside the app.</p>
    <h4>Stop messages from us</h4><p>If anyone at ${esc(LG.CONFIG.provider)} has contacted you about offers or news and you do not want that, say so here and you will be removed from our contact list.</p>
    <div class="row"><button class="btn ghost" onclick="LG.sendUnsub('messages')">Unsubscribe from messages</button></div>
    <h4>Cancel the subscription</h4><p>There is no auto-renewal, so you can simply not pay again. The app keeps working until the paid-up date${LG.lic().expiry ? ' (' + esc(AP.fmtDate(LG.lic().expiry)) + ')' : ''}. Tell us if you want it closed formally, and ask for your data to be exported or deleted.</p>
    <div class="row"><button class="btn ghost" onclick="LG.sendUnsub('cancel')">Cancel my subscription</button></div>` })
};

/* ---------- plumbing ---------- */
LG.contactLine = () => {
  const c = LG.CONFIG, bits = [];
  if (c.providerEmail) bits.push(`<a href="mailto:${esc(c.providerEmail)}">${esc(c.providerEmail)}</a>`);
  if (c.providerWhatsApp) bits.push(`WhatsApp <a href="https://wa.me/${esc(c.providerWhatsApp)}" target="_blank" rel="noopener">${esc(c.providerWhatsApp)}</a>`);
  if (settings.phone) bits.push(`${LG.biz()} on ${esc(settings.phone)}`);
  return bits.length ? bits.join(' · ') : esc(c.provider);
};
LG.open = key => {
  const p = LG.pages[key]; if (!p) return;
  const x = p();
  ssOverlay(`<div style="max-height:78vh;overflow:auto;text-align:left;font-size:14px;line-height:1.5"><h3 style="margin-top:0">${esc(x.title)}</h3>${x.html}</div><div class="row" style="margin-top:10px"><button class="btn ghost" onclick="ssClose()">Close</button></div>`, true);
};
LG.send = (subject, body) => {
  const c = LG.CONFIG, text = `${subject}\n\n${body}\n\nBusiness: ${settings.name || ''}`;
  logActivity(`${subject} sent`);
  if (c.providerWhatsApp) { window.open(`https://wa.me/${c.providerWhatsApp}?text=${encodeURIComponent(text)}`, '_blank'); return; }
  if (c.providerEmail) { location.href = `mailto:${c.providerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + '\n\nBusiness: ' + (settings.name || ''))}`; return; }
  ssOverlay(`<h3 style="margin-top:0">Copy this and send it</h3><p class="helptext">No contact address is set up in this app yet. Copy the message and send it to ${LG.contactLine()}.</p><textarea id="lgCopy" rows="7" style="width:100%">${esc(text)}</textarea><div class="row"><button class="btn gold" onclick="document.getElementById('lgCopy').select();document.execCommand('copy');AP.toast('Copied.')">Copy</button><button class="btn ghost" onclick="ssClose()">Close</button></div>`, true);
};
LG.sendDelete = () => {
  const g = id => (document.getElementById(id) || {}).value || '';
  if (!g('lgName').trim() || !g('lgWho').trim()) return alert('Enter your name and your staff ID or phone number.');
  LG.send('Data deletion request', `Name: ${g('lgName')}\nID/phone: ${g('lgWho')}\nDelete: ${g('lgWhat')}\nBackups too: ${document.getElementById('lgBk').checked ? 'Yes' : 'No'}\nDetails: ${g('lgDet') || '-'}\nDate: ${AP.fmtDate(todayIso())}`);
};
LG.sendUnsub = kind => LG.send(kind === 'cancel' ? 'Cancel subscription request' : 'Unsubscribe from messages',
  `Name: ${(currentUser && currentUser.name) || ''}\nID: ${(currentUser && currentUser.id) || ''}\nDate: ${AP.fmtDate(todayIso())}`);
LG.links = [['privacy', 'Privacy'], ['terms', 'Terms'], ['refund', 'Refunds'], ['cookies', 'Cookies'], ['pricing', 'Pricing and fees'], ['help', 'Help'], ['delete', 'Delete my data'], ['unsub', 'Unsubscribe']];
LG.linksHtml = () => `<div class="lglinks" style="text-align:center;font-size:12px;margin:10px 0;line-height:2">${LG.links.map(l => `<a href="#" onclick="LG.open('${l[0]}');return false" style="margin:0 7px;white-space:nowrap">${l[1]}</a>`).join('')}</div>`;
(function () {
  const holder = document.createElement('div'); holder.id = 'legalLinks'; holder.innerHTML = LG.linksHtml();
  const foot = document.querySelector('footer.pitch');
  (foot && foot.parentNode ? foot.parentNode : document.body).append(holder);
})();


/* ---------- Agreement pop-up: once per person, again only when the policies change ---------- */
LG.consentKey = 'ss_consent';
LG.accepted = () => { const m = ssGet(LG.consentKey, {}), r = currentUser && m[currentUser.id]; return !!(r && r.v === LG.CONFIG.policyVersion); };
LG.sub = key => {                                  // opens a full policy on top of the agreement box without closing it
  const x = LG.pages[key](), old = document.getElementById('lgSub'); if (old) old.remove();
  const d = document.createElement('div'); d.className = 'ssov'; d.id = 'lgSub';
  d.innerHTML = `<div class="sscard" style="max-height:85vh;overflow:auto;text-align:left;font-size:14px;line-height:1.5"><h3 style="margin-top:0">${esc(x.title)}</h3>${x.html}<div class="row" style="margin-top:10px"><button class="btn ghost" onclick="document.getElementById('lgSub').remove()">Back</button></div></div>`;
  document.body.append(d);
};
LG.showConsent = () => {
  const had = !!ssGet(LG.consentKey, {})[currentUser.id], news = LG.CONFIG.whatsNew || [], c = LG.CONFIG;
  const d = document.createElement('div'); d.className = 'ssov'; d.id = 'lgConsent';
  d.innerHTML = `<div class="sscard" style="max-height:90vh;overflow:auto;text-align:left;font-size:14px;line-height:1.5">
    <h3 style="margin-top:0">${had ? 'Our policies have been updated' : 'Before you continue'}</h3>
    ${had && news.length ? `<div class="ap-req"><b>What changed</b><ul style="margin:6px 0 0 18px">${news.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
    <p>${LG.biz()} uses this app to run the shop. In short:</p>
    <ul style="margin:0 0 8px 18px">
      <li>We record your name, ID, role, sales and what you do in the app. Customers on credit are kept with name and phone number.</li>
      <li>It is stored in the business's Google Sheet and on your phone so the app works offline. No cookies, no ads, and we do not sell your data.</li>
      <li>You can ask to see, correct or delete your data at any time (Delete my data, at the bottom of the app).</li>
      <li>The subscription price can change as running costs change, with ${c.priceNoticeDays} days' notice and never during a period already paid for.</li>
    </ul>
    <p style="font-size:13px">Read in full: ${['privacy:Privacy Policy', 'terms:Terms of Service', 'refund:Refund Policy', 'cookies:Cookies', 'pricing:Pricing and fees'].map(x => { const k = x.split(':'); return `<a href="#" onclick="LG.sub('${k[0]}');return false">${k[1]}</a>`; }).join(' · ')}</p>
    <label style="display:flex;gap:8px;align-items:flex-start;margin:8px 0"><input type="radio" name="lgc" value="agree" onchange="document.getElementById('lgcGo').disabled=false"><span>I have read these and I <b>agree</b></span></label>
    <label style="display:flex;gap:8px;align-items:flex-start;margin:8px 0"><input type="radio" name="lgc" value="disagree" onchange="document.getElementById('lgcGo').disabled=false"><span>I <b>do not agree</b></span></label>
    <div class="errtext" id="lgcMsg"></div>
    <button class="btn gold" id="lgcGo" style="width:100%;margin-top:8px" disabled onclick="LG.decide()">Continue</button></div>`;
  document.body.append(d);
};
LG.decide = () => {
  const pick = document.querySelector('input[name="lgc"]:checked'); if (!pick) return;
  const v = LG.CONFIG.policyVersion;
  ['lgSub', 'lgConsent'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
  if (pick.value === 'agree') {
    const m = ssGet(LG.consentKey, {}); m[currentUser.id] = { v: v, t: new Date().toISOString() }; ssSet(LG.consentKey, m);
    logActivity(`Accepted policies (version ${v})`);
    AP.toast('Thank you. Your agreement has been saved.');
  } else {
    logActivity(`Declined policies (version ${v})`);
    alert('You need to agree to the policies to use the app. You have been signed out. Speak to your admin if you have questions.');
    logout();
  }
};
LG.consentCheck = () => {
  if (!currentUser || currentUser.id === 'BUILDER' || LG.accepted()) return;
  if (document.getElementById('lgConsent') || document.getElementById('ssOv') || document.body.classList.contains('ss-locked')) return;
  LG.showConsent();
};
if (window.AP && AP.rules) AP.rules.unshift(
  [/^Accepted policies/i, 'Agreed to the policies', 'This person read the privacy policy and terms and agreed to them.'],
  [/^Declined policies/i, 'Did not agree to the policies', 'This person chose not to agree and was signed out.', 'They cannot use the app until they agree.']);
{ const _raC = renderAll; renderAll = function () { _raC(); setTimeout(LG.consentCheck, 400); }; }
setTimeout(LG.consentCheck, 2500);
