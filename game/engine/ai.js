import { uid } from '../../core/utils.js';

function pickRandom(list = []) {
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function canLethalHero(state, attacker) {
  const hasTaunt = state.playerMinions.some((m) => m.taunt);
  return !hasTaunt && attacker && attacker.attack >= state.playerHealth;
}

function bestTradeTarget(state) {
  if (state.playerMinions.length === 0) return null;
  return [...state.playerMinions].sort((a, b) => (a.health + a.attack) - (b.health + b.attack))[0];
}

function bestFaceAttacker(state) {
  return [...state.enemyMinions].filter((entry) => !entry.defense).sort((a, b) => b.attack - a.attack)[0] ?? null;
}

export function getThinkDelay(profile) {
  const [minMs, maxMs] = profile?.thinkMsRange ?? [350, 750];
  const clampedMin = Math.max(250, minMs);
  const clampedMax = Math.min(1600, Math.max(clampedMin + 50, maxMs));
  return Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin;
}

export function getThinkingLine(profile) {
  const pool = {
    aggro: ['Eyes on face damage...', 'Counting lethal lines...', 'Pressure now...'],
    control: ['Evaluating board control...', 'Removing key threats...', 'Trading for tempo...'],
    value: ['Planning long-game value...', 'Sequencing for advantage...', 'Maximizing resources...'],
    default: ['Calculating move...', 'Considering options...', 'Reading board state...'],
  };
  const strategy = profile?.strategy ?? 'default';
  return pickRandom(pool[strategy] ?? pool.default);
}

export function chooseAction(state, profile) {
  if (!profile) return { type: 'pass', trace: 'no-profile' };
  const weights = profile.weights ?? {};
  const strategy = profile.strategy ?? 'default';
  const enemyAttacker = bestFaceAttacker(state);

  if (canLethalHero(state, enemyAttacker)) {
    return { type: 'attack-hero', attackerId: enemyAttacker.id, trace: 'genius:lethal-check' };
  }

  if (profile.boss && state.bossMode && (profile.script ?? []).includes('shadow-roar') && Math.random() < 0.4) {
    return { type: 'boss-roar', trace: 'script:shadow-roar' };
  }

  if (profile.id === 'insane' && state.playerMinions.length > 0 && enemyAttacker) {
    const target = bestTradeTarget(state);
    if (target && target.attack >= 4) {
      return { type: 'attack-minion', attackerId: enemyAttacker.id, targetId: target.id, trace: 'insane:remove-high-threat' };
    }
  }

  if (strategy === 'aggro' && enemyAttacker && Math.random() < 0.75) {
    const hasTaunt = state.playerMinions.some((m) => m.taunt);
    if (!hasTaunt) return { type: 'attack-hero', attackerId: enemyAttacker.id, trace: 'aggro:push-face' };
  }

  if (state.enemyMinions.length < 5 && Math.random() < (weights.summon ?? 0.2)) {
    return { type: 'summon', trace: `weighted:summon:${strategy}` };
  }

  if (enemyAttacker && state.playerMinions.length > 0 && Math.random() < (weights.trade ?? 0.5)) {
    const target = bestTradeTarget(state);
    return { type: 'attack-minion', attackerId: enemyAttacker.id, targetId: target.id, trace: `weighted:trade:${strategy}` };
  }

  if (enemyAttacker && Math.random() < (weights.attackFace ?? 0.2)) {
    const hasTaunt = state.playerMinions.some((m) => m.taunt);
    if (!hasTaunt) return { type: 'attack-hero', attackerId: enemyAttacker.id, trace: `weighted:attackFace:${strategy}` };
  }

  return { type: 'pass', trace: `fallback:pass:${strategy}` };
}

export function createSummon(profile) {
  const template = pickRandom(profile?.summons ?? []);
  if (!template) return null;
  return {
    id: uid('enemy'),
    name: template.name,
    attack: template.attack,
    health: template.health,
    taunt: !!template.taunt,
    defense: false,
    race: template.race ?? 'neutral',
    element: template.element ?? 'none',
    statuses: {},
    rarity: template.rarity ?? 'rare',
  };
}
