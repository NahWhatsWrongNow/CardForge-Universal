const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

export function getWinReward(streak = 0) {
  return 100 + Math.min(streak * 10, 50);
}

function bucketByRarity(cards) {
  return cards.reduce((acc, card) => {
    const rarity = card.rarity ?? 'common';
    acc[rarity] = acc[rarity] ?? [];
    acc[rarity].push(card);
    return acc;
  }, {});
}

function chooseRarity(weights, pityState, pityRule) {
  const roll = Math.random();
  let cursor = 0;
  for (const [rarity, weight] of Object.entries(weights)) {
    cursor += weight;
    if (roll <= cursor) {
      return rarity;
    }
  }

  const threshold = pityRule?.threshold ?? Number.MAX_SAFE_INTEGER;
  if ((pityState.missesUntilGuaranteed ?? 0) >= threshold) {
    return pityRule.rarity;
  }
  return 'common';
}

export function openPack(cards, product, pityState = { missesUntilGuaranteed: 0 }) {
  const byRarity = bucketByRarity(cards);
  const pulls = [];
  let misses = pityState.missesUntilGuaranteed ?? 0;

  for (let i = 0; i < (product.count ?? 3); i += 1) {
    let rarity = chooseRarity(product.weights ?? { common: 1 }, { missesUntilGuaranteed: misses }, product.pity);
    const pityRarity = product.pity?.rarity ?? 'rare';

    if (product.pity && misses >= product.pity.threshold) {
      rarity = pityRarity;
      misses = 0;
    }

    const pool = byRarity[rarity] ?? byRarity.common ?? [];
    const card = pool[Math.floor(Math.random() * pool.length)] ?? cards[0];
    pulls.push({ ...card, rarity });

    if (RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(pityRarity)) {
      misses = 0;
    } else {
      misses += 1;
    }
  }

  return {
    pulls,
    pityState: { missesUntilGuaranteed: misses },
  };
}

export function evaluateQuest(quest, progress = {}) {
  const current = progress[quest.metric] ?? 0;
  return {
    current,
    done: current >= quest.target,
  };
}
