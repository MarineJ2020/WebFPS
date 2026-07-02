import * as THREE from "three";
import type { Player } from "../core/entities/Player";
import { PLAYER_EYE_HEIGHT } from "../core/entities/Player";
import { MAX_PLAYER_PITCH } from "../config/constants";

const euler = new THREE.Euler(0, 0, 0, "YXZ");

export function applyPlayerToCamera(camera: THREE.PerspectiveCamera, player: Player): void {
  camera.position.set(
    player.position.x,
    player.position.y + PLAYER_EYE_HEIGHT,
    player.position.z,
  );

  // player.recoil is authoritative (SimulationWorld applies it to the actual firing direction
  // too, clamped with this same constant), so the camera showing the identical offset means
  // point of impact always matches the visual climb, even at extreme pitch.
  const rawPitch = player.pitch + player.recoil.pitch;
  const pitch = Math.min(Math.max(rawPitch, -MAX_PLAYER_PITCH), MAX_PLAYER_PITCH);
  const yaw = player.yaw + player.recoil.yaw;
  euler.set(pitch, yaw, 0, "YXZ");
  camera.quaternion.setFromEuler(euler);
}
