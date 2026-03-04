import { Registry } from '../core/registry.js';
import { loadPlugins } from '../core/loader.js';
import { setDevUnlocked } from '../core/storage.js';
import { toast, uid } from '../core/utils.js';
import { emitVfx, onVfx } from './engine/animation_bus.js';
import { explainInvalidAction } from './engine/targeting.js';
import { getRivalryIndicators, resolveCombat, resolveSpellPower } from './engine/rivalry.js';

const registry = new Registry();
const state = {
  playerHealth: 30,
  enemyHealth: 30,
  mana: 3,
  hand: [],
  rivalryPacks: [],
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

async function boot() {
  const errors = await loadPlugins(registry, [
    { manifest: './mode_packs/index.json', base: './mode_packs', type: 'mode-pack', kind: 'modes' },
    { manifest: './ai_packs/index.json', base: './ai_packs', type: 'ai-pack', kind: 'ai' },
    { manifest: './race_packs/index.json', base: './race_packs', type: 'race-pack', kind: 'rivalryPacks' },
    { manifest: '../packs/index.json', base: '../packs', type: 'card-pack', kind: 'cardPacks' },
  ], log);
  errors.forEach((error) => log(`Error: ${error}`));

  state.rivalryPacks = registry.list('rivalryPacks');

  onVfx('play-card', ({ payload }) => log(`VFX play-card: ${payload.cardId}`));
  onVfx('attack', ({ payload }) => log(`VFX attack: ${payload.attackerId} -> ${payload.targetId}`));
  onVfx('stance-toggle', ({ payload }) => log(`VFX stance-toggle: ${payload.id}=${payload.defense}`));

  const cards = registry.list('cardPacks').flatMap((pack) => pack.cards);
  state.hand = cards.slice(0, 4).map((card) => ({ ...card, instanceId: uid('card') }));
  log(`Loaded ${state.rivalryPacks.length} rivalry pack(s) for layered combat/spell/status checks.`);
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
    node.innerHTML = `
      <strong>${minion.name}</strong>
      <div>${Math.max(0, minion.attack - (minion.statuses?.weakened ? 1 : 0))}/${minion.health}</div>
      <div class="meta">${minion.race ?? 'neutral'} · ${minion.element ?? 'none'}</div>
      <div class="status-row">${minion.statuses?.weakened ? '<span class="status">Weakened</span>' : ''}</div>
      <button>Defense</button>
    `;

    node.querySelector('button').onclick = () => {
      minion.defense = !minion.defense;
      emitVfx('stance-toggle', { id: minion.id, defense: minion.defense });
      log(`${minion.name} ${minion.defense ? 'entered' : 'left'} defense mode.`);
      render();
    };

    if (playerOwned) {
      enableAttackDrag(node, minion.id);
    }
    lane.appendChild(node);
  });
}

function playCard(cardId) {
  const index = state.hand.findIndex((c) => c.instanceId === cardId);
  if (index === -1) return;
  const card = state.hand[index];

  if (card.cost > state.mana) {
    showHint(explainInvalidAction('mana'));
    toast('Not enough mana.', 'error');
    return;
  }

  if (card.type === 'minion') {
    state.hand.splice(index, 1);
    state.mana -= card.cost;
    state.playerMinions.push({
      id: uid('m'),
      name: card.name,
      attack: card.attack,
      health: card.health,
      taunt: !!card.taunt,
      defense: false,
      race: card.race ?? 'neutral',
      element: card.element ?? 'none',
      statuses: {},
    });
    emitVfx('play-card', { cardId: card.id });
    log(`Played ${card.name}.`);
    render();
    return;
  }

  if (card.type === 'spell') {
    if (state.playerMinions.length === 0 || state.enemyMinions.length === 0) {
      showHint('Spell layer demo needs a friendly minion caster and enemy minion target.');
      toast('Need both sides to have minions for this spell demo.', 'info');
      return;
    }
    const caster = state.playerMinions[0];
    const target = state.enemyMinions[0];
    const spell = resolveSpellPower(caster, target, card.damage ?? 0, state, 'player');
    target.health -= spell.power;
    spawnDamageNumber(document.querySelector(`[data-id="${target.id}"]`), spell.power);
    log(`Spell ${card.name} (${caster.name} -> ${target.name}) dealt ${spell.power}. Rules: ${spell.matchedRuleIds.join(', ') || 'none'}.`);
    emitVfx('play-card', { cardId: card.id });
    state.hand.splice(index, 1);
    state.mana -= card.cost;
    cleanupDead();
    render();
    return;
  }

  showHint(explainInvalidAction('unsupported'));
  toast('This card type is not available in runtime yet.', 'info');
}

