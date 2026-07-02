import * as THREE from "three";
import type { MapDefinition, MapVolume } from "../data/maps/MapDefinition";
import { VOLUME_COLOR } from "../data/maps/MapDefinition";

export function buildMapMeshes(scene: THREE.Scene, map: MapDefinition): THREE.Mesh[] {
  const meshes = map.volumes.map(buildVolumeMesh);
  for (const mesh of meshes) {
    scene.add(mesh);
  }
  return meshes;
}

function buildVolumeMesh(volume: MapVolume): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(
    volume.halfExtents.x * 2,
    volume.halfExtents.y * 2,
    volume.halfExtents.z * 2,
  );
  const material = new THREE.MeshStandardMaterial({ color: VOLUME_COLOR[volume.kind] });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(volume.position.x, volume.position.y, volume.position.z);
  if (volume.rotation) {
    mesh.quaternion.set(
      volume.rotation.x,
      volume.rotation.y,
      volume.rotation.z,
      volume.rotation.w,
    );
  }
  return mesh;
}
