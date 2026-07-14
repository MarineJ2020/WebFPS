import * as THREE from "three";
import { loadSkybox } from "./Skybox";

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly viewmodelScene: THREE.Scene;
  readonly viewmodelCamera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private readonly viewmodelEnvironmentQuaternion = new THREE.Quaternion();
  private readonly viewmodelEnvironmentEuler = new THREE.Euler(0, 0, 0, "YXZ");

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 1.7, 5);
    this.scene.add(this.camera);

    this.viewmodelScene = new THREE.Scene();
    this.viewmodelCamera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.01,
      10,
    );
    this.viewmodelScene.add(this.viewmodelCamera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.addLights();
    this.addViewmodelLights();
    loadSkybox(this.scene, this.renderer, [this.scene, this.viewmodelScene]);

    window.addEventListener("resize", this.onResize);
  }

  private addViewmodelLights(): void {
    this.viewmodelScene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 2, 2);
    this.viewmodelScene.add(key);
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x5f6d7a, 1.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4df, 2.2);
    sun.position.set(12, 20, 8);
    this.scene.add(sun);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewmodelCamera.aspect = this.camera.aspect;
    this.viewmodelCamera.fov = this.camera.fov;
    this.viewmodelCamera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  render(): void {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.syncViewmodelEnvironmentRotation();
    this.renderer.render(this.viewmodelScene, this.viewmodelCamera);
  }

  private syncViewmodelEnvironmentRotation(): void {
    this.viewmodelEnvironmentQuaternion.copy(this.camera.quaternion).invert();
    this.viewmodelEnvironmentEuler.setFromQuaternion(this.viewmodelEnvironmentQuaternion, "YXZ");
    this.viewmodelScene.environmentRotation.copy(this.viewmodelEnvironmentEuler);
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
  }
}
