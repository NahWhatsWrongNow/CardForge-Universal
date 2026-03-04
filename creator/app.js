import { Registry } from '../core/registry.js';
import { loadPlugins } from '../core/loader.js';

const registry = new Registry();
const state = { groups: [] };

function addGroup(initialOp = 'AND') {
  state.groups.push({ id: `g-${crypto.randomUUID().slice(0, 8)}`, op: initialOp, conditions: [{ kind: 'board', field: 'enemyHasTaunt', value: 'true' }] });
  renderGroups();
}

function addCondition(groupId) {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) return;
  group.conditions.push({ kind: 'resource', field: 'manaAtLeast', value: '3' });
  renderGroups();
}

function renderGroups() {
  const host = document.querySelector('#condition-groups');
  host.innerHTML = '';
  state.groups.forEach((group) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'group';
    const rows = group.conditions.map((condition, i) => `<div class="condition-row" data-group="${group.id}" data-index="${i}"><select data-key="kind"><option value="board" ${condition.kind === 'board' ? 'selected' : ''}>board</option><option value="resource" ${condition.kind === 'resource' ? 'selected' : ''}>resource</option><option value="tribe" ${condition.kind === 'tribe' ? 'selected' : ''}>tribe</option><option value="status" ${condition.kind === 'status' ? 'selected' : ''}>status</option></select><input data-key="field" value="${condition.field}" /><input data-key="value" value="${condition.value}" /><button type="button" data-remove="${i}">Remove</button></div>`).join('');
    wrapper.innerHTML = `<div class="group-header"><strong>Group ${group.id}</strong><label>Operator <select data-op="${group.id}"><option value="AND" ${group.op === 'AND' ? 'selected' : ''}>AND</option><option value="OR" ${group.op === 'OR' ? 'selected' : ''}>OR</option></select></label><button type="button" data-add="${group.id}">Add Condition</button></div>${rows}`;
    host.appendChild(wrapper);
  });

  host.querySelectorAll('[data-add]').forEach((button) => { button.onclick = () => addCondition(button.dataset.add); });
  host.querySelectorAll('[data-op]').forEach((select) => { select.onchange = () => { const g = state.groups.find((entry) => entry.id === select.dataset.op); if (g) g.op = select.value; }; });
  host.querySelectorAll('.condition-row').forEach((row) => {
    row.querySelectorAll('[data-key]').forEach((input) => {
      input.oninput = () => {
        const group = state.groups.find((entry) => entry.id === row.dataset.group);
        if (!group) return;
        group.conditions[Number(row.dataset.index)][input.dataset.key] = input.value;
      };
    });
    row.querySelector('[data-remove]').onclick = () => {
      const group = state.groups.find((entry) => entry.id === row.dataset.group);
      if (!group) return;
      group.conditions.splice(Number(row.dataset.index), 1);
      renderGroups();
    };
  });
}

document.querySelector('#add-group').onclick = () => addGroup('AND');

function parseAdvancedJson() {
  const raw = document.querySelector('#advanced-json').value.trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { parseError: 'Invalid advanced JSON ignored.' }; }
}

function collectAbility() {
  const templateId = document.querySelector('#ability-template').value;
  const template = registry.list('abilityPacks').flatMap((pack) => pack.templates ?? []).find((item) => item.id === templateId);
  const ability = {
    id: `ability-${crypto.randomUUID().slice(0, 8)}`,
    type: 'ability',
    name: template?.name ?? 'Custom Ability',
    trigger: document.querySelector('#ability-trigger').value,
    templateId,
    effect: template?.effect ?? { action: 'dealDamage', amount: 1 },
    targeting: { source: document.querySelector('#target-source').value, scope: document.querySelector('#target-scope').value, filterTag: document.querySelector('#target-filter').value || null },
    conditions: state.groups.map((group) => ({ operator: group.op, entries: group.conditions })),
  };
  return { ...ability, ...parseAdvancedJson() };
}

function explainAbility(ability) {
  const conditions = ability.conditions.map((group, i) => `Group ${i + 1} (${group.operator}): ${group.entries.map((c) => `${c.kind}.${c.field}=${c.value}`).join(', ')}`).join(' | ');
  return `${ability.name} triggers on ${ability.trigger}; effect: ${ability.effect.action}. Conditions: ${conditions || 'none'}.`;
}

