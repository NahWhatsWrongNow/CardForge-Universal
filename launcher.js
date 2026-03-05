const STORAGE_KEY = 'cardforge.profile.v1';
const WORLD_KEY = 'cardforge.world.seed.v1';
const MATCH_KEY = 'cardforge.match.opponent.v1';
const LOCAL_MODE = window.location.protocol === 'file:';

const LOCAL_DATA = {
  aiIndex: { entries: [] },
  quests: { quests: [{ id: 'local-win', goal: 'Win 1 match', metric: 'wins', target: 1, reward: 120 }] },
  store: { products: [{ id: 'local-pack', name: 'Local Starter Pack', price: 60, cardsPerPack: 3, description: 'Fallback local pack.' }] },
  decks: {
    decks: [
      {
        id: 'local-balanced',
        name: 'Local Balanced',
        entries: [
          { cardId: 'local-ember-apprentice', count: 10 },
          { cardId: 'local-ward-guardian', count: 10 },
          { cardId: 'local-rift-scout', count: 10 },
        ],
      },
    ],
  },
  cardex: {
    updatedAt: 'local',
    count: 3,
    cards: [
      { id: 'local-ember-apprentice', name: 'Ember Apprentice', type: 'minion', cost: 1, attack: 2, health: 1, race: 'mage', element: 'fire', rarity: 'common', tags: ['starter'] },
      { id: 'local-ward-guardian', name: 'Ward Guardian', type: 'minion', cost: 2, attack: 2, health: 3, race: 'guardian', element: 'light', rarity: 'rare', tags: ['starter'] },
      { id: 'local-rift-scout', name: 'Rift Scout', type: 'minion', cost: 1, attack: 1, health: 2, race: 'scout', element: 'arcane', rarity: 'common', tags: ['starter'] },
    ],
  },
  aiProfiles: [
    {
      id: 'local-initiate',
      name: 'Mira Vale',
      level: 2,
      deck: [{ name: 'Ember Acolyte', attack: 2, health: 1 }, { name: 'Ward Sentry', attack: 1, health: 3, taunt: true }],
      personality: { title: 'Dimensional Initiate', dimensionTag: '#Aster-2', backstory: 'A careful duelist from the Prism lanes.' },
    },
    {
      id: 'local-sentinel',
      name: 'Gregory Of Oltine',
      level: 5,
      deck: [{ name: 'Oltine Bulwark', attack: 2, health: 4, taunt: true }, { name: 'Rift Lancer', attack: 4, health: 2 }],
      personality: { title: 'Oltine Sentinel', dimensionTag: '#Oltine-Prime', backstory: 'A tactical veteran who defends the fracture gates.' },
    },
  ],
};

const dom = {
  lobbyPanel: document.getElementById('lobby-panel'),
  openLobby: document.getElementById('open-lobby'),
  loadingPanel: document.getElementById('loading-panel'),
  loadingFiles: document.getElementById('loading-files'),
  mapSvg: document.getElementById('dimension-map'),
  mapHoverCard: document.getElementById('map-hover-card'),
  mapOrbitCanvas: document.getElementById('map-orbit-canvas'),
  matchTab: document.getElementById('match-tab'),
  deckTab: document.getElementById('deck-tab'),
  questsTab: document.getElementById('quests-tab'),
  shopTab: document.getElementById('shop-tab'),
  carnifexTab: document.getElementById('carnifex-tab'),
  worldTab: document.getElementById('world-tab'),
  cardexMeta: document.getElementById('cardex-meta'),
  cardexList: document.getElementById('cardex-list'),
  cardexSearch: document.getElementById('cardex-search'),
  dimensionInput: document.getElementById('dimension-input'),
  dimensionLocate: document.getElementById('dimension-locate'),
  dimensionCanvas: document.getElementById('dimension-canvas'),
  lobbyRoomCanvas: document.getElementById('lobby-room-canvas'),
  roomHint: document.getElementById('room-hint'),
  dialogLog: document.getElementById('dialog-log'),
  dialogChoices: document.getElementById('dialog-choices'),
  talkNearby: document.getElementById('talk-nearby'),
  captureTarget: document.getElementById('capture-target'),
  startCapture: document.getElementById('start-capture'),
  captureFeedback: document.getElementById('capture-feedback'),
  captureStage: document.getElementById('capture-stage'),
  lifeforceMeta: document.getElementById('lifeforce-meta'),
  capturedList: document.getElementById('captured-list'),
  traderOffer: document.getElementById('trader-offer'),
  paywallToggle: document.getElementById('paywall-toggle'),
  idleChatter: document.getElementById('idle-chatter'),
  cinematic: document.getElementById('match-cinematic'),
  cinematicPlayer: document.getElementById('cinematic-player'),
  cinematicOpponent: document.getElementById('cinematic-opponent'),
};

let cachedAiProfiles = [];
let mapOrbitHandle = null;
let codexOrbitHandle = null;
let worldRoom = { player: { x: 70, y: 270 }, residents: [] };
let idleChatterTimer = null;
let captureState = null;
let activeDialogAi = null;

function getSessionSeed() {
  let seed = localStorage.getItem(WORLD_KEY);
  if (!seed) {
    seed = `${Date.now()}-${Math.floor(Math.random() * 99999)}`;
    localStorage.setItem(WORLD_KEY, seed);
  }
  return seed;
}

