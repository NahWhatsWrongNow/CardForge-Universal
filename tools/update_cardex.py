import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
cards_path = root / 'packs' / 'starter_cards.json'
out_path = root / 'cardex.json'

cards = json.loads(cards_path.read_text())['cards']
entries = []
for card in cards:
    ability = card.get('ability') or {'action': 'none', 'amount': 0}
    entries.append({
        'id': card.get('id'),
        'name': card.get('name'),
        'type': card.get('type'),
        'rarity': card.get('rarity', 'common'),
        'cost': card.get('cost', 0),
        'ability': ability,
        'tags': card.get('tags', []),
    })

payload = {
    'updatedAt': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
    'count': len(entries),
    'cards': entries,
}
out_path.write_text(json.dumps(payload, indent=2))
print(f'wrote {out_path} ({len(entries)} cards)')
