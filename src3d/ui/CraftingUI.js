import { DRAGON_TYPES_BY_ID } from '../data/dragonTypes.js';
import { cardIcon, partIcon, GIVEABLE_CARD_RESOURCES } from '../data/cards.js';
import { makeDragonThumbnails } from './thumbnails.js';

// Crafting Center overlay (GAMEPLAY_SYSTEMS.md §3 / 2D UIScene crafting menu).
// Click-to-select sequence, same as the 2D game: click a card to select it
// (yellow outline), click a second card to connect, click the same card to
// deselect. Clicking a dragon with a giveable card selected gives it the card.
// Pure view over GameState — all rules live in state.connectCards /
// state.craftFromParts / state.giveCard; this class renders and relays clicks.

export class CraftingUI {
  constructor(state) {
    this.state = state;
    this.selected = null; // index into state.ownedCards
    this.thumbs = new Map(); // typeId -> dataURL, grown lazily as types appear

    this.craftBtn = document.getElementById('craft-btn');
    this.panel = document.getElementById('craft-panel');
    this.#build();

    this.craftBtn.addEventListener('click', () => this.toggle());

    // Re-render while open: cards change on connect/give/pack-collect, the
    // dragon row grows on buy/craft.
    const refresh = () => {
      if (this.isOpen) this.#render();
    };
    state.on('cards', refresh);
    state.on('dragonAdded', refresh);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.close();
    });
  }

  get isOpen() {
    return this.panel.classList.contains('open');
  }

  toggle() {
    if (this.isOpen) return this.close();
    // One overlay at a time (same DOM-id pattern StoreUI uses for backpack).
    for (const id of ['store-panel', 'pack-panel', 'backpack-panel', 'fight-panel']) {
      document.getElementById(id)?.classList.remove('open');
    }
    this.selected = null;
    this.panel.classList.add('open');
    this.#render();
  }

  close() {
    this.panel.classList.remove('open');
    this.selected = null;
  }

  #build() {
    this.panel.innerHTML = `
      <div class="panel-head">
        <h3>⚒️ Crafting Center</h3>
        <button class="panel-close" id="craft-close">✕</button>
      </div>
      <div class="craft-sub">Connect Part cards to build a dragon — collect all 4 pieces!
        Select a 🍎🌳🎣 card, then click a dragon to give it.</div>
      <div class="craft-cards" id="craft-cards"></div>
      <div class="craft-dragons-title">YOUR DRAGONS</div>
      <div class="craft-dragons" id="craft-dragons"></div>
      <div class="craft-actions"><button class="panel-btn craft-now-btn" id="craft-now">✨ CRAFT NEW DRAGON</button></div>
    `;
    this.cardsEl = this.panel.querySelector('#craft-cards');
    this.dragonsEl = this.panel.querySelector('#craft-dragons');
    this.craftNowBtn = this.panel.querySelector('#craft-now');
    this.panel.querySelector('#craft-close').addEventListener('click', () => this.close());
    this.craftNowBtn.addEventListener('click', () => this.#craftFromParts());
  }

  // — Rendering ————————————————————————————————————————————————
  #render() {
    this.#renderCards();
    this.#renderDragons();
    // The 2D game shows the craft button only when all 4 raw parts are owned.
    this.craftNowBtn.parentElement.style.display = this.state.hasAllParts() ? '' : 'none';
  }

  #renderCards() {
    this.cardsEl.innerHTML = '';
    const cards = this.state.ownedCards;
    if (cards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'craft-empty';
      empty.textContent = 'No cards collected yet — open packs in the Store!';
      this.cardsEl.appendChild(empty);
      return;
    }
    cards.forEach((card, index) => {
      const tile = document.createElement('button');
      tile.className = 'craft-card';
      if (this.selected === index) tile.classList.add('selected');

      const icon = document.createElement('div');
      icon.className = 'craft-card-icon';
      icon.textContent = cardIcon(card);

      const name = document.createElement('div');
      name.className = 'craft-card-name';
      name.textContent = card.name;

      const type = document.createElement('div');
      type.className = 'craft-card-type';
      type.textContent = card.type.toUpperCase();

      tile.append(icon, name, type);

      // Combo cards list the components they already contain.
      if (card.type === 'Combo' && card.parts) {
        const parts = document.createElement('div');
        parts.className = 'craft-card-parts';
        parts.textContent = `${card.parts.map(partIcon).join('')} ${card.parts.length}/4`;
        tile.appendChild(parts);
      }

      tile.addEventListener('click', () => this.#onCardClick(index));
      this.cardsEl.appendChild(tile);
    });
  }

  #renderDragons() {
    this.#ensureThumbs();
    this.dragonsEl.innerHTML = '';
    for (const entry of this.state.ownedDragons) {
      const tile = document.createElement('button');
      tile.className = 'craft-dragon';
      const url = this.thumbs.get(entry.typeId);
      tile.innerHTML = `
        ${url ? `<img class="craft-dragon-thumb" src="${url}" alt="">` : '<div class="craft-dragon-thumb">🐉</div>'}
        <div class="craft-dragon-name">${entry.name}</div>
      `;
      tile.addEventListener('click', () => this.#onDragonClick(entry));
      this.dragonsEl.appendChild(tile);
    }
  }

  // Snapshot any dragon type we haven't rendered yet (store types on first
  // open, crafted types as they appear).
  #ensureThumbs() {
    const missing = new Map();
    for (const d of this.state.ownedDragons) {
      const type = DRAGON_TYPES_BY_ID[d.typeId];
      if (type && !this.thumbs.has(d.typeId)) missing.set(d.typeId, type);
    }
    if (missing.size === 0) return;
    const fresh = makeDragonThumbnails([...missing.values()]);
    fresh.forEach((url, id) => this.thumbs.set(id, url));
  }

  // — Interactions ——————————————————————————————————————————————
  #onCardClick(index) {
    if (this.selected === null) {
      this.selected = index; // first click: select
    } else if (this.selected === index) {
      this.selected = null; // same card: deselect
    } else {
      this.#connect(this.selected, index); // second card: try to connect
      this.selected = null;
    }
    this.#render();
  }

  #connect(a, b) {
    const result = this.state.connectCards(a, b);
    if (!result.ok) {
      const msg =
        result.reason === 'duplicate'
          ? "Can't connect two of the same part!"
          : 'Only Part and Combo cards connect!';
      this.#toast(msg, false);
      return;
    }
    if (result.crafted) {
      this.#celebrate(`✨ COMPLETE DRAGON: ${result.crafted.name} ✨`);
    } else {
      this.#toast('✨ CONNECTED! ✨', true);
    }
  }

  #craftFromParts() {
    const crafted = this.state.craftFromParts();
    if (!crafted) return;
    // The 2D game closes the menu on success so you see the dragon appear.
    this.close();
    this.#celebrate(`✨ CRAFTED: ${crafted.name} ✨`);
  }

  #onDragonClick(entry) {
    if (this.selected === null) return;
    const card = this.state.ownedCards[this.selected];
    if (!card) return;
    if (!GIVEABLE_CARD_RESOURCES[card.type]) {
      // Part/Combo cards can't be given — matches the 2D no-op, plus a hint.
      this.#toast('That card connects to other cards instead!', false);
      return;
    }
    const gift = this.state.giveCard(this.selected, entry.id);
    this.selected = null;
    if (gift) this.#toast(`Gave ${gift.card.name} to ${gift.dragon.name}!`, true);
    this.#render();
  }

  // — Feedback ————————————————————————————————————————————————
  #toast(message, good) {
    // Newest message wins — rapid actions must not stack unreadably.
    document.querySelectorAll('.store-toast').forEach((t) => t.remove());
    const el = document.createElement('div');
    el.className = `store-toast ${good ? 'good' : 'bad'}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  // Big 4-second banner for a freshly crafted dragon (2D success text).
  #celebrate(message) {
    const el = document.createElement('div');
    el.className = 'craft-banner';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}
