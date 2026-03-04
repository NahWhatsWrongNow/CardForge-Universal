import { Registry } from '../core/registry.js';
import { loadPlugins } from '../core/loader.js';
import { loadProfile, saveProfile, setDevUnlocked, resetProfile } from '../core/storage.js';
import { toast, uid } from '../core/utils.js';
import { emitVfx, onVfx } from './engine/animation_bus.js';
import { explainInvalidAction } from './engine/targeting.js';
import { getRivalryIndicators, resolveCombat, resolveSpellPower } from './engine/rivalry.js';
import { evaluateQuest, getWinReward, openPack } from './engine/economy.js';
import { chooseAction, createSummon } from './engine/ai.js';

const registry = new Registry();
const state = {
  profile: loadProfile(),
  playerHealth: 30,
  enemyHealth: 30,
  mana: 3,
  hand: [],
  rivalryPacks: [],
  quests: [],
  storeProducts: [],
  aiProfiles: [],
  backdrops: [],
  playlists: [],
  cardBacks: [],
  themes: [],
  decks: [],
  deckMode: 'planning',
  deckSearch: '',
  selectedDeckId: null,
  selectedAiId: null,
  bossMode: false,
  lastAiTrace: 'not-run',
  playerMinions: [],
  enemyMinions: [
    { id: uid('enemy'), name: 'Guard Pup', attack: 1, health: 3, taunt: true, defense: false, race: 'undead', element: 'shadow', statuses: {} },
    { id: uid('enemy'), name: 'Ash Spirit', attack: 2, health: 2, taunt: false, defense: false, race: 'elemental', element: 'fire', statuses: {} },
  ],
};

const log = (msg) => {
  const host = document.querySelector('#log');
  host.innerHTML = `<div>${msg}</div>` + host.innerHTML;
};

const showHint = (msg = '') => {
  document.querySelector('#hint').textContent = msg;
};

function getAllCards() {
  return registry.list('cardPacks').flatMap((pack) => pack.cards);
}

function currentAiProfile() {
  return state.aiProfiles.find((profile) => profile.id === state.selectedAiId) ?? state.aiProfiles[0] ?? null;
}

function getSelectedDeck() {
  return state.decks.find((deck) => deck.id === state.selectedDeckId) ?? state.decks[0] ?? null;
}

function persistProfile() {
  saveProfile(state.profile);
}

