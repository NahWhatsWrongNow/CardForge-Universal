import { Registry } from '../core/registry.js';
import { loadPlugins } from '../core/loader.js';
import { loadProfile, saveProfile, setDevUnlocked } from '../core/storage.js';
import { toast, uid } from '../core/utils.js';

const registry = new Registry();
const state = {
  playerHealth: 30,
  enemyHealth: 30,
  mana: 3,
  hand: [],
  playerMinions: [],
  enemyMinions: [
    { id: uid('enemy'), name: 'Guard Pup', attack: 1, health: 3, taunt: true, defense: false },
  ],
};

const log = (msg) => {
  const host = document.querySelector('#log');
  host.innerHTML = `<div>${msg}</div>` + host.innerHTML;
};

async function boot() {
  const errors = await loadPlugins(registry, [
    { manifest: './mode_packs/index.json', base: './mode_packs', type: 'mode-pack', kind: 'modes' },
    { manifest: './ai_packs/index.json', base: './ai_packs', type: 'ai-pack', kind: 'ai' },
    { manifest: '../packs/index.json', base: '../packs', type: 'card-pack', kind: 'cardPacks' },
  ], log);
  errors.forEach((error) => log(`Error: ${error}`));

  const cards = registry.list('cardPacks').flatMap((pack) => pack.cards);
  state.hand = cards.slice(0, 4).map((card) => ({ ...card, instanceId: uid('card') }));
  render();
}

function render() {
  document.querySelector('#player-health').textContent = state.playerHealth;
  document.querySelector('#enemy-health').textContent = state.enemyHealth;

  const handHost = document.querySelector('#hand');
  handHost.innerHTML = '';
  state.hand.forEach((card) => {
    const node = document.createElement('div');
    node.className = 'card';
    node.dataset.id = card.instanceId;
    node.innerHTML = `<strong>${card.name}</strong><div>${card.type}</div><div>${card.cost} mana</div>`;
    enableDrag(node, () => playCard(card.instanceId));
    handHost.appendChild(node);
  });

  renderLane('#player-minions', state.playerMinions, true);
  renderLane('#enemy-minions', state.enemyMinions, false);
}

function renderLane(selector, minions, playerOwned) {
  const lane = document.querySelector(selector);
  lane.innerHTML = '';
  minions.forEach((minion) => {
    const node = document.createElement('div');
    node.className = `minion ${minion.taunt ? 'taunt' : ''}`;
    node.dataset.id = minion.id;
    node.dataset.defense = minion.defense;
    node.innerHTML = `<strong>${minion.name}</strong><div>${minion.attack}/${minion.health}</div><button>Defense</button>`;

    node.querySelector('button').onclick = () => {
      minion.defense = !minion.defense;
      log(`${minion.name} ${minion.defense ? 'entered' : 'left'} defense mode.`);
      render();
    };

    if (playerOwned) {
      enableDrag(node, () => attackWith(minion.id));
    }
    lane.appendChild(node);
  });
}

function playCard(cardId) {
  const index = state.hand.findIndex((c) => c.instanceId === cardId);
  if (index === -1) return;
  const card = state.hand[index];
  if (card.type !== 'minion') {
    toast('Only minions are in this demo runtime.', 'info');
    return;
  }
  if (card.cost > state.mana) {
    toast('Not enough mana.', 'error');
    return;
  }
  state.hand.splice(index, 1);
  state.playerMinions.push({ id: uid('m'), name: card.name, attack: card.attack, health: card.health, taunt: !!card.taunt, defense: false });
  log(`Played ${card.name}.`);
  render();
}

function attackWith(minionId) {
  const attacker = state.playerMinions.find((m) => m.id === minionId);
  if (!attacker) return;
  if (attacker.defense) {
    toast('Unit in defense mode cannot attack.', 'error');
    return;
  }

  const taunts = state.enemyMinions.filter((m) => m.taunt);
  if (taunts.length > 0) {
    taunts[0].health -= attacker.attack;
    attacker.health -= taunts[0].attack;
    log(`${attacker.name} attacked taunt ${taunts[0].name}.`);
    cleanupDead();
    render();
    return;
  }

  if (state.enemyMinions.length > 0) {
    const defender = state.enemyMinions[0];
    defender.health -= attacker.attack;
    attacker.health -= defender.attack;
    log(`${attacker.name} attacked ${defender.name}.`);
  } else {
    state.enemyHealth -= attacker.attack;
    log(`${attacker.name} attacked enemy hero.`);
  }

  cleanupDead();
  render();
}

function cleanupDead() {
  state.playerMinions = state.playerMinions.filter((m) => m.health > 0);
  state.enemyMinions = state.enemyMinions.filter((m) => m.health > 0);
}

function enableDrag(node, onDrop) {
  node.onpointerdown = (event) => {
    const ghost = node.cloneNode(true);
    ghost.classList.add('ghost');
    document.body.appendChild(ghost);

    const move = (e) => {
      ghost.style.left = `${e.clientX + 6}px`;
      ghost.style.top = `${e.clientY + 6}px`;
    };
    move(event);

    const up = (e) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const dropZone = document.querySelector('#drop-zone').getBoundingClientRect();
      const lane = document.querySelector('#enemy-minions').getBoundingClientRect();
      if (e.clientY >= dropZone.top && e.clientY <= dropZone.bottom) onDrop();
      if (e.clientY >= lane.top && e.clientY <= lane.bottom) onDrop();
      ghost.remove();
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  };
}

document.querySelector('#chat-input').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  if (event.target.value.trim() === './DevAbil') {
    setDevUnlocked(true);
    toast('Developer panels unlocked.', 'info');
    log('Dev unlock persisted to localStorage.');
  }
  event.target.value = '';
});

boot();
