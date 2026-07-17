import * as THREE from 'three';

// One procedural low-poly dragon, parameterized by a config from
// src3d/data/dragonTypes.js. Built entirely from primitives — no model files.
//
// Usage:
//   const dragon = createDragon(DRAGON_TYPES_BY_ID.fire);
//   scene.add(dragon.group);
//   dragon.setAnimation('walk');      // base loop: 'idle' | 'walk' | 'fly'
//   dragon.play('attack');            // one-shot: 'attack' | 'hurt'
//   dragon.update(dt);                // every frame
//
// The dragon faces +Z. Outer `group` is yours to position/rotate; all
// animation offsets happen on an inner rig so they never fight your placement.

const HURT_COLOR = new THREE.Color(0xff4444);

function makeMaterial(config, colorHex, overrides = {}) {
  const params = {
    color: colorHex,
    flatShading: true,
    roughness: 0.9,
    metalness: 0,
  };

  switch (config.style) {
    case 'shiny':
      params.roughness = 0.4;
      params.metalness = 0.1;
      break;
    case 'metallic':
      params.roughness = 0.25;
      params.metalness = 0.95;
      break;
    case 'glass':
      params.roughness = 0.08;
      params.metalness = 0.1;
      params.transparent = true;
      params.opacity = config.opacity ?? 0.45;
      break;
    case 'crystal':
      params.roughness = 0.12;
      params.metalness = 0.4;
      params.transparent = true;
      params.opacity = config.opacity ?? 0.8;
      break;
  }

  if (config.emissive !== undefined) {
    params.emissive = config.emissive;
    params.emissiveIntensity = config.emissiveIntensity ?? 0.2;
  }

  return new THREE.MeshStandardMaterial({ ...params, ...overrides });
}

