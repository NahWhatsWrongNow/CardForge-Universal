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
  },
  stats: {
    wins: 0,
    losses: 0,
    packsOpened: 0,
    favoriteTribe: 'none',
    streak: 0,
  },
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