function seededRandom(seed) {
  let t = 0;
  for (let i = 0; i < seed.length; i += 1) t += seed.charCodeAt(i) * (i + 1);
  return () => {
    t = (t * 9301 + 49297) % 233280;
    return t / 233280;
  };
}

function pickRandom(list = [], seed = null) {
  if (list.length === 0) return null;
  if (seed == null) return list[Math.floor(Math.random() * list.length)];
  const rand = seededRandom(seed);
  return list[Math.floor(rand() * list.length)];
}

function loadProfile() {
  const base = {
    economy: { gold: 400, lifeforce: 0 },
    stats: { wins: 0, losses: 0, streak: 0 },
    collection: {},
    customDecks: [],
    starterDeckId: 'starter-balanced-core',
    discoveredDimensions: [],
    defeatedAiIds: [],
    lobbyResidents: [],
    carnexCodes: {},
    capturedCards: {},
    paywallMode: false,
    questProgress: {},
    questClaims: {},
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      ...base,
      ...parsed,
      economy: { ...base.economy, ...(parsed.economy ?? {}) },
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
      collection: { ...base.collection, ...(parsed.collection ?? {}) },
      discoveredDimensions: [...new Set([...(base.discoveredDimensions || []), ...((parsed.discoveredDimensions) || [])])],
      defeatedAiIds: [...new Set([...(base.defeatedAiIds || []), ...((parsed.defeatedAiIds) || [])])],
      lobbyResidents: [...new Set([...(base.lobbyResidents || []), ...((parsed.lobbyResidents) || [])])],
      carnexCodes: { ...base.carnexCodes, ...(parsed.carnexCodes ?? {}) },
      capturedCards: { ...base.capturedCards, ...(parsed.capturedCards ?? {}) },
      questProgress: { ...base.questProgress, ...(parsed.questProgress ?? {}) },
      questClaims: { ...base.questClaims, ...(parsed.questClaims ?? {}) },
    };
  } catch {
    return base;
  }
}

function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

async function loadJson(path, fallback) {
  if (LOCAL_MODE) return fallback;
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw error;
  }
}

function mapStatus(profileState, aiProfile) {
  const gate = Math.max(0, (aiProfile.level ?? 1) - 3);
  const defeated = (profileState.defeatedAiIds ?? []).includes(aiProfile.id);
  const unlockedByWins = (profileState.stats?.wins ?? 0) >= gate;
  const unlocked = defeated || unlockedByWins;
  const inLobby = (profileState.lobbyResidents ?? []).includes(aiProfile.id) || defeated;
  return { gate, defeated, unlocked, inLobby };
}

function showTab(tab) {
  ['match', 'deck', 'quests', 'shop', 'carnifex', 'world'].forEach((id) => {
    document.getElementById(`${id}-tab`).classList.toggle('hidden', id !== tab);
  });

  if (tab === 'world') {
    renderWorldTab(cachedAiProfiles);
  }
}

document.querySelectorAll('[data-tab]').forEach((button) => {
  button.onclick = () => showTab(button.dataset.tab);
});

async function loadAiProfiles() {
  if (LOCAL_MODE) return LOCAL_DATA.aiProfiles;
  const idx = await loadJson('./game/ai_packs/index.json', LOCAL_DATA.aiIndex);
  const out = [];
  for (const entry of idx.entries ?? []) {
    const data = await loadJson(`./game/ai_packs/${entry}`, null);
    if (data?.personality) out.push(data);
  }
  return out.sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
}

function buildMapPositions(profiles, width, height) {
  const rand = seededRandom(`${getSessionSeed()}-map-layout-${profiles.length}`);
  const nodes = [];
  const margin = 34;

  for (const profile of profiles) {
    let chosen = null;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const x = margin + rand() * (width - (margin * 2));
      const y = margin + rand() * (height - (margin * 2));
      const minDistance = 52;
      const valid = nodes.every((node) => Math.hypot(node.x - x, node.y - y) >= minDistance);
      if (valid) {
        chosen = { x, y };
        break;
      }
    }

    if (!chosen) {
      const i = nodes.length;
      chosen = {
        x: margin + ((i % 8) * ((width - margin * 2) / 7)),
        y: margin + (Math.floor(i / 8) * 62),
      };
    }

    nodes.push({
      id: profile.id,
      profile,
      x: chosen.x,
      y: chosen.y,
      radius: 12 + Math.min(7, Math.floor((profile.level ?? 1) / 3)),
    });
  }

  return nodes;
}

