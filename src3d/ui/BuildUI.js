import { BUILDINGS, UPGRADES, UPGRADES_BY_ID, structureLabel } from '../data/structures.js';

// Construction Hub + upgrade menu overlays (GAME_DESIGN.md §9), HTML/CSS like
// the rest of the UI. Pure view over GameState; placement itself is handed to
// the ConstructionManager (ghost mesh → click to place). Matching the 2D
// menus: unaffordable BUILD/UPGRADE buttons are inert rather than erroring,
// and an upgraded building shows a status card instead of options.

const RESOURCE_ICONS = { coins: '🪙', apples: '🍎', stone: '🪨', wood: '🪵', fish: '🐟' };

function costChips(state, cost) {
  return Object.entries(cost)
    .map(([res, n]) => {
      const ok = (state.resources[res] ?? 0) >= n;
      return `<span class="cost-chip ${ok ? 'ok' : 'short'}">${RESOURCE_ICONS[res]} ${n}</span>`;
    })
    .join('');
}

export class BuildUI {
  constructor(state, construction) {
    this.state = state;
    this.construction = construction;
    this.upgradeTarget = null; // structure entry the upgrade panel is showing

    this.buildBtn = document.getElementById('build-btn');
    this.buildPanel = document.getElementById('build-panel');
    this.upgradePanel = document.getElementById('upgrade-panel');
    this.placeHint = document.getElementById('place-hint');

    this.buildBtn.addEventListener('click', () => this.toggleHub());

    construction.onStructureClicked = (entry) => this.openUpgrade(entry);
    construction.onPlacementChanged = (def) => {
      this.placeHint.classList.toggle('open', !!def);
      if (def) {
        this.placeHint.textContent = `${def.icon} Placing ${def.name} — click the ground to build · Esc to cancel`;
      }
    };

    // Keep costs/buttons truthful while panels are open.
    state.on('resources', () => {
      if (this.buildPanel.classList.contains('open')) this.#renderHub();
      if (this.upgradePanel.classList.contains('open')) this.#renderUpgrade();
    });
    state.on('structureUpgraded', (s) => {
      if (this.upgradeTarget?.id === s.id && this.upgradePanel.classList.contains('open')) {
        this.#renderUpgrade();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.closeAll();
    });
  }

  // — Open/close (one overlay at a time, like the 2D closeAllMenus) ————
  toggleHub() {
    const open = !this.buildPanel.classList.contains('open');
    this.closeAll();
    if (!open) return;
    this.buildPanel.classList.add('open');
    this.#renderHub();
  }

  openUpgrade(entry) {
    this.closeAll();
    this.upgradeTarget = entry;
    this.upgradePanel.classList.add('open');
    this.#renderUpgrade();
  }

  closeAll() {
    for (const id of [
      'build-panel',
      'upgrade-panel',
      'store-panel',
      'pack-panel',
      'craft-panel',
      'backpack-panel',
      'fight-panel',
    ]) {
      document.getElementById(id)?.classList.remove('open');
    }
  }

  // — Construction Hub ————————————————————————————————————————————
  #renderHub() {
    this.buildPanel.innerHTML = `
      <div class="panel-head">
        <h3>🏗️ Construction Hub</h3>
        <button class="panel-close" id="build-close">✕</button>
      </div>
      <div id="build-rows"></div>
    `;
    this.buildPanel
      .querySelector('#build-close')
      .addEventListener('click', () => this.closeAll());

    const rows = this.buildPanel.querySelector('#build-rows');
    for (const def of BUILDINGS) {
      const affordable = this.state.canAfford(def.cost);
      const row = document.createElement('div');
      row.className = 'build-row';
      row.innerHTML = `
        <div class="build-icon">${def.icon}</div>
        <div class="build-info">
          <div class="build-name">${def.name}</div>
          <div class="build-cost">${costChips(this.state, def.cost)}</div>
          <div class="build-desc">${def.desc}</div>
        </div>
        <button class="panel-btn build-go ${affordable ? '' : 'disabled'}">BUILD</button>
      `;
      if (affordable) {
        row.querySelector('.build-go').addEventListener('click', () => {
          this.closeAll();
          this.construction.beginPlacement(def);
        });
      }
      rows.appendChild(row);
    }
  }

  // — Upgrade menu / status card ————————————————————————————————
  #renderUpgrade() {
    const s = this.upgradeTarget;
    if (!s) return;

    // Already upgraded → status card (2D: "functioning as a ...").
    if (s.upgradeType) {
      const up = UPGRADES_BY_ID[s.upgradeType];
      const activity =
        s.upgradeType === 'tower'
          ? 'Defending island against black dragons...'
          : 'Generating passive resources...';
      this.upgradePanel.innerHTML = `
        <div class="panel-head">
          <h3>${up.icon} ${up.name.toUpperCase()}</h3>
          <button class="panel-close" id="upgrade-close">✕</button>
        </div>
        <div class="upgrade-status">
          <p>This building is functioning as a <b>${up.name}</b>.</p>
          <p class="status-active">Status: Active</p>
          <p class="status-flavor">${activity}</p>
        </div>
      `;
    } else {
      this.upgradePanel.innerHTML = `
        <div class="panel-head">
          <h3>⬆️ Upgrade ${structureLabel(s)}</h3>
          <button class="panel-close" id="upgrade-close">✕</button>
        </div>
        <div class="craft-sub">Pick a one-time upgrade — it can't be undone!</div>
        <div id="upgrade-rows"></div>
      `;
      const rows = this.upgradePanel.querySelector('#upgrade-rows');
      for (const up of UPGRADES) {
        const affordable = this.state.canAfford(up.cost);
        const row = document.createElement('div');
        row.className = 'build-row';
        row.innerHTML = `
          <div class="build-icon" style="color:${up.color}">${up.icon}</div>
          <div class="build-info">
            <div class="build-name" style="color:${up.color}">${up.name}</div>
            <div class="build-cost">${costChips(this.state, up.cost)}</div>
            <div class="build-desc">${up.desc}</div>
          </div>
          <button class="panel-btn build-go ${affordable ? '' : 'disabled'}">UPGRADE</button>
        `;
        if (affordable) {
          row.querySelector('.build-go').addEventListener('click', () => {
            const done = this.state.upgradeStructure(s.id, up.id);
            if (done) this.closeAll();
          });
        }
        rows.appendChild(row);
      }
    }

    this.upgradePanel
      .querySelector('#upgrade-close')
      .addEventListener('click', () => this.closeAll());
  }
}
