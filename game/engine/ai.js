import { uid } from '../../core/utils.js';

const MAX_LANE_SIZE = 8;
const WIN_SCORE = 100000;
const ACTION_TRACE_PREFIX = 'neural';

function pickRandom(list = []) {
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function relu(v) {
  return Math.max(0, v);
}

function dot(a = [], b = []) {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function dense(input = [], matrix = [], bias = []) {
  return matrix.map((row, idx) => dot(input, row) + (bias[idx] ?? 0));
}

function cloneMinion(minion) {
  return {
    ...minion,
    statuses: { ...(minion?.statuses ?? {}) },
  };
}

function cloneState(state) {
  return {
    enemyHealth: state.enemyHealth,
    playerHealth: state.playerHealth,
    enemyMinions: (state.enemyMinions ?? []).map(cloneMinion),
    playerMinions: (state.playerMinions ?? []).map(cloneMinion),
    enemyDeck: (state.enemyDeck ?? []).map((card) => ({ ...card })),
    enemyUsedAttacks: { ...(state.enemyUsedAttacks ?? {}) },
    playerUsedAttacks: { ...(state.playerUsedAttacks ?? {}) },
  };
}

function hasTaunt(minions = []) {
  return minions.some((m) => !!m.taunt && (m.health ?? 0) > 0);
}

function attackCap(minion) {
  return minion?.allowMultiAttack ? 99 : 1;
}

function sideLane(stateLike, side) {
  return side === 'enemy' ? stateLike.enemyMinions : stateLike.playerMinions;
}

function oppositeLane(stateLike, side) {
  return side === 'enemy' ? stateLike.playerMinions : stateLike.enemyMinions;
}

function usedAttackMap(stateLike, side) {
  if (side === 'enemy') return stateLike.enemyUsedAttacks ?? {};
  return stateLike.playerUsedAttacks ?? {};
}

function canAttack(stateLike, side, minion) {
  if (!minion) return false;
  if ((minion.health ?? 0) <= 0) return false;
  if (minion.defense || minion.summoningSick) return false;
  const used = usedAttackMap(stateLike, side)[minion.id] ?? 0;
  return used < attackCap(minion);
}

function markAttackUsed(stateLike, side, minion) {
  if (!minion) return;
  if (side === 'enemy') stateLike.enemyUsedAttacks[minion.id] = (stateLike.enemyUsedAttacks[minion.id] ?? 0) + 1;
  else stateLike.playerUsedAttacks[minion.id] = (stateLike.playerUsedAttacks[minion.id] ?? 0) + 1;
}

function clearDeadMinions(stateLike) {
  stateLike.enemyMinions = stateLike.enemyMinions.filter((m) => (m.health ?? 0) > 0);
  stateLike.playerMinions = stateLike.playerMinions.filter((m) => (m.health ?? 0) > 0);
}

function availableAttackers(stateLike, side) {
  return sideLane(stateLike, side).filter((m) => canAttack(stateLike, side, m));
}

function rarityBonus(rarity = 'common') {
  const table = {
    common: 0,
    rare: 0.2,
    epic: 0.45,
    legendary: 0.75,
  };
  return table[String(rarity).toLowerCase()] ?? 0;
}

function cardPower(card = {}, stateLike = null, profile = null) {
  const attack = card.attack ?? 0;
  const health = card.health ?? 0;
  const oppAttack = stateLike?.playerMinions?.reduce((sum, m) => sum + (m.attack ?? 0), 0) ?? 0;
  const enemyPressure = oppAttack / Math.max(1, stateLike?.enemyHealth ?? 1);

  let score = (attack * 1.45) + (health * 1.25);
  if (card.taunt) score += 1.6 + (enemyPressure * 2.4);
  if (card.charge) score += 2.2;
  if (card.allowMultiAttack) score += 1.8;
  score += rarityBonus(card.rarity) * 1.8;

  const strategy = profile?.strategy ?? 'default';
  if (strategy === 'aggro') score += attack * 0.35;
  if (strategy === 'control') score += health * 0.25 + (card.taunt ? 0.8 : 0);
  if (strategy === 'value') score += (attack + health) * 0.1;

  return score;
}

function chooseDeckCard(stateLike, profile, explicitDeckIndex = null) {
  const deck = stateLike.enemyDeck ?? [];
  if (deck.length > 0) {
    if (Number.isInteger(explicitDeckIndex)) {
      const idx = clamp(explicitDeckIndex, 0, deck.length - 1);
      const [picked] = deck.splice(idx, 1);
      return picked ?? null;
    }

    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < deck.length; i += 1) {
      const score = cardPower(deck[i], stateLike, profile);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const [picked] = deck.splice(bestIdx, 1);
    return picked ?? null;
  }

  const templates = profile?.summons ?? [];
  if (!templates.length) return null;

  let bestTemplate = templates[0];
  let bestTemplateScore = cardPower(bestTemplate, stateLike, profile);
  for (let i = 1; i < templates.length; i += 1) {
    const score = cardPower(templates[i], stateLike, profile);
    if (score > bestTemplateScore) {
      bestTemplateScore = score;
      bestTemplate = templates[i];
    }
  }
  return { ...bestTemplate };
}

function makeSummon(card = {}, idPrefix = 'sim') {
  return {
    id: `${idPrefix}-${Math.floor(Math.random() * 999999)}`,
    name: card.name ?? 'Construct Token',
    attack: card.attack ?? 2,
    health: card.health ?? 2,
    taunt: !!card.taunt,
    defense: false,
    race: card.race ?? 'neutral',
    element: card.element ?? 'none',
    statuses: {},
    rarity: card.rarity ?? 'rare',
    allowMultiAttack: !!card.allowMultiAttack,
    allowFriendlyAttack: !!card.allowFriendlyAttack,
    charge: !!card.charge,
    summoningSick: !card.charge,
  };
}

function applySideAction(stateLike, side, action, profile) {
  const next = cloneState(stateLike);
  const attackers = sideLane(next, side);
  const defenders = oppositeLane(next, side);

  if (action.type === 'attack-hero') {
    const attacker = attackers.find((m) => m.id === action.attackerId);
    if (!attacker || !canAttack(next, side, attacker)) return null;
    if (hasTaunt(defenders)) return null;
    if (side === 'enemy') next.playerHealth -= Math.max(0, attacker.attack ?? 0);
    else next.enemyHealth -= Math.max(0, attacker.attack ?? 0);
    markAttackUsed(next, side, attacker);
    return next;
  }

  if (action.type === 'attack-minion') {
    const attacker = attackers.find((m) => m.id === action.attackerId);
    const defender = defenders.find((m) => m.id === action.targetId);
    if (!attacker || !defender || !canAttack(next, side, attacker)) return null;

    const tauntTargets = defenders.filter((m) => m.taunt);
    if (tauntTargets.length > 0 && !defender.taunt) return null;

    const attackDamage = Math.max(0, attacker.attack ?? 0);
    const counterDamage = Math.max(0, defender.attack ?? 0);

    defender.health -= attackDamage;
    attacker.health -= counterDamage;
    markAttackUsed(next, side, attacker);
    clearDeadMinions(next);
    return next;
  }

  if (action.type === 'summon' && side === 'enemy') {
    if ((next.enemyMinions?.length ?? 0) >= MAX_LANE_SIZE) return null;

    const chosenCard = chooseDeckCard(next, profile, action.deckIndex ?? null);
    if (!chosenCard) return null;

    next.enemyMinions.push(makeSummon(chosenCard));
    return next;
  }

  if (action.type === 'pass') {
    return next;
  }

  return null;
}

function boardStats(stateLike, side) {
  const lane = sideLane(stateLike, side);
  let attack = 0;
  let health = 0;
  let taunt = 0;
  let readyAttack = 0;
  let stickyCount = 0;
  let highThreat = 0;

  for (const minion of lane) {
    const minionAttack = minion.attack ?? 0;
    const minionHealth = minion.health ?? 0;
    attack += minionAttack;
    health += minionHealth;
    if (minion.taunt) taunt += 1;
    if (canAttack(stateLike, side, minion)) readyAttack += minionAttack;
    if (minionHealth >= 4) stickyCount += 1;
    if (minionAttack >= 5) highThreat += 1;
  }

  return {
    count: lane.length,
    attack,
    health,
    taunt,
    readyAttack,
    stickyCount,
    highThreat,
  };
}

function deckQuality(stateLike, profile) {
  const deck = stateLike.enemyDeck ?? [];
  if (!deck.length) return 0;

  const top = [...deck]
    .map((card) => cardPower(card, stateLike, profile))
    .sort((a, b) => b - a)
    .slice(0, 5);

  const avg = top.reduce((sum, value) => sum + value, 0) / Math.max(1, top.length);
  return clamp(avg / 12, -2, 2);
}

const L1_WEIGHTS = [
  [0.75, 1.18, 0.72, 1.12, 0.81, 0.68, -0.52, 0.94, -1.1, 0.58, 0.22, 0.4, 0.38, 0.86, 0.62, 0.2],
  [-0.34, 0.86, 1.05, 0.64, 0.62, 1.03, -0.24, 0.45, -0.72, 0.4, 0.18, 0.28, 0.11, 0.42, 0.67, 0.1],
  [0.4, 0.52, 0.74, 1.22, 1.16, 0.55, -0.62, 0.8, -0.9, 0.3, 0.14, 0.2, 0.3, 1.0, 0.78, 0.12],
  [0.2, 0.1, 0.38, 0.6, 0.7, 1.28, -0.16, 1.35, -1.22, 0.2, 0.12, 0.25, 0.18, 0.4, 0.52, 0.22],
  [0.62, 0.98, 0.26, 0.74, 0.84, 0.42, -0.42, 0.36, -0.5, 0.64, 0.34, 0.56, 0.42, 0.58, 0.36, 0.18],
  [-0.08, 0.3, 0.66, 1.08, 0.92, 0.46, -0.5, 0.74, -0.86, 0.08, 0.16, 0.2, 0.24, 0.88, 0.72, 0.1],
  [0.28, 0.44, 0.82, 0.92, 0.58, 0.7, -0.3, 1.04, -0.98, 0.18, 0.08, 0.22, 0.2, 0.54, 0.44, 0.3],
  [0.18, 0.64, 0.58, 0.72, 0.62, 0.9, -0.2, 0.7, -0.72, 0.36, 0.24, 0.34, 0.3, 0.62, 0.48, 0.14],
];

const L1_BIAS = [0.12, -0.08, 0.05, 0.18, -0.02, 0.08, 0.04, 0.06];

const L2_WEIGHTS = [
  [0.8, 0.62, 0.74, 0.72, 0.5, 0.78, 0.64, 0.7],
  [0.54, 0.88, 0.72, 0.44, 0.4, 0.68, 0.76, 0.6],
  [0.64, 0.56, 0.92, 0.36, 0.28, 0.84, 0.5, 0.46],
  [0.5, 0.4, 0.38, 1.04, 0.58, 0.52, 0.8, 0.72],
  [0.76, 0.44, 0.54, 0.58, 0.92, 0.46, 0.36, 0.62],
  [0.42, 0.72, 0.48, 0.84, 0.46, 0.64, 0.58, 0.7],
];

const L2_BIAS = [0.1, 0.05, 0.06, 0.14, 0.08, 0.09];
const OUT_WEIGHTS = [1.02, 0.88, 1.08, 0.94, 0.82, 0.9];
const OUT_BIAS = -1.2;

function neuralStateScore(stateLike, profile) {
  if ((stateLike.playerHealth ?? 0) <= 0) return WIN_SCORE;
  if ((stateLike.enemyHealth ?? 0) <= 0) return -WIN_SCORE;

  const me = boardStats(stateLike, 'enemy');
  const opp = boardStats(stateLike, 'player');

  const features = [
    1,
    clamp((stateLike.enemyHealth - stateLike.playerHealth) / 30, -2, 2),
    clamp((me.count - opp.count) / 8, -2, 2),
    clamp((me.attack - opp.attack) / 24, -2, 2),
    clamp((me.health - opp.health) / 28, -2, 2),
    clamp((me.readyAttack - opp.readyAttack) / 22, -2, 2),
    clamp((me.taunt - opp.taunt) / 4, -2, 2),
    clamp((me.readyAttack - stateLike.playerHealth) / 10, -2, 2),
    clamp((opp.readyAttack - stateLike.enemyHealth) / 10, -2, 2),
    clamp(stateLike.enemyHealth / Math.max(1, stateLike.enemyHealth + opp.readyAttack), -2, 2),
    clamp((stateLike.enemyDeck?.length ?? 0) / 30, -2, 2),
    deckQuality(stateLike, profile),
    clamp((MAX_LANE_SIZE - me.count) / MAX_LANE_SIZE, -2, 2),
    clamp((me.highThreat - opp.highThreat) / 4, -2, 2),
    clamp((me.stickyCount - opp.stickyCount) / 6, -2, 2),
    profile?.strategy === 'aggro' ? 0.9 : profile?.strategy === 'control' ? -0.4 : 0.2,
  ];

  const l1 = dense(features, L1_WEIGHTS, L1_BIAS).map(relu);
  const l2 = dense(l1, L2_WEIGHTS, L2_BIAS).map(relu);
  const networkOutput = dot(l2, OUT_WEIGHTS) + OUT_BIAS;

  const aggression = clamp(profile?.weights?.attackFace ?? 0.5, 0.1, 1.6);
  const tradeBias = clamp(profile?.weights?.trade ?? 0.6, 0.1, 1.6);
  const summonBias = clamp(profile?.weights?.summon ?? 0.6, 0.05, 1.8);

  const tactical = (features[7] * aggression * 2.6) + (features[3] * tradeBias * 1.8) + (features[11] * summonBias * 1.6);
  return (networkOutput * 10) + tactical;
}

function quickAttackBonus(before, after, action) {
  if (action.type === 'attack-hero') {
    const dealt = Math.max(0, (before.playerHealth ?? 0) - (after.playerHealth ?? 0));
    const lethal = (after.playerHealth ?? 0) <= 0 ? WIN_SCORE : 0;
    return (dealt * 3.6) + lethal;
  }

  if (action.type === 'attack-minion') {
    const killed = Math.max(0, (before.playerMinions?.length ?? 0) - (after.playerMinions?.length ?? 0));
    const lost = Math.max(0, (before.enemyMinions?.length ?? 0) - (after.enemyMinions?.length ?? 0));
    return (killed * 6) - (lost * 4.5);
  }

  if (action.type === 'summon') {
    const gained = Math.max(0, (after.enemyMinions?.length ?? 0) - (before.enemyMinions?.length ?? 0));
    return gained * 2.2;
  }

  return 0;
}

function makeAttackActions(stateLike, side) {
  const actions = [];
  const attackers = availableAttackers(stateLike, side);
  const defenders = oppositeLane(stateLike, side);
  const tauntTargets = defenders.filter((m) => m.taunt);

  for (const attacker of attackers) {
    if (tauntTargets.length === 0) {
      actions.push({
        type: 'attack-hero',
        attackerId: attacker.id,
        trace: `${ACTION_TRACE_PREFIX}:${side}:attack-hero`,
      });
    }

    const legalTargets = tauntTargets.length > 0 ? tauntTargets : defenders;
    for (const target of legalTargets) {
      actions.push({
        type: 'attack-minion',
        attackerId: attacker.id,
        targetId: target.id,
        trace: `${ACTION_TRACE_PREFIX}:${side}:attack-minion`,
      });
    }
  }

  return actions;
}

function makeSummonActions(stateLike, profile, maxOptions = 4) {
  if ((stateLike.enemyMinions?.length ?? 0) >= MAX_LANE_SIZE) return [];

  const deck = stateLike.enemyDeck ?? [];
  if (deck.length > 0) {
    const scored = deck
      .map((card, idx) => ({ idx, score: cardPower(card, stateLike, profile), name: card.name ?? 'Unknown' }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxOptions);

    return scored.map((item) => ({
      type: 'summon',
      deckIndex: item.idx,
      trace: `${ACTION_TRACE_PREFIX}:enemy:summon:${item.name}`,
    }));
  }

  if ((profile?.summons?.length ?? 0) > 0) {
    return [{ type: 'summon', trace: `${ACTION_TRACE_PREFIX}:enemy:summon-template` }];
  }

  return [];
}

function pruneActionsByGain(stateLike, actions, side, profile, maxActions = 12) {
  if (!actions.length) return [];

  const base = neuralStateScore(stateLike, profile);
  const scored = [];

  for (const action of actions) {
    const after = applySideAction(stateLike, side, action, profile);
    if (!after) continue;
    const gain = neuralStateScore(after, profile) - base + quickAttackBonus(stateLike, after, action);
    scored.push({ action, gain });
  }

  scored.sort((a, b) => b.gain - a.gain);
  return scored.slice(0, maxActions).map((entry) => entry.action);
}

function enumerateEnemyActions(stateLike, profile, config) {
  const attackActions = makeAttackActions(stateLike, 'enemy');
  const summons = makeSummonActions(stateLike, profile, config.summonBranchLimit);

  const prunedAttacks = pruneActionsByGain(
    stateLike,
    attackActions,
    'enemy',
    profile,
    config.attackBranchLimit,
  );

  const actions = [...prunedAttacks, ...summons];
  actions.push({ type: 'pass', trace: `${ACTION_TRACE_PREFIX}:enemy:pass` });
  return actions;
}

function enumeratePlayerActions(stateLike, profile, config) {
  const attackActions = makeAttackActions(stateLike, 'player');
  const pruned = pruneActionsByGain(stateLike, attackActions, 'player', profile, config.playerBranchLimit);
  pruned.push({ type: 'pass', trace: `${ACTION_TRACE_PREFIX}:player:pass` });
  return pruned;
}

function simulatePlayerCounterplay(stateLike, profile, config) {
  let current = cloneState(stateLike);

  for (let depth = 0; depth < config.counterDepth; depth += 1) {
    const actions = enumeratePlayerActions(current, profile, config);
    let bestAction = { type: 'pass', trace: `${ACTION_TRACE_PREFIX}:player:no-op` };
    let bestState = current;
    let bestScore = neuralStateScore(current, profile);

    for (const action of actions) {
      const after = applySideAction(current, 'player', action, profile);
      if (!after) continue;
      const score = neuralStateScore(after, profile);
      if (score < bestScore) {
        bestScore = score;
        bestAction = action;
        bestState = after;
      }
    }

    current = bestState;
    if (bestAction.type === 'pass') break;
    if ((current.enemyHealth ?? 0) <= 0 || (current.playerHealth ?? 0) <= 0) break;
  }

  return current;
}

function planActionScore(rootState, terminalState, afterCounter, actions, profile) {
  const preCounter = neuralStateScore(terminalState, profile);
  const postCounter = neuralStateScore(afterCounter, profile);

  const boardDiff = (terminalState.enemyMinions.length - rootState.enemyMinions.length) - (terminalState.playerMinions.length - rootState.playerMinions.length);
  const damageToHero = Math.max(0, rootState.playerHealth - terminalState.playerHealth);
  const selfDamage = Math.max(0, rootState.enemyHealth - terminalState.enemyHealth);

  const stepPenalty = actions.length * 0.35;
  const pressureBonus = damageToHero * 1.2;
  const durabilityBonus = boardDiff * 1.5;

  return (preCounter * 0.35) + (postCounter * 0.65) + pressureBonus + durabilityBonus - selfDamage - stepPenalty;
}

function sanitizeAction(action) {
  if (action.type === 'attack-hero') {
    return { type: action.type, attackerId: action.attackerId, trace: action.trace };
  }
  if (action.type === 'attack-minion') {
    return {
      type: action.type,
      attackerId: action.attackerId,
      targetId: action.targetId,
      trace: action.trace,
    };
  }
  if (action.type === 'summon') {
    return {
      type: action.type,
      deckIndex: action.deckIndex,
      trace: action.trace,
    };
  }
  return { type: 'pass', trace: action.trace ?? `${ACTION_TRACE_PREFIX}:pass` };
}

function neuralConfig(profile) {
  const level = clamp(profile?.level ?? 1, 1, 20);
  const scale = clamp((level - 4) / 12, 0, 1);
  const isUltimate = (profile?.id === 'neural-ai') || (String(profile?.name ?? '').toLowerCase() === 'neural ai');

  return {
    maxDepth: isUltimate ? 7 : 4 + Math.round(scale * 2),
    beamWidth: isUltimate ? 28 : 10 + Math.round(scale * 10),
    attackBranchLimit: isUltimate ? 16 : 8 + Math.round(scale * 5),
    summonBranchLimit: isUltimate ? 6 : 3 + Math.round(scale * 2),
    counterDepth: isUltimate ? 3 : 2,
    playerBranchLimit: isUltimate ? 10 : 6,
  };
}

function neuralTurnPlan(state, profile) {
  const cfg = neuralConfig(profile);
  const root = cloneState(state);

  let frontier = [{
    sim: root,
    actions: [],
    score: neuralStateScore(root, profile),
  }];
  const terminals = [];

  for (let depth = 0; depth < cfg.maxDepth; depth += 1) {
    const expanded = [];

    for (const node of frontier) {
      if ((node.sim.playerHealth ?? 0) <= 0 || (node.sim.enemyHealth ?? 0) <= 0) {
        terminals.push(node);
        continue;
      }

      const options = enumerateEnemyActions(node.sim, profile, cfg);
      let madeChild = false;

      for (const action of options) {
        if (action.type === 'pass') {
          terminals.push(node);
          continue;
        }

        const after = applySideAction(node.sim, 'enemy', action, profile);
        if (!after) continue;

        madeChild = true;
        const actionGain = neuralStateScore(after, profile) - neuralStateScore(node.sim, profile) + quickAttackBonus(node.sim, after, action);
        expanded.push({
          sim: after,
          actions: [...node.actions, sanitizeAction(action)],
          score: node.score + actionGain,
        });
      }

      if (!madeChild) terminals.push(node);
    }

    if (!expanded.length) break;

    expanded.sort((a, b) => b.score - a.score);
    frontier = expanded.slice(0, cfg.beamWidth);

    const lethal = frontier.find((entry) => (entry.sim.playerHealth ?? 0) <= 0);
    if (lethal) {
      terminals.push(lethal);
      break;
    }
  }

  terminals.push(...frontier);

  let best = null;
  let bestScore = -Infinity;

  for (const candidate of terminals) {
    const afterCounter = simulatePlayerCounterplay(candidate.sim, profile, cfg);
    const score = planActionScore(root, candidate.sim, afterCounter, candidate.actions, profile);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (!best || best.actions.length === 0) {
    return [{ type: 'pass', trace: `${ACTION_TRACE_PREFIX}:enemy:no-plan` }];
  }

  return best.actions;
}

function bestTradeTarget(state) {
  if (state.playerMinions.length === 0) return null;
  return [...state.playerMinions].sort((a, b) => (b.attack + b.health) - (a.attack + a.health))[0];
}

function bestFaceAttacker(state) {
  const attackers = availableAttackers(state, 'enemy');
  return attackers.sort((a, b) => (b.attack ?? 0) - (a.attack ?? 0))[0] ?? null;
}

function canLethalHero(state, attacker) {
  return !hasTaunt(state.playerMinions) && attacker && (attacker.attack ?? 0) >= state.playerHealth;
}

function legacyAction(state, profile) {
  const weights = profile?.weights ?? {};
  const strategy = profile?.strategy ?? 'default';
  const enemyAttacker = bestFaceAttacker(state);

  if (canLethalHero(state, enemyAttacker)) {
    return { type: 'attack-hero', attackerId: enemyAttacker.id, trace: 'legacy:lethal-check' };
  }

  if (profile?.boss && state.bossMode && (profile.script ?? []).includes('shadow-roar') && Math.random() < 0.4) {
    return { type: 'boss-roar', trace: 'legacy:script:shadow-roar' };
  }

  if (strategy === 'aggro' && enemyAttacker && !hasTaunt(state.playerMinions) && Math.random() < 0.75) {
    return { type: 'attack-hero', attackerId: enemyAttacker.id, trace: 'legacy:aggro:push-face' };
  }

  if (state.enemyMinions.length < MAX_LANE_SIZE && Math.random() < (weights.summon ?? 0.2)) {
    return { type: 'summon', trace: `legacy:weighted:summon:${strategy}` };
  }

  if (enemyAttacker && state.playerMinions.length > 0 && Math.random() < (weights.trade ?? 0.5)) {
    const target = bestTradeTarget(state);
    if (target) {
      return {
        type: 'attack-minion',
        attackerId: enemyAttacker.id,
        targetId: target.id,
        trace: `legacy:weighted:trade:${strategy}`,
      };
    }
  }

  if (enemyAttacker && !hasTaunt(state.playerMinions) && Math.random() < (weights.attackFace ?? 0.2)) {
    return { type: 'attack-hero', attackerId: enemyAttacker.id, trace: `legacy:weighted:attack-face:${strategy}` };
  }

  return { type: 'pass', trace: `legacy:fallback:pass:${strategy}` };
}

function usesNeuralPlanner(profile) {
  const profileName = String(profile?.name ?? '').toLowerCase();
  return profile?.tacticProfile === 'neural-network'
    || profile?.id === 'nivinis'
    || profile?.id === 'neural-ai'
    || profileName === 'neural ai';
}

export function chooseTurnPlan(state, profile) {
  if (!profile) return [{ type: 'pass', trace: 'no-profile' }];

  if (usesNeuralPlanner(profile) || profile?.tacticProfile === 'omniscient') {
    return neuralTurnPlan(state, profile);
  }

  return [legacyAction(state, profile)];
}

export function getThinkDelay(profile) {
  const [minMs, maxMs] = profile?.thinkMsRange ?? [350, 750];
  const clampedMin = Math.max(250, minMs);
  const clampedMax = Math.min(2200, Math.max(clampedMin + 50, maxMs));
  return Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin;
}

export function getThinkingLine(profile) {
  const pool = {
    aggro: ['Running kill-net inference...', 'Face-damage branch selected...', 'Lethal vectors prioritized...'],
    control: ['Stabilizing board matrix...', 'Threat map recalculated...', 'Counterplay branches collapsing...'],
    value: ['Resource graph optimized...', 'Sequencing high-value line...', 'Future turns weighted...'],
    genius: ['Neural horizon search active...', 'Counterfactual tree resolved...', 'Dominant line committed...'],
    default: ['Evaluating board graph...', 'Projecting responses...', 'Calibrating action values...'],
  };
  const strategy = profile?.strategy ?? 'default';
  return pickRandom(pool[strategy] ?? pool.default);
}

export function chooseAction(state, profile) {
  if (!profile) return { type: 'pass', trace: 'no-profile' };

  if (usesNeuralPlanner(profile) || profile?.tacticProfile === 'omniscient') {
    const plan = neuralTurnPlan(state, profile);
    return plan[0] ?? { type: 'pass', trace: `${ACTION_TRACE_PREFIX}:fallback` };
  }

  return legacyAction(state, profile);
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
    allowMultiAttack: !!template.allowMultiAttack,
    allowFriendlyAttack: !!template.allowFriendlyAttack,
    charge: !!template.charge,
  };
}

