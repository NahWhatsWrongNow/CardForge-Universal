# Quick Run

- Windows: run `run_game.bat` from repo root.
- Cross-platform: `python -m http.server 8080` then open `http://localhost:8080/game/`.

---

# CardForge Framework Prompt (GPT-5.2 Thinking Extended) — Expanded Creative + QoL Edition

You are **GPT-5.2 Thinking (Extended)** acting as a **lead systems architect + gameplay engineer + UI/UX designer + tools/creator engineer + VFX/audio designer + economy designer**.
You will design and implement **CardForge**, a **Hearthstone-like** digital card game + creator suite in **pure HTML/CSS/JS** (no build tools required), with **first-class mobile + PC support**, and an **everything-is-modular** plugin architecture where **every system can be extended by dropping files into folders** (no core code edits required for new content).

Your output must be **production-ready**, **multi-file**, **highly modular**, **neat + tidy**, **documented**, and **easy to extend**.
Assume the user will keep giving new feature requests; your design must anticipate expansion without refactors.

---

## 0) Core Non-Negotiables

### A. “Drop-in modular” applies to EVERYTHING

Everything below must be extendable by **dropping a file into a specific folder**:

* Card packs (cards, abilities, art, SFX/VFX descriptors)
* Attribute tags, effect types, conditions/actions, rules
* Races/tribes, elements, mortal enemy relations, familiarity
* Heroes, hero powers, spells, minions, weapons, tokens
* AI profiles & difficulty packs
* Loot boxes / pack products, rarity tables, pity timers, animations
* Backdrops, UI themes, music playlists
* Localizations, tooltips, lore blurbs, campaign nodes
* Debug tools, dev mode additions, experiments
* Achievements/quests/events
* Tutorials and onboarding steps

### B. Mobile + PC parity

All interactions must work on:

* Desktop mouse/keyboard
* Touch devices
  Using **Pointer Events**, not HTML5 drag/drop.

Tooltips:

* PC: hover shows tooltip
* Mobile: tooltips appear only in a “Tooltips/Info” panel or tap-to-open

### C. Drag to play is mandatory

Cards must be played by **dragging from hand → dropping onto a valid zone**.
No “tap to auto-spawn” for core gameplay.

### D. Clear targeting & combat visualization

Player must always see:

* What is targetable and why
* Who is attacking whom
* VFX/SFX for: play, summon, attack, hit, death, defense-mode toggle, hero power, spell cast
* State updates instantly (no “disappears until next turn” bug)
* Combat log explains outcomes (crit/deflect/fear/etc.)

### E. Rules enforcement

* You **cannot attack hero if enemy has any minions** unless attacker has a specific bypass effect.
* Taunt: must be attacked first, unless an explicit bypass mechanic allows it.
* Defense Mode (Yu-Gi-Oh stance):

  * Unit can toggle stance
  * Gains defense benefits (configurable)
  * **Cannot attack** while in defense stance
  * Must have visible stance VFX and UI state marker

### F. Minion-only rivalry system

Race/element rivalry modifiers affect **minions only**, not heroes.

Layers:

* Combat
* Spell (minion→minion only)
* Status resistance (minion statuses)
* Crit / deflect chance
* Fear/taunt interactions

Conditional triggers:

* Only if adjacent ally is X
* Only if enemy controls Y element
* Only if familiarity >= N

---

## 0.5) Creative Missing Features You MUST Add (Game Feel, Depth, Stickiness)

### A. Onboarding & Learning (in-game)

* Interactive **Tutorial Scenario** (modular) that teaches:

  * drag to play
  * targeting
  * stance
  * taunt & face rule
  * pack opening + store
* “**Why can’t I do this?**” helper: when a move is invalid, show a short reason + hint
* **Card Preview Zoom** on hold (mobile) / hover (desktop)
* **Rulebook panel** that is generated from loaded registries (no hardcoded docs)

### B. Match Modes (modular)

Add modular modes (each is a file):

* Casual (unranked)
* Ranked-lite (simple MMR locally)
* Sandbox (infinite mana / spawn cards) — dev gated
* Draft/arena-lite (pick from random offerings)
* Puzzle mode (win in 1 turn challenges)
* Boss encounters (AI scripts + special rules)

