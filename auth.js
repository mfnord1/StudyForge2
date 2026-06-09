// ══ StudyForge Auth & XP System ══
// Include this in every page with <script src="/auth.js"></script>

window.SF = window.SF || {};

// ── Storage ──
SF.getToken = () => localStorage.getItem('sf_token');
SF.getUser  = () => { try { return JSON.parse(localStorage.getItem('sf_user')); } catch(e) { return null; } };
SF.setAuth  = (token, user) => { localStorage.setItem('sf_token', token); localStorage.setItem('sf_user', JSON.stringify(user)); };
SF.logout   = () => { localStorage.removeItem('sf_token'); localStorage.removeItem('sf_user'); location.reload(); };

// ── API helpers ──
SF.authHeaders = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (SF.getToken() || '') });

SF.earnXP = async (action, data = {}) => {
  const token = SF.getToken();
  if (!token) return null;
  try {
    const res = await fetch('/xp', { method: 'POST', headers: SF.authHeaders(), body: JSON.stringify({ action, data }) });
    const result = await res.json();
    if (result.levelUp) SF.showLevelUp(result.level);
    SF.updateHUD(result.xp, result.level);
    // Update cached user
    const user = SF.getUser() || {};
    user.xp = result.xp;
    user.level = result.level;
    localStorage.setItem('sf_user', JSON.stringify(user));
    return result;
  } catch(e) { return null; }
};

// ── Level config (must match server) ──
SF.LEVELS = [
  { level:1, name:'Nybegynder',    emoji:'🌱', xpRequired:0    },
  { level:2, name:'Studerende',    emoji:'📖', xpRequired:100  },
  { level:3, name:'Lærling',       emoji:'✏️', xpRequired:300  },
  { level:4, name:'Elev',          emoji:'🎒', xpRequired:600  },
  { level:5, name:'Videnshunger',  emoji:'🔥', xpRequired:1000 },
  { level:6, name:'Ekspert',       emoji:'⚡', xpRequired:1500 },
  { level:7, name:'Mester',        emoji:'🏆', xpRequired:2200 },
  { level:8, name:'Legende',       emoji:'👑', xpRequired:3000 },
];

SF.getLevel = (xp) => {
  let cur = SF.LEVELS[0];
  for (const l of SF.LEVELS) { if (xp >= l.xpRequired) cur = l; else break; }
  const nextIdx = SF.LEVELS.findIndex(l => l.level === cur.level) + 1;
  const next = SF.LEVELS[nextIdx] || null;
  return { ...cur, xp, nextXP: next ? next.xpRequired : null };
};