function applyThemeAndSettings() {
  const board = document.querySelector('#board');
  const backdrop = state.backdrops.find((item) => item.id === state.profile.settings.selectedBackdrop) ?? state.backdrops[0];
  if (backdrop?.css) board.style.background = backdrop.css;

  const theme = state.themes.find((item) => item.id === state.profile.settings.selectedTheme) ?? state.themes[0];
  if (theme) {
    document.body.style.background = theme.appBg;
    document.querySelectorAll('.panel').forEach((panel) => { panel.style.background = theme.panelBg; });
    document.documentElement.style.setProperty('--accent', theme.accent);
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

function claimQuest(questId) {
  const quest = state.quests.find((entry) => entry.id === questId);
  if (!quest) return;
  const status = evaluateQuest(quest, state.profile.questProgress);
  if (!status.done || state.profile.questClaims[questId]) {
    toast('Quest unavailable.', 'info');
    return;
  }
  state.profile.economy.gold += quest.reward;
  state.profile.questClaims[questId] = true;
  persistProfile();
  log(`Quest claimed: ${quest.goal} (+${quest.reward} gold).`);
  renderPanels();
}

function claimDailyGift() {
  const today = new Date().toDateString();
  if (state.profile.economy.lastDailyGiftAt === today) {
    toast('Daily gift already claimed.', 'info');
    return;
  }
  state.profile.economy.lastDailyGiftAt = today;
  state.profile.economy.gold += 75;
  persistProfile();
  toast('Daily gift: +75 gold', 'info');
  renderPanels();
}

function claimDemoWin() {
  const reward = getWinReward(state.profile.stats.streak);
  state.profile.stats.wins += 1;
  state.profile.stats.streak += 1;
  state.profile.economy.gold += reward;
  persistProfile();
  log(`Victory reward claimed: +${reward} gold.`);
  renderPanels();
}

function performEnemyAttack(attackerId, targetId) {
  const attacker = state.enemyMinions.find((m) => m.id === attackerId);
  if (!attacker) return;
  if (targetId === 'player-hero') {
    state.playerHealth -= attacker.attack;
    spawnDamageNumber(document.querySelector('[data-target-id="player-hero"]'), attacker.attack);
    log(`Enemy ${attacker.name} attacked your hero for ${attacker.attack}.`);
    return;
  }
  const defender = state.playerMinions.find((m) => m.id === targetId);
  if (!defender) return;
  const result = resolveCombat(attacker, defender, state, 'enemy');
  defender.health -= result.damageToDefender;
  attacker.health -= result.damageToAttacker;
  spawnDamageNumber(document.querySelector(`[data-id="${defender.id}"]`), result.damageToDefender);
  spawnDamageNumber(document.querySelector(`[data-id="${attacker.id}"]`), result.damageToAttacker);
  log(`Enemy ${attacker.name} attacked ${defender.name}. Trace: ${result.matchedRuleIds.join(', ') || 'none'}.`);
}

function runEnemyTurn() {
  const profile = currentAiProfile();
  if (!profile) return;
  const action = chooseAction(state, profile);
  state.lastAiTrace = `${profile.name} -> ${action.trace}`;
  if (action.type === 'summon') {
    const summon = createSummon(profile);
    if (summon) {
      state.enemyMinions.push(summon);
      emitVfx('summon', { side: 'enemy', unit: summon.name });
      log(`${profile.name} summons ${summon.name}.`);
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
    log('Boss skill: shadow-roar triggered.');
  } else {
    log(`${profile.name} passes.`);
  }
  cleanupDead();
  render();
  renderPanels();
}

function renderPanels() {
  document.querySelector('#gold').textContent = state.profile.economy.gold;
  document.querySelector('#streak').textContent = state.profile.stats.streak;

  const questHost = document.querySelector('#quests');
  questHost.innerHTML = '<h3>Daily Quests</h3>';
  state.quests.forEach((quest) => {
    const status = evaluateQuest(quest, state.profile.questProgress);
    const claimed = !!state.profile.questClaims[quest.id];
    const row = document.createElement('div');
    row.innerHTML = `<div>${quest.goal} (${status.current}/${quest.target}) - ${quest.reward}g</div>`;
    const button = document.createElement('button');
    button.textContent = claimed ? 'Claimed' : 'Claim';
    button.disabled = claimed || !status.done;
    button.onclick = () => claimQuest(quest.id);
    row.appendChild(button);
    questHost.appendChild(row);
  });

  const storeHost = document.querySelector('#store');
  storeHost.innerHTML = '<h3>Store + Gifts</h3>';
  const giftButton = document.createElement('button');
  giftButton.textContent = 'Claim Daily Gift (+75g)';
  giftButton.onclick = claimDailyGift;
  storeHost.appendChild(giftButton);

  state.storeProducts.forEach((product) => {
    const row = document.createElement('div');
    row.innerHTML = `<div><strong>${product.name}</strong> - ${product.price}g</div><div>${product.description ?? ''}</div>`;
    const buy1 = document.createElement('button');
    buy1.textContent = 'Buy x1';
    buy1.disabled = state.profile.economy.gold < product.price;
    buy1.onclick = () => buyAndOpen(product.id, 1);
    const buy5 = document.createElement('button');
    buy5.textContent = 'Buy x5 (discount)';
    buy5.disabled = state.profile.economy.gold < Math.floor(product.price * 4.5);
    buy5.onclick = () => buyAndOpen(product.id, 5, 0.9);
    row.append(buy1, buy5);
    storeHost.appendChild(row);
  });

  const aiHost = document.querySelector('#ai-panel');
  aiHost.innerHTML = '<h3>AI Control</h3>';
  const aiSelect = document.createElement('select');
  state.aiProfiles.forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === state.selectedAiId;
    aiSelect.appendChild(option);
  });
  aiSelect.onchange = () => { state.selectedAiId = aiSelect.value; renderPanels(); };
  aiHost.appendChild(aiSelect);

  const aiProfile = currentAiProfile();
  if (aiProfile?.personality) {
    const lore = document.createElement('div');
    lore.id = 'ai-trace';
    lore.textContent = `${aiProfile.personality.title} ${aiProfile.personality.dimensionTag}: ${aiProfile.personality.backstory}`;
    aiHost.appendChild(lore);
  }

  const runButton = document.createElement('button');
  runButton.textContent = 'Run Enemy Turn';
  runButton.onclick = runEnemyTurn;
  const bossButton = document.createElement('button');
  bossButton.textContent = state.bossMode ? 'Disable Boss Mode' : 'Enable Boss Mode';
  bossButton.onclick = () => { state.bossMode = !state.bossMode; renderPanels(); };
  aiHost.append(runButton, bossButton);
  const trace = document.createElement('div');
  trace.id = 'ai-trace';
  trace.textContent = `Decision trace: ${state.lastAiTrace}`;
  aiHost.appendChild(trace);

  const settingsHost = document.querySelector('#settings-panel');
  settingsHost.innerHTML = '<h3>Themes + Accessibility</h3>';

  const themeSelect = document.createElement('select');
  state.themes.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    option.selected = state.profile.settings.selectedTheme === entry.id;
    themeSelect.appendChild(option);
  });
  themeSelect.onchange = () => { state.profile.settings.selectedTheme = themeSelect.value; persistProfile(); applyThemeAndSettings(); };
  settingsHost.appendChild(themeSelect);

  const backdropSelect = document.createElement('select');
  state.backdrops.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = `Backdrop: ${entry.name}`;
    option.selected = state.profile.settings.selectedBackdrop === entry.id;
    backdropSelect.appendChild(option);
  });
  backdropSelect.onchange = () => { state.profile.settings.selectedBackdrop = backdropSelect.value; persistProfile(); applyThemeAndSettings(); };
  settingsHost.appendChild(backdropSelect);

  const audioSelect = document.createElement('select');
  state.playlists.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = `Playlist: ${entry.name}`;
    option.selected = state.profile.settings.selectedPlaylist === entry.id;
    audioSelect.appendChild(option);
  });
  audioSelect.onchange = () => { state.profile.settings.selectedPlaylist = audioSelect.value; persistProfile(); };
  settingsHost.appendChild(audioSelect);

  const backSelect = document.createElement('select');
  state.cardBacks.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = `Card Back: ${entry.name}`;
    option.selected = state.profile.settings.selectedCardBack === entry.id;
    backSelect.appendChild(option);
  });
  backSelect.onchange = () => { state.profile.settings.selectedCardBack = backSelect.value; persistProfile(); render(); };
  settingsHost.appendChild(backSelect);

  [['High Contrast', 'highContrast'], ['Reduce Motion', 'reduceMotion']].forEach(([label, key]) => {
    const btn = document.createElement('button');
    btn.textContent = `${label}: ${state.profile.settings[key] ? 'On' : 'Off'}`;
    btn.onclick = () => {
      state.profile.settings[key] = !state.profile.settings[key];
      persistProfile();
      applyThemeAndSettings();
      renderPanels();
    };
    settingsHost.appendChild(btn);
  });

  const deckHost = document.querySelector('#deck-panel');
  deckHost.innerHTML = '<h3>Deck Builder</h3>';
  const modeSelect = document.createElement('select');
  modeSelect.innerHTML = `<option value="planning" ${state.deckMode === 'planning' ? 'selected' : ''}>Planning Mode (all cards)</option><option value="final" ${state.deckMode === 'final' ? 'selected' : ''}>Final Mode (owned only)</option>`;
  modeSelect.onchange = () => { state.deckMode = modeSelect.value; renderPanels(); };
  deckHost.appendChild(modeSelect);

  const deckSelect = document.createElement('select');
  state.decks.forEach((deck) => {
    const option = document.createElement('option');
    option.value = deck.id;
    option.textContent = deck.name;
    option.selected = deck.id === state.selectedDeckId;
    deckSelect.appendChild(option);
  });
  deckSelect.onchange = () => { state.selectedDeckId = deckSelect.value; renderPanels(); };
  deckHost.appendChild(deckSelect);

  const search = document.createElement('input');
  search.placeholder = 'Search cards...';
  search.value = state.deckSearch;
  search.oninput = () => { state.deckSearch = search.value.toLowerCase(); renderPanels(); };
  deckHost.appendChild(search);

  const selectedDeck = getSelectedDeck();
  if (selectedDeck) {
    const total = selectedDeck.entries.reduce((sum, entry) => sum + entry.count, 0);
    const preview = document.createElement('div');
    preview.id = 'deck-preview';
    preview.textContent = `${selectedDeck.name}: ${total}/30 cards`;
    deckHost.appendChild(preview);
  }

  const cards = getAllCards();
  const visibleCards = cards
    .filter((card) => (state.deckMode === 'planning' || (state.profile.collection[card.id] ?? 0) > 0))
    .filter((card) => card.name.toLowerCase().includes(state.deckSearch))
    .sort((a, b) => compatibilityScore(b, selectedDeck) - compatibilityScore(a, selectedDeck));

  const list = document.createElement('div');
  list.id = 'deck-list';
  visibleCards.forEach((card) => {
    const owned = state.profile.collection[card.id] ?? 0;
    const row = document.createElement('article');
    row.textContent = `${card.name} (${card.type}) • compat ${compatibilityScore(card, selectedDeck)} • owned ${owned}`;
    list.appendChild(row);
  });
  deckHost.appendChild(list);
}

