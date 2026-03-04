import { Registry } from '../core/registry.js';
import { loadPlugins } from '../core/loader.js';
import { loadProfile, saveProfile, setDevUnlocked, resetProfile } from '../core/storage.js';
import { toast, uid } from '../core/utils.js';
import { emitVfx, onVfx } from './engine/animation_bus.js';
import { explainInvalidAction } from './engine/targeting.js';
import { getRivalryIndicators, resolveCombat, resolveSpellPower } from './engine/rivalry.js';
import { evaluateQuest, getWinReward, openPack } from './engine/economy.js';
import { chooseAction, createSummon, getThinkDelay, getThinkingLine } from './engine/ai.js';

const registry = new Registry();
const MATCH_KEY = 'cardforge.match.opponent.v1';
const state = {
  profile: loadProfile(),
  playerHealth: 30,
  playerMaxHealth: 30,
  enemyHealth: 30,
  enemyMaxHealth: 30,
  mana: 1,
  maxMana: 1,
  hand: [],
  rivalryPacks: [], quests: [], storeProducts: [], aiProfiles: [], backdrops: [], playlists: [], cardBacks: [], themes: [], decks: [],
  deckMode: 'planning', deckSearch: '', selectedDeckId: null, selectedAiId: null, bossMode: false, aiThinking: false, aiThinkingLine: '', lastAiTrace: 'not-run', selectedPlayerSlot: null, selectedAttackerId: null, logHidden: false, usedAttacks: {}, enemyUsedAttacks: {}, currentTurn: 'player', enemyDeck: [],
  playerMinions: [],
  enemyMinions: [
    { id: uid('enemy'), name: 'Guard Pup', attack: 1, health: 3, maxHealth: 3, taunt: true, defense: false, race: 'undead', element: 'shadow', statuses: {}, rarity: 'common', level: 2 },
    { id: uid('enemy'), name: 'Ash Spirit', attack: 2, health: 2, maxHealth: 2, taunt: false, defense: false, race: 'elemental', element: 'fire', statuses: {}, rarity: 'rare', level: 3 },
  ],
};

const log = (msg) => {
  const host = document.querySelector('#log');
  host.innerHTML = `<div>${msg}</div>` + host.innerHTML;
};
const showHint = (msg = '') => { document.querySelector('#hint').textContent = msg; };
const getAllCards = () => registry.list('cardPacks').flatMap((pack) => pack.cards);
const currentAiProfile = () => state.aiProfiles.find((profile) => profile.id === state.selectedAiId) ?? state.aiProfiles[0] ?? null;
const getSelectedDeck = () => state.decks.find((deck) => deck.id === state.selectedDeckId) ?? state.decks[0] ?? null;
const persistProfile = () => saveProfile(state.profile);

function shuffle(list = []) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initEnemyDeck() {
  const profile = currentAiProfile();
  if (!profile) { state.enemyDeck = []; return; }
  const pool = (profile.deck ?? profile.summons ?? []).map((c) => ({ ...c }));
  const expanded = [];
  for (let i = 0; i < 30; i += 1) expanded.push({ ...(pool[i % Math.max(1, pool.length)] ?? { name: 'Wisp', attack: 1, health: 1, race: 'spirit', element: 'arcane' }) });
  state.enemyDeck = shuffle(expanded);
}

function drawEnemySummon(profile) {
  if (!state.enemyDeck.length) initEnemyDeck();
  const next = state.enemyDeck.shift();
  if (!next) return createSummon(profile);
  return {
    id: uid('enemy'),
    name: next.name,
    attack: next.attack ?? 2,
    health: next.health ?? 2,
    taunt: !!next.taunt,
    defense: false,
    race: next.race ?? 'neutral',
    element: next.element ?? 'none',
    statuses: {},
    rarity: next.rarity ?? 'rare',
  };
}


function getSlotOccupant(minions, slot) {
  return minions.find((m) => (m.slot ?? -1) === slot) ?? null;
}

function resetAttackUsageFor(side = 'player') {
  if (side === 'player') state.usedAttacks = {};
  else state.enemyUsedAttacks = {};
}