### C. Persistence & Player Profile (local)

* Player profile stored in localStorage (versioned)
* Stats: wins/losses, favorite tribes, streaks, total packs opened
* Cosmetic unlocks (card backs, board skins) stored as modular content too

### D. Cosmetics (drop-in)

* Card backs (image pack)
* Board frames, mana gem styles
* Alternate sound packs
* “Rarity glow” skins

### E. Accessibility & Comfort

* UI scale slider
* Colorblind outlines
* Motion reduction toggle
* High contrast toggle
* Audio mixer (music/sfx/voice)

### F. Fast “Fun” Loops

* Daily/weekly quests (modular)
* Achievements (modular)
* Seasonal event pack rotation (modular)
* A “collection binder” view with filters, search, sort by rarity/race/element

### G. Replay & Share (optional but recommended)

* Match replays via seed + input log (minimally)
* Export match log as JSON for debugging
* Shareable “deck code” string

---

## 1) Deliverables

You must produce:

1. **Folder architecture** with clear conventions
2. **Content loader framework** that:

   * scans `index.json` manifests per folder
   * hot-loads plugins on startup
   * validates schemas and reports errors in a console/chat
3. **Creator Suite**:

   * Card creator (minions + spells + weapons)
   * Hero creator
   * Ability system editor (guided + advanced)
   * Race/element editor (layered rivalry)
   * Pack product/lootbox editor (rarity weights, pity, animation style)
   * Deck builder
   * Collection manager
   * Debug + dev mode tools
4. **Game Runtime**:

   * professional board UI
   * zones for minions + extras (weapon/secret/field/graveyard/discard)
   * drag to play, drag to attack
   * VFX/SFX hooks system
   * Settings (backdrop chooser + music player + accessibility)
5. **AI System**:

   * at least 3 difficulties (easy/normal/hard) out of the box
   * modular AI packs: drop a file → new AI selectable
   * optional “boss AI scripts”
6. **Economy/Loot system**:

   * currency earned from matches + bonuses + quests + streaks
   * store to buy pack products
   * pack opening animation system (TCG-simulator vibe)
   * rarity tables & pity timers per product
7. **Hidden Dev Mode**:

   * chat/log interface in game
   * typing `./DevAbil` unlocks dev panels (persisted)
8. **Neat codebase**:

   * clean module boundaries
   * consistent naming conventions
   * minimal global state
   * readable, well-documented

---

## 2) Required Architecture (Plugin-First)

### 2.1 Top-level folders

```text
/index.html                 (launcher menu: Creator / Game / Settings)
/styles.css                 (global theme tokens)
/core/
  registry.js
  loader.js
  schema.js
  events.js
  utils.js
  storage.js

/creator/
  index.html
  styles.css
  app.js
  ui/
  plugins/
  behavior_packs/
  ability_packs/
  race_packs/
  effect_packs/
  tag_packs/
  ui_packs/
  loot_packs/
  audio_packs/
  backdrop_packs/

/game/
  index.html
  game.css
  game.js
  ui/
  engine/
    rules.js
    runtime.js
    targeting.js
    combat.js
    resolver.js
    animation_bus.js
    ai.js
    economy.js
    profile.js
  ai_packs/
  vfx_packs/
  sfx_packs/
  backdrop_packs/
  audio_packs/
  store_packs/
  mode_packs/
  quest_packs/
  achievement_packs/

/packs/
  index.json
  <PackFolder>/
    manifest.json
    cards.json
    abilities.json
    heroes.json
    art/ (png/webp)
    audio/ (optional)
    vfx/ (optional)
```

### 2.2 Content discovery rule

Every modular folder must support:

* `index.json` with `{ "files": [...] }` or `{ "packs": [...] }`
* Each file has `{ "type": "...", "version": N }`
* Loader merges all objects into registries with dedupe + conflict policies
* Each pack can declare dependencies

### 2.3 Registries

Implement global registries:

* `Registry.cards`
* `Registry.abilities`
* `Registry.effects`
* `Registry.conditions`
* `Registry.actions`
* `Registry.tags`
* `Registry.races`
* `Registry.elements`
* `Registry.relations`
* `Registry.aiProfiles`
* `Registry.lootProducts`
* `Registry.backdrops`
* `Registry.music`
* `Registry.vfx`
* `Registry.sfx`
* `Registry.uiThemes`
* `Registry.modes`
* `Registry.quests`
* `Registry.achievements`

Every registry supports:

* `register(item)`
* `registerPack(pack)`
* `validate(item)`
* `list()`
* `get(id)`
* conflict strategy per registry: `warn_keep_first`, `warn_override`, `strict_fail`

### 2.4 Validation & error surfacing

* Schema validation with human-friendly errors shown in:

  * Creator “Validation” panel
  * Game “Console/Chat” panel
* Non-fatal errors: log, continue

### 2.5 Hot Reload (nice-to-have but recommended)

* “Reload content” button in Creator + Game (server mode)
* “Watch mode” optional (poll index.json changes)

---

## 3) Creator Suite UX Requirements (Polish & Ease)

### 3.1 Layout & design

* Modern, clean, “AAA UI” vibe
* Mobile first; desktop becomes split panels
* Persistent left nav + right editor
* Search/filter everywhere
* Quick-add templates
* “Context inspector” panel (shows current selection, dependencies)

### 3.2 Ability System — Make it easier (Guided Builder 2.0)

#### Key improvement: Ability is built from “Blocks” with templates

Instead of raw graph-first, default to:

* Choose an **Ability Template**:

  * “Damage Spell”
  * “Summon Swarm”
  * “Aura Buff”
  * “On Hit Status”
  * “Conditional Combo”
* Each template pre-wires nodes, then user edits parameters.

#### Guided UI rule

If user selects **A**, show only A’s parameters:

* sliders
* toggles
* dropdowns
* multi-select tags
* target selector
* preview summary sentence

#### Add “Smart Targeting UI”

* A dedicated “Target” panel:

  * Who (enemy/friendly/any)
  * What (minion/hero/character)
  * Filters (race, element, rarity, cost range, damaged only, defense mode only)
  * Target count (single, random, all, adjacent)
  * Priority rules (lowest HP, highest attack, etc.)

#### Add “Condition Builder UI”

* AND/OR groups with nesting
* “Add condition” search box
* Common presets:

  * “If enemy has minions”
  * “If target is mortal enemy”
  * “If adjacency requirement met”
  * “If element advantage”
  * “If familiarity >= N”

#### Add “Explain Ability” button

Generates human-readable description from nodes:

* “When played, if enemy controls Fire, then summon 2 Imps; else draw 1.”

#### Add “Test Sandbox”

* One click: spawn selected card into a sandbox match
* Run effect preview with fake targets
* Show expected outputs (estimated damage, status odds)

### 3.3 Spell Creator & Hero Creator

* Spell creator includes:

  * cast animation preset
  * target rules
  * rarity + color + element
* Hero creator includes:

  * HP/armor
  * portrait
  * hero power (ability graph)
  * familiarity defaults (optional)

### 3.4 Creator dev unlock

* Advanced toggles hidden by default
* Unlock via `./DevAbil` typed in game chat/log:

  * raw JSON panels
  * “Create new node type” scaffolder (creates a plugin file)
  * schema editor (advanced)
  * debug currency controls

---

## 4) Game Runtime UX Requirements (Make it feel good)

### 4.1 Zones

Must visually contain:

* Hand
* Board (7 slots each side)
* Weapon slot, secret slot, field slot
* Graveyard pile, discard pile
* Deck counters (cards remaining)
* Tooltip panel + rule hints

### 4.2 Drag interactions

* Drag hand card → slot to play
* Drag minion → enemy minion/hero to attack
* Clear highlight + status bar reasons
* Long-press zoom (mobile)

### 4.3 Combat visuals (must exist)

Use a VFX/SFX event bus:

* `Events.emit("ATTACK_START", payload)`
* `Events.emit("HIT", payload)`
* `Events.emit("DAMAGE_NUMBER", payload)`
* `Events.emit("STANCE_TOGGLE", payload)`
* `Events.emit("DEATH", payload)`
* `Events.emit("CAST", payload)`

VFX packs define:

* animation name, duration, easing
* sprite/particles optional
* screen shake intensity
* sound hooks

### 4.4 Fix the “card disappears until next turn” bug

State transitions must be atomic:

1. remove from hand
2. place into slot immediately
3. render immediately
4. resolve play triggers (with animation steps)
5. render after each step or batched with animation queue

### 4.5 “Who is attacking what” clarity

* Attack line (Bezier arc)
* Target glow
* Floating damage numbers
* Combat log line:

  * “X attacks Y (crit) for 6, Y deflects (reduced to 3), reflects 1”

---

## 5) Rules & Systems

### 5.1 Attack rules

* If enemy has any minions, hero cannot be attacked unless ability says otherwise.
* Taunt is enforced unless a minion-only bypass effect triggers.

### 5.2 Defense mode

* Toggle on unit
* Cannot attack
* Gains defense benefits and VFX
* Add “stance cooldown” optional config (prevents spam toggling)

### 5.3 Rivalry system (minion-only layered + conditional)

Relations between race A and B include:

* Combat modifiers (crit/deflect/fear/taunt bypass)
* Spell modifiers (minion→minion only)
* Status resistance modifiers
* Conditions gates (adjacent ally, enemy elements, familiarity thresholds)

### 5.4 Add “Keyword System” (missing but crucial)

Implement standard keywords as modular definitions:

* Taunt, Charge, Stealth, Divine Shield-like, Lifesteal-like, Poisonous-like, etc.
  Each keyword is:
* tag + tooltip + runtime hooks
  Drop-in new keywords by adding files.

### 5.5 Add “Status System” (with stacking rules)

Statuses:

* stackable and duration-based
* each status defined in a status pack:

  * id, tooltip, tick rules, visuals
    Examples:
* toxic, burn, freeze, fear, weaken, shielded

---

## 6) Economy / Loot / Rewards (Expanded, Not Basic)

### 6.1 Currency types (modular)

Support multiple currencies:

* Gold (base earned)
* Gems (rare)
* Dust (crafting)
* Tickets (arena entry)

All defined via economy packs.

### 6.2 Match rewards (deep)

Reward components:

* Participation reward
* Win reward
* Streak bonus
* “Clean play” bonus (no wasted mana)
* “Combo” bonus (multiple effects in one turn)
* “Underdog” bonus (win with lower deck power)
* “Tribe mastery” bonus (play race-focused decks)
* “Daily first win” bonus
* Difficulty multiplier (hard AI gives more)

### 6.3 Quests (modular)

Daily/weekly quests:

* “Play 10 spells”
* “Win with Dragonkin”
* “Apply 20 stacks of toxic”
* “Win without attacking hero”
  Quests reward:
* currency
* packs
* cosmetics
* XP

### 6.4 XP + Leveling (optional but sticky)

* Player XP
* Level rewards:

  * packs
  * cosmetics
  * unlocking “advanced templates”
    All modular via progression packs.

### 6.5 Store + pack products

Each product defines:

* price (currency type)
* rarity weights
* pity timer rules
* guaranteed min rarity
* eligible card pool filters (tags/races/elements)
* opening animation style (vfx preset)
* SFX/music

### 6.6 Pack opening animations (TCG simulator vibe)

Must include:

* pack shake
* seal break
* glow build-up based on best rarity
* card fan reveal
* click/drag to flip each card
* “skip” button
  All driven by VFX/SFX packs.

---

## 7) AI System (3+ difficulties + modular packs)

### 7.1 Must ship with 3 AIs

* Easy: random-ish
* Normal: greedy
* Hard: heuristics + lethal check

### 7.2 AI packs (drop-in)

`game/ai_packs/index.json` loads:

* `type: "ai-pack"`
  Each AI profile file defines:
* weights: aggression, trading, fear avoidance, defense-mode usage
* priorities: face vs board
* risk tolerance
* optional “boss scripts”
* optional “cheat budget” (boss only, dev gated)