function nodeColor(profile, status) {
  if (status.defeated) return '#7dffa2';
  if (!status.unlocked) return '#7883a9';
  if ((profile.level ?? 1) >= 11) return '#ff8b6b';
  if ((profile.level ?? 1) >= 7) return '#ffd36d';
  return '#7fb4ff';
}
function startOrbitAnimation(canvas, handleKey, label, difficulty = 1, owner = 'Unknown') {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const seed = `${getSessionSeed()}-${label}-${owner}`;
  const rand = seededRandom(seed);
  const count = 5 + Math.max(0, Math.min(3, Math.floor(difficulty / 4)));
  const planets = Array.from({ length: count }, (_, i) => ({
    r: 28 + (i * 18),
    angle: rand() * Math.PI * 2,
    speed: 0.004 + (i * 0.0014) + (difficulty * 0.0001),
    size: 3 + rand() * (5 + Math.min(4, difficulty / 4)),
    color: `hsl(${Math.floor(rand() * 360)}, 86%, 62%)`,
  }));

  if (handleKey === 'map' && mapOrbitHandle) cancelAnimationFrame(mapOrbitHandle);
  if (handleKey === 'codex' && codexOrbitHandle) cancelAnimationFrame(codexOrbitHandle);

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#060c1d');
    gradient.addColorStop(1, '#140d2b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.fillStyle = '#ffe39a';
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();

    planets.forEach((planet) => {
      ctx.strokeStyle = 'rgba(130, 170, 255, 0.30)';
      ctx.beginPath();
      ctx.arc(cx, cy, planet.r, 0, Math.PI * 2);
      ctx.stroke();

      planet.angle += planet.speed;
      const px = cx + Math.cos(planet.angle) * planet.r;
      const py = cy + Math.sin(planet.angle) * planet.r;
      ctx.fillStyle = planet.color;
      ctx.beginPath();
      ctx.arc(px, py, planet.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#bdd1ff';
    ctx.font = '12px system-ui';
    ctx.fillText(`Dimension: ${label}`, 10, 18);
    ctx.fillText(`Owner: ${owner}`, 10, 34);

    if (handleKey === 'map') mapOrbitHandle = requestAnimationFrame(draw);
    else codexOrbitHandle = requestAnimationFrame(draw);
  };

  draw();
}

function renderBattleMap(profiles, profileState) {
  const svg = dom.mapSvg;
  const width = 900;
  const height = 360;
  svg.innerHTML = '';

  const nodes = buildMapPositions(profiles, width, height);

  for (let i = 0; i < nodes.length; i += 1) {
    const source = nodes[i];
    const nearest = [...nodes]
      .filter((node) => node.id !== source.id)
      .sort((a, b) => Math.hypot(a.x - source.x, a.y - source.y) - Math.hypot(b.x - source.x, b.y - source.y))
      .slice(0, 2);

    for (const target of nearest) {
      if (source.id > target.id) continue;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(source.x));
      line.setAttribute('y1', String(source.y));
      line.setAttribute('x2', String(target.x));
      line.setAttribute('y2', String(target.y));
      line.setAttribute('stroke', 'rgba(120, 146, 206, 0.35)');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '6 7');
      svg.appendChild(line);
    }
  }

  for (const node of nodes) {
    const status = mapStatus(profileState, node.profile);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('dim-node');
    g.dataset.id = node.id;

    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', String(node.x));
    ring.setAttribute('cy', String(node.y));
    ring.setAttribute('r', String(node.radius + 5));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'rgba(160, 190, 255, 0.3)');
    ring.setAttribute('stroke-width', '1.5');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(node.x));
    circle.setAttribute('cy', String(node.y));
    circle.setAttribute('r', String(node.radius));
    circle.setAttribute('fill', nodeColor(node.profile, status));
    circle.setAttribute('stroke', status.unlocked ? '#d9ebff' : '#5f6c8f');
    circle.setAttribute('stroke-width', status.unlocked ? '2.4' : '1.5');

    const level = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    level.textContent = String(node.profile.level ?? 1);
    level.setAttribute('x', String(node.x));
    level.setAttribute('y', String(node.y + 4));
    level.setAttribute('text-anchor', 'middle');
    level.setAttribute('fill', '#061022');
    level.setAttribute('font-size', '11');
    level.setAttribute('font-weight', '700');

    const name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    name.textContent = node.profile.name;
    name.setAttribute('x', String(node.x));
    name.setAttribute('y', String(node.y - (node.radius + 10)));
    name.setAttribute('text-anchor', 'middle');
    name.setAttribute('fill', '#d9e8ff');
    name.setAttribute('font-size', '10');

    g.appendChild(ring);
    g.appendChild(circle);
    g.appendChild(level);
    g.appendChild(name);

    g.addEventListener('mouseenter', () => {
      g.classList.add('hovered');
      const statusLabel = status.defeated
        ? 'Defeated and moved to lobby dimension'
        : status.unlocked
          ? 'Unlocked'
          : `Locked (needs ${status.gate} wins)`;
      dom.mapHoverCard.innerHTML = `
        <h4>${node.profile.name} (Lvl ${node.profile.level ?? 1})</h4>
        <div><strong>Dimension:</strong> ${node.profile.personality?.dimensionTag ?? '#Unknown'}</div>
        <div><strong>Owner:</strong> ${node.profile.personality?.title ?? 'Unknown Guardian'}</div>
        <div><strong>Status:</strong> ${statusLabel}</div>
        <div><strong>Carnex Code:</strong> ${(profileState.carnexCodes ?? {})[node.profile.id] ? 'Unlocked' : 'Not earned'}</div>
      `;
      dom.mapHoverCard.classList.remove('hidden');
      startOrbitAnimation(dom.mapOrbitCanvas, 'map', node.profile.personality?.dimensionTag ?? node.profile.name, node.profile.level ?? 1, node.profile.name);
    });

    g.addEventListener('mouseleave', () => {
      g.classList.remove('hovered');
    });

    g.addEventListener('click', () => {
      if (status.unlocked) startCinematic('Novice', node.profile);
    });

    svg.appendChild(g);
  }

  svg.onmouseleave = () => {
    dom.mapHoverCard.classList.add('hidden');
  };
}

