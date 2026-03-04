import { uid } from '../../core/utils.js';

function pickRandom(list = []) {
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export function chooseAction(state, profile) {
  if (!profile) return { type: 'pass', trace: 'no-profile' };
  const weights = profile.weights ?? {};
  const enemyAttacker = state.enemyMinions.find((unit) => !unit.defense);

  if (profile.boss && state.bossMode && (profile.script ?? []).includes('shadow-roar') && Math.random() < 0.35) {
    return { type: 'boss-roar', trace: 'script:shadow-roar' };
  }

  if (state.enemyMinions.length < 3 && Math.random() < (weights.summon ?? 0)) {
    return { type: 'summon', trace: 'weighted:summon' };
  }

  if (enemyAttacker && state.playerMinions.length > 0 && Math.random() < (weights.trade ?? 0.5)) {
    const target = [...state.playerMinions].sort((a, b) => (a.health + a.attack) - (b.health + b.attack))[0];
    return { type: 'attack-minion', attackerId: enemyAttacker.id, targetId: target.id, trace: 'weighted:trade' };
  }

  if (enemyAttacker && Math.random() < (weights.attackFace ?? 0.2)) {
    return { type: 'attack-hero', attackerId: enemyAttacker.id, trace: 'weighted:attackFace' };
  }

  return { type: 'pass', trace: 'fallback:pass' };
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
  };
}
