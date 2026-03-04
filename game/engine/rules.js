export function canAttackHero(enemyMinions, hasBypass = false) {
  return hasBypass || enemyMinions.length === 0;
}

export function mustHitTaunt(enemyMinions) {
  return enemyMinions.find((m) => m.taunt) ?? null;
}