function makeWingGeometry() {
  // Bat-wing silhouette in XY (x = span outward, y = front/back before rotation).
  // After rotation.x = -PI/2 the shape lies flat; shape -y becomes world +z (forward).
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(5, -2.2); // leading edge
  shape.lineTo(11, -3);
  shape.lineTo(14.5, -0.8); // wingtip
  shape.lineTo(11, 2.6); // scalloped trailing edge
  shape.lineTo(7.5, 4.2);
  shape.lineTo(3.5, 5);
  shape.lineTo(0, 3.2);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function makeBoltGeometry() {
  // Zigzag lightning-bolt fin for the thunder dragon's back.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(1.6, 2.2);
  shape.lineTo(0.5, 2.4);
  shape.lineTo(2.4, 5);
  shape.lineTo(1.1, 5.1);
  shape.lineTo(3, 7.6);
  shape.lineTo(-0.4, 5.6);
  shape.lineTo(0.8, 5.4);
  shape.lineTo(-1, 2.9);
  shape.lineTo(0.1, 2.7);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function buildSpikes(config, bodyMat, parts, rig) {
  const kind = config.spikes ?? 'cones';
  if (kind === 'none') return;

  const spikeMat = makeMaterial(config, config.colors.spikes, config.style === 'glass' || config.style === 'crystal' ? {} : { transparent: false, opacity: 1 });

  if (kind === 'bolt') {
    const bolt = new THREE.Mesh(
      makeBoltGeometry(),
      new THREE.MeshStandardMaterial({
        color: config.colors.spikes,
        emissive: config.colors.spikes,
        emissiveIntensity: 0.7,
        side: THREE.DoubleSide,
        flatShading: true,
      })
    );
    bolt.position.set(0, 15.2, 0.5);
    bolt.rotation.y = Math.PI / 2; // fin runs along the spine
    rig.add(bolt);
    parts.spikeMeshes.push(bolt);
    return;
  }

  if (kind === 'flames') {
    spikeMat.emissive = new THREE.Color(config.colors.spikes);
    spikeMat.emissiveIntensity = 0.8;
  }

  const positions = [
    { z: 5.5, s: 0.8 },
    { z: 2, s: 1.15 },
    { z: -1.5, s: 1.0 },
    { z: -5, s: 0.75 },
  ];

  for (const { z, s } of positions) {
    let geo;
    if (kind === 'crystals' || kind === 'rocks') {
      geo = new THREE.OctahedronGeometry(1.5, 0);
    } else if (kind === 'leaves') {
      geo = new THREE.ConeGeometry(1.5, 3.2, 5);
    } else {
      geo = new THREE.ConeGeometry(1.1, 2.8, 5); // cones + flames
    }
    const spike = new THREE.Mesh(geo, spikeMat);
    spike.position.set(0, 15 + (kind === 'crystals' ? 0.6 : 0.4), z);
    spike.scale.setScalar(s);
    if (kind === 'leaves') {
      spike.scale.z *= 0.35;
      spike.rotation.x = -0.3;
    }
    if (kind === 'rocks') {
      spike.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
    }
    spike.castShadow = true;
    rig.add(spike);
    parts.spikeMeshes.push(spike);
  }
}

function buildAccessories(config, parts, rig, headGroup) {
  const list = config.accessories ?? [];

  if (list.includes('jacket')) {
    const leather = new THREE.MeshStandardMaterial({ color: 0x6e4b2a, roughness: 0.7, flatShading: true });
    // Open-front shell wrapped around the torso (cylinder axis rotated onto z).
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(7.1, 7.1, 9, 12, 1, true, Math.PI * 0.15, Math.PI * 1.7),
      new THREE.MeshStandardMaterial({ color: 0x6e4b2a, roughness: 0.7, flatShading: true, side: THREE.DoubleSide })
    );
    shell.rotation.x = Math.PI / 2;
    shell.rotation.y = Math.PI; // opening faces the belly
    shell.position.set(0, 10.4, 0.5);
    rig.add(shell);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(4.6, 1, 6, 12), leather);
    collar.position.set(0, 13.2, 5.2);
    collar.rotation.x = Math.PI / 2.4;
    rig.add(collar);
  }

  if (list.includes('mug')) {
    const mug = new THREE.Group();
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.1, 2.4, 10),
      new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.5 })
    );
    mug.add(cup);
    const coffee = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 0.3, 10),
      new THREE.MeshStandardMaterial({ color: 0x3b2412, roughness: 0.9 })
    );
    coffee.position.y = 1.1;
    mug.add(coffee);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.22, 6, 10),
      cup.material
    );
    handle.position.x = 1.5;
    mug.add(handle);
    mug.position.set(5.8, 11.5, 5.5);
    rig.add(mug);
  }

  if (list.includes('can')) {
    const can = new THREE.Group();
    const bodyMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0xd63031, roughness: 0.35, metalness: 0.4 })
    );
    can.add(bodyMesh);
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.55, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: 0xc0c8d0, roughness: 0.3, metalness: 0.8 })
    );
    lid.position.y = 2.1;
    can.add(lid);
    can.position.set(0, 16.6, -1);
    can.rotation.z = 0.18;
    rig.add(can);
  }

  if (list.includes('flower')) {
    const flower = new THREE.Group();
    const center = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.8 })
    );
    flower.add(center);
    const petalMat = new THREE.MeshStandardMaterial({ color: 0xf78fb3, roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.55, 6, 5), petalMat);
      const a = (i / 5) * Math.PI * 2;
      petal.position.set(Math.cos(a) * 1, 0, Math.sin(a) * 1);
      petal.scale.set(1.2, 0.4, 1.2);
      flower.add(petal);
    }
    flower.position.set(1.2, 4.2, 0.5);
    headGroup.add(flower);
  }

  if (list.includes('halo')) {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.35, 8, 20),
      new THREE.MeshStandardMaterial({
        color: 0xffe9a0,
        emissive: 0xffd54f,
        emissiveIntensity: 1.2,
      })
    );
    halo.position.set(0, 6.2, 0);
    halo.rotation.x = Math.PI / 2;
    headGroup.add(halo);
    return halo;
  }
  return null;
}

class Dragon {
  constructor(config) {
    this.config = config;

    this.group = new THREE.Group();
    this.group.name = `dragon-${config.id}`;
    this.rig = new THREE.Group();
    this.group.add(this.rig);

    this.parts = { spikeMeshes: [] };
    this.materials = [];
    this.anim = 'idle';
    this.animTime = Math.random() * 100; // desync instances
    this.oneShot = null;

    this.#build();

    this.group.scale.setScalar(config.scale ?? 1);
    if (config.flatten) this.group.scale.x *= config.flatten;

    // Collect materials for the hurt flash.
    this.rig.traverse((obj) => {
      if (obj.isMesh && obj.material && !this.materials.includes(obj.material)) {
        this.materials.push(obj.material);
      }
    });
    this.baseEmissive = this.materials.map((m) => ({
      color: m.emissive ? m.emissive.clone() : null,
      intensity: m.emissiveIntensity,
    }));
  }

