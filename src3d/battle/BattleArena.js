import * as THREE from 'three';
import { createDragon } from '../dragons/DragonFactory.js';
import { DRAGON_TYPES_BY_ID } from '../data/dragonTypes.js';
import { ProjectileManager } from '../combat/Projectiles.js';
import { armoredDamage } from '../state/GameState.js';

// Battle Arena (Batch 10) — the dedicated fight mode from the 2D BattleScene,
// rebuilt as its OWN Three.js scene with its own camera and lighting. While a
// battle is active, main.js renders this scene instead of the island (the 2D
// game paused MainScene/UIScene and launched BattleScene on top).
//
// Combat rules copied from src/scenes/BattleScene.js (code wins over docs):
//   - both sides start at 100 HP, every hit deals 10
//   - click YOUR dragon to attack (1,000ms cooldown between clicks)
//   - the opponent auto-attacks every 2,000–5,000ms
//   - your dragon faints → next team member swaps in at FULL HP
//   - opponent faints → VICTORY, +10 coins; whole team faints → DEFEAT,
//     no penalty; either way the game returns to the island after ~2s

export const BATTLE_MAX_HP = 100; // 2D: this.maxHP = 100
export const BATTLE_DAMAGE = 10; // 2D handleDamage: const damage = 10
export const BATTLE_REWARD_COINS = 10; // 2D handleBattleEnd: coins += 10
const PLAYER_COOLDOWN_SEC = 1; // 2D: delayedCall(1000) re-arms the click
const OPP_ATTACK_MIN_SEC = 2; // 2D: Phaser.Math.Between(2000, 5000)
const OPP_ATTACK_MAX_SEC = 5;
const SWITCH_SEC = 1; // 2D: 500ms slide-out + 500ms fade-in
const END_DELAY_SEC = 2; // 2D: delayedCall(2000) before returning

const FIGHTER_X = 60; // both dragons stand this far from center
// Fighters are bigger in the arena than on the island, mirroring the 2D game
// (0.25 battle scale vs 0.08 on the map) so the face-off reads as a close-up.
const FIGHTER_SCALE = 1.6;
const CHEST_Y = 10 * FIGHTER_SCALE; // mid-body height, for aiming projectiles
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

