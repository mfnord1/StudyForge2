# Deploy til Railway (gratis hosting)

## Trin 1 — GitHub
1. Opret en gratis konto på github.com
2. Lav et nyt repository (kald det "studyforge")
3. Upload de 3 filer: `index.html`, `server.js`, `package.json`
   - Klik "Add file" → "Upload files" på GitHub

## Trin 2 — Railway
1. Gå til railway.app og klik "Start a New Project"
2. Log ind med din GitHub-konto
3. Vælg "Deploy from GitHub repo" → vælg dit studyforge repo
4. Railway deployer automatisk

## Trin 3 — API nøgle
1. I Railway: klik på dit projekt → "Variables"
2. Tilføj: `ANTHROPIC_API_KEY` = din nøgle
3. Klik "Deploy" igen

## Trin 4 — Del URL
1. I Railway: klik "Settings" → "Networking" → "Generate Domain"
2. Du får en URL som: `studyforge-xxx.up.railway.app`
3. Del den URL med dine venner — de behøver ikke installere noget!

## Styr forbrug
- Tjek `/stats` på din URL for at se forbrug og estimeret pris
- Standard: max 20 requests per bruger per dag
- Ændr grænsen i Railway Variables: `DAILY_LIMIT=50`

## Pris
Railway gratis plan: op til 500 timer/måned (nok til hobby-brug)
Anthropic API: ~0.10-0.50 DKK per quiz/flashcard-sæt