function addDialogLine(role, text) {
  const row = document.createElement('div');
  row.className = `dialog-row ${role}`;
  row.textContent = `${role === 'ai' ? 'AI' : 'You'}: ${text}`;
  dom.dialogLog.prepend(row);
}

function buildDialogueChoices(ai, profileState) {
  const status = mapStatus(profileState, ai);
  const codeUnlocked = !!(profileState.carnexCodes ?? {})[ai.id];
  return [
    {
      label: 'Challenge',
      action: () => {
        addDialogLine('you', 'I challenge your dimension.');
        addDialogLine('ai', status.unlocked ? 'Then sharpen your deck and step into the rift.' : `You are not ready. Win ${status.gate} matches first.`);
        if (status.unlocked) startCinematic('Novice', ai);
      },
    },
    {
      label: 'Ask Lore',
      action: () => {
        addDialogLine('you', 'Tell me about your world.');
        addDialogLine('ai', ai.personality?.backstory ?? `${ai.name}'s world remains undocumented.`);
      },
    },
    {
      label: 'Ask Carnex Code',
      action: () => {
        addDialogLine('you', 'Give me your Carnex dimensional code.');
        if (codeUnlocked) {
          addDialogLine('ai', `Code verified: ${(profileState.carnexCodes ?? {})[ai.id]}. You may hunt this dimension's creatures.`);
        } else {
          addDialogLine('ai', 'Defeat me first. The code is earned, never gifted.');
        }
      },
    },
    {
      label: 'Capture Rights',
      action: () => {
        addDialogLine('you', 'Authorize creature capture rights.');
        if (status.defeated) addDialogLine('ai', 'Rights granted. Survive the reaction trial and the creatures are yours.');
        else addDialogLine('ai', 'No rights. Win the battle for this dimension first.');
      },
    },
    {
      label: 'Leave',
      action: () => {
        addDialogLine('you', 'We are done for now.');
        addDialogLine('ai', 'Then we speak again across the next rift.');
      },
    },
  ];
}

function openDialogue(ai) {
  if (!ai) return;
  activeDialogAi = ai;
  const profileState = loadProfile();
  addDialogLine('ai', `${ai.name}, ${ai.personality?.title ?? 'Dimensional Warden'} of ${ai.personality?.dimensionTag ?? '#Unknown'}. Speak.`);

  dom.dialogChoices.innerHTML = '';
  const choices = buildDialogueChoices(ai, profileState);
  choices.forEach((choice) => {
    const button = document.createElement('button');
    button.textContent = choice.label;
    button.onclick = () => choice.action();
    dom.dialogChoices.appendChild(button);
  });
}

function startCinematic(playerName, aiProfile) {
  localStorage.setItem(MATCH_KEY, aiProfile.id);
  dom.cinematicPlayer.textContent = playerName;
  dom.cinematicOpponent.textContent = aiProfile.name;
  dom.cinematic.classList.remove('hidden');
  setTimeout(() => dom.cinematic.classList.add('fade'), 240);
  setTimeout(() => window.location.assign('./game/index.html'), 2200);
}

async function renderMatchTab(profiles) {
  const host = dom.matchTab;
  const profileState = loadProfile();
  host.innerHTML = '<h3>Select Opponent Dimension</h3>';
  const list = document.createElement('div');
  list.id = 'deck-list';

  profiles.forEach((ai) => {
    const status = mapStatus(profileState, ai);
    const row = document.createElement('article');
    const statusLabel = status.defeated ? 'Defeated (in lobby)' : status.unlocked ? 'Unlocked' : `Locked: win ${status.gate} total matches`;
    row.innerHTML = `
      <strong>${ai.name}</strong> — Lvl ${ai.level ?? 1}
      <div>${ai.personality?.title ?? 'Unknown'} ${ai.personality?.dimensionTag ?? '#Unknown'}</div>
      <small>${ai.personality?.backstory ?? ''}</small>
      <div><strong>Status:</strong> ${statusLabel}</div>
    `;

    const matchButton = document.createElement('button');
    matchButton.textContent = 'Matchmake';
    matchButton.disabled = !status.unlocked;
    matchButton.onclick = () => startCinematic('Novice', ai);

    const talkButton = document.createElement('button');
    talkButton.textContent = 'Talk';
    talkButton.onclick = () => openDialogue(ai);

    row.appendChild(matchButton);
    row.appendChild(talkButton);
    list.appendChild(row);
  });

  host.appendChild(list);
  renderBattleMap(profiles, profileState);
}
async function renderQuestTab() {
  const host = dom.questsTab;
  const profile = loadProfile();
  const qp = await loadJson('./game/quest_packs/daily.json', LOCAL_DATA.quests);
  const quests = qp.quests || [];
  host.innerHTML = '<h3>Quest Board</h3>';

  quests.forEach((q) => {
    const current = profile.questProgress?.[q.metric] ?? 0;
    const done = current >= q.target;
    const claimed = !!(profile.questClaims || {})[q.id];
    const row = document.createElement('article');
    row.innerHTML = `<strong>${q.goal}</strong><div>${current}/${q.target} • Reward ${q.reward}g</div>`;

    const button = document.createElement('button');
    button.textContent = claimed ? 'Claimed' : 'Claim';
    button.disabled = claimed || !done;
    button.onclick = () => {
      profile.questClaims = profile.questClaims || {};
      profile.economy = profile.economy || { gold: 0, lifeforce: 0 };
      profile.questClaims[q.id] = true;
      profile.economy.gold = (profile.economy.gold || 0) + q.reward;
      saveProfile(profile);
      renderQuestTab();
      renderShopTab();
    };

    row.appendChild(button);
    host.appendChild(row);
  });
}

