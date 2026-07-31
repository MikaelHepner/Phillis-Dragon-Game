// HTML/CSS HUD overlay that sits on top of the 3D canvas (per the locked-in
// decision: UI is DOM, not in-engine). It's a pure view over GameState — it
// subscribes to state events and re-renders; buttons call GameState methods.
// Style is chunky and kid-friendly (GAME_DESIGN.md §11) via classes in
// index3d.html.

import { cardIcon } from '../data/cards.js';

const STAT_META = [
  { key: 'hp', label: 'HP', icon: '❤️', cls: 'bar-hp' },
  { key: 'hunger', label: 'Hunger', icon: '🍎', cls: 'bar-hunger' },
  { key: 'energy', label: 'Energy', icon: '⚡', cls: 'bar-energy' },
  { key: 'love', label: 'Love', icon: '💖', cls: 'bar-love' },
];

const RESOURCE_META = [
  { key: 'coins', icon: '🪙' },
  { key: 'apples', icon: '🍎' },
  { key: 'stone', icon: '🪨' },
  { key: 'wood', icon: '🪵' },
  { key: 'fish', icon: '🐟' },
];

export class Hud {
  constructor(state) {
    this.state = state;
    this.bars = {}; // stat key -> { fill, value } elements

    this.#buildResources();
    this.#buildDragonPanel();
    this.#buildBackpack();

    // Re-render on the relevant state changes.
    state.on('resources', () => {
      this.#renderResources();
      this.#renderBackpack();
    });
    state.on('cards', () => this.#renderBackpack());
    state.on('selection', (d) => this.#renderDragon(d));
    state.on('stats', (d) => {
      if (d && d.id === state.selectedId) this.#renderStats(d.stats);
    });

    this.#renderResources();
    this.#renderDragon(state.selected);
  }

  // — Top-left resource counters —
  #buildResources() {
    const bar = document.getElementById('resource-bar');
    this.resourceEls = {};
    for (const { key, icon } of RESOURCE_META) {
      const chip = document.createElement('span');
      chip.className = 'hud-chip resource-chip';
      const val = document.createElement('span');
      val.className = 'resource-val';
      chip.append(document.createTextNode(`${icon} `), val);
      bar.appendChild(chip);
      this.resourceEls[key] = val;
    }
  }

  #renderResources() {
    for (const { key } of RESOURCE_META) {
      this.resourceEls[key].textContent = this.state.resources[key];
    }
  }

  // — Bottom-left selected-dragon panel —
  #buildDragonPanel() {
    const panel = document.getElementById('dragon-panel');

    this.dragonName = document.createElement('div');
    this.dragonName.className = 'dragon-name';
    panel.appendChild(this.dragonName);

    const barsWrap = document.createElement('div');
    barsWrap.className = 'stat-bars';
    for (const meta of STAT_META) {
      const row = document.createElement('div');
      row.className = 'stat-row';

      const label = document.createElement('span');
      label.className = 'stat-label';
      label.textContent = meta.icon;
      label.title = meta.label;

      const track = document.createElement('div');
      track.className = 'stat-track';
      const fill = document.createElement('div');
      fill.className = `stat-fill ${meta.cls}`;
      track.appendChild(fill);

      const value = document.createElement('span');
      value.className = 'stat-value';

      row.append(label, track, value);
      barsWrap.appendChild(row);
      this.bars[meta.key] = { fill, value };
    }
    panel.appendChild(barsWrap);

    // Action buttons.
    const actions = document.createElement('div');
    actions.className = 'dragon-actions';
    const mk = (text, handler) => {
      const b = document.createElement('button');
      b.className = 'action-btn';
      b.textContent = text;
      b.addEventListener('click', handler);
      actions.appendChild(b);
      return b;
    };
    mk('🍎 Feed', () => this.state.feed(this.state.selectedId));
    mk('😴 Rest', () => this.state.rest(this.state.selectedId));
    mk('💖 Pet', () => this.state.pet(this.state.selectedId));
    panel.appendChild(actions);

    this.dragonPanel = panel;
  }

  #renderDragon(d) {
    if (!d) {
      this.dragonPanel.classList.add('hidden');
      return;
    }
    this.dragonPanel.classList.remove('hidden');
    this.dragonName.textContent = `🐉 ${d.name}  ·  Lv ${d.stats.level}`;
    this.#renderStats(d.stats);
  }

  #renderStats(stats) {
    for (const meta of STAT_META) {
      const { fill, value } = this.bars[meta.key];
      const v = Math.round(stats[meta.key]);
      fill.style.width = `${v}%`;
      value.textContent = v;
      // Warn (red pulse) when a need is critically low.
      fill.classList.toggle('bar-low', v <= 20);
    }
  }

  // — Backpack (top-right) — resource list; fleshed out in Batch 5 —
  #buildBackpack() {
    this.backpackBtn = document.getElementById('backpack-btn');
    this.backpackPanel = document.getElementById('backpack-panel');
    this.backpackBtn.addEventListener('click', () => {
      const open = this.backpackPanel.classList.toggle('open');
      if (open) this.#renderBackpack();
    });
    document.getElementById('backpack-close')?.addEventListener('click', () => {
      this.backpackPanel.classList.remove('open');
    });
  }

  #renderBackpack() {
    if (!this.backpackPanel.classList.contains('open')) return;
    const list = document.getElementById('backpack-list');
    list.innerHTML = '';
    for (const { key, icon } of RESOURCE_META) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${icon} ${key}</span><b>${this.state.resources[key]}</b>`;
      list.appendChild(li);
    }
    this.#renderCards();
  }

  // Card collection from booster packs (Batch 6), grouped with ×counts.
  #renderCards() {
    const wrap = document.getElementById('backpack-cards');
    wrap.innerHTML = '<h4>🎴 Cards</h4>';
    const cards = this.state.ownedCards;
    if (cards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No cards yet — open packs in the Store!';
      wrap.appendChild(empty);
      return;
    }
    const counts = new Map(); // name -> { card, n } keeps first-seen order
    for (const card of cards) {
      const bucket = counts.get(card.name) ?? { card, n: 0 };
      bucket.n += 1;
      counts.set(card.name, bucket);
    }
    const ul = document.createElement('ul');
    for (const { card, n } of counts.values()) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${cardIcon(card)} ${card.name}</span><b>×${n}</b>`;
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }
}
