import * as THREE from "three";
import { SceneManager } from "./SceneManager";
import { MapSceneController } from "./MapRenderer";
import { EntityRenderer } from "./EntityRenderer";
import { PlayerViewmodel } from "./PlayerViewmodel";
import { HitDecals } from "./fx/HitDecals";
import { ImpactParticles } from "./fx/ImpactParticles";
import { Tracer } from "./fx/Tracer";
import { TracerCoordinator } from "./fx/TracerCoordinator";
import { WorldAudio } from "./fx/WorldAudio";
import { BotDebugVisualizer } from "./debug/BotDebugVisualizer";
import { ThreeHitscanQuery } from "../core/physics/raycast/ThreeHitscanQuery";
import { applyPlayerToCamera } from "./CameraRig";
import { getWeaponConfig } from "../data/weapons/weaponTypes";
import type { MapDefinition } from "../data/maps/MapDefinition";
import type { SimulationWorld } from "../core/simulation/SimulationWorld";
import type { LanCharacterSnapshot, LanMatchSnapshot } from "../net/LanProtocol";
import { PLAYER_EYE_HEIGHT } from "../core/entities/Player";

export class RenderWorld {
  readonly sceneManager: SceneManager;
  readonly hitscan = new ThreeHitscanQuery();
  private readonly mapScene: MapSceneController;
  private readonly entityRenderer: EntityRenderer;
  private readonly viewmodel: PlayerViewmodel;
  private readonly hitDecals: HitDecals;
  private readonly impactParticles: ImpactParticles;
  private readonly tracer: Tracer;
  private readonly worldAudio: WorldAudio;
  private readonly botDebug: BotDebugVisualizer;
  private tracerCoordinator: TracerCoordinator | null = null;
  private eventUnsubscribers: Array<() => void> = [];
  private lastReloadTimer = 0;

  constructor(container: HTMLElement) {
    this.sceneManager = new SceneManager(container);
    this.mapScene = new MapSceneController(this.sceneManager.scene);
    this.entityRenderer = new EntityRenderer(this.sceneManager.scene);
    this.viewmodel = new PlayerViewmodel(this.sceneManager.viewmodelScene);
    this.hitDecals = new HitDecals(this.sceneManager.scene);
    this.impactParticles = new ImpactParticles(this.sceneManager.scene);
    this.tracer = new Tracer(this.sceneManager.scene);
    this.worldAudio = new WorldAudio(this.sceneManager.scene, this.sceneManager.camera);
    this.botDebug = new BotDebugVisualizer(this.sceneManager.scene);
  }

  get domElement(): HTMLElement {
    return this.sceneManager.renderer.domElement;
  }

  get camera(): THREE.PerspectiveCamera {
    return this.sceneManager.camera;
  }

  loadMap(map: MapDefinition): void {
    const meshes = this.mapScene.load(map);
    this.hitscan.setTargets(meshes);
    this.entityRenderer.clear();
  }

  getMapMeshes(): THREE.Mesh[] {
    return this.mapScene.getHitscanTargets();
  }

  async bindSimulation(simulation: SimulationWorld): Promise<void> {
    this.clearSimulationBindings();
    this.lastReloadTimer = 0;
    await this.viewmodel.setWeapon(getWeaponConfig(simulation.player.currentWeapon.configId));

    this.tracerCoordinator = new TracerCoordinator(simulation.events, this.tracer);

    this.eventUnsubscribers = [
      simulation.events.on("weaponFired", (event) => {
        if (event.entityId === simulation.player.id) {
          const isLastRound = simulation.player.currentWeapon.ammoInMag === 0;
          this.viewmodel.playFireEffect(isLastRound);
          return;
        }
        this.worldAudio.playShot(event.origin);
      }),
      simulation.events.on("weaponHit", (hit) => {
        if (!hit.hitEntityId && hit.normal) {
          this.hitDecals.spawn(hit.point, hit.normal);
          this.impactParticles.spawnWall(hit.point, hit.normal);
          this.worldAudio.playImpact(hit.point, "world");
        } else if (hit.hitEntityId) {
          this.impactParticles.spawnBlood(hit.point);
          this.worldAudio.playImpact(hit.point, "character");
        }
      }),
    ];
  }

  async bindNetworkWeapon(configId: string): Promise<void> {
    this.clearSimulationBindings();
    this.lastReloadTimer = 0;
    await this.viewmodel.setWeapon(getWeaponConfig(configId));
  }

