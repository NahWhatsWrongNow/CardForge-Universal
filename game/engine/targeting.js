export function explainInvalidAction(reason) {
  const hints = {
    defense: 'This unit is in defense mode. Toggle stance to attack.',
    taunt: 'An enemy with taunt must be attacked first.',
    mana: 'You need more mana crystals to play this card.',
  };
  return hints[reason] ?? 'That action is not valid right now.';
}