function attackWith(attackerId, targetId) {
  const attacker = state.playerMinions.find((m) => m.id === attackerId);
  if (!attacker) return;
  if (attacker.defense) {
    showHint(explainInvalidAction('defense'));
    toast('Unit in defense mode cannot attack.', 'error');
    return;
  }

  const forcedTaunt = state.enemyMinions.find((m) => m.taunt);
  if (forcedTaunt && targetId !== forcedTaunt.id) {
    showHint(explainInvalidAction('taunt'));
    toast('Taunt must be attacked first.', 'error');
    return;
  }

  const attackerEl = document.querySelector(`[data-id="${attacker.id}"]`);
  const targetEl = document.querySelector(`[data-target-id="${targetId}"]`);

  if (targetId === 'enemy-hero') {
    if (state.enemyMinions.length > 0) {
      showHint(explainInvalidAction('taunt'));
      toast('Cannot attack hero while enemy minions exist.', 'error');
      return;
    }
    state.enemyHealth -= attacker.attack;
    spawnDamageNumber(targetEl, attacker.attack);
    log(`${attacker.name} attacked enemy hero.`);
  } else {
    const defender = state.enemyMinions.find((m) => m.id === targetId);
    if (!defender) return;
    const result = resolveCombat(attacker, defender, state, 'player');

    defender.health -= result.damageToDefender;
    attacker.health -= result.damageToAttacker;
    spawnDamageNumber(document.querySelector(`[data-id="${defender.id}"]`), result.damageToDefender);
    spawnDamageNumber(attackerEl, result.damageToAttacker);

    const extra = result.events.length > 0 ? ` (${result.events.join(', ')})` : '';
    log(`${attacker.name} attacked ${defender.name} for ${result.damageToDefender}/${result.damageToAttacker}${extra}. Rules: ${result.matchedRuleIds.join(', ') || 'none'}.`);
    if (result.events.includes('fear')) {
      showHint('Fear triggered: attack was interrupted this round.');
    }
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
  document.querySelectorAll('.target-valid,.target-blocked').forEach((el) => {
    el.classList.remove('target-valid', 'target-blocked');
  });
}

function highlightCardPlayTargets() {
  clearHighlights();
  document.querySelector('#drop-zone').classList.add('target-valid');
}

function highlightAttackTargets(attackerId) {
  clearHighlights();
  const attacker = state.playerMinions.find((m) => m.id === attackerId);
  if (!attacker) return;

  if (attacker.defense) {
    showHint(explainInvalidAction('defense'));
    return;
  }

  const taunt = state.enemyMinions.find((m) => m.taunt);
  if (taunt) {
    document.querySelectorAll('#enemy-minions .minion').forEach((node) => {
      node.classList.add(node.dataset.id === taunt.id ? 'target-valid' : 'target-blocked');
    });
    document.querySelector('[data-target-id="enemy-hero"]').classList.add('target-blocked');
    showHint(explainInvalidAction('taunt'));
    return;
  }

  const enemyNodes = document.querySelectorAll('#enemy-minions .minion');
  if (enemyNodes.length > 0) {
    enemyNodes.forEach((node) => node.classList.add('target-valid'));
    document.querySelector('[data-target-id="enemy-hero"]').classList.add('target-blocked');
    showHint('Choose an enemy minion target.');
  } else {
    document.querySelector('[data-target-id="enemy-hero"]').classList.add('target-valid');
    showHint('Enemy hero can be targeted.');
  }
}

function dragWithGhost(node, onMove, onDrop) {
  node.onpointerdown = (event) => {
    const ghost = node.cloneNode(true);
    ghost.classList.add('ghost');
    document.body.appendChild(ghost);

    const move = (e) => {
      ghost.style.left = `${e.clientX + 6}px`;
      ghost.style.top = `${e.clientY + 6}px`;
      onMove(e);
    };
    move(event);

    const up = (e) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      onDrop(e);
      ghost.remove();
      clearHighlights();
      showHint('');
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  };
}

function enableCardDrag(node, cardId) {
  dragWithGhost(
    node,
    () => highlightCardPlayTargets(),
    (e) => {
      const hovered = document.elementFromPoint(e.clientX, e.clientY);
      const drop = hovered?.closest('#drop-zone');
      if (drop) {
        playCard(cardId);
      } else {
        showHint('Drag onto play zone to summon.');
      }
    },
  );
}

function enableAttackDrag(node, attackerId) {
  dragWithGhost(
    node,
    () => highlightAttackTargets(attackerId),
    (e) => {
      const hovered = document.elementFromPoint(e.clientX, e.clientY);
      const target = hovered?.closest('[data-target-id]');
      if (!target) {
        showHint('Drop on a highlighted target.');
        return;
      }
      attackWith(attackerId, target.dataset.targetId);
    },
  );
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