// ── HUD ──
SF.injectHUD = () => {
  if (document.getElementById('sf-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'sf-hud';
  hud.innerHTML = `
    <style>
      #sf-hud {
        position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
        background: rgba(10,10,10,0.95); backdrop-filter: blur(12px);
        border-bottom: 1px solid #262626;
        padding: 0 20px; height: 52px;
        display: flex; align-items: center; gap: 16px;
        font-family: 'Syne', sans-serif;
      }
      #sf-hud .hud-logo { font-size: 15px; font-weight: 800; color: #f0ede8; letter-spacing: -.01em; white-space:nowrap; }
      #sf-hud .hud-logo em { font-family: 'Instrument Serif', serif; font-style: italic; color: #e8ff47; }
      #sf-hud .hud-logo a { color:inherit; text-decoration:none; }
      #sf-hud .hud-sep { width: 1px; height: 24px; background: #262626; flex-shrink:0; }
      #sf-hud .hud-user { display:flex; align-items:center; gap:10px; flex:1; min-width:0; }
      #sf-hud .hud-avatar { width:28px; height:28px; border-radius:50%; background:#e8ff47; color:#000; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; flex-shrink:0; }
      #sf-hud .hud-name { font-size:13px; font-weight:600; color:#f0ede8; white-space:nowrap; }
      #sf-hud .hud-level { font-size:11px; color:#5a5a5a; font-family:'DM Mono',monospace; white-space:nowrap; }
      #sf-hud .hud-xpbar-wrap { flex:1; min-width:60px; max-width:180px; }
      #sf-hud .hud-xpbar { height:4px; background:#1c1c1c; border-radius:99px; overflow:hidden; }
      #sf-hud .hud-xpfill { height:100%; background:#e8ff47; border-radius:99px; transition:width .5s ease; }
      #sf-hud .hud-xp-label { font-size:10px; color:#5a5a5a; font-family:'DM Mono',monospace; margin-top:3px; }
      #sf-hud .hud-btns { display:flex; gap:8px; flex-shrink:0; }
      #sf-hud .hud-btn { padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; border:none; font-family:'Syne',sans-serif; }
      #sf-hud .hud-btn-lb { background:#1c1c1c; color:#f0ede8; border:1px solid #262626; }
      #sf-hud .hud-btn-lb:hover { border-color:#e8ff47; }
      #sf-hud .hud-btn-out { background:none; color:#5a5a5a; border:1px solid #262626; }
      #sf-hud .hud-btn-out:hover { color:#f87171; border-color:#f87171; }
      #sf-hud .hud-login-btn { padding:7px 16px; background:#e8ff47; color:#000; border:none; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer; font-family:'Syne',sans-serif; }
      /* push page content down */
      body { padding-top: 52px !important; }

      /* ── Modal ── */
      #sf-modal-bg { display:none; position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:2000; align-items:center; justify-content:center; }
      #sf-modal-bg.open { display:flex; }
      #sf-modal { background:#141414; border:1.5px solid #262626; border-radius:16px; padding:36px; width:100%; max-width:400px; margin:20px; }
      #sf-modal h2 { font-size:22px; font-weight:800; margin-bottom:4px; letter-spacing:-.02em; }
      #sf-modal .modal-sub { font-size:13px; color:#5a5a5a; margin-bottom:28px; }
      #sf-modal .modal-tabs { display:flex; gap:0; margin-bottom:24px; border:1px solid #262626; border-radius:8px; overflow:hidden; }
      #sf-modal .modal-tab { flex:1; padding:10px; font-size:13px; font-weight:600; cursor:pointer; background:none; border:none; color:#5a5a5a; font-family:'Syne',sans-serif; transition:background .15s, color .15s; }
      #sf-modal .modal-tab.active { background:#e8ff47; color:#000; }
      #sf-modal input { width:100%; background:#0a0a0a; border:1.5px solid #262626; border-radius:8px; padding:12px 14px; color:#f0ede8; font-family:'Syne',sans-serif; font-size:14px; outline:none; margin-bottom:12px; transition:border-color .2s; }
      #sf-modal input:focus { border-color:#e8ff47; }
      #sf-modal .modal-btn { width:100%; padding:14px; background:#e8ff47; color:#000; border:none; border-radius:8px; font-family:'Syne',sans-serif; font-size:15px; font-weight:700; cursor:pointer; margin-top:4px; }
      #sf-modal .modal-err { font-size:13px; color:#f87171; margin-top:8px; font-family:'DM Mono',monospace; min-height:20px; }
      #sf-modal .modal-close { float:right; background:none; border:none; color:#5a5a5a; font-size:20px; cursor:pointer; margin-top:-4px; }
      #sf-modal .modal-close:hover { color:#f0ede8; }

      /* ── Level up toast ── */
      #sf-levelup { position:fixed; top:70px; left:50%; transform:translateX(-50%);
        background:#141414; border:1.5px solid #e8ff47; border-radius:14px;
        padding:16px 24px; text-align:center; z-index:3000; display:none;
        animation:slideDown .4s ease; font-family:'Syne',sans-serif; min-width:240px; }
      #sf-levelup.show { display:block; }
      @keyframes slideDown { from{opacity:0;transform:translateX(-50%) translateY(-20px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      #sf-levelup .lu-emoji { font-size:36px; margin-bottom:8px; }
      #sf-levelup .lu-title { font-size:14px; font-weight:700; color:#e8ff47; }
      #sf-levelup .lu-name { font-size:18px; font-weight:800; }

      /* ── Leaderboard modal ── */
      #sf-lb-bg { display:none; position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:2000; align-items:center; justify-content:center; }
      #sf-lb-bg.open { display:flex; }
      #sf-lb { background:#141414; border:1.5px solid #262626; border-radius:16px; padding:32px; width:100%; max-width:480px; margin:20px; max-height:80vh; overflow-y:auto; }
      #sf-lb h2 { font-size:20px; font-weight:800; margin-bottom:20px; }
      .lb-row { display:flex; align-items:center; gap:14px; padding:12px 0; border-bottom:1px solid #1c1c1c; }
      .lb-rank { font-family:'DM Mono',monospace; font-size:13px; color:#5a5a5a; width:24px; flex-shrink:0; }
      .lb-rank.top { color:#e8ff47; font-weight:700; }
      .lb-info { flex:1; }
      .lb-name { font-size:14px; font-weight:600; }
      .lb-level { font-size:11px; color:#5a5a5a; font-family:'DM Mono',monospace; }
      .lb-xp { font-family:'DM Mono',monospace; font-size:13px; color:#e8ff47; }
      .lb-close { width:100%; padding:11px; background:#1c1c1c; border:1px solid #262626; border-radius:8px; color:#f0ede8; font-family:'Syne',sans-serif; font-size:14px; font-weight:600; cursor:pointer; margin-top:16px; }
    </style>

    <div class="hud-logo"><a href="/"><Study<em>Forge</em></a></div>
    <div class="hud-sep"></div>
    <div id="sf-hud-user" style="display:none; flex:1; align-items:center; gap:10px; min-width:0; display:flex;">
      <div class="hud-avatar" id="sf-avatar"></div>
      <div>
        <div class="hud-name" id="sf-hud-name"></div>
        <div class="hud-level" id="sf-hud-level"></div>
      </div>
      <div class="hud-xpbar-wrap">
        <div class="hud-xpbar"><div class="hud-xpfill" id="sf-xpfill"></div></div>
        <div class="hud-xp-label" id="sf-xp-label"></div>
      </div>
    </div>
    <div id="sf-hud-guest" style="flex:1"></div>
    <div class="hud-btns">
      <button class="hud-btn hud-btn-lb" onclick="SF.showLeaderboard()">🏆 Leaderboard</button>
      <a href="/profile.html" style="text-decoration:none"><button class="hud-btn hud-btn-lb">👤 Profil</button></a>
      <span id="sf-hud-auth"></span>
    </div>
  `;
  document.body.prepend(hud);

  // Auth modal
  const modalBg = document.createElement('div');
  modalBg.id = 'sf-modal-bg';
  modalBg.innerHTML = `
    <div id="sf-modal">
      <button class="modal-close" onclick="SF.closeModal()">✕</button>
      <h2>StudyForge</h2>
      <div class="modal-sub">Log ind for at gemme dit fremskridt</div>
      <div class="modal-tabs">
        <button class="modal-tab active" id="tab-login" onclick="SF.switchTab('login')">Log ind</button>
        <button class="modal-tab" id="tab-register" onclick="SF.switchTab('register')">Opret konto</button>
      </div>
      <input type="text" id="sf-username" placeholder="Brugernavn" autocomplete="username">
      <input type="password" id="sf-password" placeholder="Adgangskode" autocomplete="current-password">
      <button class="modal-btn" id="sf-auth-btn" onclick="SF.doAuth()">Log ind</button>
      <div class="modal-err" id="sf-auth-err"></div>
    </div>`;
  document.body.appendChild(modalBg);
  modalBg.addEventListener('click', e => { if (e.target === modalBg) SF.closeModal(); });

  // Level up toast
  const lu = document.createElement('div');
  lu.id = 'sf-levelup';
  lu.innerHTML = `<div class="lu-emoji" id="lu-emoji"></div><div class="lu-title">LEVEL UP!</div><div class="lu-name" id="lu-name"></div>`;
  document.body.appendChild(lu);

  // Leaderboard modal
  const lbBg = document.createElement('div');
  lbBg.id = 'sf-lb-bg';
  lbBg.innerHTML = `<div id="sf-lb"><h2>🏆 Leaderboard</h2><div id="sf-lb-list"></div><button class="lb-close" onclick="SF.closeLeaderboard()">Luk</button></div>`;
  document.body.appendChild(lbBg);
  lbBg.addEventListener('click', e => { if (e.target === lbBg) SF.closeLeaderboard(); });

  SF.refreshHUD();
};

SF._authMode = 'login';
SF.switchTab = (mode) => {
  SF._authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-register').classList.toggle('active', mode === 'register');
  document.getElementById('sf-auth-btn').textContent = mode === 'login' ? 'Log ind' : 'Opret konto';
  document.getElementById('sf-auth-err').textContent = '';
};

SF.openModal = () => { document.getElementById('sf-modal-bg').classList.add('open'); document.getElementById('sf-username').focus(); };
SF.closeModal = () => { document.getElementById('sf-modal-bg').classList.remove('open'); };

SF.doAuth = async () => {
  const username = document.getElementById('sf-username').value.trim();
  const password = document.getElementById('sf-password').value;
  const errEl = document.getElementById('sf-auth-err');
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Udfyld alle felter.'; return; }
  const btn = document.getElementById('sf-auth-btn');
  btn.disabled = true; btn.textContent = '...';
  try {
    const endpoint = SF._authMode === 'login' ? '/auth/login' : '/auth/register';
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Fejl'; btn.disabled = false; btn.textContent = SF._authMode === 'login' ? 'Log ind' : 'Opret konto'; return; }
    SF.setAuth(data.token, { username: data.username, xp: data.xp || 0, level: data.level, stats: data.stats });
    SF.closeModal();
    SF.refreshHUD();
  } catch(e) { errEl.textContent = 'Netværksfejl.'; btn.disabled = false; btn.textContent = SF._authMode === 'login' ? 'Log ind' : 'Opret konto'; }
};

// Enter key in modal
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('sf-modal-bg')?.classList.contains('open')) SF.doAuth();
});

