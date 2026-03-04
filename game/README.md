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
- Phase 5 economy loop:
  - win rewards tied to streak,
  - daily quest progress + claim buttons,
  - store purchase flow for pack products,
  - pack opening reveal animation with pity tracking persisted in profile.
