import { Registry } from '../core/registry.js';
import { loadPlugins } from '../core/loader.js';

const registry = new Registry();

const state = {
  groups: [],
};

function addGroup(initialOp = 'AND') {
  state.groups.push({
    id: `g-${crypto.randomUUID().slice(0, 8)}`,
    op: initialOp,
    conditions: [
      { kind: 'board', field: 'enemyHasTaunt', value: 'true' },
    ],
  });
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

    const rows = group.conditions.map((condition, i) => `
      <div class="condition-row" data-group="${group.id}" data-index="${i}">
        <select data-key="kind">
          <option value="board" ${condition.kind === 'board' ? 'selected' : ''}>board</option>
          <option value="resource" ${condition.kind === 'resource' ? 'selected' : ''}>resource</option>
          <option value="tribe" ${condition.kind === 'tribe' ? 'selected' : ''}>tribe</option>
          <option value="status" ${condition.kind === 'status' ? 'selected' : ''}>status</option>
        </select>
        <input data-key="field" value="${condition.field}" />
        <input data-key="value" value="${condition.value}" />
        <button type="button" data-remove="${i}">Remove</button>
      </div>
    `).join('');

    wrapper.innerHTML = `
      <div class="group-header">
        <strong>Group ${group.id}</strong>
        <label>Operator
          <select data-op="${group.id}">
            <option value="AND" ${group.op === 'AND' ? 'selected' : ''}>AND</option>
            <option value="OR" ${group.op === 'OR' ? 'selected' : ''}>OR</option>
          </select>
        </label>
      </div>
      ${rows}
      <button type="button" data-add="${group.id}">Add Condition</button>
    `;

    host.appendChild(wrapper);
  });

  host.querySelectorAll('button[data-add]').forEach((button) => {
    button.onclick = () => addCondition(button.dataset.add);
  });

  host.querySelectorAll('button[data-remove]').forEach((button) => {
    button.onclick = () => {
      const row = button.closest('.condition-row');
      const group = state.groups.find((g) => g.id === row.dataset.group);
      group.conditions.splice(Number(button.dataset.remove), 1);
      if (group.conditions.length === 0) {
        group.conditions.push({ kind: 'board', field: 'always', value: 'true' });
      }
      renderGroups();
    };
  });

  host.querySelectorAll('select[data-op]').forEach((select) => {
    select.onchange = () => {
      const group = state.groups.find((g) => g.id === select.dataset.op);
      group.op = select.value;
    };
  });

  host.querySelectorAll('.condition-row').forEach((row) => {
    row.querySelectorAll('select,input').forEach((input) => {
      input.oninput = () => {
        const group = state.groups.find((g) => g.id === row.dataset.group);
        const condition = group.conditions[Number(row.dataset.index)];
        condition[input.dataset.key] = input.value;
      };
    });
  });
}

function parseAdvancedJson() {
  const text = document.querySelector('#advanced-json').value.trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { __advancedJsonError: 'Invalid advanced JSON ignored.' };
  }
}

function collectAbility() {
  const templateId = document.querySelector('#ability-template').value;
  const template = registry.list('abilityPacks')
    .flatMap((pack) => pack.templates ?? [])
    .find((item) => item.id === templateId);

  const ability = {
    id: `ability-${crypto.randomUUID().slice(0, 8)}`,
    type: 'ability',
    name: template?.name ?? 'Custom Ability',
    trigger: document.querySelector('#ability-trigger').value,
    templateId,
    effect: template?.effect ?? { action: 'dealDamage', amount: 1 },
    targeting: {
      source: document.querySelector('#target-source').value,
      scope: document.querySelector('#target-scope').value,
      filterTag: document.querySelector('#target-filter').value || null,
    },
    conditions: state.groups.map((group) => ({
      operator: group.op,
      entries: group.conditions,
    })),
  };

  return { ...ability, ...parseAdvancedJson() };
}

function explainAbility(ability) {
  const conditions = ability.conditions
    .map((group, i) => `Group ${i + 1} (${group.operator}): ${group.entries.map((c) => `${c.kind}.${c.field}=${c.value}`).join(', ')}`)
    .join(' | ');
  const targetFilter = ability.targeting.filterTag ? ` filtered by tag '${ability.targeting.filterTag}'` : '';
  return `${ability.name} triggers on ${ability.trigger} and applies ${ability.effect.action} to ${ability.targeting.scope}${targetFilter}. Conditions: ${conditions || 'none'}.`;
}

function setupCardCreator() {
  const form = document.querySelector('#card-form');
  const preview = document.querySelector('#preview');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const cardType = data.get('cardType');
    const base = {
      type: 'card',
      id: data.get('id'),
      name: data.get('name'),
      cardType,
      cost: Number(data.get('cost')),
    };
    const card = cardType === 'minion'
      ? { ...base, type: 'minion', attack: Number(data.get('attack')), health: Number(data.get('health')), taunt: data.get('taunt') === 'on' }
      : { ...base, type: 'spell', spellSchool: 'arcane' };

    preview.textContent = JSON.stringify(card, null, 2);
  });
}

function setupHeroCreator() {
  const form = document.querySelector('#hero-form');
  const preview = document.querySelector('#preview');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const hero = {
      type: 'hero',
      id: data.get('id'),
      name: data.get('name'),
      health: Number(data.get('health')),
      tribe: data.get('tribe') || null,
      heroPower: {
        name: data.get('powerName'),
        cost: Number(data.get('powerCost')),
      },
    };
    preview.textContent = JSON.stringify(hero, null, 2);
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
    ],
    (line) => logs.push(line),
  );

  [...logs, ...errors.map((e) => `Error: ${e}`)].forEach((line) => {
    const card = document.createElement('article');
    card.textContent = line;
    host.appendChild(card);
  });

  setupCardCreator();
  setupHeroCreator();
  setupAbilityBuilder();
  addGroup('AND');
}

boot();