function setBar(id, value, max) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const bar = document.querySelector(id);
  if (bar) bar.style.width = `${pct}%`;
}

function applyThemeAndSettings() {
  const board = document.querySelector('#board');
  const backdrop = state.backdrops.find((item) => item.id === state.profile.settings.selectedBackdrop) ?? state.backdrops[0];
  if (backdrop?.css) board.style.background = backdrop.css;
  board.style.backgroundSize = 'cover';
  board.style.backgroundPosition = 'center';
  const theme = state.themes.find((item) => item.id === state.profile.settings.selectedTheme) ?? state.themes[0];
  if (theme) {
    document.body.style.background = theme.appBg;
    document.querySelectorAll('.panel').forEach((panel) => { panel.style.background = theme.panelBg; });
    document.documentElement.style.setProperty('--accent', theme.accent);
    if (theme.hpStart) document.documentElement.style.setProperty('--hp-start', theme.hpStart);
    if (theme.hpEnd) document.documentElement.style.setProperty('--hp-end', theme.hpEnd);
  }
  document.body.style.transform = `scale(${state.profile.settings.uiScale})`;
  document.body.style.transformOrigin = 'top center';
  document.body.classList.toggle('high-contrast', !!state.profile.settings.highContrast);
  document.body.classList.toggle('reduce-motion', !!state.profile.settings.reduceMotion);
}

function bumpQuestMetric(metric, amount = 1) {
  state.profile.questProgress[metric] = (state.profile.questProgress[metric] ?? 0) + amount;
  persistProfile();
}

function compatibilityScore(card, deck) {
  if (!deck) return 0;
  const byId = Object.fromEntries(getAllCards().map((entry) => [entry.id, entry]));
  const deckCards = deck.entries.flatMap((entry) => Array.from({ length: entry.count }, () => byId[entry.cardId])).filter(Boolean);
  const races = new Set(deckCards.map((item) => item.race).filter(Boolean));
  const elements = new Set(deckCards.map((item) => item.element).filter(Boolean));
  let score = 0;
  if (card.race && races.has(card.race)) score += 2;
  if (card.element && elements.has(card.element)) score += 2;
  if (card.synergy?.some((tag) => races.has(tag) || elements.has(tag))) score += 2;
  if (card.type === 'spell' && deckCards.some((item) => item.type === 'minion')) score += 1;
  return score;
}

function claimDailyGift() {
  const today = new Date().toDateString();
  if (state.profile.economy.lastDailyGiftAt === today) return;
  state.profile.economy.lastDailyGiftAt = today;
  state.profile.economy.gold += 75;
  persistProfile();
  toast('Daily gift claimed (+75g).', 'info');
  renderPanels();
}

function claimDemoWin() {
  const reward = getWinReward(state.profile.stats.streak);
  state.profile.stats.wins += 1;
  state.profile.stats.streak += 1;
  state.profile.economy.gold += reward;
  persistProfile();
  toast(`Win reward claimed (+${reward}g).`, 'info');
  renderPanels();
}

function performEnemyAttack(attackerId, targetId) {
  const attacker = state.enemyMinions.find((m) => m.id === attackerId);
  if (!attacker) return;
  const used = state.enemyUsedAttacks[attacker.id] ?? 0;
  const cap = attacker.allowMultiAttack ? 99 : 1;
  if (used >= cap) return;
  if (targetId === 'player-hero') {
    state.playerHealth -= attacker.attack;
    state.enemyUsedAttacks[attacker.id] = used + 1;
    spawnDamageNumber(document.querySelector('[data-target-id="player-hero"]'), attacker.attack);
    return;
  }
  const defender = state.playerMinions.find((m) => m.id === targetId);
  if (!defender) return;
  const result = resolveCombat(attacker, defender, state, 'enemy');
  defender.health -= result.damageToDefender;
  attacker.health -= result.damageToAttacker;
  spawnDamageNumber(document.querySelector(`[data-id="${defender.id}"]`), result.damageToDefender);
  state.enemyUsedAttacks[attacker.id] = used + 1;
  spawnDamageNumber(document.querySelector(`[data-id="${attacker.id}"]`), result.damageToAttacker);
}