export class BattleArena {
  /**
   * @param {GameState} state    for the coin reward
   * @param {object} opts
   * @param {THREE.Texture} [opts.environment]  env map so metal/glass skins reflect
   * @param {AudioManager} [opts.audio]         hit / victory / defeat sounds
   */
  constructor(state, { environment = null, audio = null } = {}) {
    this.state = state;
    this.audio = audio;
    this.active = false;
    // Batch 11: fires on start and teardown so main.js can swap the music.
    this.onSceneChange = null;

    // — Own scene: a dusk-lit arena so it reads as "somewhere else" —
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3b2a5e);
    this.scene.fog = new THREE.Fog(0x3b2a5e, 320, 1000); // depth behind the stand
    if (environment) this.scene.environment = environment;

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      1,
      2000
    );
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    this.projectiles = new ProjectileManager(this.scene);
    this.floaters = []; // battle-local damage popups { el, pos, t }

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    this.#buildArena();
    this.#bindHud();
  }

  // — Arena set dressing (built once, reused every battle) ————————————
  #buildArena() {
    const s = this.scene;

    s.add(new THREE.HemisphereLight(0xb9a3e3, 0x2c1e40, 0.85));
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
    sun.position.set(-120, 220, 160);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260;
    sun.shadow.camera.bottom = -260;
    sun.shadow.camera.far = 700;
    s.add(sun);

    // Sandy fighting platform with a stone rim.
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(200, 210, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0xd9b978, roughness: 1, flatShading: true })
    );
    floor.position.y = -5;
    floor.receiveShadow = true;
    s.add(floor);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(202, 6, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0x8a7a63, roughness: 0.9, flatShading: true })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1;
    s.add(rim);

    // Painted ring emblem, so the open sand in front of the fighters reads as
    // a marked-out fighting circle instead of empty ground.
    const paintMat = new THREE.MeshStandardMaterial({
      color: 0xc09a54,
      roughness: 1,
      transparent: true,
      opacity: 0.55,
    });
    for (const [inner, outer] of [[28, 34], [118, 124]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 48), paintMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.15; // just above the platform top face
      s.add(ring);
    }

    // Ground below the platform edge, so the horizon isn't empty fog.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(900, 32),
      new THREE.MeshStandardMaterial({ color: 0x4a3a6b, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -14;
    s.add(ground);

    // Torch pillars around the ring (emissive flames — no extra lights needed).
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x9c8d78, roughness: 0.9, flatShading: true });
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xffa030,
      emissive: 0xff7a00,
      emissiveIntensity: 1.6,
    });
    this.flames = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 40, 8), pillarMat);
      pillar.position.set(Math.cos(a) * 216, 20, Math.sin(a) * 216);
      pillar.castShadow = true;
      s.add(pillar);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(6, 14, 7), flameMat);
      flame.position.set(pillar.position.x, 46, pillar.position.z);
      s.add(flame);
      this.flames.push(flame);
    }

    // Barrier wall right behind the ring, with tiered spectator rows rising
    // behind it — reads as a packed grandstand rather than scattered props.
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(232, 236, 44, 40, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x5d4a85,
        roughness: 1,
        side: THREE.DoubleSide,
        flatShading: true,
      })
    );
    stand.position.y = 12;
    s.add(stand);

    const blobGeo = new THREE.SphereGeometry(7, 6, 5);
    const blobMats = [0xff8a65, 0x4fc3f7, 0xaed581, 0xfff176, 0xf48fb1, 0xb39ddb].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true })
    );
    this.crowd = [];
    const ROWS = [
      { r: 246, y: 30 },
      { r: 276, y: 41 },
      { r: 306, y: 52 },
    ];
    ROWS.forEach((row, rowIndex) => {
      const count = 34 + rowIndex * 6;
      for (let i = 0; i < count; i++) {
        // Even spacing with a little jitter so rows don't look stamped.
        const a = ((i + (rowIndex % 2) * 0.5) / count) * Math.PI * 2 + rand(-0.02, 0.02);
        const blob = new THREE.Mesh(blobGeo, blobMats[(i + rowIndex) % blobMats.length]);
        blob.position.set(
          Math.cos(a) * row.r,
          row.y + rand(-1.5, 1.5),
          Math.sin(a) * row.r
        );
        s.add(blob);
        this.crowd.push({ mesh: blob, baseY: blob.position.y, phase: Math.random() * 10 });
      }
    });

    // Fixed face-off camera: low and close, so the two fighters fill the frame
    // instead of a wide expanse of arena floor. A gentle sway is added in
    // update(); LOOK_AT is the shared aim point so both stay in sync.
    this.camera.position.set(0, 40, 142);
    this.camera.lookAt(0, CHEST_Y + 4, 0);
  }

  // — HTML battle HUD (HP bars, names, help text, return button) ————————
  #bindHud() {
    this.hud = document.getElementById('battle-hud');
    this.els = {
      playerName: document.getElementById('battle-player-name'),
      playerHp: document.getElementById('battle-player-hp'),
      playerHpText: document.getElementById('battle-player-hptext'),
      teamDots: document.getElementById('battle-team-dots'),
      oppName: document.getElementById('battle-opp-name'),
      oppHp: document.getElementById('battle-opp-hp'),
      oppHpText: document.getElementById('battle-opp-hptext'),
      help: document.getElementById('battle-help'),
    };
    document
      .getElementById('battle-return')
      .addEventListener('click', () => this.#teardown()); // leave any time, no reward
  }

  #banner(text, color) {
    const el = document.createElement('div');
    el.className = 'battle-banner';
    el.style.color = color;
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  #renderHp(side) {
    const isPlayer = side === 'player';
    const hp = isPlayer ? this.playerHP : this.opponentHP;
    const fill = isPlayer ? this.els.playerHp : this.els.oppHp;
    const text = isPlayer ? this.els.playerHpText : this.els.oppHpText;
    const pct = hp / BATTLE_MAX_HP;
    fill.style.width = `${pct * 100}%`;
    // 2D bar colors: green → yellow below 50% → red below 25%.
    fill.classList.toggle('mid', pct < 0.5 && pct >= 0.25);
    fill.classList.toggle('low', pct < 0.25);
    text.textContent = `${hp} / ${BATTLE_MAX_HP}`;
  }

  #renderTeamDots() {
    // One dot per team slot: filled = still standing, hollow = fainted. The
    // active slot counts as fainted once its HP is gone (the defeat case,
    // where there's no next dragon to advance to).
    this.els.teamDots.textContent = this.team
      .map((_, i) => {
        const alive = i > this.teamIndex || (i === this.teamIndex && this.playerHP > 0);
        return alive ? '●' : '○';
      })
      .join(' ');
  }

  // — Battle lifecycle ————————————————————————————————————————————
  /**
   * Start a battle (called by FightUI's START BATTLE).
   * @param {{typeId: string, name: string}} opponent
   * @param {Array<{typeId: string, name: string}>} team  1–3 fighters, in order
   */
  start(opponent, team) {
    if (this.active || team.length === 0) return;
    this.active = true;
    this.opponentInfo = opponent;
    this.team = team;
    this.teamIndex = 0;

    this.playerHP = BATTLE_MAX_HP;
    this.opponentHP = BATTLE_MAX_HP;
    this.canPlayerAttack = true;
    this.playerCooldown = 0;
    this.switchT = 0; // >0 while the next team dragon slides in
    this.endT = 0; // >0 after win/lose, counts down to teardown
    this.nextOppAttack = rand(OPP_ATTACK_MIN_SEC, OPP_ATTACK_MAX_SEC);

    this.playerDragon = this.#spawn(team[0].typeId, -FIGHTER_X, Math.PI / 2, team[0].armored);
    this.opponentDragon = this.#spawn(opponent.typeId, FIGHTER_X, -Math.PI / 2);

    this.els.playerName.textContent = team[0].name;
    this.els.oppName.textContent = opponent.name;
    this.els.help.textContent = 'Click YOUR dragon to attack!';
    this.#renderHp('player');
    this.#renderHp('opponent');
    this.#renderTeamDots();

    this.hud.classList.add('open');
    document.body.classList.add('in-battle'); // hides the island HUD via CSS
    this.onSceneChange?.();
  }

  #spawn(typeId, x, yaw, armored = false) {
    const type = DRAGON_TYPES_BY_ID[typeId] ?? DRAGON_TYPES_BY_ID.phillis;
    const dragon = createDragon(type);
    dragon.group.position.set(x, 0, 0);
    dragon.group.rotation.y = yaw; // face the other fighter
    dragon.group.scale.multiplyScalar(FIGHTER_SCALE); // keeps the type's own scale
    dragon.setAnimation('idle');
    if (armored) dragon.setArmor(true); // your fighter wears its island armor
    this.scene.add(dragon.group);
    return dragon;
  }

  #despawn(dragon) {
    if (!dragon) return;
    this.scene.remove(dragon.group);
    dragon.group.traverse((obj) => {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material?.dispose();
    });
  }

  #teardown() {
    if (!this.active) return;
    this.active = false;
    this.#despawn(this.playerDragon);
    this.#despawn(this.opponentDragon);
    this.playerDragon = null;
    this.opponentDragon = null;
    // Flush in-flight projectiles and damage popups.
    for (const s of this.projectiles.shots) this.scene.remove(s.group);
    this.projectiles.shots.length = 0;
    for (const f of this.floaters) f.el.remove();
    this.floaters.length = 0;
    this.hud.classList.remove('open');
    document.body.classList.remove('in-battle');
    this.onSceneChange?.();
  }

  // — Input: clicks on the canvas while a battle is active ————————————
  /** Returns true when the click was consumed (always, during a battle). */
  handleClick(clientX, clientY) {
    if (!this.active) return false;
    if (this.endT > 0 || this.switchT > 0 || !this.playerDragon) return true;

    this._pointer.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObject(this.playerDragon.group, true);
    if (hits.length && this.canPlayerAttack && this.opponentHP > 0) {
      this.canPlayerAttack = false;
      this.playerCooldown = PLAYER_COOLDOWN_SEC;
      this.#attack(true);
    }
    return true; // never fall through to island click-to-move
  }

  // — Combat ————————————————————————————————————————————————————
  #attack(byPlayer) {
    const attacker = byPlayer ? this.playerDragon : this.opponentDragon;
    const info = byPlayer ? this.team[this.teamIndex] : this.opponentInfo;
    if (!attacker) return;

    attacker.play('attack'); // lunge toward the other side

    const element = DRAGON_TYPES_BY_ID[info.typeId]?.element ?? 'default';
    const from = attacker.group.position.clone();
    from.y += CHEST_Y + 6; // roughly mouth height on a scaled-up fighter
    from.x += byPlayer ? 18 : -18; // clear of its own body

    const aim = new THREE.Vector3();
    const getTargetPos = () => {
      const target = byPlayer ? this.opponentDragon : this.playerDragon;
      if (!target) return null; // target despawned mid-flight → projectile expires
      aim.copy(target.group.position);
      aim.y += CHEST_Y;
      return aim;
    };

    this.projectiles.fireElement(element, from, getTargetPos, () => {
      this.#applyDamage(!byPlayer);
    });
  }

  #applyDamage(toPlayer) {
    if (!this.active || this.endT > 0) return;
    const target = toPlayer ? this.playerDragon : this.opponentDragon;
    if (!target || (toPlayer && this.switchT > 0)) return;

    // Forged armor halves what your fighter takes. The arena keeps its own HP
    // pool rather than the dragon's stats, so it can't route through
    // GameState.damageDragon — it applies the same formula itself.
    const dealt = toPlayer
      ? armoredDamage(this.team[this.teamIndex], BATTLE_DAMAGE)
      : BATTLE_DAMAGE;

    if (toPlayer) this.playerHP = Math.max(0, this.playerHP - dealt);
    else this.opponentHP = Math.max(0, this.opponentHP - dealt);

    target.play('hurt'); // shake + red flash
    this.audio?.sfx('hit');
    this.#renderHp(toPlayer ? 'player' : 'opponent');
    this.#floatDamage(target.group.position, `-${dealt}`);

    const hp = toPlayer ? this.playerHP : this.opponentHP;
    if (hp > 0) return;

    if (!toPlayer) {
      this.#end(true);
    } else if (this.teamIndex + 1 < this.team.length) {
      this.#switchDragon();
    } else {
      this.#end(false);
    }
  }

  #switchDragon() {
    // Next roster dragon slides in at full HP (2D switchPlayerDragon).
    this.teamIndex += 1;
    const next = this.team[this.teamIndex];
    this.switchT = SWITCH_SEC;
    this.#despawn(this.playerDragon);
    this.playerDragon = this.#spawn(next.typeId, -FIGHTER_X - 60, Math.PI / 2, next.armored);
    this.playerHP = BATTLE_MAX_HP;
    this.els.playerName.textContent = next.name;
    this.#renderHp('player');
    this.#renderTeamDots();
    this.#banner(`GO ${next.name.toUpperCase()}!`, '#2eff7b');
  }

  #end(victory) {
    this.endT = END_DELAY_SEC;
    this.audio?.sfx(victory ? 'victory' : 'defeat');
    if (victory) {
      this.state.addResource('coins', BATTLE_REWARD_COINS);
      this.#banner(`VICTORY!  +${BATTLE_REWARD_COINS} 🪙`, '#ffe95e');
      if (this.playerDragon) this.playerDragon.setAnimation('fly'); // victory lap
    } else {
      this.#banner('DEFEAT', '#ff5555');
      this.#renderTeamDots();
    }
    this.els.help.textContent = victory ? 'You win!' : 'Better luck next time…';
  }

  // — Battle-local floating damage text (projected with the ARENA camera) —
  #floatDamage(worldPos, text) {
    const el = document.createElement('div');
    el.className = 'battle-float';
    el.textContent = text;
    document.body.appendChild(el);
    // Anchored just over the fighter's back; the rise is kept short so the
    // popup never climbs into the HP panels at the top of the screen.
    this.floaters.push({ el, pos: worldPos.clone().setY(worldPos.y + CHEST_Y + 4), t: 0 });
  }

  #updateFloaters(dt) {
    const v = new THREE.Vector3();
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t >= 1) {
        f.el.remove();
        this.floaters.splice(i, 1);
        continue;
      }
      v.copy(f.pos);
      v.y += f.t * 16;
      v.project(this.camera);
      f.el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
      f.el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
      f.el.style.opacity = `${1 - f.t}`;
    }
  }

  // — Per-frame (only called by main.js while active) ————————————————
  update(dt) {
    if (!this.active) return;
    const t = performance.now() / 1000;

    this.playerDragon?.update(dt);
    this.opponentDragon?.update(dt);
    this.projectiles.update(dt);
    this.#updateFloaters(dt);

    // Player attack re-arms after the 1s cooldown.
    if (!this.canPlayerAttack) {
      this.playerCooldown -= dt;
      if (this.playerCooldown <= 0) this.canPlayerAttack = true;
    }

    // New team dragon slides in from off-stage.
    if (this.switchT > 0 && this.playerDragon) {
      this.switchT = Math.max(0, this.switchT - dt);
      const k = 1 - this.switchT / SWITCH_SEC; // 0 → 1
      const ease = 1 - (1 - k) * (1 - k);
      this.playerDragon.group.position.x = -FIGHTER_X - 60 * (1 - ease);
      this.playerDragon.setAnimation(this.switchT > 0 ? 'walk' : 'idle');
    }

    // Opponent auto-attack clock (2D scheduleOpponentAttack).
    if (this.endT <= 0 && this.switchT <= 0 && this.opponentHP > 0 && this.playerHP > 0) {
      this.nextOppAttack -= dt;
      if (this.nextOppAttack <= 0) {
        this.nextOppAttack = rand(OPP_ATTACK_MIN_SEC, OPP_ATTACK_MAX_SEC);
        this.#attack(false);
      }
    }

    // Post-battle linger, then back to the island.
    if (this.endT > 0) {
      this.endT -= dt;
      if (this.endT <= 0) this.#teardown();
    }

    // Ambient life: flickering torches, bobbing crowd, gentle camera sway.
    for (let i = 0; i < this.flames.length; i++) {
      this.flames[i].scale.setScalar(1 + Math.sin(t * 9 + i * 1.7) * 0.12);
    }
    for (const c of this.crowd) {
      c.mesh.position.y = c.baseY + Math.abs(Math.sin(t * 2.4 + c.phase)) * 4;
    }
    this.camera.position.x = Math.sin(t * 0.22) * 8;
    this.camera.lookAt(0, CHEST_Y + 4, 0);
  }
}
