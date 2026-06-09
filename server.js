const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const PORT = process.env.PORT || 3000;

// ── Rate limiting: max requests per IP per day ──
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '20');
const usage = {}; // { ip: { count, date, tokens } }

function getIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function checkLimit(ip) {
  const today = new Date().toDateString();
  if (!usage[ip] || usage[ip].date !== today) {
    usage[ip] = { count: 0, date: today, tokens: 0 };
  }
  return usage[ip].count < DAILY_LIMIT;
}

function recordUsage(ip, tokens) {
  const today = new Date().toDateString();
  if (!usage[ip] || usage[ip].date !== today) usage[ip] = { count: 0, date: today, tokens: 0 };
  usage[ip].count++;
  usage[ip].tokens += tokens || 0;
}

// ── Cost logger ──
let totalTokensIn = 0, totalTokensOut = 0, totalRequests = 0;
function logUsage(inputTokens, outputTokens, ip) {
  totalTokensIn += inputTokens || 0;
  totalTokensOut += outputTokens || 0;
  totalRequests++;
  // claude-sonnet-4-5 pricing: $3/1M input, $15/1M output
  const costUSD = (totalTokensIn / 1e6 * 3) + (totalTokensOut / 1e6 * 15);
  const costDKK = costUSD * 6.9;
  console.log(`[${new Date().toLocaleTimeString()}] IP:${ip} | req #${totalRequests} | in:${inputTokens} out:${outputTokens} | total: ~${costDKK.toFixed(2)} DKK`);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── Serve HTML files ──
  if (req.method === 'GET') {
    const urlPath = req.url.split('?')[0];
    const fileName = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
    const filePath = path.join(__dirname, fileName);
    if (fileName.endsWith('.html') && fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // ── Usage stats (simple admin endpoint) ──
  if (req.method === 'GET' && req.url === '/stats') {
    const costUSD = (totalTokensIn / 1e6 * 3) + (totalTokensOut / 1e6 * 15);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalRequests,
      totalTokensIn,
      totalTokensOut,
      estimatedCostDKK: (costUSD * 6.9).toFixed(2),
      activeIPs: Object.keys(usage).length,
      usageByIP: usage
    }, null, 2));
    return;
  }

  // ── API proxy ──
  if (req.method === 'POST' && req.url === '/api/claude') {
    const ip = getIP(req);

    if (!API_KEY) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY mangler på serveren.' }));
      return;
    }

    if (!checkLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Du har nået dagens grænse på ${DAILY_LIMIT} forespørgsler. Prøv igen i morgen.` }));
      return;
    }

    let chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); }
      catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ugyldig JSON: ' + e.message }));
        return;
      }

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
          let parsed;
          try { parsed = JSON.parse(raw); } catch(e) { parsed = {}; }
          const inputT = parsed.usage?.input_tokens || 0;
          const outputT = parsed.usage?.output_tokens || 0;
          recordUsage(ip, inputT + outputT);
          logUsage(inputT, outputT, ip);
          res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(raw);
        });
      });

      apiReq.on('error', err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Netværksfejl: ' + err.message }));
      });

      apiReq.write(postBuffer);
      apiReq.end();
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║       StudyForge kører! 🎓           ║');
  console.log('  ║  Åbn: http://localhost:' + PORT + '          ║');
  console.log('  ║  Stats: /stats                       ║');
  console.log('  ╚══════════════════════════════════════╝\n');
  console.log(`  Daglig grænse: ${DAILY_LIMIT} requests per bruger`);
  if (!API_KEY) console.log('\n  ⚠️  ANTHROPIC_API_KEY mangler!\n');
});