async function runEnemyTurn() {
  const profile = currentAiProfile();
  if (!profile || state.aiThinking) return;

  state.aiThinking = true;
  state.currentTurn = 'enemy';
  state.aiThinkingLine = getThinkingLine(profile);
  renderPanels();

  const delayMs = getThinkDelay(profile);
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  const action = chooseAction(state, profile);
  state.lastAiTrace = `${profile.name} -> ${action.trace} (${delayMs}ms)`;
  if (action.type === 'summon') {
    const summon = drawEnemySummon(profile);
    if (summon) {
      summon.maxHealth = summon.health;
      summon.level = profile.level ?? 1;
      const free = Array.from({ length: 8 }, (_, i) => i).find((i) => !getSlotOccupant(state.enemyMinions, i));
      if (free == null) return;
      summon.slot = free;
      state.enemyMinions.push(summon);
      emitVfx('summon', { side: 'enemy', unit: summon.name });
    }
  } else if (action.type === 'attack-minion') {
    performEnemyAttack(action.attackerId, action.targetId);
  } else if (action.type === 'attack-hero') {
    performEnemyAttack(action.attackerId, 'player-hero');
  } else if (action.type === 'boss-roar') {
    state.playerHealth -= 2;
    state.enemyMinions.forEach((m) => { m.attack += 1; });
    spawnDamageNumber(document.querySelector('[data-target-id="player-hero"]'), 2);
    emitVfx('boss-skill', { skill: 'shadow-roar' });
  }

  state.aiThinking = false;
  state.aiThinkingLine = '';
  state.currentTurn = 'player';
  resetAttackUsageFor('player');
  cleanupDead();
  render();
  toast('Enemy turn complete.', 'info');
  renderPanels();
}


function endTurn() {
  if (state.enemyHeroPoison) {
    state.enemyHealth -= state.enemyHeroPoison;
    spawnDamageNumber(document.querySelector('[data-target-id=\"enemy-hero\"]'), state.enemyHeroPoison, 'poison');
  }
  state.maxMana = Math.min(15, state.maxMana + 1);
  state.mana = state.maxMana;
  state.selectedAttackerId = null;
  resetAttackUsageFor('enemy');
  state.enemyMinions = state.enemyMinions.map((m, i) => ({ ...m, slot: m.slot ?? i }));
  state.hand = getAllCards().slice(0, 5).map((card) => ({ ...card, instanceId: uid('card') }));
  runEnemyTurn();
  render();
}

function renderPanels() {
  document.querySelector('#gold').textContent = state.profile.economy.gold;
  document.querySelector('#streak').textContent = state.profile.stats.streak;
  document.querySelector('#mana').textContent = `${state.mana}/${state.maxMana}`;

  const slotHelp = document.querySelector('#slot-help');
  if (slotHelp) {
    slotHelp.innerHTML = '<h3>Battle Slots</h3><div>8 fixed minion slots per side.</div><div>Click an empty player slot before summoning from hand.</div><div>Click your minion, then click a target to attack.</div>';
  }
}

async function buyAndOpen(productId, quantity = 1, discount = 1) {
  const product = state.storeProducts.find((entry) => entry.id === productId);
  if (!product) return;
  const totalPrice = Math.floor(product.price * quantity * discount);
  if (state.profile.economy.gold < totalPrice) return;
  state.profile.economy.gold -= totalPrice;
  for (let i = 0; i < quantity; i += 1) {
    const pityState = state.profile.economy.pityByProduct[product.id] ?? { missesUntilGuaranteed: 0 };
    const pool = product.poolTag ? getAllCards().filter((card) => (card.tags ?? []).includes(product.poolTag)) : getAllCards();
    const opened = openPack(pool, product, pityState);
    state.profile.economy.pityByProduct[product.id] = opened.pityState;
    state.profile.stats.packsOpened += 1;
    opened.pulls.forEach((card) => { state.profile.collection[card.id] = (state.profile.collection[card.id] ?? 0) + 1; });
    bumpQuestMetric('packsOpened', 1);
    await animatePackOpening(opened.pulls);
    emitVfx('pack-open', { product: product.id, count: opened.pulls.length });
  }
  persistProfile();
  toast(`Opened ${quantity} pack(s).`, 'info');
  renderPanels();
}

