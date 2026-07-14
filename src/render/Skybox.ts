import * as THREE from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

const SKYBOX_URL = "/skybox/skybox.exr";

/**
 * Loads an optional equirectangular EXR skybox from public/skybox/skybox.exr. If the file
 * hasn't been dropped in (or fails to load), the scene just keeps its flat fallback color -
 * this is a nice-to-have, not a hard requirement.
 */
export function loadSkybox(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  environmentScenes: readonly THREE.Scene[] = [scene],
): void {
  new EXRLoader().setDataType(THREE.FloatType).load(
    SKYBOX_URL,
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const environment = pmrem.fromEquirectangular(texture).texture;
      scene.background = texture;
      for (const environmentScene of environmentScenes) {
        environmentScene.environment = environment;
      }
      pmrem.dispose();
    },
    undefined,
    () => {
      // No skybox.exr present yet - keep the solid-color background from SceneManager.
    },
  );
}
