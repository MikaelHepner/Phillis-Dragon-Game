import * as THREE from 'three';
import { createDragon } from '../dragons/DragonFactory.js';
import { DRAGON_TYPES_BY_ID } from '../data/dragonTypes.js';

// The Black Room (Batch 11) — the 2D game's secret scene
// (src/scenes/BlackRoomScene.js, GAME_DESIGN.md §9) reimagined in 3D.
//
// Everything the 2D version had is here: a pure black room, drifting dust
// motes, a faint centre glow, "..." fading in, and a "← Go Back" link that
// appears after a delay. What 3D adds is depth — the motes float around the
// camera instead of across a flat plane, and something very large is breathing
// in the dark just past the glow. It still has no gameplay function.
//
// Structurally this is the same trick as BattleArena: its own THREE.Scene and
// camera, and while `active` is true main.js renders it instead of the island.

const MOTE_COUNT = 260;
const ROOM_HALF = 130; // motes wrap inside this box, centred on the camera
const TEXT_DELAY_SEC = 0.2; // "..." starts fading in almost immediately
const BACK_DELAY_SEC = 1.5; // 2D: back button tween has a 1500ms delay

function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(150, 160, 220, 0.55)');
  grad.addColorStop(0.35, 'rgba(80, 85, 140, 0.22)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class BlackRoom {
  constructor() {
    this.active = false;
    this.elapsed = 0;
    this.onExit = null; // main.js hook: () => void

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.5,
      1200
    );
    this.camera.position.set(0, 16, 96);
    this.camera.lookAt(0, 16, 0);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    this.#buildRoom();
    this.#bindHud();
  }

  #buildRoom() {
    // Faint centre glow — two stacked sprites, the 3D read of the 2D game's
    // two overlapping translucent circles.
    const glowTex = makeGlowTexture();
    this.glows = [];
    for (const [scale, opacity] of [[240, 0.9], [420, 0.45]]) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      sprite.scale.set(scale, scale, 1);
      sprite.position.set(0, 18, -30);
      this.scene.add(sprite);
      this.glows.push({ sprite, base: opacity });
    }

    // Dust motes: a point cloud drifting around the camera, wrapping at the
    // room bounds exactly like the 2D motes wrapped at the screen edges.
    const positions = new Float32Array(MOTE_COUNT * 3);
    this.moteVel = new Float32Array(MOTE_COUNT * 3);
    for (let i = 0; i < MOTE_COUNT; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * ROOM_HALF;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * ROOM_HALF * 0.6 + 16;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * ROOM_HALF;
      this.moteVel[i * 3] = (Math.random() - 0.5) * 3.2;
      this.moteVel[i * 3 + 1] = (Math.random() - 0.5) * 2.2;
      this.moteVel[i * 3 + 2] = (Math.random() - 0.5) * 3.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.6,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      })
    );
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);

    // Something is in here with you. The black dragon, lit only by a dim rim
    // light, turning very slowly — visible enough to notice, never enough to
    // be sure. (It is decoration: nothing in the room can be interacted with.)
    const silhouette = createDragon(DRAGON_TYPES_BY_ID.black);
    silhouette.group.position.set(0, 0, -150);
    silhouette.group.scale.multiplyScalar(2.6);
    silhouette.group.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      o.material = o.material.clone();
      o.material.color?.multiplyScalar(0.25); // sink it into the dark
    });
    silhouette.setAnimation('idle');
    this.scene.add(silhouette.group);
    this.silhouette = silhouette;

    // Just enough light to catch an edge of it.
    const rim = new THREE.PointLight(0x8a93d8, 3.2, 620, 1.4);
    rim.position.set(-60, 70, -40);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x1a1c2c, 0.6));
  }

  #bindHud() {
    this.hud = document.getElementById('blackroom-hud');
    this.textEl = document.getElementById('blackroom-text');
    this.backBtn = document.getElementById('blackroom-back');
    this.backBtn.addEventListener('click', () => this.exit());
    window.addEventListener('keydown', (e) => {
      if (this.active && e.code === 'Escape') this.exit();
    });
  }

  enter() {
    if (this.active) return;
    this.active = true;
    this.elapsed = 0;
    this.textEl.classList.remove('visible');
    this.backBtn.classList.remove('visible');
    this.hud.classList.add('open');
    document.body.classList.add('in-blackroom');
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.hud.classList.remove('open');
    document.body.classList.remove('in-blackroom');
    this.onExit?.();
  }

  update(dt) {
    if (!this.active) return;
    this.elapsed += dt;

    // Timed reveals, matching the 2D tween delays.
    if (this.elapsed > TEXT_DELAY_SEC) this.textEl.classList.add('visible');
    if (this.elapsed > BACK_DELAY_SEC) this.backBtn.classList.add('visible');

    // Drifting, wrapping motes.
    const pos = this.motes.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < MOTE_COUNT; i++) {
      const o = i * 3;
      arr[o] += this.moteVel[o] * dt;
      arr[o + 1] += this.moteVel[o + 1] * dt;
      arr[o + 2] += this.moteVel[o + 2] * dt;
      if (arr[o] > ROOM_HALF) arr[o] = -ROOM_HALF;
      else if (arr[o] < -ROOM_HALF) arr[o] = ROOM_HALF;
      if (arr[o + 1] > 16 + ROOM_HALF * 0.6) arr[o + 1] = 16 - ROOM_HALF * 0.6;
      else if (arr[o + 1] < 16 - ROOM_HALF * 0.6) arr[o + 1] = 16 + ROOM_HALF * 0.6;
      if (arr[o + 2] > ROOM_HALF) arr[o + 2] = -ROOM_HALF;
      else if (arr[o + 2] < -ROOM_HALF) arr[o + 2] = ROOM_HALF;
    }
    pos.needsUpdate = true;

    // Slow breathing glow and an almost-imperceptible turn.
    const pulse = 0.85 + Math.sin(this.elapsed * 0.6) * 0.15;
    for (const g of this.glows) g.sprite.material.opacity = g.base * pulse;
    this.silhouette.update(dt);
    this.silhouette.group.rotation.y = Math.sin(this.elapsed * 0.08) * 0.5;
  }
}
