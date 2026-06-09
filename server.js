const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const PORT = process.env.PORT || 3000;
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '30');
const DB_FILE = path.join(__dirname, 'users.json');

// ── User DB (persisted to disk) ──
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { return { users: {} }; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ── Rate limiting ──
const usage = {};
function getIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}
function checkLimit(ip) {
  const today = new Date().toDateString();
  if (!usage[ip] || usage[ip].date !== today) usage[ip] = { count: 0, date: today };
  return usage[ip].count < DAILY_LIMIT;
}
function recordUsage(ip) {
  const today = new Date().toDateString();
  if (!usage[ip] || usage[ip].date !== today) usage[ip] = { count: 0, date: today };
  usage[ip].count++;
}

// ── Cost logger ──
let totalIn = 0, totalOut = 0, totalReqs = 0;
function logCost(inT, outT, user) {
  totalIn += inT || 0; totalOut += outT || 0; totalReqs++;
  const cost = ((totalIn / 1e6 * 0.8) + (totalOut / 1e6 * 4)) * 6.9;
  console.log(`[${new Date().toLocaleTimeString()}] ${user} | req #${totalReqs} | ~${cost.toFixed(2)} DKK total`);
}

// ── Simple auth token (username:password hash) ──
function makeToken(username) {
  return Buffer.from(username + ':' + Date.now()).toString('base64');
}
function getUserFromToken(token, db) {
  if (!token) return null;
  return Object.values(db.users).find(u => u.token === token) || null;
}

// ── Body parser ──
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch(e) { reject(e); } });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ── XP & Level system ──
const XP_REWARDS = {
  quiz_correct: 10,
  quiz_complete: 50,
  flashcard_correct: 8,
  flashcard_complete: 40,
  feynman_complete: 60,
  resume_generate: 30,
  mindmap_generate: 30,
  exam_correct: 15,
  exam_complete: 80,
  boss_correct: 20,
  boss_defeated: 150,
  boss_all_cleared: 500
};

const LEVELS = [
  { level:1, name:'Nybegynder',    emoji:'🌱', xpRequired:0    },
  { level:2, name:'Studerende',    emoji:'📖', xpRequired:100  },
  { level:3, name:'Lærling',       emoji:'✏️', xpRequired:300  },
  { level:4, name:'Elev',          emoji:'🎒', xpRequired:600  },
  { level:5, name:'Videnshunger',  emoji:'🔥', xpRequired:1000 },
  { level:6, name:'Ekspert',       emoji:'⚡', xpRequired:1500 },
  { level:7, name:'Mester',        emoji:'🏆', xpRequired:2200 },
  { level:8, name:'Legende',       emoji:'👑', xpRequired:3000 },
];

