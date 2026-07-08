import * as THREE from "three";
import type { MapDefinition, MapVolume } from "../data/maps/MapDefinition";
import { VOLUME_COLOR } from "../data/maps/MapDefinition";

export class MapSceneController {
  private readonly scene: THREE.Scene;
  private readonly meshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  load(map: MapDefinition): THREE.Mesh[] {
    this.clear();
    for (const volume of map.volumes) {
      const mesh = buildVolumeMesh(volume);
      this.meshes.push(mesh);
      this.scene.add(mesh);
    }
    return this.getHitscanTargets();
  }

  getHitscanTargets(): THREE.Mesh[] {
    return [...this.meshes];
  }

  clear(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
    this.meshes.length = 0;
  }
}

export function buildMapMeshes(scene: THREE.Scene, map: MapDefinition): THREE.Mesh[] {
  const controller = new MapSceneController(scene);
  return controller.load(map);
}

export function buildVolumeMesh(volume: MapVolume): THREE.Mesh {
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
