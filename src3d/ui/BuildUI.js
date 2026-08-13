import {
  BUILDABLES,
  UPGRADES,
  UPGRADES_BY_ID,
  GRABEN,
  BARBED_WIRE,
  DRAGON_ARMOR,
  structureLabel,
} from '../data/structures.js';
import { DRAGON_TYPES_BY_ID } from '../data/dragonTypes.js';
import { makeDragonThumbnails } from './thumbnails.js';

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
    this.armorPicker = false; // true while the Hub shows the armor dragon list
    this.thumbs = new Map(); // typeId -> dataURL, grown lazily (like CraftingUI)

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

    // Keep costs/buttons truthful while panels are open. A mine ticking while
    // the armor picker is up must re-render the PICKER, not snap back to the
    // Hub and lose the player's place.
    state.on('resources', () => {
      if (this.buildPanel.classList.contains('open')) {
        if (this.armorPicker) this.#renderArmorPicker();
        else this.#renderHub();
      }
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
    this.armorPicker = false;
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
    this.armorPicker = false;
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
    for (const def of BUILDABLES) {
      const check = this.#check(def);
      const label = def.equip ? 'FORGE' : def.id === GRABEN.id ? 'DIG' : 'BUILD';
      const row = document.createElement('div');
      row.className = 'build-row';
      row.innerHTML = `
        <div class="build-icon">${def.icon}</div>
        <div class="build-info">
          <div class="build-name">${def.name}</div>
          <div class="build-cost">${costChips(this.state, def.cost)}</div>
          <div class="build-desc">${check.reason ?? def.desc}</div>
        </div>
        <button class="panel-btn build-go ${check.ok ? '' : 'disabled'}">${label}</button>
      `;
      if (check.ok) {
        row.querySelector('.build-go').addEventListener('click', () => {
          // Armor needs a dragon, not a spot: the Hub becomes a picker.
          if (def.equip) {
            this.#renderArmorPicker();
            return;
          }
          if (!def.instant) {
            this.closeAll();
            this.construction.beginPlacement(def);
            return;
          }
          // Instant builds keep the Hub open so a row can be bought repeatedly;
          // the 'resources' listener above re-renders it after each purchase.
          if (def.id === GRABEN.id) this.construction.digGraben();
          else this.construction.buyBarbedWire();
          this.#renderHub();
        });
      }
      rows.appendChild(row);
    }
  }

  // Can this row be used, and if not, why? The outer defences derive their
  // position from the wall ring, so the manager — not the cost alone — decides,
  // and says why when it says no. Armor additionally needs a bare dragon to put
  // it on. Ghost-placed buildings only need the cost.
  #check(def) {
    if (def.id === GRABEN.id) return this.construction.canDigGraben();
    if (def.id === BARBED_WIRE.id) return this.construction.canBuyBarbedWire();
    if (def.equip && !this.state.hasUnarmoredDragon()) {
      return { ok: false, reason: 'Every one of your dragons is already armored.' };
    }
    return { ok: this.state.canAfford(def.cost), reason: null };
  }

  // — Armor picker: the Hub's own body, swapped in place ————————————
  // Forging needs a target rather than a spot, so the panel turns into a dragon
  // list instead of entering placement mode. Nothing is charged until a dragon
  // is clicked, so ← Back costs the player nothing.
  #renderArmorPicker() {
    this.armorPicker = true;
    this.buildPanel.innerHTML = `
      <div class="panel-head">
        <h3>${DRAGON_ARMOR.icon} Equip ${DRAGON_ARMOR.name}</h3>
        <button class="panel-close" id="build-close">✕</button>
      </div>
      <div class="craft-sub">
        Pick the dragon to armor — it takes half damage from then on. Costs
        ${costChips(this.state, DRAGON_ARMOR.cost)}
      </div>
      <div class="craft-dragons" id="armor-dragons"></div>
      <div class="craft-actions"><button class="panel-btn" id="armor-back">← Back</button></div>
    `;
    this.buildPanel
      .querySelector('#build-close')
      .addEventListener('click', () => this.closeAll());
    this.buildPanel
      .querySelector('#armor-back')
      .addEventListener('click', () => this.#renderHub());

    this.#ensureThumbs();
    const wrap = this.buildPanel.querySelector('#armor-dragons');
    for (const d of this.state.ownedDragons) {
      const url = this.thumbs.get(d.typeId);
      const tile = document.createElement('button');
      tile.className = `craft-dragon ${d.armored ? 'armored' : ''}`;
      tile.innerHTML = `
        ${url ? `<img class="craft-dragon-thumb" src="${url}" alt="">` : '<div class="craft-dragon-thumb">🐉</div>'}
        <div class="craft-dragon-name">${d.name}</div>
        ${d.armored ? '<div class="craft-dragon-badge">🛡️ Armored</div>' : ''}
      `;
      if (!d.armored) tile.addEventListener('click', () => this.#forgeArmor(d));
      wrap.appendChild(tile);
    }
  }

  #forgeArmor(entry) {
    const armored = this.state.equipArmor(entry.id);
    // Null means the stone ran out between render and click — say so instead of
    // closing on a purchase that never happened.
    if (!armored) {
      this.#renderArmorPicker();
      this.#toast('Not enough stone to forge that armor!', false);
      return;
    }
    this.closeAll();
    this.#toast(`🛡️ ${armored.name} is armored — half damage from now on!`, true);
  }

  // Snapshot any dragon type not rendered yet (the same lazy cache CraftingUI
  // keeps, so opening the picker never re-renders thumbnails it already has).
  #ensureThumbs() {
    const missing = new Map();
    for (const d of this.state.ownedDragons) {
      const type = DRAGON_TYPES_BY_ID[d.typeId];
      if (type && !this.thumbs.has(d.typeId)) missing.set(d.typeId, type);
    }
    if (missing.size === 0) return;
    makeDragonThumbnails([...missing.values()]).forEach((url, id) =>
      this.thumbs.set(id, url)
    );
  }

  #toast(message, good) {
    document.querySelectorAll('.store-toast').forEach((t) => t.remove());
    const el = document.createElement('div');
    el.className = `store-toast ${good ? 'good' : 'bad'}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
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