async function buyAndOpen(productId, quantity = 1, discount = 1) {
  const product = state.storeProducts.find((entry) => entry.id === productId);
  if (!product) return;
  const totalPrice = Math.floor(product.price * quantity * discount);
  if (state.profile.economy.gold < totalPrice) {
    toast('Not enough gold.', 'error');
    return;
  }
  state.profile.economy.gold -= totalPrice;
  for (let i = 0; i < quantity; i += 1) {
    const pityState = state.profile.economy.pityByProduct[product.id] ?? { missesUntilGuaranteed: 0 };
    const opened = openPack(getAllCards(), product, pityState);
    state.profile.economy.pityByProduct[product.id] = opened.pityState;
    state.profile.stats.packsOpened += 1;
    opened.pulls.forEach((card) => {
      state.profile.collection[card.id] = (state.profile.collection[card.id] ?? 0) + 1;
    });
    bumpQuestMetric('packsOpened', 1);
    await animatePackOpening(opened.pulls);
    log(`Opened ${product.name}: ${opened.pulls.map((card) => `${card.name} (${card.rarity})`).join(', ')}`);
    emitVfx('pack-open', { product: product.id, count: opened.pulls.length });
  }
  persistProfile();
  renderPanels();
}

async function animatePackOpening(cards) {
  const panel = document.querySelector('#pack-opening');
  const reveal = document.querySelector('#pack-reveal');
  panel.classList.remove('hidden');
  reveal.innerHTML = '';
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

  state.hand = getAllCards().slice(0, 5).map((card) => ({ ...card, instanceId: uid('card') }));
  applyThemeAndSettings();
  render();
  renderPanels();
}