async function renderDeckTab() {
  const host = dom.deckTab;
  const profile = loadProfile();
  const cards = (await loadJson('./cardex.json', LOCAL_DATA.cardex)).cards;
  const deckPack = await loadJson('./game/deck_packs/starter_decks.json', LOCAL_DATA.decks);
  const allDecks = [...(deckPack.decks || []), ...(profile.customDecks || [])];

  host.innerHTML = '<h3>Deck Builder + Simulator</h3>';
  const select = document.createElement('select');
  allDecks.forEach((deck) => {
    const option = document.createElement('option');
    option.value = deck.id;
    option.textContent = `${deck.name} (${deck.entries.reduce((sum, entry) => sum + entry.count, 0)}/30)`;
    option.selected = deck.id === profile.starterDeckId;
    select.appendChild(option);
  });
  host.appendChild(select);

  const setButton = document.createElement('button');
  setButton.textContent = 'Set as Simulation Deck';
  setButton.onclick = () => {
    profile.starterDeckId = select.value;
    saveProfile(profile);
  };
  host.appendChild(setButton);

  const cloneButton = document.createElement('button');
  cloneButton.textContent = 'Save Copy to Custom Decks';
  cloneButton.onclick = () => {
    const chosen = allDecks.find((deck) => deck.id === select.value);
    if (!chosen) return;
    const cloned = { ...chosen, id: `${chosen.id}-custom-${Date.now()}`, name: `${chosen.name} (Custom)` };
    profile.customDecks = [...(profile.customDecks || []), cloned];
    saveProfile(profile);
    renderDeckTab();
  };
  host.appendChild(cloneButton);

  const list = document.createElement('div');
  list.id = 'deck-list';
  const selectedDeck = allDecks.find((deck) => deck.id === select.value) || allDecks[0];
  (selectedDeck?.entries || []).forEach((entry) => {
    const card = cards.find((c) => c.id === entry.cardId);
    const row = document.createElement('article');
    row.textContent = `${entry.count}x ${card?.name || entry.cardId}`;
    list.appendChild(row);
  });
  host.appendChild(list);
}

async function renderShopTab() {
  const host = dom.shopTab;
  const profile = loadProfile();
  const store = await loadJson('./game/store_packs/starter_store.json', LOCAL_DATA.store);
  host.innerHTML = `<h3>Shop</h3><div>Gold: ${profile.economy?.gold ?? 0}</div>`;

  (store.products || []).forEach((product) => {
    const row = document.createElement('article');
    row.innerHTML = `<strong>${product.name}</strong> (${product.price}g)<div>${product.description ?? 'Dimensional pack'}</div>`;
    host.appendChild(row);
  });
}

function drawDimensionByName(name) {
  startOrbitAnimation(dom.dimensionCanvas, 'codex', name, 8, 'Codex Projection');
}

function describeRarity(cardName) {
  const n = cardName.toLowerCase();
  if (n.includes('legend') || n.includes('tyrant') || n.includes('reaper')) return { rarity: 'legendary', scrap: 14 };
  if (n.includes('epic') || n.includes('fractal') || n.includes('axiom')) return { rarity: 'epic', scrap: 9 };
  if (n.includes('rare') || n.includes('warden')) return { rarity: 'rare', scrap: 6 };
  return { rarity: 'common', scrap: 4 };
}

function traderPool(profiles) {
  const pool = [];
  profiles.forEach((ai) => {
    (ai.deck ?? ai.summons ?? []).forEach((unit) => {
      pool.push({
        name: unit.name,
        owner: ai.name,
        dimension: ai.personality?.dimensionTag ?? '#Unknown',
        level: ai.level ?? 1,
      });
    });
  });
  return pool;
}

function getTraderOffer(profile, profiles) {
  const today = new Date().toISOString().slice(0, 10);
  if (profile.traderOffer?.day === today) return profile.traderOffer;

  const pool = traderPool(profiles);
  if (!pool.length) return null;

  const rand = seededRandom(`${today}-${getSessionSeed()}-trader`);
  const pick = pool[Math.floor(rand() * pool.length)];
  const cost = 18 + Math.floor((pick.level ?? 1) * 1.6);
  const offer = {
    day: today,
    card: pick.name,
    owner: pick.owner,
    dimension: pick.dimension,
    cost,
  };
  profile.traderOffer = offer;
  saveProfile(profile);
  return offer;
}