  #build() {
    const { config, parts, rig } = this;
    const c = config.colors;

    const bodyMat = makeMaterial(config, c.body);
    const bellyMat = makeMaterial(config, c.belly);
    const wingMat = makeMaterial(config, c.wings, { side: THREE.DoubleSide });
    const hornMat = makeMaterial(config, c.horns, { transparent: false, opacity: 1 });

    // — Body —
    const body = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8), bodyMat);
    body.scale.set(1.05, 0.95, 1.45);
    body.position.y = 10;
    body.castShadow = true;
    rig.add(body);
    parts.body = body;

    const belly = new THREE.Mesh(new THREE.SphereGeometry(5.4, 10, 8), bellyMat);
    belly.scale.set(0.9, 0.8, 1.25);
    belly.position.set(0, 8.6, 1.2);
    rig.add(belly);

    // — Head —
    const head = new THREE.Group();
    head.position.set(0, 15.5, 8.5);
    rig.add(head);
    parts.head = head;

    const skull = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), bodyMat);
    skull.castShadow = true;
    head.add(skull);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 3.6), bodyMat);
    snout.position.set(0, -1, 3.6);
    head.add(snout);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1, 3), bellyMat);
    jaw.position.set(0, -2.2, 3.3);
    head.add(jaw);

    const eyeColor = config.eyeColor ?? 0x222222;
    const eyeMat = new THREE.MeshStandardMaterial({
      color: eyeColor,
      roughness: 0.3,
      emissive: config.eyeEmissive ? eyeColor : 0x000000,
      emissiveIntensity: config.eyeEmissive ? 1 : 0,
    });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), eyeWhiteMat);
      eyeWhite.position.set(side * 2.2, 1, 2.4);
      head.add(eyeWhite);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), eyeMat);
      pupil.position.set(side * 2.5, 1, 3.1);
      head.add(pupil);

      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.6, 6), hornMat);
      horn.position.set(side * 1.9, 3.4, -1);
      horn.rotation.x = -0.45;
      horn.rotation.z = side * -0.15;
      head.add(horn);
    }

    // — Wings — (pivots at the shoulders; geometry extends +x, mirrored for the left)
    const wingGeo = makeWingGeometry();
    parts.wings = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 5.2, 13.5, 0.5);
      const wing = new THREE.Mesh(wingGeo, wingMat);
      wing.rotation.x = -Math.PI / 2;
      wing.scale.x = side;
      wing.castShadow = true;
      pivot.add(wing);
      rig.add(pivot);
      parts.wings.push({ pivot, side });
    }

    // — Legs — (pivots at the hips so rotation.x swings them)
    parts.legs = [];
    const legGeo = new THREE.CapsuleGeometry(1.5, 3.4, 4, 8);
    const footGeo = new THREE.SphereGeometry(1.7, 8, 6);
    const legDefs = [
      { x: -3.9, z: 4.6, phase: 0 }, // front-left
      { x: 3.9, z: 4.6, phase: Math.PI }, // front-right
      { x: -4.2, z: -4.4, phase: Math.PI }, // back-left
      { x: 4.2, z: -4.4, phase: 0 }, // back-right
    ];
    for (const def of legDefs) {
      const pivot = new THREE.Group();
      pivot.position.set(def.x, 7.5, def.z);
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.y = -3.2;
      leg.castShadow = true;
      pivot.add(leg);
      const foot = new THREE.Mesh(footGeo, bellyMat);
      foot.position.set(0, -6.2, 0.6);
      foot.scale.set(1, 0.55, 1.25);
      pivot.add(foot);
      rig.add(pivot);
      parts.legs.push({ pivot, phase: def.phase });
    }

    // — Tail — (chained segments so sway cascades)
    parts.tailSegs = [];
    const tailBase = new THREE.Group();
    tailBase.position.set(0, 10.5, -8);
    rig.add(tailBase);
    let parent = tailBase;
    const segDefs = [
      { r: 2.9, z: -2 },
      { r: 2.1, z: -4.4 },
      { r: 1.4, z: -3.6 },
    ];
    for (const def of segDefs) {
      const seg = new THREE.Group();
      seg.position.z = def.z;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.r, 8, 6), bodyMat);
      mesh.scale.set(0.9, 0.9, 1.5);
      mesh.castShadow = true;
      seg.add(mesh);
      parent.add(seg);
      parts.tailSegs.push(seg);
      parent = seg;
    }
    const tailSpike = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.4, 5), hornMat);
    tailSpike.rotation.x = -Math.PI / 2; // point backward (-z)
    tailSpike.position.z = -2.6;
    parent.add(tailSpike);

    buildSpikes(config, bodyMat, parts, rig);
    parts.halo = buildAccessories(config, parts, rig, head);
  }

  /** Set the looping base animation: 'idle' | 'walk' | 'fly'. */
  setAnimation(name) {
    if (!['idle', 'walk', 'fly'].includes(name)) return;
    this.anim = name;
  }

  /** Trigger a one-shot: 'attack' | 'hurt'. Returns to the base loop when done. */
  play(name) {
    if (name === 'attack') this.oneShot = { name, t: 0, duration: 0.45 };
    else if (name === 'hurt') this.oneShot = { name, t: 0, duration: 0.4 };
    else this.setAnimation(name);
  }

  update(dt) {
    this.animTime += dt;
    const t = this.animTime;
    const { parts, rig } = this;

    let bob = 0;
    let lift = 0;
    let flap;
    let legSwing = 0;
    let legTuck = 0;
    let tailSpeed = 1.5;
    let tailAmp = 0.14;

    switch (this.anim) {
      case 'walk':
        bob = Math.abs(Math.sin(t * 8)) * 0.7;
        flap = 0.7 + Math.sin(t * 8) * 0.06; // folded, small bounce
        legSwing = 0.55;
        tailSpeed = 4;
        tailAmp = 0.22;
        break;
      case 'fly':
        lift = 16 + Math.sin(t * 3) * 2;
        flap = Math.sin(t * 10) * 0.85;
        legTuck = 0.95;
        tailSpeed = 2.5;
        tailAmp = 0.08;
        break;
      default: // idle
        bob = Math.sin(t * 2.2) * 0.6;
        flap = 0.5 + Math.sin(t * 1.8) * 0.12;
        break;
    }

    // One-shot overlays.
    let lungeZ = 0;
    let headPitch = 0;
    let shakeX = 0;
    let flash = 0;
    if (this.oneShot) {
      this.oneShot.t += dt;
      const p = Math.min(this.oneShot.t / this.oneShot.duration, 1);
      if (this.oneShot.name === 'attack') {
        lungeZ = Math.sin(Math.PI * p) * 7;
        headPitch = Math.sin(Math.PI * p) * 0.5;
        flap = 0.9 * Math.sin(Math.PI * p) + (flap ?? 0.5) * (1 - p);
      } else {
        shakeX = Math.sin(p * 40) * 1.1 * (1 - p);
        flash = 1 - p;
      }
      if (p >= 1) this.oneShot = null;
    }

    rig.position.set(shakeX, bob + lift, lungeZ);

    for (const { pivot, side } of parts.wings) {
      pivot.rotation.z = side * flap;
    }
    for (const { pivot, phase } of parts.legs) {
      pivot.rotation.x = legTuck > 0 ? legTuck : Math.sin(t * 8 + phase) * legSwing;
    }
    parts.tailSegs.forEach((seg, i) => {
      seg.rotation.y = Math.sin(t * tailSpeed + i * 0.9) * tailAmp;
    });
    parts.head.rotation.x = headPitch + Math.sin(t * 1.3) * 0.04;
    if (parts.halo) parts.halo.rotation.z = t * 1.5;

    // Hurt flash: push every material toward red, restore as it fades.
    if (flash > 0 || this.wasFlashing) {
      this.materials.forEach((m, i) => {
        const base = this.baseEmissive[i];
        if (!m.emissive || !base.color) return;
        m.emissive.copy(base.color).lerp(HURT_COLOR, flash);
        m.emissiveIntensity = THREE.MathUtils.lerp(base.intensity ?? 0, 1, flash);
      });
      this.wasFlashing = flash > 0;
    }
  }
}

/** Build a dragon from a config entry in src3d/data/dragonTypes.js. */
export function createDragon(config) {
  return new Dragon(config);
}
