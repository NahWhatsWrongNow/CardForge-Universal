# CardForge Game Runtime

## Quick start

### Option A (Windows launcher)
Double click `run_game.bat` from the repo root.

### Option B (manual)
From the repository root:

```bash
python -m http.server 8080
```

Then open:
- `http://localhost:8080/game/` for the game.
- `http://localhost:8080/creator/` for the creator.

## Highlights
- Animated runtime background and rarity-based card outlines.
- Dynamic health bars for heroes and all minions.
- Separate Shop panel and Deck Builder panel.
- Deck builder planning mode (all cards) + final mode (owned cards only).
- AI roster includes easy/normal/hard/insane + personality and boss profiles.
- Dev commands:
  - `./DevAbil`
  - `./ResetProgress`