function renderInventoryAndTrader(profiles) {
  const profile = loadProfile();
  const cards = Object.entries(profile.capturedCards ?? {}).filter(([, count]) => count > 0);

  dom.lifeforceMeta.textContent = `Lifeforce: ${profile.economy?.lifeforce ?? 0}`;
  dom.capturedList.innerHTML = cards.length ? '' : '<div>No captured creatures yet.</div>';

  cards.forEach(([name, count]) => {
    const row = document.createElement('div');
    row.className = 'inventory-row';
    row.innerHTML = `<span>${name} x${count}</span>`;

    const scrapButton = document.createElement('button');
    scrapButton.textContent = 'Scrap 1';
    scrapButton.onclick = () => {
      const rarity = describeRarity(name);
      const next = loadProfile();
      next.capturedCards[name] = Math.max(0, (next.capturedCards[name] ?? 0) - 1);
      if (next.capturedCards[name] === 0) delete next.capturedCards[name];
      next.economy.lifeforce = (next.economy.lifeforce ?? 0) + rarity.scrap;
      saveProfile(next);
      renderInventoryAndTrader(profiles);
      dom.captureFeedback.textContent = `Scrapped ${name} for ${rarity.scrap} lifeforce.`;
    };

    row.appendChild(scrapButton);
    dom.capturedList.appendChild(row);
  });

  const offer = getTraderOffer(profile, profiles);
  if (!offer) {
    dom.traderOffer.textContent = 'Trader unavailable.';
  } else {
    dom.traderOffer.innerHTML = `
      <h4>Dimensional Trader</h4>
      <div>${offer.card} (${offer.dimension})</div>
      <div>Cost: ${offer.cost} lifeforce</div>
    `;

    const buy = document.createElement('button');
    buy.textContent = 'Buy Card';
    buy.disabled = (profile.economy?.lifeforce ?? 0) < offer.cost;
    buy.onclick = () => {
      const next = loadProfile();
      if ((next.economy?.lifeforce ?? 0) < offer.cost) return;
      next.economy.lifeforce -= offer.cost;
      next.capturedCards[offer.card] = (next.capturedCards[offer.card] ?? 0) + 1;
      saveProfile(next);
      renderInventoryAndTrader(profiles);
      dom.captureFeedback.textContent = `Purchased ${offer.card} from ${offer.owner}.`;
    };

    dom.traderOffer.appendChild(buy);
  }

  dom.paywallToggle.checked = !!profile.paywallMode;
  dom.paywallToggle.onchange = () => {
    const next = loadProfile();
    next.paywallMode = dom.paywallToggle.checked;
    saveProfile(next);
  };
}
function closestResident() {
  let closest = null;
  let bestDist = Infinity;
  for (const resident of worldRoom.residents) {
    const dist = Math.hypot(resident.x - worldRoom.player.x, resident.y - worldRoom.player.y);
    if (dist < bestDist) {
      bestDist = dist;
      closest = resident;
    }
  }
  return bestDist <= 70 ? closest : null;
}

function renderWorldRoom(aiProfiles) {
  const canvas = dom.lobbyRoomCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#0f1a32');
  bg.addColorStop(1, '#111428');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#44588f';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  for (let i = 0; i < 90; i += 1) {
    ctx.fillStyle = `rgba(180, 210, 255, ${0.08 + (i % 5) * 0.02})`;
    ctx.fillRect((i * 41) % canvas.width, (i * 67) % canvas.height, 2, 2);
  }

  worldRoom.residents.forEach((resident) => {
    const color = resident.defeated ? '#7dffa2' : '#9ab7ff';
    ctx.fillStyle = color;
    ctx.fillRect(resident.x - 11, resident.y - 11, 22, 22);
    ctx.fillStyle = '#dbe9ff';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(resident.name, resident.x, resident.y - 16);
  });

  ctx.fillStyle = '#ffd977';
  ctx.fillRect(worldRoom.player.x - 10, worldRoom.player.y - 10, 20, 20);
  ctx.fillStyle = '#111';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('You', worldRoom.player.x, worldRoom.player.y - 14);

  const nearby = closestResident();
  dom.roomHint.textContent = nearby
    ? `Near ${nearby.name}. Press Talk Nearby to open dialogue.`
    : 'Move around the room to approach defeated AI residents.';

  canvas.onclick = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const hit = worldRoom.residents.find((resident) => Math.hypot(resident.x - x, resident.y - y) <= 16);
    if (hit) {
      const ai = aiProfiles.find((entry) => entry.id === hit.id);
      if (ai) openDialogue(ai);
    }
  };
}

function movePlayer(direction, aiProfiles) {
  const speed = 18;
  if (direction === 'up') worldRoom.player.y -= speed;
  if (direction === 'down') worldRoom.player.y += speed;
  if (direction === 'left') worldRoom.player.x -= speed;
  if (direction === 'right') worldRoom.player.x += speed;

  worldRoom.player.x = Math.max(18, Math.min(dom.lobbyRoomCanvas.width - 18, worldRoom.player.x));
  worldRoom.player.y = Math.max(18, Math.min(dom.lobbyRoomCanvas.height - 18, worldRoom.player.y));
  renderWorldRoom(aiProfiles);
}

function updateCaptureTargetSelect(aiProfiles) {
  const profile = loadProfile();
  dom.captureTarget.innerHTML = '';

  const defeated = aiProfiles.filter((ai) => mapStatus(profile, ai).defeated);
  defeated.forEach((ai) => {
    const option = document.createElement('option');
    option.value = ai.id;
    option.textContent = `${ai.name} (${ai.personality?.dimensionTag ?? '#Unknown'})`;
    dom.captureTarget.appendChild(option);
  });

  if (!defeated.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Defeat an AI to unlock captures';
    dom.captureTarget.appendChild(option);
  }
}