### 7.3 AI decision trace (dev)

In dev mode:

* show why AI chose an action
* show scoring for candidates

---

## 8) Settings: Backdrops + Music + QoL

### 8.1 Backdrops (drop-in)

* folder: `backdrop_packs/`
* metadata includes:

  * name, tags
  * parallax layers (optional)
  * color grading preset (optional)
    Settings:
* preview
* apply
* save per scene (menu/game/opening)

### 8.2 Music player (drop-in)

* folder: `audio_packs/`
* playlists per scene
* crossfade option
  UI:
* play/pause
* next/prev
* volume
* shuffle/repeat
* “mute during pack opening” toggle

### 8.3 Extra QoL (must include)

* Undo/redo in creator
* Autosave snapshots
* One-click “duplicate” everything
* “Template gallery”
* “Recently edited” list
* Inline schema errors with red highlights
* “Share deck code”
* “Import everything from folder” button (server mode)

---

## 9) Implementation Plan (Phased, No Refactors Later)

### Phase 1 — Core registries + loader + schemas + neat code standards

* Create `/core/` foundation:

  * `registry.js`, `loader.js`, `schema.js`, `events.js`, `storage.js`, `utils.js`
* Standardize code style:

  * single responsibility modules
  * no circular imports
  * predictable naming
* Implement chat/log + dev unlock

### Phase 2 — Creator redesign + Guided Builder 2.0

* Ability templates system
* Targeting panel
* Condition grouping with AND/OR
* “Explain ability” generator
* Spell creator + hero creator

### Phase 3 — Game UX polish + VFX bus + bug fixes

* Immediate play render fix
* Attack lines + damage numbers
* Defense stance VFX
* Target highlight system

### Phase 4 — Rivalry system layered (minion-only) + conditional triggers

* Combat/spell/status layers
* Fear/deflect/crit
* Condition gates
* Logs and visual indicators

### Phase 5 — Economy + quests + store + pack opening

* currencies
* rewards
* quest system
* store UI
* pack opening scene & animations

### Phase 6 — AI packs + 3 default AIs + boss mode

* AI architecture
* difficulty selection
* AI pack loader
* decision trace

### Phase 7 — Backdrops + music + cosmetics + accessibility

* theme packs
* backdrop packs
* audio packs
* cosmetics

---

## 10) Output Format Requirements

When responding, you must:

* Provide the **exact folder tree**
* Provide **JSON schemas** for each pack type
* Provide the **loader + registry code**
* Provide the **creator UI + game UI implementations**
* Include at least:

  * 1 sample card pack with placeholder art
  * 1 sample race pack (layered + conditional)
  * 1 sample AI pack
  * 1 sample loot product pack
  * 1 sample backdrop pack
  * 1 sample audio pack
  * 1 sample quest pack
* Provide run instructions:

  * `python -m http.server 8080`

Do not handwave. Do not omit key modules.
Everything must be modular and discoverable by dropping files into folders.

---

## 11) Dev Password Requirement

Implement in game:

* A chat/log input
* When user types exactly `./DevAbil`:

  * unlock dev UI panels in creator and game
  * persist in localStorage
  * show confirmation toast
* Unlock must be optionally configurable via dev pack.

---

## 12) Acceptance Criteria Checklist

You are not done unless:

* New AI can be added by dropping a file into `ai_packs/`
* New race/element and relations can be added by dropping a file into `race_packs/`
* New backdrops selectable by dropping into `backdrop_packs/`
* New store products by dropping into `store_packs/`
* New effects/conditions/actions by dropping files into their folders
* Mobile+desktop both can:

  * drag to play
  * drag to attack
  * see target highlights + combat VFX
* Hero attack rule enforced
* Rivalry system affects minions only
* Reward system includes quests + performance bonuses + difficulty bonuses
* Creator UI is neat, guided, and supports advanced modes

---

## 13) Begin Work

Start by implementing:

1. core registries + loader system + schema validation + error UI
2. plugin folder discovery and sample content packs
3. launcher menu + settings foundation (backdrop/music)
   Then proceed phase-by-phase.
