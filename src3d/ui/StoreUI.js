import { STORE_DRAGONS, DRAGON_TYPES_BY_ID } from '../data/dragonTypes.js';
import { PACK_COST, cardIcon } from '../data/cards.js';
import { makeDragonThumbnails } from './thumbnails.js';

// Dragon Store + Pack Store overlays (GAME_DESIGN.md §9), HTML/CSS on top of
// the canvas like the rest of the UI. Pure view over GameState: buttons call
// state.buyDragon / state.openPack / state.collectCards; re-renders on state
// events. The store grid uses one-shot 3D snapshots from thumbnails.js.

export class StoreUI {
  constructor(state) {
    this.state = state;
    this.thumbs = null; // Map<typeId, dataURL>, generated on first open

    this.storeBtn = document.getElementById('store-btn');
    this.storePanel = document.getElementById('store-panel');
    this.packPanel = document.getElementById('pack-panel');

    this.#buildStorePanel();
    this.#buildPackPanel();

    this.storeBtn.addEventListener('click', () => this.toggleStore());

    // Keep the grid's BUY/OWNED buttons truthful while the store is open.
    const refresh = () => {
      if (this.storePanel.classList.contains('open')) this.#renderGrid();
    };
    state.on('resources', refresh);
    state.on('dragonAdded', refresh);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.closeAll();
    });
  }

  // — Open/close ————————————————————————————————————————————————
  toggleStore() {
    const open = !this.storePanel.classList.contains('open');
    this.closeAll();
    if (!open) return;
    // Generating 16 snapshots takes a moment the first time; lazy so boot
    // stays instant.
    if (!this.thumbs) this.thumbs = makeDragonThumbnails(STORE_DRAGONS);
    this.storePanel.classList.add('open');
    this.#renderGrid();
  }

  openPackStore() {
    this.closeAll();
    this.packPanel.classList.add('open');
  }

  closeAll() {
    this.storePanel.classList.remove('open');
    this.packPanel.classList.remove('open');
    document.getElementById('backpack-panel')?.classList.remove('open');
    document.getElementById('craft-panel')?.classList.remove('open');
    document.getElementById('build-panel')?.classList.remove('open');
    document.getElementById('upgrade-panel')?.classList.remove('open');
    document.getElementById('fight-panel')?.classList.remove('open');
  }

  // — Dragon Store ——————————————————————————————————————————————
  #buildStorePanel() {
    this.storePanel.innerHTML = `
      <div class="panel-head">
        <h3>🐉 Dragon Store</h3>
        <div class="panel-head-actions">
          <button class="panel-btn" id="store-packs-btn">🎴 PACKS</button>
          <button class="panel-close" id="store-close">✕</button>
        </div>
      </div>
      <div class="store-grid" id="store-grid"></div>
    `;
    this.grid = this.storePanel.querySelector('#store-grid');
    this.storePanel
      .querySelector('#store-close')
      .addEventListener('click', () => this.closeAll());
    this.storePanel
      .querySelector('#store-packs-btn')
      .addEventListener('click', () => this.openPackStore());
  }

  #renderGrid() {
    this.grid.innerHTML = '';
    for (const type of STORE_DRAGONS) {
      const owned = this.state.ownsType(type.id);
      const affordable = this.state.resources.coins >= type.cost;

      const tile = document.createElement('div');
      tile.className = 'store-tile';

      const img = document.createElement('img');
      img.className = 'store-thumb';
      img.src = this.thumbs.get(type.id);
      img.alt = type.name;

      const name = document.createElement('div');
      name.className = 'store-name';
      name.textContent = type.name;

      const cost = document.createElement('div');
      cost.className = 'store-cost';
      cost.textContent = `🪙 ${type.cost}`;

      const btn = document.createElement('button');
      btn.className = 'store-buy';
      if (owned) {
        btn.textContent = 'OWNED';
        btn.classList.add('owned');
        btn.disabled = true;
      } else {
        btn.textContent = 'BUY';
        btn.classList.toggle('poor', !affordable);
        btn.addEventListener('click', () => this.#buy(type));
      }

      tile.append(img, name, cost, btn);
      this.grid.appendChild(tile);
    }
  }

  #buy(type) {
    const entry = this.state.buyDragon(type);
    if (entry) {
      this.#toast(`Bought ${type.name}!`, true);
    } else {
      this.#toast('Not enough coins!', false);
    }
  }

  // — Pack Store ————————————————————————————————————————————————
  #buildPackPanel() {
    this.packPanel.innerHTML = `
      <div class="panel-head">
        <h3>🎴 Pack Store</h3>
        <button class="panel-close" id="pack-close">✕</button>
      </div>
      <div class="pack-body">
        <div class="pack-visual" id="pack-visual">
          <div class="pack-art">🐉</div>
          <div class="pack-shine"></div>
        </div>
        <div class="pack-name">Dragon Booster Pack</div>
        <div class="pack-cost">🪙 ${PACK_COST} · 3 random cards</div>
        <button class="panel-btn pack-open-btn" id="pack-open-btn">OPEN PACK</button>
        <button class="panel-btn pack-back-btn" id="pack-back-btn">← Back to Store</button>
      </div>
    `;
    const open = () => this.#openPack();
    this.packPanel.querySelector('#pack-open-btn').addEventListener('click', open);
    this.packPanel.querySelector('#pack-visual').addEventListener('click', open);
    this.packPanel
      .querySelector('#pack-close')
      .addEventListener('click', () => this.closeAll());
    this.packPanel
      .querySelector('#pack-back-btn')
      .addEventListener('click', () => this.toggleStore());
  }

  #openPack() {
    const cards = this.state.openPack();
    if (!cards) {
      this.#toast('Not enough coins!', false);
      return;
    }
    this.#showReveal(cards);
  }

  // — Card reveal: staggered 3D flips (2D used Back.easeOut scale pops) ——
  #showReveal(cards) {
    const overlay = document.createElement('div');
    overlay.id = 'reveal-overlay';

    const title = document.createElement('div');
    title.className = 'reveal-title';
    title.textContent = 'PACK UNLOCKED!';
    overlay.appendChild(title);

    const row = document.createElement('div');
    row.className = 'reveal-row';
    cards.forEach((card, i) => {
      const holder = document.createElement('div');
      holder.className = 'reveal-card';
      holder.style.setProperty('--i', i); // drives the 300ms flip stagger
      holder.innerHTML = `
        <div class="card-inner">
          <div class="card-face card-back"><span>🐉</span></div>
          <div class="card-face card-front">
            <div class="card-icon">${cardIcon(card)}</div>
            <div class="card-name">${card.name}</div>
            <div class="card-type">${card.type.toUpperCase()}</div>
          </div>
        </div>
      `;
      row.appendChild(holder);
    });
    overlay.appendChild(row);

    const collect = document.createElement('button');
    collect.className = 'panel-btn reveal-collect';
    collect.textContent = 'COLLECT ALL';
    collect.addEventListener('click', () => {
      this.state.collectCards(cards);
      overlay.remove();
    });
    overlay.appendChild(collect);

    document.body.appendChild(overlay);
  }

  // — Tiny feedback toast at the top of the screen ————————————————
  #toast(message, good) {
    // Newest message wins — rapid actions must not stack unreadably.
    document.querySelectorAll('.store-toast').forEach((t) => t.remove());
    const el = document.createElement('div');
    el.className = `store-toast ${good ? 'good' : 'bad'}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }
}
