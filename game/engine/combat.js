export function trade(attacker, defender) {
  defender.health -= attacker.attack;
  attacker.health -= defender.attack;
  return { attacker, defender };
}
