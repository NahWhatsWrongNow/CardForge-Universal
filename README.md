# 🎴 CardForge Universal

CardForge Universal is a modular browser card game with:
- **Game Runtime** (`/game`) for matches.
- **Creator Suite** (`/creator`) for authoring cards/abilities/AI.
- **Lobby** (main menu) for deck setup, shop preview, and Carnifex index browsing.

---

## 🚀 Quick Start

### Run locally
```bash
python tools/update_cardex.py
python -m http.server 8080
```
Then open:
- `http://localhost:8080/` → Menu + Lobby
- `http://localhost:8080/game/index.html` → Runtime
- `http://localhost:8080/creator/index.html` → Creator

Windows helper:
- `run_game.bat` regenerates Carnifex and launches server.

---

## 🕹️ Gameplay Highlights

- **8 fixed minion slots** per side on board.
- **Drag or click play** from hand into player slots.
- **Click-to-target combat**: click your minion, then click target.
- **Optional friendly attacks** on units that support it.
- **End Turn** button triggers AI turn.
- **Elemental damage numbers** and trail line visuals.
- **Theme-aware health bars** and animated battlefield.

---

## 🏛️ Lobby

The Menu has a **Lobby** button with tabs:
- **Deck Builder**: pick simulation deck, save custom copy.
- **Shop**: view available pack products.
- **Carnifex**: searchable full card bibliography/index.

---

## 🧪 Creator Suite

Creator includes:
- Card template picker (auto-generates minion/spell templates from all ability templates).
- Expanded card options including:
  - `allowFriendlyAttack`
  - `damageColorMode`
- Ability builder with conditions and advanced JSON override.
- AI personality JSON preview flow.

---

## 📦 Content System

All content is plugin-style JSON packs.

### Card generations
- **GEN1**: baseline card pool.
- **GEN2**: hero-debuff and poison-oriented pool.

Pack manifest:
- `packs/index.json`

Card packs:
- `packs/gen1_cards.json`
- `packs/gen2_cards.json`

Store products can target a generation by `poolTag` (e.g. `GEN1`, `GEN2`).

---

## 🧩 Add More Content

### Add cards
1. Create/update a card pack JSON in `packs/`.
2. Add file to `packs/index.json` entries.
3. Run `python tools/update_cardex.py`.

### Add themes
1. Edit `game/theme_packs/starter_themes.json`.
2. Add fields like `accent`, `hpStart`, `hpEnd` for custom health bars.

### Add abilities
1. Edit `creator/ability_packs/starter_abilities.json`.
2. Creator auto-exposes templates in pickers.

### Add AI
1. Add an AI pack JSON in `game/ai_packs/`.
2. Ensure it is included in `game/ai_packs/index.json`.

---

## 🧠 Dev Commands (Runtime Console)

- `./help`
- `./DevAbil`
- `./ResetProgress`
- `./Lobby`

---

## 🖼️ Backdrops and Images

Board backdrop rendering uses cover scaling (`background-size: cover`) and centered positioning.
This supports arbitrary image sizes while filling the board area.

---

Enjoy building and battling in CardForge.