SF.refreshHUD = () => {
  const user = SF.getUser();
  const hudUser = document.getElementById('sf-hud-user');
  const hudGuest = document.getElementById('sf-hud-guest');
  const hudAuth = document.getElementById('sf-hud-auth');
  if (user && SF.getToken()) {
    hudUser.style.display = 'flex';
    hudGuest.style.display = 'none';
    hudAuth.innerHTML = `<button class="hud-btn hud-btn-out" onclick="SF.logout()">Logout</button>`;
    SF.updateHUD(user.xp || 0, user.level || SF.getLevel(0));
  } else {
    hudUser.style.display = 'none';
    hudGuest.style.display = 'flex';
    hudAuth.innerHTML = `<button class="hud-login-btn" onclick="SF.openModal()">Log ind / Opret</button>`;
  }
};

SF.updateHUD = (xp, level) => {
  const user = SF.getUser();
  if (!user) return;
  document.getElementById('sf-avatar').textContent = (user.username || '?')[0].toUpperCase();
  document.getElementById('sf-hud-name').textContent = user.username;
  document.getElementById('sf-hud-level').textContent = `${level.emoji} Niveau ${level.level} · ${level.name}`;
  const prev = SF.LEVELS[level.level - 2];
  const prevXP = prev ? prev.xpRequired : 0;
  const nextXP = level.nextXP || (xp + 1);
  const pct = Math.min(100, Math.round(((xp - prevXP) / (nextXP - prevXP)) * 100));
  document.getElementById('sf-xpfill').style.width = pct + '%';
  document.getElementById('sf-xp-label').textContent = level.nextXP ? `${xp} / ${nextXP} XP` : `${xp} XP — MAX`;
};

