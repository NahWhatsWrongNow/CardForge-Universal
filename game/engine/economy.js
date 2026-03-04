export function getWinReward(streak = 0) {
  return 100 + Math.min(streak * 10, 50);
}
