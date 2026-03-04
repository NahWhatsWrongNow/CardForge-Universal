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