SF.showLevelUp = (level) => {
  document.getElementById('lu-emoji').textContent = level.emoji;
  document.getElementById('lu-name').textContent = `Niveau ${level.level}: ${level.name}`;
  const el = document.getElementById('sf-levelup');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
};

SF.showLeaderboard = async () => {
  document.getElementById('sf-lb-bg').classList.add('open');
  document.getElementById('sf-lb-list').innerHTML = '<div style="color:#5a5a5a;font-family:DM Mono,monospace;font-size:13px;padding:20px 0;text-align:center;">Henter...</div>';
  try {
    const res = await fetch('/leaderboard');
    const data = await res.json();
    const medals = ['🥇','🥈','🥉'];
    document.getElementById('sf-lb-list').innerHTML = data.leaderboard.map((u, i) => `
      <div class="lb-row">
        <div class="lb-rank ${i < 3 ? 'top' : ''}">${medals[i] || (i + 1)}</div>
        <div class="lb-info">
          <div class="lb-name">${u.username}</div>
          <div class="lb-level">${u.level.emoji} Niveau ${u.level.level} · ${u.level.name}</div>
        </div>
        <div class="lb-xp">${u.xp} XP</div>
      </div>`).join('') || '<div style="color:#5a5a5a;padding:20px 0;text-align:center;">Ingen brugere endnu</div>';
  } catch(e) {
    document.getElementById('sf-lb-list').innerHTML = '<div style="color:#f87171;padding:20px 0;text-align:center;">Kunne ikke hente leaderboard</div>';
  }
};
SF.closeLeaderboard = () => document.getElementById('sf-lb-bg').classList.remove('open');

// ── Auto-init when DOM ready ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', SF.injectHUD);
} else {
  SF.injectHUD();
}
