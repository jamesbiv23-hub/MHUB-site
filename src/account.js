// MHUB accounts: email/password sign-in with Supabase, and two-way sync between this
// browser's copy (MHUB_LOCAL) and the account. Signed out, MHUB keeps working locally.
(function () {
  const cfg = window.MHUB_CONFIG || {};
  const L = window.MHUB_LOCAL;
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && L);
  const TABLE = 'mhub_docs';
  const LAST = 'mhub-last-sync';
  let sb = null, session = null, pushTimer = null, syncing = false;
  const pending = new Set();
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg) { const t = $('toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3000); }
  // read the signed-in name early so the Hub greets the person on first paint
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k)) { const u = (JSON.parse(localStorage.getItem(k)) || {}).user; if (u && L) L.setName((u.user_metadata || {}).name || ''); } } } catch (e) {}
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

  // ---------- sync ----------
  async function pullRows(since) {
    const rows = []; let from = 0; const page = 1000;
    for (;;) {
      let q = sb.from(TABLE).select('path,data,deleted,ts,updated_at').order('updated_at', { ascending: true }).range(from, from + page - 1);
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q; if (error) throw error;
      rows.push(...data); if (data.length < page) break; from += page;
    }
    return rows;
  }
  async function pushPaths(paths) {
    const uid = session.user.id;
    const rows = paths.map(p => L.doc(p)).filter(Boolean).map(r => ({ user_id: uid, path: r.path, data: r.deleted ? null : r.data, deleted: r.deleted, ts: r.ts || Date.now() }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from(TABLE).upsert(rows.slice(i, i + 200), { onConflict: 'user_id,path' });
      if (error) throw error;
    }
  }
  async function fullSync() {
    if (!session || syncing) return; syncing = true; setStatus('Syncing…');
    try {
      const uid = session.user.id;
      const owner = L.owner();
      if (owner && owner !== uid) L.clear(); // another account's copy: never mix
      const remote = await pullRows(null);
      const seen = new Set(), toPush = [];
      remote.forEach(r => { seen.add(r.path); const lt = L.localTs(r.path); if ((+r.ts || 0) >= lt) L.applyRemote({ path: r.path, data: r.data, deleted: r.deleted, ts: +r.ts || 0 }); else toPush.push(r.path); });
      L.allDocs().forEach(d => { if (!seen.has(d.path)) toPush.push(d.path); });
      if (toPush.length) await pushPaths(toPush);
      L.setOwner(uid); L.commit();
      const last = remote.length ? remote[remote.length - 1].updated_at : new Date().toISOString();
      ls(LAST + ':' + uid, last);
      setStatus('Synced');
      return { pulled: remote.length, pushed: toPush.length };
    } catch (e) { setStatus('Sync paused: ' + (e.message || 'connection problem')); throw e; }
    finally { syncing = false; }
  }
  async function quickPull() {
    if (!session || syncing) return;
    try {
      const uid = session.user.id, since = ls(LAST + ':' + uid);
      const rows = await pullRows(since);
      let changed = false;
      rows.forEach(r => { if ((+r.ts || 0) >= L.localTs(r.path)) { L.applyRemote({ path: r.path, data: r.data, deleted: r.deleted, ts: +r.ts || 0 }); changed = true; } });
      if (rows.length) ls(LAST + ':' + uid, rows[rows.length - 1].updated_at);
      if (changed) L.commit();
      setStatus('Synced');
    } catch (e) { setStatus('Offline. Changes save on this device and sync later.'); }
  }
  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      if (!session || !pending.size) return;
      const paths = [...pending]; pending.clear();
      try { await pushPaths(paths); setStatus('Synced'); }
      catch (e) { paths.forEach(p => pending.add(p)); setStatus('Offline. Changes save on this device and sync later.'); setTimeout(schedulePush, 15000); }
    }, 900);
  }

  // ---------- UI ----------
  function setStatus(t) { const el = $('acct-status'); if (el) el.textContent = t; }
  function injectUI() {
    const style = document.createElement('style');
    style.textContent = `
      .acct-btn { font: inherit; font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 20px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); cursor: pointer; white-space: nowrap; }
      .acct-btn.in { background: transparent; color: var(--text); border-color: var(--border-strong); }
      .acct-overlay { position: fixed; inset: 0; background: rgba(10,12,16,.45); display: grid; place-items: center; z-index: 50; padding: 16px; }
      .acct-modal { width: min(420px, 100%); background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 18px; padding: 22px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
      .acct-modal h2 { font-family: var(--display, inherit); font-size: 21px; margin: 0; letter-spacing: -0.02em; }
      .acct-modal .sw { display: flex; gap: 4px; background: var(--surface-2); border-radius: 10px; padding: 3px; }
      .acct-modal .sw button { flex: 1; font: inherit; font-size: 13px; font-weight: 600; padding: 7px; border: none; border-radius: 8px; background: transparent; color: var(--text-2); cursor: pointer; }
      .acct-modal .sw button[aria-pressed="true"] { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .acct-modal .msg { font-size: 13px; color: var(--text-2); min-height: 18px; }
      .acct-modal .msg.err { color: var(--danger); }
      .acct-modal .linkish { background: none; border: none; color: var(--line); font: inherit; font-size: 13px; padding: 0; cursor: pointer; text-align: left; }
      #acct-status { font-size: 11.5px; color: var(--text-3); }`;
    document.head.appendChild(style);
    const holder = document.querySelector('header.top .row');
    if (!holder) return;
    const wrap = document.createElement('span'); wrap.className = 'row'; wrap.style.gap = '8px';
    wrap.innerHTML = `<span id="acct-status"></span><button class="acct-btn" id="acct-btn" type="button">Sign in</button>`;
    holder.prepend(wrap);
    $('acct-btn').addEventListener('click', () => session ? openAccount() : openAuth('signin'));
    renderBtn();
  }
  function renderBtn() {
    const b = $('acct-btn'); if (!b) return;
    if (session) { const n = (session.user.user_metadata || {}).name || session.user.email; b.textContent = n.split(' ')[0].split('@')[0]; b.classList.add('in'); b.title = 'Account'; }
    else { b.textContent = 'Sign in'; b.classList.remove('in'); b.title = 'Sign in to save MHUB to your account'; setStatus('Saved on this device'); }
  }
  function modal(html) {
    closeModal();
    const o = document.createElement('div'); o.className = 'acct-overlay'; o.id = 'acct-overlay';
    o.innerHTML = `<div class="acct-modal" role="dialog" aria-modal="true">${html}</div>`;
    o.addEventListener('click', e => { if (e.target === o) closeModal(); });
    document.addEventListener('keydown', escClose);
    document.body.appendChild(o);
    const f = o.querySelector('input'); if (f) f.focus();
    return o;
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() { const o = $('acct-overlay'); if (o) o.remove(); document.removeEventListener('keydown', escClose); }
  function openAuth(mode) {
    const signup = mode === 'signup', reset = mode === 'reset';
    const o = modal(`<h2>${reset ? 'Reset your password' : signup ? 'Create your MHUB account' : 'Sign in to MHUB'}</h2>
      ${reset ? '' : `<div class="sw"><button type="button" data-m="signin" aria-pressed="${!signup}">Sign in</button><button type="button" data-m="signup" aria-pressed="${signup}">Create account</button></div>`}
      <form id="acct-form" class="stack" style="gap:10px">
        ${signup ? '<div><label for="acct-name">First name</label><input id="acct-name" autocomplete="given-name"></div>' : ''}
        <div><label for="acct-email">Email</label><input id="acct-email" type="email" autocomplete="email" required></div>
        ${reset ? '' : `<div><label for="acct-pass">Password</label><input id="acct-pass" type="password" minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}" required></div>`}
        <button class="btn" type="submit" id="acct-go">${reset ? 'Email me a reset link' : signup ? 'Create account' : 'Sign in'}</button>
      </form>
      <div class="msg" id="acct-msg">${signup ? 'Anything you’ve already logged on this device moves into your new account.' : ''}</div>
      ${reset ? '<button class="linkish" data-m="signin">Back to sign in</button>' : signup ? '' : '<button class="linkish" data-m="reset">Forgot your password?</button>'}`);
    o.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => openAuth(b.dataset.m)));
    $('acct-form').addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('acct-msg'), go = $('acct-go'); msg.className = 'msg'; go.disabled = true;
      const email = $('acct-email').value.trim();
      try {
        if (reset) {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#reset' });
          if (error) throw error; msg.textContent = 'Check your email for a reset link.';
        } else if (signup) {
          const { data, error } = await sb.auth.signUp({ email, password: $('acct-pass').value, options: { data: { name: $('acct-name').value.trim() }, emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (!data.session) { msg.textContent = 'Almost done: check your email and click the confirmation link, then sign in.'; go.disabled = false; return; }
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password: $('acct-pass').value });
          if (error) throw error;
        }
      } catch (err) { msg.className = 'msg err'; msg.textContent = friendly(err); }
      go.disabled = false;
    });
  }
  function friendly(err) {
    const m = (err && err.message) || '';
    if (/invalid login/i.test(m)) return 'That email and password don’t match.';
    if (/already registered/i.test(m)) return 'There’s already an account with that email. Sign in instead.';
    if (/password/i.test(m) && /6|8|short|weak/i.test(m)) return 'Use a password with at least 8 characters.';
    if (/rate limit/i.test(m)) return 'Too many tries. Wait a few minutes and try again.';
    if (/not confirmed/i.test(m)) return 'Confirm your email first: check your inbox for the link.';
    return m || 'Something went wrong. Try again.';
  }
  function openAccount() {
    const u = session.user, n = (u.user_metadata || {}).name || '';
    const o = modal(`<h2>${n ? esc(n) + '’s' : 'Your'} MHUB account</h2>
      <div class="hint" style="font-size:13px">${esc(u.email)}</div>
      <div class="msg" id="acct-msg">Your mistakes, scores, flashcards, topics and plan sync to this account on every device you sign in on.</div>
      <div class="row"><button class="btn ghost" id="acct-sync">Sync now</button><button class="btn" id="acct-out">Sign out</button></div>
      <p class="hint" style="font-size:12px">Signing out removes MHUB’s copy from this browser. Everything stays in your account.</p>`);
    $('acct-sync').addEventListener('click', async () => { const m = $('acct-msg'); m.textContent = 'Syncing…'; try { const r = await fullSync(); m.textContent = `Up to date. Pulled ${r.pulled}, sent ${r.pushed}.`; } catch (e) { m.className = 'msg err'; m.textContent = friendly(e); } });
    $('acct-out').addEventListener('click', async () => {
      try { if (pending.size) await pushPaths([...pending]); } catch (e) {}
      await sb.auth.signOut(); L.clear(); closeModal(); location.reload();
    });
  }
  function openNewPassword() {
    modal(`<h2>Choose a new password</h2><form id="np-form" class="stack" style="gap:10px"><div><label for="np-pass">New password</label><input id="np-pass" type="password" minlength="8" autocomplete="new-password" required></div><button class="btn" type="submit">Save password</button></form><div class="msg" id="acct-msg"></div>`);
    $('np-form').addEventListener('submit', async e => { e.preventDefault(); const { error } = await sb.auth.updateUser({ password: $('np-pass').value }); const m = $('acct-msg'); if (error) { m.className = 'msg err'; m.textContent = friendly(error); } else { m.textContent = 'Password saved.'; setTimeout(closeModal, 900); } });
  }

  // Data saved on this device before signing in: ask before it goes into the account.
  function askAboutDeviceData() {
    const owner = L.owner();
    if (owner === session.user.id) return Promise.resolve('keep');
    const local = L.allDocs().filter(d => !d.deleted);
    if (owner || !local.length) { if (owner) L.clear(); return Promise.resolve('none'); }
    const count = p => local.filter(d => d.path.includes('/hub/' + p + '/')).length;
    return new Promise(resolve => {
      const o = modal(`<h2>This browser has MHUB data</h2>
        <div class="msg">${count('mistakes')} mistakes, ${count('scores')} practice tests and ${count('cardsets')} flashcard decks are saved here from before you signed in. Add them to your account?</div>
        <div class="row"><button class="btn" id="dd-add">Add to my account</button><button class="btn ghost" id="dd-skip">Don’t add</button></div>
        <p class="hint" style="font-size:12px">“Don’t add” removes them from this browser and loads only what’s in your account. To keep a copy, cancel by closing this, then use Plan → Download backup first.</p>`);
      const done = v => { document.removeEventListener('keydown', escClose); o.remove(); resolve(v); };
      $('dd-add').addEventListener('click', () => done('add'));
      $('dd-skip').addEventListener('click', () => { L.clear(); done('skip'); });
      o.addEventListener('click', async e => { if (e.target === o) { await sb.auth.signOut(); session = null; renderBtn(); o.remove(); location.reload(); } });
    });
  }

  // ---------- boot ----------
  function start() {
    if (!enabled) return; // no config yet: MHUB stays device-only
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    injectUI();
    L.onWrite(p => { if (session) { pending.add(p); schedulePush(); } });
    sb.auth.onAuthStateChange(async (event, s) => {
      const was = session; session = s;
      if (s) L.setName((s.user.user_metadata || {}).name || '');
      renderBtn();
      if (event === 'PASSWORD_RECOVERY') return openNewPassword();
      if (event === 'SIGNED_IN' && !was) {
        closeModal();
        await askAboutDeviceData();
        try { const r = await fullSync(); if (r && (r.pulled || r.pushed)) { toast('Signed in. Your MHUB is synced.'); setTimeout(() => location.reload(), 500); } else toast('Signed in'); }
        catch (e) { toast('Signed in, but sync failed. Try “Sync now”.'); }
      }
      if (event === 'INITIAL_SESSION' && s) {
        if (L.owner() === s.user.id) quickPull();
        else { await askAboutDeviceData(); try { await fullSync(); location.reload(); } catch (e) {} }
      }
    });
    window.addEventListener('focus', quickPull);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pending.size) schedulePush(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
