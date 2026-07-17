import * as THREE from 'three';

const DISTANCE = 110;
const HEIGHT = 70;
const LOOK_HEIGHT = 12;
const FOLLOW_LERP = 0.08;
const YAW_LIMIT = Math.PI * 0.9;
const PITCH_MIN = -0.25;
const PITCH_MAX = 0.35;

/**
 * Third-person follow rig: fixed distance/height behind the target with a
 * slight mouse-drag orbit (clamped yaw + pitch), smoothed with lerp.
 */
export class CameraRig {
  constructor(camera, target, domElement) {
    this.camera = camera;
    this.target = target;
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

  update() {
    this.smoothedTarget.lerp(this.target.position, FOLLOW_LERP);

    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * DISTANCE * Math.cos(this.pitch),
      HEIGHT + Math.sin(this.pitch) * DISTANCE,
      Math.cos(this.yaw) * DISTANCE * Math.cos(this.pitch)
    );

    this.camera.position.copy(this.smoothedTarget).add(offset);
    this.camera.lookAt(
      this.smoothedTarget.x,
      this.smoothedTarget.y + LOOK_HEIGHT,
      this.smoothedTarget.z
    );
  }
}
