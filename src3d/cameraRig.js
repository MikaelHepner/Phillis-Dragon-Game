import * as THREE from 'three';

const DISTANCE = 110;
const HEIGHT = 70;
const LOOK_HEIGHT = 12;
const FOLLOW_LERP = 0.08;
// Height is followed more tightly: a fire dragon climbs the volcano fast, and a
// camera trailing far below it ends up aiming into the slope.
const FOLLOW_LERP_Y = 0.25;
const CLEARANCE = 12; // keep at least this far above any terrain under the camera
const YAW_LIMIT = Math.PI * 0.9;
const PITCH_MIN = -0.25;
const PITCH_MAX = 0.35;

/**
 * Third-person follow rig: fixed distance/height behind the target with a
 * slight mouse-drag orbit (clamped yaw + pitch), smoothed with lerp.
 */
export class CameraRig {
  /**
   * @param {(x: number, z: number) => number} [opts.heightAt] terrain surface y
   *   under a point; the camera never drops below it (the volcano slopes).
   */
  constructor(camera, target, domElement, { heightAt = null } = {}) {
    this.camera = camera;
    this.target = target;
    this.heightAt = heightAt;
    this.yaw = 0;
    this.pitch = 0;
    this.smoothedTarget = target.position.clone();

    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    domElement.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.yaw = THREE.MathUtils.clamp(this.yaw - dx * 0.004, -YAW_LIMIT, YAW_LIMIT);
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.003, PITCH_MIN, PITCH_MAX);
    });
  }

  /** Follow a different object; the existing lerp pans the camera over. */
  setTarget(target) {
    this.target = target;
  }

  update() {
    const t = this.target.position;
    const s = this.smoothedTarget;
    s.x += (t.x - s.x) * FOLLOW_LERP;
    s.z += (t.z - s.z) * FOLLOW_LERP;
    s.y += (t.y - s.y) * FOLLOW_LERP_Y;

    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * DISTANCE * Math.cos(this.pitch),
      HEIGHT + Math.sin(this.pitch) * DISTANCE,
      Math.cos(this.yaw) * DISTANCE * Math.cos(this.pitch)
    );

    this.camera.position.copy(this.smoothedTarget).add(offset);
    if (this.heightAt) {
      const p = this.camera.position;
      p.y = Math.max(p.y, this.heightAt(p.x, p.z) + CLEARANCE);
    }
    this.camera.lookAt(
      this.smoothedTarget.x,
      this.smoothedTarget.y + LOOK_HEIGHT,
      this.smoothedTarget.z
    );
  }
}