async function animatePackOpening(cards) {
  const panel = document.querySelector('#pack-opening');
  const reveal = document.querySelector('#pack-reveal');
  panel.classList.remove('hidden');
  reveal.innerHTML = '';
  const guide = document.querySelector('#pack-guide');
  if (guide) guide.classList.remove('hidden');
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (guide) guide.classList.add('hidden');
  for (const card of cards) {
    const node = document.createElement('div');
    node.className = `pack-card ${card.rarity}`;
    node.innerHTML = `<strong>${card.name}</strong><div>${card.rarity}</div>`;
    reveal.appendChild(node);
    await new Promise((resolve) => setTimeout(resolve, 100));
    node.classList.add('show');
  }
}

async function boot() {
  const errors = await loadPlugins(registry, [
    { manifest: './mode_packs/index.json', base: './mode_packs', type: 'mode-pack', kind: 'modes' },
    { manifest: './ai_packs/index.json', base: './ai_packs', type: 'ai-pack', kind: 'ai' },
    { manifest: './race_packs/index.json', base: './race_packs', type: 'race-pack', kind: 'rivalryPacks' },
    { manifest: './quest_packs/index.json', base: './quest_packs', type: 'quest-pack', kind: 'questPacks' },
    { manifest: './store_packs/index.json', base: './store_packs', type: 'store-pack', kind: 'storePacks' },
    { manifest: './deck_packs/index.json', base: './deck_packs', type: 'deck-pack', kind: 'deckPacks' },
    { manifest: './backdrop_packs/index.json', base: './backdrop_packs', type: 'backdrop-pack', kind: 'backdropPacks' },
    { manifest: './audio_packs/index.json', base: './audio_packs', type: 'audio-pack', kind: 'audioPacks' },
    { manifest: './cosmetic_packs/index.json', base: './cosmetic_packs', type: 'cosmetic-pack', kind: 'cosmeticPacks' },
    { manifest: './theme_packs/index.json', base: './theme_packs', type: 'theme-pack', kind: 'themePacks' },
    { manifest: '../packs/index.json', base: '../packs', type: 'card-pack', kind: 'cardPacks' },
  ], log);
  errors.forEach((error) => log(`Error: ${error}`));

  state.rivalryPacks = registry.list('rivalryPacks');
  state.quests = registry.list('questPacks').flatMap((pack) => pack.quests ?? []);
  state.storeProducts = registry.list('storePacks').flatMap((pack) => pack.products ?? []);
  state.aiProfiles = registry.list('ai');
  state.selectedAiId = state.aiProfiles[0]?.id ?? null;
  const queuedOpponent = localStorage.getItem(MATCH_KEY);
  if (queuedOpponent && state.aiProfiles.some((a) => a.id === queuedOpponent)) state.selectedAiId = queuedOpponent;
  state.backdrops = registry.list('backdropPacks').flatMap((pack) => pack.backdrops ?? []);
  state.playlists = registry.list('audioPacks').flatMap((pack) => pack.playlists ?? []);
  state.cardBacks = registry.list('cosmeticPacks').flatMap((pack) => pack.cardBacks ?? []);
  state.themes = registry.list('themePacks').flatMap((pack) => pack.themes ?? []);
  state.decks = registry.list('deckPacks').flatMap((pack) => pack.decks ?? []);
  state.selectedDeckId = state.profile.starterDeckId ?? state.decks[0]?.id ?? null;

  onVfx('play-card', ({ payload }) => log(`VFX play-card: ${payload.cardId}`));
  onVfx('attack', ({ payload }) => log(`VFX attack: ${payload.attackerId} -> ${payload.targetId}`));
  onVfx('stance-toggle', ({ payload }) => log(`VFX stance-toggle: ${payload.id}=${payload.defense}`));
  onVfx('summon', ({ payload }) => log(`VFX summon: ${payload.unit}`));
  onVfx('pack-open', ({ payload }) => log(`VFX pack-open: ${payload.product} x${payload.count}`));

  state.enemyMinions = state.enemyMinions.map((m, i) => ({ ...m, slot: m.slot ?? i }));
  state.maxMana = 1;
  state.mana = 1;
  initEnemyDeck();
  state.hand = getAllCards().slice(0, 5).map((card) => ({ ...card, instanceId: uid('card') }));
  applyThemeAndSettings();
  render();
  toast('Runtime ready.', 'info');
  renderPanels();
}