function render() {
  document.querySelector('#player-health').textContent = state.playerHealth;
  document.querySelector('#enemy-health').textContent = state.enemyHealth;
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
  minions.forEach((minion) => {
    const node = document.createElement('div');
    const indicators = getRivalryIndicators(minion, opponents, state, playerOwned ? 'player' : 'enemy');
    node.className = `minion target ${minion.taunt ? 'taunt' : ''} ${indicators.hasAdvantage ? 'rivalry-advantage' : ''} ${indicators.hasDisadvantage ? 'rivalry-danger' : ''}`;
    node.dataset.id = minion.id;
    node.dataset.targetId = minion.id;
    node.dataset.defense = String(minion.defense);
    node.innerHTML = `<strong>${minion.name}</strong><div>${Math.max(0, minion.attack - (minion.statuses?.weakened ? 1 : 0))}/${minion.health}</div><div class="meta">${minion.race ?? 'neutral'} · ${minion.element ?? 'none'}</div><div class="status-row">${minion.statuses?.weakened ? '<span class="status">Weakened</span>' : ''}</div><button>Defense</button>`;
    node.querySelector('button').onclick = () => { minion.defense = !minion.defense; emitVfx('stance-toggle', { id: minion.id, defense: minion.defense }); render(); };
    if (playerOwned) enableAttackDrag(node, minion.id);
    lane.appendChild(node);
  });
}

function playCard(cardId) {
  const index = state.hand.findIndex((c) => c.instanceId === cardId);
  if (index === -1) return;
  const card = state.hand[index];
  if (card.cost > state.mana) { showHint(explainInvalidAction('mana')); return; }
  if (card.type === 'minion') {
    state.hand.splice(index, 1);
    state.mana -= card.cost;
    state.playerMinions.push({ id: uid('m'), name: card.name, attack: card.attack, health: card.health, taunt: !!card.taunt, defense: false, race: card.race ?? 'neutral', element: card.element ?? 'none', statuses: {} });
    emitVfx('play-card', { cardId: card.id });
    bumpQuestMetric('cardsPlayed', 1);
    render();
    renderPanels();
    return;
  }
  if (card.type === 'spell' && state.playerMinions.length > 0 && state.enemyMinions.length > 0) {
    const spell = resolveSpellPower(state.playerMinions[0], state.enemyMinions[0], card.damage ?? 0, state, 'player');
    state.enemyMinions[0].health -= spell.power;
    spawnDamageNumber(document.querySelector(`[data-id="${state.enemyMinions[0].id}"]`), spell.power);
    state.hand.splice(index, 1);
    state.mana -= card.cost;
    bumpQuestMetric('cardsPlayed', 1);
    cleanupDead();
    render();
    renderPanels();
  }
}

