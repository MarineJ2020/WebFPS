import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<LoadedModel>>();

function loadBase(url: string): Promise<LoadedModel> {
  let pending = cache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url).then((gltf) => ({ scene: gltf.scene, animations: gltf.animations }));
    cache.set(url, pending);
  }
  return pending;
}

/**
 * Loads (and caches) a GLTF model, returning an independent clone safe to add to the render
 * tree - regular Object3D.clone() doesn't correctly duplicate skinned-mesh bone bindings, so
 * this uses SkeletonUtils. Animation clips are stateless data and are shared, not cloned.
 */
export async function loadModelInstance(url: string): Promise<LoadedModel> {
  const base = await loadBase(url);
  return { scene: cloneSkeleton(base.scene) as THREE.Group, animations: base.animations };
}