function getLevel(xp) {
  let current = LEVELS[0];
  for (const l of LEVELS) { if (xp >= l.xpRequired) current = l; else break; }
  const nextIdx = LEVELS.findIndex(l => l.level === current.level) + 1;
  const next = LEVELS[nextIdx] || null;
  return { ...current, xp, nextXP: next ? next.xpRequired : null, nextName: next ? next.name : null };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  // ── Static files (.html, .js, .css) ──
  if (req.method === 'GET') {
    const fileName = url === '/' ? 'index.html' : url.replace(/^\//, '');
    const filePath = path.join(__dirname, fileName);
    const ext = require('path').extname(fileName);
    const mimeMap = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css' };
    if (mimeMap[ext] && fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': mimeMap[ext] + '; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // ══ AUTH ROUTES ══

  // POST /auth/register
  if (req.method === 'POST' && url === '/auth/register') {
    let body; try { body = await readBody(req); } catch(e) { json(res, 400, { error: 'Ugyldig JSON' }); return; }
    const { username, password } = body;
    if (!username || !password || username.length < 2 || password.length < 4) {
      json(res, 400, { error: 'Brugernavn (min 2 tegn) og adgangskode (min 4 tegn) kræves.' }); return;
    }
    const db = loadDB();
    const key = username.toLowerCase();
    if (db.users[key]) { json(res, 409, { error: 'Brugernavnet er allerede taget.' }); return; }
    const token = makeToken(username);
    db.users[key] = {
      username,
      passwordHash: Buffer.from(password).toString('base64'),
      token,
      xp: 0,
      stats: { quizzes: 0, flashcards: 0, bosses: 0, bossesCleared: [], totalCorrect: 0 },
      createdAt: new Date().toISOString()
    };
    saveDB(db);
    console.log(`[register] ${username}`);
    json(res, 200, { token, username, level: getLevel(0) });
    return;
  }

  // POST /auth/login
  if (req.method === 'POST' && url === '/auth/login') {
    let body; try { body = await readBody(req); } catch(e) { json(res, 400, { error: 'Ugyldig JSON' }); return; }
    const { username, password } = body;
    const db = loadDB();
    const key = username?.toLowerCase();
    const user = db.users[key];
    if (!user || user.passwordHash !== Buffer.from(password || '').toString('base64')) {
      json(res, 401, { error: 'Forkert brugernavn eller adgangskode.' }); return;
    }
    // Refresh token on login
    user.token = makeToken(username);
    saveDB(db);
    console.log(`[login] ${username}`);
    json(res, 200, { token: user.token, username: user.username, level: getLevel(user.xp), stats: user.stats, xp: user.xp });
    return;
  }

  // GET /auth/me  (requires token)
  if (req.method === 'GET' && url === '/auth/me') {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    const db = loadDB();
    const user = getUserFromToken(token, db);
    if (!user) { json(res, 401, { error: 'Ikke logget ind.' }); return; }
    json(res, 200, { username: user.username, level: getLevel(user.xp), stats: user.stats, xp: user.xp });
    return;
  }

  // ══ XP ROUTE ══
  // POST /xp  { action: 'quiz_correct' }
  if (req.method === 'POST' && url === '/xp') {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    const db = loadDB();
    const user = getUserFromToken(token, db);
    if (!user) { json(res, 401, { error: 'Ikke logget ind.' }); return; }
    let body; try { body = await readBody(req); } catch(e) { json(res, 400, { error: 'Ugyldig JSON' }); return; }
    const { action, data } = body;
    const reward = XP_REWARDS[action] || 0;
    const oldXP = user.xp;
    user.xp += reward;

    // Update stats
    if (action === 'quiz_complete') user.stats.quizzes = (user.stats.quizzes || 0) + 1;
    if (action === 'flashcard_complete') user.stats.flashcards = (user.stats.flashcards || 0) + 1;
    if (action === 'boss_defeated' && data?.bossId !== undefined) {
      user.stats.bosses = (user.stats.bosses || 0) + 1;
      if (!user.stats.bossesCleared.includes(data.bossId)) user.stats.bossesCleared.push(data.bossId);
    }
    if (action === 'quiz_correct' || action === 'boss_correct' || action === 'exam_correct') {
      user.stats.totalCorrect = (user.stats.totalCorrect || 0) + 1;
    }

    const key = Object.keys(db.users).find(k => db.users[k].token === token);
    db.users[key] = user;
    saveDB(db);

    const newLevel = getLevel(user.xp);
    const oldLevel = getLevel(oldXP);
    const levelUp = newLevel.level > oldLevel.level;
    json(res, 200, { xp: user.xp, reward, level: newLevel, levelUp });
    return;
  }

  // GET /leaderboard
  if (req.method === 'GET' && url === '/leaderboard') {
    const db = loadDB();
    const board = Object.values(db.users)
      .map(u => ({ username: u.username, xp: u.xp, level: getLevel(u.xp), stats: u.stats }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 20);
    json(res, 200, { leaderboard: board });
    return;
  }

  // ══ CLAUDE PROXY ══
  if (req.method === 'POST' && url === '/api/claude') {
    const ip = getIP(req);
    if (!API_KEY) { json(res, 500, { error: 'ANTHROPIC_API_KEY mangler.' }); return; }
    if (!checkLimit(ip)) { json(res, 429, { error: `Daglig grænse på ${DAILY_LIMIT} nået. Prøv igen i morgen.` }); return; }

    let body; try { body = await readBody(req); } catch(e) { json(res, 400, { error: 'Ugyldig JSON' }); return; }
    recordUsage(ip);

    // Get username for logging
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    const db = loadDB();
    const user = getUserFromToken(token, db);
    const uname = user ? user.username : ip;

    const postBuffer = Buffer.from(JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: body.messages
    }), 'utf8');

    const apiReq = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        'Content-Length': postBuffer.length
      }
    }, apiRes => {
      let out = [];
      apiRes.on('data', c => out.push(c));
      apiRes.on('end', () => {
        const raw = Buffer.concat(out).toString('utf8');
        let parsed; try { parsed = JSON.parse(raw); } catch(e) { parsed = {}; }
        logCost(parsed.usage?.input_tokens, parsed.usage?.output_tokens, uname);
        res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(raw);
      });
    });
    apiReq.on('error', err => json(res, 500, { error: 'Netværksfejl: ' + err.message }));
    apiReq.write(postBuffer);
    apiReq.end();
    return;
  }

  // ── Stats ──
  if (req.method === 'GET' && url === '/stats') {
    const db = loadDB();
    const cost = ((totalIn / 1e6 * 0.8) + (totalOut / 1e6 * 4)) * 6.9;
    json(res, 200, { totalReqs, estimatedCostDKK: cost.toFixed(2), users: Object.keys(db.users).length });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║       StudyForge kører! 🎓           ║');
  console.log('  ║  Åbn: http://localhost:' + PORT + '          ║');
  console.log('  ╚══════════════════════════════════════╝\n');
  if (!API_KEY) console.log('  ⚠️  ANTHROPIC_API_KEY mangler!\n');
});
