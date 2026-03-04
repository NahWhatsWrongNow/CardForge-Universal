# Game Runtime

Run a local server from repository root:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/game/`.

Features in this scaffold:
- Pointer-event drag from hand to play zone.
- Drag minions to enemy lane to attack.
- Taunt + hero attack restriction.
- Defense mode toggle prevents attacking.
- Dev commands:
  - `./DevAbil` unlocks dev mode,
  - `./ResetProgress` resets local profile/collection/settings.
- Phase 4 layered rivalry system (minion-only) with combat/spell/status modifiers.
- Phase 5 economy loop (win rewards, quests, better store, daily gift, and pack opening/pity).
- Phase 6 AI systems:
  - easy/normal/hard/insane,
  - boss profile,
  - personality AIs with lore + dimension tags,
  - richer decision logic (threat removal + lethal checks).
- Phase 7 systems:
  - modular backdrops, playlists, cosmetics, and theme packs,
  - accessibility toggles,
  - deck builder planning mode (all cards) vs final mode (owned only),
  - compatibility scoring + search,
  - 5 starter decks including a balanced starter 30-card deck.
- Card rarity outlines in hand and pack reveals.
