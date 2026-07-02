import { SceneManager } from "../render/SceneManager";
import { buildMapMeshes } from "../render/MapRenderer";
import { EntityRenderer } from "../render/EntityRenderer";
import { PlayerViewmodel } from "../render/PlayerViewmodel";
import { HitDecals } from "../render/fx/HitDecals";
import { BLOCKOUT_MAP_01 } from "../data/maps/blockoutMap01";
import { applyPlayerToCamera } from "../render/CameraRig";
import { InputManager } from "../input/InputManager";
import { SimulationWorld } from "../core/simulation/SimulationWorld";
import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import { FIXED_TIMESTEP, MAX_FRAME_DELTA } from "../config/constants";
import { FixedTimestepAccumulator } from "../core/Clock";
import { ThreeHitscanQuery } from "../core/physics/raycast/ThreeHitscanQuery";
import { HUD } from "../ui/hud/HUD";
import { getWeaponConfig } from "../data/weapons/weaponTypes";
import { SettingsStore } from "../ui/SettingsStore";
import { SettingsMenu } from "../ui/menus/SettingsMenu";
import { DeathScreen } from "../ui/menus/DeathScreen";

export class Game {
  private readonly sceneManager: SceneManager;
  private readonly inputManager: InputManager;
  private readonly hud: HUD;
  private readonly entityRenderer: EntityRenderer;
  private readonly viewmodel: PlayerViewmodel;
  private readonly hitDecals: HitDecals;
  private readonly clock = new FixedTimestepAccumulator(FIXED_TIMESTEP, MAX_FRAME_DELTA);
  private readonly settingsStore = new SettingsStore();
  private readonly settingsMenu: SettingsMenu;
  private readonly deathScreen: DeathScreen;
  private simulation!: SimulationWorld;
  private lastTime = performance.now();
  private running = false;
  private paused = false;
  private isDead = false;
  private lastReloadTimer = 0;

  constructor(container: HTMLElement) {
    this.sceneManager = new SceneManager(container);
    this.inputManager = new InputManager(this.sceneManager.renderer.domElement);
    this.hud = new HUD(container);
    this.entityRenderer = new EntityRenderer(this.sceneManager.scene);
    this.viewmodel = new PlayerViewmodel(this.sceneManager.camera);
    this.hitDecals = new HitDecals(this.sceneManager.scene);
    this.settingsMenu = new SettingsMenu(container, this.settingsStore);
    this.deathScreen = new DeathScreen(container);

    this.settingsMenu.setOnVisibilityChange((visible) => {
      this.paused = visible;
      if (visible) document.exitPointerLock();
    });

    this.applySettings(this.settingsStore.get());
    this.settingsStore.onChange((settings) => this.applySettings(settings));
  }

  async init(): Promise<void> {
    const hitscan = new ThreeHitscanQuery();
    this.simulation = await SimulationWorld.create(hitscan);

    const mapMeshes = buildMapMeshes(this.sceneManager.scene, BLOCKOUT_MAP_01);
    hitscan.setTargets(mapMeshes);

    await this.viewmodel.setWeapon(getWeaponConfig(this.simulation.player.currentWeapon.configId));

    this.simulation.events.on("weaponFired", (event) => {
      if (event.entityId !== this.simulation.player.id) return;
      const isLastRound = this.simulation.player.currentWeapon.ammoInMag === 0;
      this.viewmodel.playFireEffect(isLastRound);
    });

    this.simulation.events.on("weaponHit", (hit) => {
      if (!hit.hitEntityId && hit.normal) {
        this.hitDecals.spawn(hit.point, hit.normal);
      }
    });
  }

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
  }

  get player() {
    return this.simulation.player;
  }

  private applySettings(settings: { mouseSensitivity: number; fov: number }): void {
    this.inputManager.sensitivity = settings.mouseSensitivity;
    this.sceneManager.camera.fov = settings.fov;
    this.sceneManager.camera.updateProjectionMatrix();
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    const frameDelta = Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (!this.isDead && this.simulation.player.health <= 0) {
      this.isDead = true;
      this.paused = true;
      this.deathScreen.show();
      document.exitPointerLock();
    }

    if (!this.paused) {
      const command = this.inputManager.consumeCommand();
      const commandsByEntityId = new Map<string, PlayerCommand>([
        [this.simulation.player.id, command],
      ]);
      this.clock.advance(frameDelta, (fixedDt) => {
        this.simulation.update(fixedDt, commandsByEntityId);
      });

      const weapon = this.simulation.player.currentWeapon;
      if (weapon.reloadTimer > 0 && this.lastReloadTimer <= 0) {
        // ammoInMag hasn't been refilled yet at this edge - still reflects the pre-reload count.
        this.viewmodel.playReloadEffect(weapon.ammoInMag <= 0);
      }
      this.lastReloadTimer = weapon.reloadTimer;
    }

    this.viewmodel.update(frameDelta);
    applyPlayerToCamera(this.sceneManager.camera, this.simulation.player);
    this.entityRenderer.sync(this.simulation.aiCharacters);
    this.sceneManager.render();
    this.updateHUD();

    requestAnimationFrame(this.tick);
  };

  private updateHUD(): void {
    const player = this.simulation.player;
    const weapon = player.currentWeapon;
    const config = getWeaponConfig(weapon.configId);
    const mode = config.fireModes[weapon.currentFireModeIndex];
    this.hud.setAmmoStatus(mode.kind, weapon.ammoInMag, weapon.ammoReserve, weapon.reloadTimer > 0);
    this.hud.setHealth(player.health, player.maxHealth);

    const spreadRange = config.maxSpread - config.baseSpread;
    const spreadFraction = spreadRange > 0 ? (weapon.currentSpread - config.baseSpread) / spreadRange : 0;
    this.hud.setCrosshairSpread(spreadFraction);
  }
}
