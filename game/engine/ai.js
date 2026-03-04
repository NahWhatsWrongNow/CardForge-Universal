export function chooseAction(state) {
  if (state.enemyMinions?.length) return { type: 'attack', target: state.enemyMinions[0].id };
  return { type: 'pass' };
}
