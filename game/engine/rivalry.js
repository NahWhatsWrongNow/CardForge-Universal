function clampChance(value = 0) {
  return Math.max(0, Math.min(1, value));
}

function meetsConditions(rule, attacker, state, ownerSide, familiarity = {}) {
  const conditions = rule.conditions ?? {};
  const ownerLane = ownerSide === 'player' ? state.playerMinions : state.enemyMinions;
  const enemyLane = ownerSide === 'player' ? state.enemyMinions : state.playerMinions;

  if (conditions.adjacentAllyRace) {
    const index = ownerLane.findIndex((entry) => entry.id === attacker.id);
    const adjacent = [ownerLane[index - 1], ownerLane[index + 1]].filter(Boolean);
    if (!adjacent.some((entry) => entry.race === conditions.adjacentAllyRace)) return false;
  }

  if (conditions.enemyControlsElement) {
    if (!enemyLane.some((entry) => entry.element === conditions.enemyControlsElement)) return false;
  }

  if (conditions.familiarityAtLeast) {
    const score = familiarity[attacker.race]?.[rule.targetRace] ?? 0;
    if (score < conditions.familiarityAtLeast) return false;
  }

  return true;
}

function findMatchingRules(attacker, defender, state, ownerSide) {
  const packs = state.rivalryPacks ?? [];
  const matched = [];
  packs.forEach((pack) => {
    (pack.rivalries ?? []).forEach((rule) => {
      if (rule.sourceRace !== attacker.race || rule.targetRace !== defender.race) return;
      if (!meetsConditions(rule, attacker, state, ownerSide, pack.familiarity)) return;
      matched.push(rule);
    });
  });
  return matched;
}

export function getRivalryIndicators(minion, opponents, state, ownerSide) {
  const hasAdvantage = opponents.some((opponent) => findMatchingRules(minion, opponent, state, ownerSide).length > 0);
  const hasDisadvantage = opponents.some((opponent) => findMatchingRules(opponent, minion, state, ownerSide === 'player' ? 'enemy' : 'player').length > 0);
  return { hasAdvantage, hasDisadvantage };
}

export function resolveCombat(attacker, defender, state, ownerSide) {
  const matched = findMatchingRules(attacker, defender, state, ownerSide);
  const layer = {
    attackBonus: 0,
    critChance: 0,
    deflectChance: 0,
    fearChance: 0,
    statusApplyBonus: 0,
    statusResistBonus: 0,
  };

  matched.forEach((rule) => {
    layer.attackBonus += rule.layers?.combat?.attackBonus ?? 0;
    layer.critChance += rule.layers?.combat?.critChance ?? 0;
    layer.deflectChance += rule.layers?.deflect?.chance ?? 0;
    layer.fearChance += rule.layers?.fear?.chance ?? 0;
    layer.statusApplyBonus += rule.layers?.status?.applyChanceBonus ?? 0;
    layer.statusResistBonus += rule.layers?.status?.resistChanceBonus ?? 0;
  });

  const events = [];
  if (Math.random() < clampChance(layer.fearChance)) {
    events.push('fear');
    return { damageToDefender: 0, damageToAttacker: 0, events, matchedRuleIds: matched.map((rule) => rule.id) };
  }

  let damageToDefender = Math.max(0, attacker.attack + layer.attackBonus - (attacker.statuses?.weakened ? 1 : 0));
  const damageToAttacker = Math.max(0, defender.attack - (defender.statuses?.weakened ? 1 : 0));

  if (Math.random() < clampChance(layer.critChance)) {
    damageToDefender += 1;
    events.push('crit');
  }

  if (Math.random() < clampChance(layer.deflectChance)) {
    damageToDefender = Math.max(0, damageToDefender - 1);
    events.push('deflect');
  }

  const statusChance = clampChance(0.2 + layer.statusApplyBonus - layer.statusResistBonus);
  if (Math.random() < statusChance) {
    defender.statuses = { ...(defender.statuses ?? {}), weakened: 1 };
    events.push('weakened');
  }

  return { damageToDefender, damageToAttacker, events, matchedRuleIds: matched.map((rule) => rule.id) };
}

export function resolveSpellPower(source, target, basePower, state, ownerSide) {
  const matched = findMatchingRules(source, target, state, ownerSide);
  const bonus = matched.reduce((total, rule) => total + (rule.layers?.spell?.powerBonus ?? 0), 0);
  return {
    power: Math.max(0, basePower + bonus),
    matchedRuleIds: matched.map((rule) => rule.id),
  };
}
