# StudyForge 🎓

AI-drevet studieplatform med 6 værktøjer til eksamensforberedelse.

## Opsætning

### Krav
- [Node.js](https://nodejs.org/) version 16+
- Anthropic API-nøgle fra [console.anthropic.com](https://console.anthropic.com)

### Start

**Mac / Linux:**
```bash
ANTHROPIC_API_KEY=din-nøgle-her node server.js
```

**Windows (CMD):**
```cmd
set ANTHROPIC_API_KEY=din-nøgle-her
node server.js
```

**Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY="din-nøgle-her"
node server.js
```

Åbn: **http://localhost:3000**

## Værktøjer

| Værktøj | Beskrivelse |
|---|---|
| ⚡ Quiz | Multiple choice med forklaringer |
| 🃏 Flashcards | Spaced repetition — fejlede kort kommer igen |
| 🧠 Feynman | Forklar begreber, Claude vurderer din forståelse |
| 📋 Resumé | Struktureret oversigt med "skal du huske"-sektion |
| 🕸️ Begrebskort | Visuelt kort over sammenhænge i materialet |
| ⏱️ Eksamenstest | Tidssat quiz uden hjælp — simuler eksamen |

## Brug
1. Upload .pdf, .txt eller .md fil på forsiden (eller indsæt tekst)
2. Vælg et værktøj
3. Materialet huskes mens du skifter mellem værktøjer