function render() {
  document.querySelector('#mana').textContent = `${state.mana}/${state.maxMana}`;
  document.querySelector('#player-health').textContent = state.playerHealth;
  document.querySelector('#enemy-health').textContent = state.enemyHealth;
  const aiName = currentAiProfile()?.name ?? 'Unknown';
  const enemyNameEl = document.querySelector('#enemy-name');
  if (enemyNameEl) enemyNameEl.textContent = aiName;
  setBar('#player-hero-bar', state.playerHealth, state.playerMaxHealth);
  setBar('#enemy-hero-bar', state.enemyHealth, state.enemyMaxHealth);

  const handHost = document.querySelector('#hand');
  handHost.innerHTML = '';
  state.hand.forEach((card) => {
    const node = document.createElement('div');
    node.className = `card rarity-${card.rarity ?? 'common'}`;
    node.dataset.id = card.instanceId;
    node.innerHTML = `<strong>${card.name}</strong><div>${card.type}</div><div>${card.cost} mana</div><div>${state.profile.settings.selectedCardBack}</div>`;
    enableCardDrag(node, card.instanceId);
    handHost.appendChild(node);
  });

  renderLane('#player-minions', state.playerMinions, true);
  renderLane('#enemy-minions', state.enemyMinions, false);
}

function renderLane(selector, minions, playerOwned) {
  const lane = document.querySelector(selector);
  const opponents = playerOwned ? state.enemyMinions : state.playerMinions;
  lane.innerHTML = '';

  for (let i = 0; i < 8; i += 1) {
    const slot = document.createElement('div');
    slot.className = 'board-slot';
    slot.dataset.slotIndex = String(i);
    const minion = getSlotOccupant(minions, i);

    if (!minion) {
      slot.textContent = playerOwned ? `Player Slot ${i + 1}` : `Enemy Slot ${i + 1}`;
      if (playerOwned) {
        slot.onclick = () => { state.selectedPlayerSlot = i; render(); };
        if (state.selectedPlayerSlot === i) slot.classList.add('selected');
      }
      lane.appendChild(slot);
      continue;
    }

    const node = document.createElement('div');
    const indicators = getRivalryIndicators(minion, opponents, state, playerOwned ? 'player' : 'enemy');
    node.className = `minion target rarity-${minion.rarity ?? 'common'} ${minion.taunt ? 'taunt' : ''} ${indicators.hasAdvantage ? 'rivalry-advantage' : ''} ${indicators.hasDisadvantage ? 'rivalry-danger' : ''} ${state.selectedAttackerId === minion.id ? 'selected-attacker' : ''}`;
    node.dataset.id = minion.id;
    node.dataset.targetId = minion.id;
    node.dataset.defense = String(minion.defense);
    const currentAttack = Math.max(0, minion.attack - (minion.statuses?.weakened ? 1 : 0));
    const hpPct = Math.max(0, Math.min(100, (minion.health / Math.max(1, minion.maxHealth ?? minion.health)) * 100));
    node.innerHTML = `<strong>${minion.name}</strong><div>${currentAttack}/${minion.health}</div><div class="health-bar"><div class="health-fill" style="width:${hpPct}%"></div></div><div class="meta">${minion.race ?? 'neutral'} · ${minion.element ?? 'none'} · L${minion.level ?? 1}</div><div class="status-row">${minion.statuses?.weakened ? '<span class="status">Weakened</span>' : ''}</div><button>${minion.defense ? 'Defense ON' : 'Defense OFF'}</button>`;
    node.querySelector('button').onclick = (event) => { event.stopPropagation(); minion.defense = !minion.defense; emitVfx('stance-toggle', { id: minion.id, defense: minion.defense }); render(); };

    if (playerOwned) {
      node.onclick = () => {
        if (state.selectedAttackerId && state.selectedAttackerId !== minion.id) {
          attackWith(state.selectedAttackerId, minion.id);
          state.selectedAttackerId = null;
          render();
          return;
        }
        state.selectedAttackerId = minion.id;
        highlightAttackTargets(minion.id);
        render();
      };
      enableAttackDrag(node, minion.id);
    }

    slot.appendChild(node);
    lane.appendChild(slot);
  }
}

