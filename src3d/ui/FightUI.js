import { DRAGON_TYPES } from '../data/dragonTypes.js';
import { makeDragonThumbnails } from './thumbnails.js';

// Fighter Selection (Batch 10) — the 2-step flow from the 2D UIScene
// (createFighterSelection / renderOpponentSelection / renderTeamSelection):
//   1. "Select Opponent"  — grid of the 15 fightable dragon types
//   2. "Build Your Team"  — 3 slots filled from your owned dragons, then
//      START BATTLE hands off to BattleArena.
// A "⚔️ Fight" button is added to the selected-dragon panel, standing in for
// the 2D Dragon Menu's Fight option.

// Opponent roster copied verbatim from the 2D fighter list — 15 types, in
// this order, with these names (the 2D roster says "Storm Dragon" even though
// the store calls it "Thunder Dragon", and it has no Water Dragon).
const FIGHTERS = [
  { typeId: 'fire', name: 'Fire Dragon' },
  { typeId: 'ice', name: 'Ice Dragon' },
  { typeId: 'storm', name: 'Storm Dragon' },
  { typeId: 'stone', name: 'Stone Dragon' },
  { typeId: 'poison', name: 'Poison Dragon' },
  { typeId: 'plant', name: 'Plant Dragon' },
  { typeId: 'soda', name: 'Soda Dragon' },
  { typeId: 'sand', name: 'Sand Dragon' },
  { typeId: 'metal', name: 'Metal Dragon' },
  { typeId: 'paper', name: 'Paper Dragon' },
  { typeId: 'diamond', name: 'Diamond Dragon' },
  { typeId: 'glass', name: 'Glass Dragon' },
  { typeId: 'jacket', name: 'Jacket Dragon' },
  { typeId: 'light', name: 'Light Dragon' },
  { typeId: 'coffee', name: 'Coffee Dragon' },
];

const TEAM_SIZE = 3;

export class FightUI {
  constructor(state, battle) {
    this.state = state;
    this.battle = battle;
    this.thumbs = null; // Map<typeId, dataURL>, generated on first open
    this.panel = document.getElementById('fight-panel');
    this.selectedOpponent = null;
    this.selectedTeam = [null, null, null]; // entries: { typeId, name } | null

    // The Fight button joins Feed/Rest/Pet on the selected-dragon panel.
    const actions = document.querySelector('#dragon-panel .dragon-actions');
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = '⚔️ Fight';
    btn.addEventListener('click', () => this.open());
    actions.appendChild(btn);
  }

  open() {
    // Close every other overlay first (the 2D closeAllMenus).
    document
      .querySelectorAll('.overlay-panel.open, #backpack-panel.open')
      .forEach((el) => el.classList.remove('open'));
    // All friendly types can appear as opponents or team members.
    if (!this.thumbs) {
      this.thumbs = makeDragonThumbnails(DRAGON_TYPES.filter((t) => !t.enemy));
    }
    this.selectedOpponent = null;
    this.selectedTeam = [null, null, null];
    this.panel.classList.add('open');
    this.#renderOpponentStep();
  }

  close() {
    this.panel.classList.remove('open');
  }

  #head(title, color) {
    return `
      <div class="panel-head">
        <h3 style="color:${color}">${title}</h3>
        <button class="panel-close" id="fight-close">✕</button>
      </div>
    `;
  }

  #wireClose() {
    this.panel.querySelector('#fight-close').addEventListener('click', () => this.close());
  }

  // — Step 1: Select Opponent ————————————————————————————————————
  #renderOpponentStep() {
    this.panel.innerHTML = `
      ${this.#head('⚔️ Select Opponent', '#c0392b')}
      <div class="store-grid" id="fight-grid"></div>
    `;
    this.#wireClose();

    const grid = this.panel.querySelector('#fight-grid');
    for (const f of FIGHTERS) {
      const tile = document.createElement('div');
      tile.className = 'store-tile fight-tile';
      tile.innerHTML = `
        <img class="store-thumb" src="${this.thumbs.get(f.typeId)}" alt="${f.name}">
        <div class="store-name">${f.name}</div>
        <button class="store-buy fight-select">SELECT</button>
      `;
      const pick = () => {
        this.selectedOpponent = f;
        this.#renderTeamStep();
      };
      tile.querySelector('img').addEventListener('click', pick);
      tile.querySelector('button').addEventListener('click', pick);
      grid.appendChild(tile);
    }
  }

  // — Step 2: Build Your Team ————————————————————————————————————
  #renderTeamStep() {
    this.panel.innerHTML = `
      ${this.#head('🛡️ Build Your Team', '#1e7a2e')}
      <div class="craft-sub">Fighting <b>${this.selectedOpponent.name}</b> — pick up to ${TEAM_SIZE} of your dragons.</div>
      <div class="team-slots" id="team-slots"></div>
      <div class="craft-actions">
        <button class="panel-btn" id="team-back">← Opponent</button>
        <button class="panel-btn team-start" id="team-start">START BATTLE</button>
      </div>
    `;
    this.#wireClose();
    this.panel.querySelector('#team-back').addEventListener('click', () => this.#renderOpponentStep());

    const slots = this.panel.querySelector('#team-slots');
    for (let i = 0; i < TEAM_SIZE; i++) {
      const member = this.selectedTeam[i];
      const slot = document.createElement('button');
      slot.className = 'team-slot';
      if (member) {
        slot.innerHTML = `
          <img class="store-thumb" src="${this.thumbs.get(member.typeId)}" alt="${member.name}">
          <div class="store-name">${member.name}</div>
        `;
      } else {
        slot.innerHTML = '<div class="team-plus">+</div>';
      }
      slot.addEventListener('click', () => this.#showDragonChooser(i));
      slots.appendChild(slot);
    }

    const start = this.panel.querySelector('#team-start');
    const ready = this.selectedTeam.some((t) => t !== null);
    start.classList.toggle('disabled', !ready);
    if (ready) start.addEventListener('click', () => this.#startBattle());
  }

  // Slot click → pick one of your owned dragons (2D showDragonList; the same
  // dragon may fill several slots, exactly like the 2D game).
  #showDragonChooser(slotIndex) {
    const overlay = document.createElement('div');
    overlay.className = 'team-chooser';
    overlay.innerHTML = '<div class="team-chooser-title">Choose Dragon</div>';

    const list = document.createElement('div');
    list.className = 'team-chooser-list';
    for (const d of this.state.ownedDragons) {
      const typeId = d.typeId ?? d.id;
      const item = document.createElement('button');
      item.className = 'team-choice';
      item.innerHTML = `
        <img src="${this.thumbs.get(typeId) ?? ''}" alt="${d.name}">
        <span>${d.name}</span>
      `;
      item.addEventListener('click', () => {
        this.selectedTeam[slotIndex] = { typeId, name: d.name };
        overlay.remove();
        this.#renderTeamStep();
      });
      list.appendChild(item);
    }
    overlay.appendChild(list);

    const cancel = document.createElement('button');
    cancel.className = 'panel-btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => overlay.remove());
    overlay.appendChild(cancel);

    this.panel.appendChild(overlay);
  }

  #startBattle() {
    const team = this.selectedTeam.filter((t) => t !== null);
    if (team.length === 0) return;
    this.close();
    this.battle.start(this.selectedOpponent, team);
  }
}
