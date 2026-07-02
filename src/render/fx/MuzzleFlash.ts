import * as THREE from "three";

const FLASH_DURATION = 0.045;
const PEAK_LIGHT_INTENSITY = 4;

/** Brief primitive flash + point light, triggered once per shot. */
export class MuzzleFlash {
  readonly object: THREE.Group;
  private readonly mesh: THREE.Mesh;
  private readonly light: THREE.PointLight;
  private timer = 0;

  constructor() {
    this.object = new THREE.Group();

    const geometry = new THREE.ConeGeometry(0.045, 0.16, 6);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -0.08);
    const material = new THREE.MeshBasicMaterial({ color: 0xffdd88 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.object.add(this.mesh);

    this.light = new THREE.PointLight(0xffaa33, 0, 2.5);
    this.object.add(this.light);

    this.setVisible(false);
  }

  trigger(): void {
    this.timer = FLASH_DURATION;
    this.mesh.rotation.z = Math.random() * Math.PI * 2;
    this.setVisible(true);
  }

  update(dt: number): void {
    if (this.timer <= 0) return;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.setVisible(false);
      return;
    }
    this.light.intensity = PEAK_LIGHT_INTENSITY * (this.timer / FLASH_DURATION);
  }

  private setVisible(visible: boolean): void {
    this.mesh.visible = visible;
    this.light.intensity = visible ? PEAK_LIGHT_INTENSITY : 0;
  }
}