function playCard(cardId, slotOverride = null) {
  const index = state.hand.findIndex((c) => c.instanceId === cardId);
  if (index === -1) return;
  const card = state.hand[index];
  if (card.cost > state.mana) { showHint(explainInvalidAction('mana')); return; }

  if (card.type === 'minion') {
    if (state.playerMinions.length >= 8) { showHint('Board is full (8/8).'); return; }
    const slot = slotOverride ?? state.selectedPlayerSlot;
    if (slot == null || slot < 0 || slot > 7) { showHint('Select a board slot first.'); return; }
    if (getSlotOccupant(state.playerMinions, slot)) { showHint('That slot is occupied. Choose another slot.'); return; }
    const summon = { id: uid('m'), name: card.name, attack: card.attack, health: card.health, maxHealth: card.health, taunt: !!card.taunt, defense: false, race: card.race ?? 'neutral', element: card.element ?? 'none', statuses: {}, rarity: card.rarity ?? 'common', level: card.level ?? 1, allowFriendlyAttack: !!card.allowFriendlyAttack, slot };
    state.hand.splice(index, 1);
    state.mana -= card.cost;
    state.playerMinions.push(summon);
    emitVfx('play-card', { cardId: card.id });
    bumpQuestMetric('cardsPlayed', 1);
    render(); renderPanels();
    return;
  }

  if (card.type === 'spell') {
    const action = card.effect?.action ?? 'dealDamage';
    const amount = card.effect?.amount ?? card.damage ?? 0;
    const enemyHero = document.querySelector('[data-target-id="enemy-hero"]');

    if (action === 'poisonHero') {
      state.enemyHeroPoison = (state.enemyHeroPoison ?? 0) + amount;
      spawnDamageNumber(enemyHero, amount, 'poison');
    } else if (action === 'weakenAllEnemies') {
      state.enemyMinions.forEach((m) => { m.statuses.weakened = true; });
    } else {
      const target = state.enemyMinions[0];
      if (target) {
        const spell = resolveSpellPower(state.playerMinions[0] ?? { race: 'none', element: 'none' }, target, amount, state, 'player');
        target.health -= spell.power;
        spawnDamageNumber(document.querySelector(`[data-id="${target.id}"]`), spell.power, card.element ?? target.element);
      } else {
        state.enemyHealth -= amount;
        spawnDamageNumber(enemyHero, amount, card.element ?? 'arcane');
      }
    }

    state.hand.splice(index, 1);
    state.mana -= card.cost;
    bumpQuestMetric('cardsPlayed', 1);
    cleanupDead();
    render(); renderPanels();
  }
}
function attackWith(attackerId, targetId) {
  const attacker = state.playerMinions.find((m) => m.id === attackerId);
  if (!attacker || attacker.defense) return;
  const used = state.usedAttacks[attacker.id] ?? 0;
  const cap = attacker.allowMultiAttack ? 99 : 1;
  if (used >= cap) { showHint('This minion already attacked this turn.'); return; }
  const friendlyTarget = state.playerMinions.find((m) => m.id === targetId);
  const forcedTaunt = state.enemyMinions.find((m) => m.taunt);
  if (!friendlyTarget && forcedTaunt && targetId !== forcedTaunt.id) return;

  const attackerEl = document.querySelector(`[data-id="${attacker.id}"]`);
  const targetEl = document.querySelector(`[data-target-id="${targetId}"]`);

  if (targetId === 'enemy-hero') {
    if (state.enemyMinions.length > 0) return;
    state.enemyHealth -= attacker.attack;
    spawnDamageNumber(targetEl, attacker.attack, attacker.element ?? 'arcane');
  } else {
    const defender = state.enemyMinions.find((m) => m.id === targetId) ?? (attacker.allowFriendlyAttack ? state.playerMinions.find((m) => m.id === targetId) : null);
    if (!defender) return;
    const result = resolveCombat(attacker, defender, state, 'player');
    defender.health -= result.damageToDefender;
    attacker.health -= result.damageToAttacker;
    spawnDamageNumber(document.querySelector(`[data-id="${defender.id}"]`), result.damageToDefender, attacker.element ?? defender.element);
    spawnDamageNumber(attackerEl, result.damageToAttacker, defender.element ?? 'shadow');
  }
  drawAttackLine(attackerEl, targetEl);
  state.usedAttacks[attacker.id] = used + 1;
  emitVfx('attack', { attackerId, targetId });
  cleanupDead();
  render();
}
function cleanupDead() {
  state.playerMinions = state.playerMinions.filter((m) => m.health > 0);
  state.enemyMinions = state.enemyMinions.filter((m) => m.health > 0);
  if (state.enemyHealth <= 0) {
    const p = currentAiProfile();
    const line = p?.personality?.victoryLine || `You found ${p?.personality?.dimensionTag ?? '#Unknown'}.`;
    log(line);
    if (p?.personality?.dimensionTag) log(`Dimension clue unlocked: ${p.personality.dimensionTag.replace('#','')}`);
  }
}

