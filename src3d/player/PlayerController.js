import * as THREE from 'three';
import { MovableDragon } from '../entities/MovableDragon.js';

// Direct control of the starter dragon: WASD / arrow keys (camera-relative)
// AND click-to-move — the handoff doc calls out that the 2D game shipped with
// no player controls, so the 3D version has both from day one.
//
// - Keys move relative to where the camera is looking (W = away from camera).
// - A short click/tap on the ground sets a move target the dragon walks to.
// - Any key press cancels an active click-to-move target.

const KEY_FORWARD = ['KeyW', 'ArrowUp'];
const KEY_BACK = ['KeyS', 'ArrowDown'];
const KEY_LEFT = ['KeyA', 'ArrowLeft'];
const KEY_RIGHT = ['KeyD', 'ArrowRight'];
const CLICK_DRAG_TOLERANCE = 6; // px; larger presses are camera-orbit drags
const ARRIVE_DIST = 6; // stop this close to a click target

export class PlayerController {
  constructor(dragon, camera, canvas, { colliders, bounds, groundY = 2, speed = 115 }) {
    this.mover = new MovableDragon(dragon, { colliders, bounds, speed, groundY });
    this.camera = camera;
    this.groundY = groundY;
    this.keys = new Set();
    this.moveTarget = null; // THREE.Vector3 on the ground plane, or null

    // Scratch vectors reused every frame.
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._vel = new THREE.Vector3();

    // Click-to-move raycasting against the ground plane.
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
    this._downAt = null;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      this.moveTarget = null; // manual steering overrides click-to-move
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    // Tap = move; drag = camera orbit (handled by CameraRig). Distinguish by
    // how far the pointer travelled between down and up.
    canvas.addEventListener('pointerdown', (e) => {
      this._downAt = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this._downAt) return;
      const dragged = Math.hypot(e.clientX - this._downAt.x, e.clientY - this._downAt.y);
      this._downAt = null;
      if (dragged > CLICK_DRAG_TOLERANCE) return;
      this.#setTargetFromPointer(e.clientX, e.clientY);
    });
  }

  get position() {
    return this.mover.position;
  }

  #setTargetFromPointer(clientX, clientY) {
    this._pointer.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hit = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._groundPlane, hit)) {
      this.moveTarget = hit;
    }
  }

  #keyAxis(codes) {
    return codes.some((c) => this.keys.has(c)) ? 1 : 0;
  }

  update(dt) {
    // Camera-relative basis, flattened onto the ground plane.
    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    this._forward.normalize();
    this._right.set(-this._forward.z, 0, this._forward.x); // forward × up

    const fInput = this.#keyAxis(KEY_FORWARD) - this.#keyAxis(KEY_BACK);
    const rInput = this.#keyAxis(KEY_RIGHT) - this.#keyAxis(KEY_LEFT);

    this._vel.set(0, 0, 0);

    if (fInput !== 0 || rInput !== 0) {
      this._vel
        .addScaledVector(this._forward, fInput)
        .addScaledVector(this._right, rInput)
        .normalize()
        .multiplyScalar(this.mover.speed);
    } else if (this.moveTarget) {
      const pos = this.position;
      const dx = this.moveTarget.x - pos.x;
      const dz = this.moveTarget.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= ARRIVE_DIST) {
        this.moveTarget = null;
      } else {
        // Ease down over the last stretch so the dragon settles, not skids.
        const s = this.mover.speed * Math.min(1, dist / 30);
        this._vel.set((dx / dist) * s, 0, (dz / dist) * s);
      }
    }

    this.mover.step(this._vel.x, this._vel.z, dt);
  }
}