function setupCardTemplates() {
  const select = document.querySelector('#card-template-select');
  const templates = registry.list('creatorCardPacks').flatMap((pack) => pack.cards ?? []).filter((c) => c.template);
  templates.forEach((template) => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = `${template.name} (${template.type})`;
    select.appendChild(option);
  });
  if (templates.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No templates loaded';
    select.appendChild(option);
  }

  document.querySelector('#use-template').onclick = () => {
    const template = templates.find((entry) => entry.id === select.value);
    if (!template) return;
    const form = document.querySelector('#card-form');
    form.elements.id.value = template.id;
    form.elements.name.value = template.name;
    form.elements.cardType.value = template.type;
    form.elements.cost.value = template.cost ?? 1;
    form.elements.attack.value = template.attack ?? 1;
    form.elements.health.value = template.health ?? 1;
    form.elements.damage.value = template.damage ?? 0;
    form.elements.race.value = template.race ?? '';
    form.elements.element.value = template.element ?? '';
    form.elements.rarity.value = template.rarity ?? 'common';
    form.elements.synergy.value = (template.synergy ?? []).join(',');
    form.elements.taunt.checked = !!template.taunt;
  };
}

function setupCardCreator() {
  const form = document.querySelector('#card-form');
  const preview = document.querySelector('#preview');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const cardType = data.get('cardType');
    const base = { id: data.get('id'), name: data.get('name'), type: cardType, cost: Number(data.get('cost')), rarity: data.get('rarity'), race: data.get('race') || null, element: data.get('element') || null };
    const card = cardType === 'minion'
      ? { ...base, attack: Number(data.get('attack')), health: Number(data.get('health')), taunt: data.get('taunt') === 'on' }
      : { ...base, damage: Number(data.get('damage')), synergy: String(data.get('synergy') || '').split(',').map((s) => s.trim()).filter(Boolean) };
    preview.textContent = JSON.stringify(card, null, 2);
  });
}

function setupAiCreator() {
  const form = document.querySelector('#ai-form');
  const preview = document.querySelector('#preview');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const ai = {
      type: 'ai-pack',
      id: data.get('id'),
      name: data.get('name'),
      weights: { attackFace: Number(data.get('attackFace')), trade: Number(data.get('trade')), summon: Number(data.get('summon')) },
      personality: { title: data.get('title'), dimensionTag: data.get('dimensionTag'), backstory: data.get('backstory') },
      summons: [{ name: 'Generated Companion', attack: 3, health: 3, race: 'construct', element: 'arcane' }],
    };
    preview.textContent = JSON.stringify(ai, null, 2);
    document.querySelector('#explanation').textContent = `${ai.personality.title} ${ai.personality.dimensionTag}: ${ai.personality.backstory}`;
  });
}

function setupAbilityBuilder() {
  const select = document.querySelector('#ability-template');
  const templates = registry.list('abilityPacks').flatMap((pack) => pack.templates ?? []);
  templates.forEach((template) => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = `${template.name} (${template.id})`;
    select.appendChild(option);
  });
  if (templates.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'No templates loaded';
    option.value = '';
    select.appendChild(option);
  }

  document.querySelector('#preview-ability').onclick = () => {
    const ability = collectAbility();
    document.querySelector('#preview').textContent = JSON.stringify(ability, null, 2);
  };
  document.querySelector('#explain-ability').onclick = () => {
    const ability = collectAbility();
    document.querySelector('#preview').textContent = JSON.stringify(ability, null, 2);
    document.querySelector('#explanation').textContent = explainAbility(ability);
  };
}

async function boot() {
  const host = document.querySelector('#plugin-list');
  const logs = [];
  const errors = await loadPlugins(
    registry,
    [
      { manifest: './plugins/index.json', base: './plugins', type: 'card-pack', kind: 'creatorCardPacks' },
      { manifest: './ability_packs/index.json', base: './ability_packs', type: 'ability-pack', kind: 'abilityPacks' },
      { manifest: '../packs/index.json', base: '../packs', type: 'card-pack', kind: 'sharedCardPacks' },
      { manifest: '../game/ai_packs/index.json', base: '../game/ai_packs', type: 'ai-pack', kind: 'aiPacks' },
    ],
    (line) => logs.push(line),
  );

  [...logs, ...errors.map((e) => `Error: ${e}`)].forEach((line) => {
    const card = document.createElement('article');
    card.textContent = line;
    host.appendChild(card);
  });

  setupCardTemplates();
  setupCardCreator();
  setupAiCreator();
  setupAbilityBuilder();
  addGroup('AND');
}

boot();
