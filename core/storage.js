const STORAGE_KEY = 'cardforge.profile.v1';

const defaultProfile = {
  version: 1,
  devUnlocked: false,
  settings: {
    uiScale: 1,
    reduceMotion: false,
    highContrast: false,
    colorblindOutlines: true,
    sfxVolume: 0.8,
    musicVolume: 0.5,
    selectedBackdrop: 'nebula-board',
    selectedPlaylist: 'menu-vibes',
    selectedCardBack: 'classic-onyx',
  },
  stats: {
    wins: 0,
    losses: 0,
    packsOpened: 0,
    favoriteTribe: 'none',
    streak: 0,
  },
  economy: {
    gold: 250,
    pityByProduct: {},
  },
  collection: {
    'river-scout': 2,
    'iron-guard': 2,
    'ember-adept': 2,
    'pack-bolt': 2,
  },
  questProgress: {
    cardsPlayed: 0,
    packsOpened: 0,
  },
  questClaims: {},
};

export function loadProfile() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return structuredClone(defaultProfile);
    const parsed = JSON.parse(stored);
    return {
      ...structuredClone(defaultProfile),
      ...parsed,
      settings: { ...defaultProfile.settings, ...(parsed.settings ?? {}) },
      stats: { ...defaultProfile.stats, ...(parsed.stats ?? {}) },
      economy: { ...defaultProfile.economy, ...(parsed.economy ?? {}) },
      collection: { ...defaultProfile.collection, ...(parsed.collection ?? {}) },
      questProgress: { ...defaultProfile.questProgress, ...(parsed.questProgress ?? {}) },
      questClaims: { ...defaultProfile.questClaims, ...(parsed.questClaims ?? {}) },
    };
  } catch {
    return structuredClone(defaultProfile);
  }
}

export function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function setDevUnlocked(unlocked) {
  const profile = loadProfile();
  profile.devUnlocked = unlocked;
  saveProfile(profile);
  return profile;
}