function clearCaptureTimers() {
  if (!captureState) return;
  (captureState.timers ?? []).forEach((timer) => clearTimeout(timer));
  captureState = null;
}

function reactionRating(ms) {
  if (ms <= 180) return { label: 'perfect', points: 4 };
  if (ms <= 290) return { label: 'good', points: 3 };
  if (ms <= 430) return { label: 'awful', points: 1 };
  return { label: 'pathetic', points: 0 };
}

function captureCardName(ai, index) {
  const pool = (ai.deck ?? ai.summons ?? [{ name: `${ai.name} Echoling` }]).map((unit) => unit.name);
  const base = pool[index % Math.max(1, pool.length)] ?? `${ai.name} Echoling`;
  return `${base} (Captured)`;
}

function startCaptureMinigame(aiProfiles) {
  const targetId = dom.captureTarget.value;
  const ai = aiProfiles.find((entry) => entry.id === targetId);
  if (!ai) {
    dom.captureFeedback.textContent = 'No valid capture target selected.';
    return;
  }

  const profile = loadProfile();
  const status = mapStatus(profile, ai);
  if (!status.defeated) {
    dom.captureFeedback.textContent = 'You must defeat that AI before capture expeditions unlock.';
    return;
  }

  clearCaptureTimers();
  dom.captureStage.innerHTML = '';
  dom.captureStage.classList.add('active');
  dom.captureFeedback.textContent = `Capture trial initiated against ${ai.name}...`;

  const rounds = 8;
  const difficulty = Math.min(12, ai.level ?? 1);
  captureState = { timers: [], running: true, points: 0, round: 0 };

  const runRound = () => {
    if (!captureState?.running) return;

    if (captureState.round >= rounds) {
      const score = captureState.points;
      const chance = Math.max(0.12, Math.min(0.92, (score / (rounds * 4)) + (0.22 - (difficulty * 0.01))));
      const won = Math.random() < chance;
      if (won) {
        const cardName = captureCardName(ai, Math.floor(Math.random() * 50));
        const next = loadProfile();
        next.capturedCards[cardName] = (next.capturedCards[cardName] ?? 0) + 1;
        saveProfile(next);
        dom.captureFeedback.textContent = `Capture success: ${cardName}`;
        renderInventoryAndTrader(aiProfiles);
      } else {
        dom.captureFeedback.textContent = 'Capture failed. Try again after calibrating your reactions.';
      }
      dom.captureStage.classList.remove('active');
      dom.captureStage.innerHTML = '';
      captureState.running = false;
      return;
    }

    captureState.round += 1;
    dom.captureStage.innerHTML = '';

    const delay = 220 + Math.floor(Math.random() * 380);
    const spawnTimer = setTimeout(() => {
      if (!captureState?.running) return;

      const target = document.createElement('button');
      target.className = 'capture-target';
      const colors = ['#ff356e', '#48d7ff', '#8eff62'];
      target.style.background = colors[(captureState.round + difficulty) % colors.length];
      target.style.left = `${12 + Math.random() * 76}%`;
      target.style.top = `${12 + Math.random() * 70}%`;
      dom.captureStage.appendChild(target);

      const spawnedAt = performance.now();
      let settled = false;

      const resolveRound = (rating) => {
        if (settled) return;
        settled = true;
        dom.captureFeedback.textContent = `${ai.name} trial: ${rating.label}`;
        captureState.points += rating.points;
        target.remove();
        const nextTimer = setTimeout(runRound, 320);
        captureState.timers.push(nextTimer);
      };

      target.onclick = () => {
        const reaction = performance.now() - spawnedAt;
        resolveRound(reactionRating(reaction));
      };

      const timeout = setTimeout(() => resolveRound({ label: 'pathetic', points: 0 }), Math.max(360, 860 - (difficulty * 35)));
      captureState.timers.push(timeout);
    }, delay);

    captureState.timers.push(spawnTimer);
  };

  runRound();
}
function startIdleChatter(aiProfiles) {
  if (idleChatterTimer) clearInterval(idleChatterTimer);
  const profile = loadProfile();
  const residents = aiProfiles.filter((ai) => mapStatus(profile, ai).inLobby);

  if (residents.length < 2) {
    dom.idleChatter.innerHTML = '<div>Defeat more AIs to populate lobby chatter.</div>';
    return;
  }

  const lines = [
    'Your summons were sloppy in the fifth branch timeline.',
    'No, your rift signature drifted by twelve vectors.',
    'The trader overcharged lifeforce again.',
    'I still remember the duel where you dropped lethal.',
    'Their deck curve improves each week. We should test them again.',
  ];

  const pushLine = () => {
    const a = residents[Math.floor(Math.random() * residents.length)];
    let b = residents[Math.floor(Math.random() * residents.length)];
    if (residents.length > 1) {
      while (b.id === a.id) b = residents[Math.floor(Math.random() * residents.length)];
    }
    const line = pickRandom(lines, `${Date.now()}-${a.id}-${b.id}`);
    const row = document.createElement('div');
    row.textContent = `${a.name}: "${line}"  |  ${b.name}: "Noted."`;
    dom.idleChatter.prepend(row);
    while (dom.idleChatter.childElementCount > 14) dom.idleChatter.removeChild(dom.idleChatter.lastChild);
  };

  pushLine();
  idleChatterTimer = setInterval(pushLine, 6000);
}

