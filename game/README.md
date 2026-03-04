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
- Dev unlock chat command: `./DevAbil`.
- Phase 4 layered rivalry system (minion-only) with combat/spell/status modifiers.
- Phase 5 economy loop (win rewards, quests, store, and pack opening/pity).
- Phase 6 AI systems (easy/normal/hard + boss profile and decision trace).
- Phase 7 systems:
  - modular backdrops, playlists, and card-back cosmetics,
  - accessibility toggles (high contrast, reduce motion, UI scale settings),
  - deck builder planning mode (all cards) vs final mode (owned collection only),
  - 4 starter 30-card decks and compatibility scoring for cross-card planning.