function drawAttackLine(fromEl, toEl) {
  if (!fromEl || !toEl) return;
  const boardRect = document.querySelector('#board').getBoundingClientRect();
  const from = fromEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();
  const x1 = from.left + (from.width / 2) - boardRect.left;
  const y1 = from.top + (from.height / 2) - boardRect.top;
  const x2 = to.left + (to.width / 2) - boardRect.left;
  const y2 = to.top + (to.height / 2) - boardRect.top;
  const svg = document.querySelector('#attack-layer');
  svg.innerHTML = `<line class="attack-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  setTimeout(() => { svg.innerHTML = ''; }, 260);
}

function spawnDamageNumber(targetEl, amount, element = 'arcane') {
  if (!targetEl || amount <= 0) return;
  const boardRect = document.querySelector('#board').getBoundingClientRect();
  const rect = targetEl.getBoundingClientRect();
  const node = document.createElement('div');
  node.className = 'damage-float';
  node.textContent = `-${amount}`;
  const colors = { fire: '#ff8a5b', water: '#67b8ff', shadow: '#b38cff', nature: '#7de092', arcane: '#c0d2ff', holy: '#ffe799', poison: '#9df75f' };
  node.style.color = colors[element] ?? '#ffd0d8';
  node.style.left = `${rect.left + rect.width / 2 - boardRect.left}px`;
  node.style.top = `${rect.top + rect.height / 2 - boardRect.top}px`;
  document.querySelector('#float-layer').appendChild(node);
  setTimeout(() => node.remove(), 900);
}

function clearHighlights() {
  document.querySelectorAll('.target-valid,.target-blocked,.slot-valid').forEach((el) => el.classList.remove('target-valid', 'target-blocked', 'slot-valid'));
}

function highlightCardPlayTargets() {
  clearHighlights();
  document.querySelector('#drop-zone').classList.add('target-valid');
  document.querySelectorAll('#player-minions .board-slot').forEach((slotNode) => {
    const idx = Number(slotNode.dataset.slotIndex);
    if (!getSlotOccupant(state.playerMinions, idx)) slotNode.classList.add('slot-valid');
  });
}

function highlightAttackTargets(attackerId) {
  clearHighlights();
  const attacker = state.playerMinions.find((m) => m.id === attackerId);
  if (!attacker || attacker.defense) return;
  const used = state.usedAttacks[attacker.id] ?? 0;
  const cap = attacker.allowMultiAttack ? 99 : 1;
  if (used >= cap) { showHint('This minion already attacked this turn.'); return; }
  const taunt = state.enemyMinions.find((m) => m.taunt);
  if (taunt) {
    document.querySelectorAll('#enemy-minions .minion').forEach((node) => node.classList.add(node.dataset.id === taunt.id ? 'target-valid' : 'target-blocked'));
    return;
  }
  const enemyNodes = document.querySelectorAll('#enemy-minions .minion');
  if (enemyNodes.length > 0) enemyNodes.forEach((node) => node.classList.add('target-valid'));
  else document.querySelector('[data-target-id=\"enemy-hero\"]').classList.add('target-valid');
  if (attacker.allowFriendlyAttack) {
    document.querySelectorAll('#player-minions .minion').forEach((node) => { if (node.dataset.id !== attackerId) node.classList.add('target-valid'); });
  }
}

function dragWithGhost(node, onMove, onDrop) {
  node.onpointerdown = (event) => {
    event.preventDefault();
    document.body.classList.add('dragging');
    const ghost = node.cloneNode(true);
    ghost.classList.add('ghost');
    document.body.appendChild(ghost);
    const move = (e) => { ghost.style.left = `${e.clientX}px`; ghost.style.top = `${e.clientY}px`; onMove(e); };
    move(event);
    const up = (e) => { document.removeEventListener('pointermove', move); onDrop(e); ghost.remove(); clearHighlights(); showHint(''); document.body.classList.remove('dragging'); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  };
}

function enableCardDrag(node, cardId) {
  dragWithGhost(node, () => highlightCardPlayTargets(), (e) => {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const slotNode = target?.closest('#player-minions .board-slot');
    const drop = target?.closest('#drop-zone');
    if (slotNode) playCard(cardId, Number(slotNode.dataset.slotIndex));
    else if (drop) playCard(cardId);
  });
}

function enableAttackDrag(node, attackerId) {
  dragWithGhost(node, () => highlightAttackTargets(attackerId), (e) => {
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-target-id]');
    if (target) attackWith(attackerId, target.dataset.targetId);
  });
}

function handleConsoleCommand(raw) {
  const cmd = raw.trim();
  if (!cmd) return;
  log(`> ${cmd}`);
  if (cmd === './DevAbil') {
    setDevUnlocked(true);
    toast('Developer panels unlocked.', 'info');
    log('Developer panels unlocked.');
    return;
  }
  if (cmd === './ResetProgress') {
    state.profile = resetProfile();
    localStorage.removeItem('cardforge.world.seed.v1');
    localStorage.removeItem('cardforge.match.opponent.v1');
    persistProfile();
    toast('Progress reset.', 'info');
    log('Progress reset.');
    renderPanels();
    render();
    return;
  }
  if (cmd === './Lobby') {
    window.location.assign('../index.html#lobby');
    log('Returning to lobby...');
    return;
  }
  if (cmd === './help') {
    toast('Commands: ./help, ./DevAbil, ./ResetProgress, ./Lobby', 'info');
    log('Available commands: ./help | ./DevAbil | ./ResetProgress | ./Lobby');
    return;
  }
  toast('Unknown command. Use ./help', 'error');
  log('Unknown command. Use ./help');
}

document.querySelector('#chat-input').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  handleConsoleCommand(event.target.value);
  event.target.value = '';
});

document.querySelector('#chat-send').addEventListener('click', () => {
  const input = document.querySelector('#chat-input');
  handleConsoleCommand(input.value);
  input.value = '';
});

document.querySelector('#menu-btn').addEventListener('click', () => { window.location.assign('../index.html'); });
document.querySelector('#lobby-btn').addEventListener('click', () => { window.location.assign('../index.html#lobby'); });
document.querySelector('#win-demo').addEventListener('click', claimDemoWin);
document.querySelector('#end-turn').addEventListener('click', endTurn);
document.querySelector('#toggle-log').addEventListener('click', () => {
  state.logHidden = !state.logHidden;
  document.querySelector('#log').classList.toggle('hidden', state.logHidden);
  document.querySelector('#toggle-log').textContent = state.logHidden ? 'Show Log' : 'Hide Log';
});

boot();
