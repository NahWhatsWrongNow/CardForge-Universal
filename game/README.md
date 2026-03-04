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
- Phase 6 AI systems:
  - modular AI packs loaded from `game/ai_packs/`,
  - default Easy/Normal/Hard profiles,
  - boss AI profile with script-triggered behavior,
  - in-game AI control panel with decision trace.
