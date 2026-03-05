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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function relu(v) {
  return Math.max(0, v);
}

function neuralStateScore(stateLike, profile) {
  const myAttack = stateLike.enemyMinions.reduce((sum, m) => sum + (m.attack ?? 0), 0);
  const myHealth = stateLike.enemyMinions.reduce((sum, m) => sum + (m.health ?? 0), 0);
  const oppAttack = stateLike.playerMinions.reduce((sum, m) => sum + (m.attack ?? 0), 0);
  const oppHealth = stateLike.playerMinions.reduce((sum, m) => sum + (m.health ?? 0), 0);
  const myTaunt = stateLike.enemyMinions.filter((m) => m.taunt).length;
  const oppTaunt = stateLike.playerMinions.filter((m) => m.taunt).length;

  const features = {
    bias: 1,
    hpDiff: clamp((stateLike.enemyHealth - stateLike.playerHealth) / 30, -2, 2),
    boardCountDiff: clamp((stateLike.enemyMinions.length - stateLike.playerMinions.length) / 8, -2, 2),
    boardAttackDiff: clamp((myAttack - oppAttack) / 20, -2, 2),
    boardHealthDiff: clamp((myHealth - oppHealth) / 25, -2, 2),
    lethalPressure: clamp((myAttack / Math.max(1, stateLike.playerHealth)) - (oppAttack / Math.max(1, stateLike.enemyHealth)), -2, 2),
    tauntDiff: clamp((myTaunt - oppTaunt) / 4, -2, 2),
  };

  const h1 = relu(0.8 * features.bias + 1.2 * features.hpDiff + 0.7 * features.boardCountDiff - 0.4 * features.tauntDiff);
  const h2 = relu(-0.2 * features.bias + 1.4 * features.boardAttackDiff + 0.9 * features.boardHealthDiff + 0.5 * features.lethalPressure);
  const h3 = relu(0.1 * features.bias + 0.9 * features.lethalPressure + 0.8 * features.hpDiff - 0.5 * features.boardHealthDiff);
  const h4 = relu(0.3 * features.bias + 0.5 * features.boardCountDiff + 1.1 * features.boardAttackDiff - 0.8 * features.tauntDiff);

  const output = (0.9 * h1) + (1.2 * h2) + (1.05 * h3) + (0.7 * h4) - 1.3;
  const aggression = clamp(profile?.weights?.attackFace ?? 0.6, 0.1, 1.5);
  const tradingBias = clamp(profile?.weights?.trade ?? 0.6, 0.1, 1.5);
  return output + (features.lethalPressure * aggression) + (features.boardHealthDiff * tradingBias * 0.35);
}

function enumerateActions(state, profile) {
  const actions = [];
  const attackers = availableEnemyAttackers(state);
  const tauntTarget = state.playerMinions.find((m) => m.taunt);
  for (const attacker of attackers) {
    if (!tauntTarget) actions.push({ type: 'attack-hero', attackerId: attacker.id, trace: 'neural:attack-hero' });
    const targets = tauntTarget ? [tauntTarget] : state.playerMinions;
    for (const target of targets) actions.push({ type: 'attack-minion', attackerId: attacker.id, targetId: target.id, trace: 'neural:attack-minion' });
  }
  if ((state.enemyMinions.length < 8) && (profile.summons?.length ?? 0) > 0) actions.push({ type: 'summon', trace: 'neural:summon' });
  if (actions.length === 0) actions.push({ type: 'pass', trace: 'neural:pass' });
  return actions;
}

function applyAction(state, action, profile) {
  const next = cloneState(state);
  if (action.type === 'attack-hero') {
    const attacker = next.enemyMinions.find((m) => m.id === action.attackerId);
    if (!attacker || hasPlayerTaunt(next)) return null;
    next.playerHealth -= attacker.attack;
    return next;
  }
  if (action.type === 'attack-minion') {
    const attacker = next.enemyMinions.find((m) => m.id === action.attackerId);
    const defender = next.playerMinions.find((m) => m.id === action.targetId);
    if (!attacker || !defender) return null;
    defender.health -= attacker.attack;
    attacker.health -= defender.attack;
    next.playerMinions = next.playerMinions.filter((m) => m.health > 0);
    next.enemyMinions = next.enemyMinions.filter((m) => m.health > 0);
    return next;
  }
  if (action.type === 'summon') {
    const template = pickRandom(profile?.summons ?? []);
    if (!template || next.enemyMinions.length >= 8) return null;
    next.enemyMinions.push({ id: uid('sim'), name: template.name, attack: template.attack ?? 2, health: template.health ?? 2, taunt: !!template.taunt, defense: false, summoningSick: true });
    return next;
  }
  return next;
}

function simulatePlayerBestResponse(stateLike) {
  const taunt = stateLike.enemyMinions.find((m) => m.taunt);
  let best = cloneState(stateLike);
  let bestScore = neuralStateScore(best, {});
  for (const attacker of stateLike.playerMinions) {
    if (attacker.defense || attacker.summoningSick) continue;
    if (!taunt) {
      const face = cloneState(stateLike);
      face.enemyHealth -= attacker.attack;
      const faceScore = neuralStateScore(face, {});
      if (faceScore < bestScore) { best = face; bestScore = faceScore; }
    }
    const targets = taunt ? [taunt] : stateLike.enemyMinions;
    for (const target of targets) {
      const trade = cloneState(stateLike);
      const a = trade.playerMinions.find((m) => m.id === attacker.id);
      const d = trade.enemyMinions.find((m) => m.id === target.id);
      if (!a || !d) continue;
      d.health -= a.attack;
      a.health -= d.attack;
      trade.playerMinions = trade.playerMinions.filter((m) => m.health > 0);
      trade.enemyMinions = trade.enemyMinions.filter((m) => m.health > 0);
      const tradeScore = neuralStateScore(trade, {});
      if (tradeScore < bestScore) { best = trade; bestScore = tradeScore; }
    }
  }
  return best;
}

function neuralBestAction(state, profile) {
  const actions = enumerateActions(state, profile);
  let best = { type: 'pass', trace: 'neural:fallback', score: -99999 };
  const samples = profile?.id === 'nivinis' ? 28 : 12;

  for (const action of actions) {
    let aggregate = 0;
    let valid = 0;
    for (let i = 0; i < samples; i += 1) {
      const after = applyAction(state, action, profile);
      if (!after) continue;
      const replied = simulatePlayerBestResponse(after);
      const noise = (Math.random() - 0.5) * 0.06;
      aggregate += neuralStateScore(replied, profile) + noise;
      valid += 1;
    }
    if (!valid) continue;
    const score = aggregate / valid;
    if (score > best.score) best = { ...action, trace: `${action.trace}:mcts-${samples}`, score };
  }

  return best.score === -99999 ? { type: 'pass', trace: 'neural:no-valid' } : best;
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

  if (profile.tacticProfile === 'neural-network' || profile.id === 'nivinis') {
    return neuralBestAction(state, profile);
  }

  if (profile.tacticProfile === 'omniscient') {
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