function attackWith(attackerId, targetId) {
  const attacker = state.playerMinions.find((m) => m.id === attackerId);
  if (!attacker || attacker.defense) return;
  const forcedTaunt = state.enemyMinions.find((m) => m.taunt);
  if (forcedTaunt && targetId !== forcedTaunt.id) return;
  const attackerEl = document.querySelector(`[data-id="${attacker.id}"]`);
  const targetEl = document.querySelector(`[data-target-id="${targetId}"]`);
  if (targetId === 'enemy-hero') {
    if (state.enemyMinions.length > 0) return;
    state.enemyHealth -= attacker.attack;
    spawnDamageNumber(targetEl, attacker.attack);
  } else {
    const defender = state.enemyMinions.find((m) => m.id === targetId);
    if (!defender) return;
    const result = resolveCombat(attacker, defender, state, 'player');
    defender.health -= result.damageToDefender;
    attacker.health -= result.damageToAttacker;
    spawnDamageNumber(document.querySelector(`[data-id="${defender.id}"]`), result.damageToDefender);
    spawnDamageNumber(attackerEl, result.damageToAttacker);
  }
  drawAttackLine(attackerEl, targetEl);
  emitVfx('attack', { attackerId, targetId });
  cleanupDead();
  render();
}

function cleanupDead() {
  state.playerMinions = state.playerMinions.filter((m) => m.health > 0);
  state.enemyMinions = state.enemyMinions.filter((m) => m.health > 0);
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

function spawnDamageNumber(targetEl, amount) {
  if (!targetEl || amount <= 0) return;
  const boardRect = document.querySelector('#board').getBoundingClientRect();
  const rect = targetEl.getBoundingClientRect();
  const node = document.createElement('div');
  node.className = 'damage-float';
  node.textContent = `-${amount}`;
  node.style.left = `${rect.left + rect.width / 2 - boardRect.left}px`;
  node.style.top = `${rect.top + rect.height / 2 - boardRect.top}px`;
  document.querySelector('#float-layer').appendChild(node);
  setTimeout(() => node.remove(), 900);
}

function clearHighlights() {
  document.querySelectorAll('.target-valid,.target-blocked').forEach((el) => el.classList.remove('target-valid', 'target-blocked'));
}

function highlightCardPlayTargets() {
  clearHighlights();
  document.querySelector('#drop-zone').classList.add('target-valid');
}

function highlightAttackTargets(attackerId) {
  clearHighlights();
  const attacker = state.playerMinions.find((m) => m.id === attackerId);
  if (!attacker || attacker.defense) return;
  const taunt = state.enemyMinions.find((m) => m.taunt);
  if (taunt) {
    document.querySelectorAll('#enemy-minions .minion').forEach((node) => node.classList.add(node.dataset.id === taunt.id ? 'target-valid' : 'target-blocked'));
    return;
  }
  const enemyNodes = document.querySelectorAll('#enemy-minions .minion');
  if (enemyNodes.length > 0) enemyNodes.forEach((node) => node.classList.add('target-valid'));
  else document.querySelector('[data-target-id="enemy-hero"]').classList.add('target-valid');
}

function dragWithGhost(node, onMove, onDrop) {
  node.onpointerdown = (event) => {
    const ghost = node.cloneNode(true);
    ghost.classList.add('ghost');
    document.body.appendChild(ghost);
    const move = (e) => { ghost.style.left = `${e.clientX + 6}px`; ghost.style.top = `${e.clientY + 6}px`; onMove(e); };
    move(event);
    const up = (e) => { document.removeEventListener('pointermove', move); onDrop(e); ghost.remove(); clearHighlights(); showHint(''); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  };
}

function enableCardDrag(node, cardId) {
  dragWithGhost(node, () => highlightCardPlayTargets(), (e) => {
    const drop = document.elementFromPoint(e.clientX, e.clientY)?.closest('#drop-zone');
    if (drop) playCard(cardId);
  });
}

function enableAttackDrag(node, attackerId) {
  dragWithGhost(node, () => highlightAttackTargets(attackerId), (e) => {
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-target-id]');
    if (target) attackWith(attackerId, target.dataset.targetId);
  });
}

document.querySelector('#chat-input').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const cmd = event.target.value.trim();
  if (cmd === './DevAbil') {
    setDevUnlocked(true);
    toast('Developer panels unlocked.', 'info');
    log('Dev unlock persisted to localStorage.');
  }
  if (cmd === './ResetProgress') {
    state.profile = resetProfile();
    persistProfile();
    toast('Progress reset to defaults.', 'info');
    renderPanels();
    render();
  }
  event.target.value = '';
});

document.querySelector('#menu-btn').addEventListener('click', () => {
  window.location.href = '../index.html';
});

document.querySelector('#win-demo').addEventListener('click', claimDemoWin);

boot();