function buildWorldResidents(aiProfiles) {
  const profile = loadProfile();
  const residents = aiProfiles.filter((ai) => mapStatus(profile, ai).inLobby);
  const rand = seededRandom(`${getSessionSeed()}-room-${residents.length}`);

  worldRoom = {
    player: worldRoom.player ?? { x: 70, y: 270 },
    residents: residents.map((ai, idx) => ({
      id: ai.id,
      name: ai.name,
      defeated: mapStatus(profile, ai).defeated,
      x: 90 + ((idx % 5) * 95) + (rand() * 26),
      y: 86 + (Math.floor(idx / 5) * 86) + (rand() * 22),
    })),
  };
}

function renderWorldTab(aiProfiles) {
  buildWorldResidents(aiProfiles);
  renderWorldRoom(aiProfiles);
  updateCaptureTargetSelect(aiProfiles);
  renderInventoryAndTrader(aiProfiles);
  startIdleChatter(aiProfiles);
}

async function renderCarnifex() {
  const payload = await loadJson('./cardex.json', LOCAL_DATA.cardex);
  dom.cardexMeta.textContent = `Updated: ${payload.updatedAt ?? 'unknown'} • Cards: ${payload.count ?? payload.cards.length}`;

  const render = () => {
    const q = dom.cardexSearch.value.trim().toLowerCase();
    dom.cardexList.innerHTML = '';

    payload.cards
      .filter((card) => `${card.name} ${card.type} ${(card.tags || []).join(' ')} ${JSON.stringify(card.ability || {})} ${card.bibliography || ''}`.toLowerCase().includes(q))
      .slice(0, 300)
      .forEach((card) => {
        const row = document.createElement('article');
        row.className = `rarity-${card.rarity} cardex-card`;
        row.innerHTML = `<strong>${card.name}</strong> <span>${card.type} • ${card.rarity}</span><div>Cost ${card.cost} • ${card.ability?.action || 'none'} ${card.ability?.amount || ''}</div><small>${card.bibliography || ''}</small>`;
        dom.cardexList.appendChild(row);
      });
  };

  dom.cardexSearch.oninput = render;
  render();

  dom.dimensionLocate.onclick = () => {
    const name = dom.dimensionInput.value.trim() || 'Unknown';
    drawDimensionByName(name);
    const profile = loadProfile();
    if (!(profile.discoveredDimensions ?? []).includes(name)) {
      profile.discoveredDimensions.push(name);
      saveProfile(profile);
    }
  };
}

function bindWorldControls() {
  document.querySelectorAll('[data-move]').forEach((button) => {
    button.onclick = () => movePlayer(button.dataset.move, cachedAiProfiles);
  });

  dom.talkNearby.onclick = () => {
    const nearby = closestResident();
    if (!nearby) {
      dom.roomHint.textContent = 'No AI close enough to talk. Move closer.';
      return;
    }
    const ai = cachedAiProfiles.find((entry) => entry.id === nearby.id);
    if (ai) openDialogue(ai);
  };

  dom.startCapture.onclick = () => startCaptureMinigame(cachedAiProfiles);

  window.addEventListener('keydown', (event) => {
    if (dom.worldTab.classList.contains('hidden')) return;
    if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') movePlayer('up', cachedAiProfiles);
    if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') movePlayer('down', cachedAiProfiles);
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') movePlayer('left', cachedAiProfiles);
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') movePlayer('right', cachedAiProfiles);
  });
}

function configureSchemeToggle() {
  const schemeSelect = document.getElementById('lobby-scheme');
  const saved = localStorage.getItem('cardforge.lobby.scheme') || 'arcane';
  schemeSelect.value = saved;
  document.body.classList.toggle('scheme-monarch', saved === 'monarch');
  schemeSelect.onchange = () => {
    const value = schemeSelect.value;
    localStorage.setItem('cardforge.lobby.scheme', value);
    document.body.classList.toggle('scheme-monarch', value === 'monarch');
  };
}

async function openLobbyPanel() {
  const push = (msg) => {
    const row = document.createElement('div');
    row.textContent = msg;
    dom.loadingFiles.prepend(row);
  };

  dom.loadingPanel.classList.remove('hidden');
  dom.loadingFiles.innerHTML = '';

  push('Loading AI packs and dimension statuses...');
  cachedAiProfiles = await loadAiProfiles();

  push('Rendering matchmaking map...');
  await renderMatchTab(cachedAiProfiles);

  push('Rendering deck systems...');
  await renderDeckTab();

  push('Loading quests...');
  await renderQuestTab();

  push('Rendering shop...');
  await renderShopTab();

  push('Loading codex and orbit systems...');
  await renderCarnifex();

  push('Booting lobby dimension room...');
  renderWorldTab(cachedAiProfiles);

  dom.loadingPanel.classList.add('hidden');
  dom.lobbyPanel.classList.remove('hidden');
  showTab('match');
}

configureSchemeToggle();
bindWorldControls();
dom.openLobby.onclick = openLobbyPanel;
if (window.location.hash === '#lobby') openLobbyPanel();
