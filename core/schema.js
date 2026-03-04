const SCHEMAS = {
  'card-pack': ['id', 'name', 'cards'],
  card: ['id', 'name', 'type', 'cost'],
  'ai-pack': ['id', 'name', 'weights'],
  'mode-pack': ['id', 'name', 'rules'],
  'quest-pack': ['id', 'name', 'quests'],
  'store-pack': ['id', 'name', 'products'],
  'ability-pack': ['id', 'name', 'templates'],
  ability: ['id', 'name', 'trigger', 'effect'],
  'race-pack': ['id', 'name', 'rivalries'],
  'deck-pack': ['id', 'name', 'decks'],
  'backdrop-pack': ['id', 'name', 'backdrops'],
  'audio-pack': ['id', 'name', 'playlists'],
  'cosmetic-pack': ['id', 'name', 'cardBacks'],
  'theme-pack': ['id', 'name', 'themes'],
};

export function validateSchema(item, expectedType) {
  const type = expectedType ?? item.type;
  const missing = [];
  const fields = SCHEMAS[type] ?? [];
  fields.forEach((field) => {
    if (item[field] === undefined || item[field] === null) {
      missing.push(field);
    }
  });

  return {
    ok: missing.length === 0,
    missing,
    type,
  };
}
