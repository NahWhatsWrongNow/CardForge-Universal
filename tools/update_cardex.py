import json
from datetime import datetime
from pathlib import Path

root = Path(__file__).resolve().parents[1]
packs_index = root / 'packs' / 'index.json'
out_path = root / 'cardex.json'

entries = json.loads(packs_index.read_text()).get('entries', [])
all_cards = []
for entry in entries:
    pack_path = root / 'packs' / entry
    payload = json.loads(pack_path.read_text())
    all_cards.extend(payload.get('cards', []))

cards = []
for card in all_cards:
    ability = card.get('ability') or card.get('effect') or {'action': 'none', 'amount': 0}
    cards.append({
        'id': card.get('id'),
        'name': card.get('name'),
        'type': card.get('type'),
        'rarity': card.get('rarity', 'common'),
        'cost': card.get('cost', 0),
        'ability': ability,
        'tags': card.get('tags', []),
        'bibliography': card.get('bibliography', ''),
    })

payload = {'updatedAt': f"{datetime.utcnow().isoformat()}Z", 'count': len(cards), 'cards': cards}
out_path.write_text(json.dumps(payload, indent=2))
print(f'wrote {out_path} ({len(cards)} cards)')