  update(
    dt: number,
    simulation: SimulationWorld,
    yawDelta: number,
    pitchDelta: number,
  ): void {
    const player = simulation.player;
    const weapon = player.currentWeapon;

    if (weapon.reloadTimer > 0 && this.lastReloadTimer <= 0) {
      this.viewmodel.playReloadEffect(weapon.ammoInMag <= 0);
    }
    this.lastReloadTimer = weapon.reloadTimer;
    this.viewmodel.setMagazineEmpty(weapon.ammoInMag <= 0 && weapon.reloadTimer <= 0);

    this.viewmodel.update(dt, yawDelta, pitchDelta, player.grounded, player.verticalVelocity);
    this.tracer.update(dt);
    this.impactParticles.update(dt);
    this.worldAudio.update();
    applyPlayerToCamera(this.sceneManager.camera, player);
    this.entityRenderer.sync(simulation.aiCharacters);
    this.botDebug.sync(simulation.aiCharacters);
  }

  updateNetwork(
    dt: number,
    localPlayer: LanCharacterSnapshot,
    snapshot: LanMatchSnapshot,
    yawDelta: number,
    pitchDelta: number,
  ): void {
    const weapon = localPlayer.weapon;
    if (weapon.reloadTimer > 0 && this.lastReloadTimer <= 0) {
      this.viewmodel.playReloadEffect(weapon.ammoInMag <= 0);
    }
    this.lastReloadTimer = weapon.reloadTimer;
    this.viewmodel.setMagazineEmpty(weapon.ammoInMag <= 0 && weapon.reloadTimer <= 0);
    this.viewmodel.update(dt, yawDelta, pitchDelta, true, 0);

    this.sceneManager.camera.position.set(
      localPlayer.position.x,
      localPlayer.position.y + PLAYER_EYE_HEIGHT,
      localPlayer.position.z,
    );
    this.sceneManager.camera.rotation.set(localPlayer.pitch, localPlayer.yaw, 0, "YXZ");

    this.entityRenderer.syncNetwork([
      ...snapshot.players
        .filter((player) => player.id !== localPlayer.id)
        .map((player) => ({
          id: player.id,
          name: player.name,
          team: player.team,
          position: player.position,
          yaw: player.yaw,
          dead: player.dead,
          weaponConfigId: player.weapon.configId,
        })),
      ...snapshot.bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        team: bot.team,
        position: bot.position,
        yaw: bot.yaw,
        dead: bot.dead,
          weaponConfigId: bot.weapon.configId,
        })),
    ], dt);
    this.entityRenderer.syncPickups(snapshot.pickups);

    for (const shot of snapshot.shots) {
      if (shot.shooterId === localPlayer.id) this.viewmodel.playFireEffect(localPlayer.weapon.ammoInMag === 0);
      else this.worldAudio.playShot(shot.from);
      this.tracer.spawn(shot.from, shot.to);
      if (shot.impactKind === "character") {
        this.impactParticles.spawnBlood(shot.to);
        this.worldAudio.playImpact(shot.to, "character");
      } else if (shot.impactKind === "world") {
        this.impactParticles.spawnWall(shot.to);
        this.worldAudio.playImpact(shot.to, "world");
      }
    }
    this.tracer.update(dt);
    this.impactParticles.update(dt);
    this.worldAudio.update();
  }

  render(): void {
    this.sceneManager.render();
  }

  applySettings(settings: { fov: number }): void {
    this.sceneManager.camera.fov = settings.fov;
    this.sceneManager.camera.updateProjectionMatrix();
    this.sceneManager.viewmodelCamera.fov = settings.fov;
    this.sceneManager.viewmodelCamera.updateProjectionMatrix();
  }

  clearSimulationBindings(): void {
    this.tracerCoordinator?.dispose();
    this.tracerCoordinator = null;
    for (const unsubscribe of this.eventUnsubscribers) unsubscribe();
    this.eventUnsubscribers = [];
    this.entityRenderer.clear();
    this.impactParticles.clear();
  }

  dispose(): void {
    this.clearSimulationBindings();
    this.botDebug.dispose();
    this.mapScene.clear();
    this.entityRenderer.clear();
    this.worldAudio.dispose();
    this.sceneManager.dispose();
  }
}
