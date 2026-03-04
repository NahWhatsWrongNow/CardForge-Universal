import { uid } from '../../core/utils.js';

function pickRandom(list = []) {
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function bestTradeTarget(state) {
  if (state.playerMinions.length === 0) return null;
  return [...state.playerMinions].sort((a, b) => (b.attack + b.health) - (a.attack + a.health))[0];
}

function availableEnemyAttackers(state) {
  return [...state.enemyMinions].filter((entry) => !entry.defense && !(entry.summoningSick));
}

function bestFaceAttacker(state) {
  return availableEnemyAttackers(state).sort((a, b) => b.attack - a.attack)[0] ?? null;
}

function hasPlayerTaunt(state) {
  return state.playerMinions.some((m) => m.taunt);
}

function canLethalHero(state, attacker) {
  return !hasPlayerTaunt(state) && attacker && attacker.attack >= state.playerHealth;
}

function scoreState(stateLike) {
  const my = stateLike.enemyMinions.reduce((sum, m) => sum + m.attack + m.health, 0);
  const opp = stateLike.playerMinions.reduce((sum, m) => sum + m.attack + m.health, 0);
  return (stateLike.enemyHealth - stateLike.playerHealth) + (my - opp) * 0.75;
}

function cloneState(state) {
  return {
    enemyHealth: state.enemyHealth,
    playerHealth: state.playerHealth,
    enemyMinions: state.enemyMinions.map((m) => ({ ...m })),
    playerMinions: state.playerMinions.map((m) => ({ ...m })),
  };
}

function simulateAttackToHero(state, attackerId) {
  const next = cloneState(state);
  const attacker = next.enemyMinions.find((m) => m.id === attackerId);
  if (!attacker || hasPlayerTaunt(next)) return { ok: false, score: -9999 };
  next.playerHealth -= attacker.attack;
  return { ok: true, score: scoreState(next) + 5 };
}

function simulateAttackToMinion(state, attackerId, targetId) {
  const next = cloneState(state);
  const attacker = next.enemyMinions.find((m) => m.id === attackerId);
  const defender = next.playerMinions.find((m) => m.id === targetId);
  if (!attacker || !defender) return { ok: false, score: -9999 };
  defender.health -= attacker.attack;
  attacker.health -= defender.attack;
  next.playerMinions = next.playerMinions.filter((m) => m.health > 0);
  next.enemyMinions = next.enemyMinions.filter((m) => m.health > 0);
  return { ok: true, score: scoreState(next) + 2 };
}

function advancedBestAction(state, profile) {
  const options = [];
  const attackers = availableEnemyAttackers(state);
  const tauntTarget = state.playerMinions.find((m) => m.taunt);

  for (const attacker of attackers) {
    if (!tauntTarget) {
      const face = simulateAttackToHero(state, attacker.id);
      if (face.ok) options.push({ type: 'attack-hero', attackerId: attacker.id, trace: 'advanced:face-eval', score: face.score });
    }
    const targets = tauntTarget ? [tauntTarget] : state.playerMinions;
    for (const target of targets) {
      const trade = simulateAttackToMinion(state, attacker.id, target.id);
      if (trade.ok) options.push({ type: 'attack-minion', attackerId: attacker.id, targetId: target.id, trace: 'advanced:trade-eval', score: trade.score });
    }
  }

  if ((state.enemyMinions.length < 8) && (profile.summons?.length ?? 0) > 0) {
    options.push({ type: 'summon', trace: 'advanced:summon-pressure', score: scoreState(state) + 1.4 });
  }

  if (options.length === 0) return { type: 'pass', trace: 'advanced:no-options' };
  options.sort((a, b) => b.score - a.score);
  return options[0];
}

export function getThinkDelay(profile) {
  const [minMs, maxMs] = profile?.thinkMsRange ?? [350, 750];
  const clampedMin = Math.max(250, minMs);
  const clampedMax = Math.min(1800, Math.max(clampedMin + 50, maxMs));
  return Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin;
}

export function getThinkingLine(profile) {
  const pool = {
    aggro: ['Eyes on face damage...', 'Counting lethal lines...', 'Pressure now...'],
    control: ['Evaluating board control...', 'Removing key threats...', 'Trading for tempo...'],
    value: ['Planning long-game value...', 'Sequencing for advantage...', 'Maximizing resources...'],
    genius: ['Projecting ten turns ahead...', 'Minimax branch selected...', 'Risk-adjusted line locked...'],
    default: ['Calculating move...', 'Considering options...', 'Reading board state...'],
  };
  const strategy = profile?.strategy ?? 'default';
  return pickRandom(pool[strategy] ?? pool.default);
}

export function chooseAction(state, profile) {
  if (!profile) return { type: 'pass', trace: 'no-profile' };

  if (profile.tacticProfile === 'omniscient' || profile.id === 'nivinis') {
    return advancedBestAction(state, profile);
  }

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
    if (!hasPlayerTaunt(state)) return { type: 'attack-hero', attackerId: enemyAttacker.id, trace: 'aggro:push-face' };
  }

  if (state.enemyMinions.length < 8 && Math.random() < (weights.summon ?? 0.2)) {
    return { type: 'summon', trace: `weighted:summon:${strategy}` };
  }

  if (enemyAttacker && state.playerMinions.length > 0 && Math.random() < (weights.trade ?? 0.5)) {
    const target = bestTradeTarget(state);
    return { type: 'attack-minion', attackerId: enemyAttacker.id, targetId: target.id, trace: `weighted:trade:${strategy}` };
  }

  if (enemyAttacker && Math.random() < (weights.attackFace ?? 0.2)) {
    if (!hasPlayerTaunt(state)) return { type: 'attack-hero', attackerId: enemyAttacker.id, trace: `weighted:attackFace:${strategy}` };
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
