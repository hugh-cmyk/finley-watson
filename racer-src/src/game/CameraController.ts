import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Third-person chase camera. Sits behind/above the kart, smoothly trails it,
 * and pushes its FOV out a touch with speed/boost for a cheap sense of pace.
 */
export class CameraController {
  private current = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private initialised = false;

  constructor(private camera: THREE.PerspectiveCamera) {}

  reset(): void {
    this.initialised = false;
  }

  update(target: THREE.Vector3, heading: number, speedRatio: number, dt: number): void {
    const c = CONFIG.camera;
    const behindX = -Math.sin(heading);
    const behindZ = -Math.cos(heading);

    const desired = new THREE.Vector3(
      target.x + behindX * c.distance,
      target.y + c.height,
      target.z + behindZ * c.distance,
    );

    // Look a little ahead of the kart in its facing direction.
    const ahead = new THREE.Vector3(
      target.x - behindX * c.lookAhead,
      target.y + 1.5,
      target.z - behindZ * c.lookAhead,
    );

    if (!this.initialised) {
      this.current.copy(desired);
      this.lookTarget.copy(ahead);
      this.initialised = true;
    } else {
      this.current.lerp(desired, Math.min(1, c.followLerp * dt));
      this.lookTarget.lerp(ahead, Math.min(1, 8 * dt));
    }
    this.camera.position.copy(this.current);
    this.camera.lookAt(this.lookTarget);

    const targetFov = THREE.MathUtils.lerp(c.baseFov, c.boostFov, THREE.MathUtils.clamp(speedRatio, 0, 1));
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 5 * dt);
    this.camera.updateProjectionMatrix();
  }
}
