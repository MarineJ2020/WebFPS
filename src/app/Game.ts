import { InputManager } from "../input/InputManager";
import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import type { SimulationWorld } from "../core/simulation/SimulationWorld";
import { getWeaponConfig } from "../data/weapons/weaponTypes";
import { createDefaultSessionDefinition, type GameSessionDefinition } from "../data/session/GameSessionDefinition";
import { SettingsStore } from "../ui/SettingsStore";
import { UIRoot } from "../ui/UIRoot";
import { RenderWorld } from "../render/RenderWorld";
import { LevelEditor, runtimeMapFromEditor } from "../editor/LevelEditor";
import { GameLoop } from "./GameLoop";
import type { GameModeState } from "./GameModeState";
import { SessionController } from "./SessionController";

export class Game {
  private readonly renderWorld: RenderWorld;
  private readonly inputManager: InputManager;
  private readonly settingsStore = new SettingsStore();
  private readonly ui: UIRoot;
  private readonly loop = new GameLoop();
  private readonly sessions = new SessionController();
  private readonly levelEditor: LevelEditor;
  private simulation: SimulationWorld | null = null;
  private mode: GameModeState = "mainMenu";

  constructor(container: HTMLElement) {
    this.renderWorld = new RenderWorld(container);
    this.inputManager = new InputManager(this.renderWorld.domElement);
    this.ui = new UIRoot(container, this.settingsStore);
    this.levelEditor = new LevelEditor(
      container,
      this.renderWorld.sceneManager.scene,
      this.renderWorld.camera,
      this.renderWorld.domElement,
      {
        getVolumeMeshes: () => this.renderWorld.getMapMeshes(),
        onDocumentChange: (document) => {
          this.renderWorld.loadMap(runtimeMapFromEditor(document));
        },
        onPlay: (document) => {
          void this.startGame(createDefaultSessionDefinition(runtimeMapFromEditor(document)));
        },
        onExit: () => this.showMainMenu(),
      },
    );

    this.wireUI();
    this.applySettings(this.settingsStore.get());
    this.settingsStore.onChange((settings) => this.applySettings(settings));
    document.addEventListener("keydown", this.onKeyDown);
  }

  async init(): Promise<void> {
    this.showMainMenu();
  }

  start(): void {
    this.loop.start(this.tick);
  }

  stop(): void {
    this.loop.stop();
  }

  get player() {
    return this.simulation?.player ?? null;
  }

  private wireUI(): void {
    this.ui.setMainMenuActions({
      onStartGame: () => void this.startGame(createDefaultSessionDefinition()),
      onOpenEditor: () => this.openEditor(),
      onOpenSettings: () => this.ui.settingsMenu.show(),
    });

    this.ui.setPauseMenuActions({
      onResume: () => this.resumeGame(),
      onRestart: () => void this.restartGame(),
      onOpenSettings: () => this.ui.settingsMenu.show(),
      onMainMenu: () => this.showMainMenu(),
    });

    this.ui.setDeathActions({
      onRestart: () => void this.restartGame(),
      onMainMenu: () => this.showMainMenu(),
    });
  }

  private async startGame(definition: GameSessionDefinition): Promise<void> {
    this.levelEditor.hide();
    this.setMode("loading");
    this.renderWorld.loadMap(definition.map);
    this.simulation = await this.sessions.start(definition, this.renderWorld.hitscan);
    await this.renderWorld.bindSimulation(this.simulation);
    this.setMode("playing");
  }

  private async restartGame(): Promise<void> {
    const restarted = await this.sessions.restart(this.renderWorld.hitscan);
    if (!restarted || !this.sessions.definition) {
      await this.startGame(createDefaultSessionDefinition());
      return;
    }

    this.levelEditor.hide();
    this.setMode("loading");
    this.renderWorld.loadMap(this.sessions.definition.map);
    this.simulation = restarted;
    await this.renderWorld.bindSimulation(this.simulation);
    this.setMode("playing");
  }

  private resumeGame(): void {
    if (!this.simulation) return;
    this.setMode("playing");
  }

  private showMainMenu(): void {
    this.simulation = null;
    this.sessions.clear();
    this.levelEditor.hide();
    this.renderWorld.clearSimulationBindings();
    this.setMode("mainMenu");
  }

  private openEditor(): void {
    this.simulation = null;
    this.sessions.clear();
    this.renderWorld.clearSimulationBindings();
    this.setMode("editing");
    this.levelEditor.show();
  }

  private setMode(mode: GameModeState): void {
    this.mode = mode;
    this.ui.showMode(mode);
    this.inputManager.setPointerLockEnabled(mode === "playing");
    if (mode !== "playing") document.exitPointerLock();
  }

  private applySettings(settings: { mouseSensitivity: number; fov: number; masterVolume: number }): void {
    this.inputManager.sensitivity = settings.mouseSensitivity;
    this.renderWorld.applySettings(settings);
  }

  private tick = (
    frameDelta: number,
    stepFixed: (step: (fixedDt: number) => void) => void,
  ): void => {
    if (this.mode === "editing") {
      this.levelEditor.update();
      this.renderWorld.render();
      return;
    }

    const simulation = this.simulation;
    if (simulation && this.mode === "playing") {
      const command = this.inputManager.consumeCommand();
      const commandsByEntityId = new Map<string, PlayerCommand>([[simulation.player.id, command]]);
      stepFixed((fixedDt) => simulation.update(fixedDt, commandsByEntityId));

      this.renderWorld.update(frameDelta, simulation, command.yawDelta, command.pitchDelta);
      this.updateHUD(simulation);

      if (simulation.player.health <= 0) {
        this.setMode("dead");
      }
    } else if (simulation) {
      this.renderWorld.update(frameDelta, simulation, 0, 0);
      this.updateHUD(simulation);
    }

    this.renderWorld.render();
  };

  private updateHUD(simulation: SimulationWorld): void {
    const player = simulation.player;
    const weapon = player.currentWeapon;
    const config = getWeaponConfig(weapon.configId);
    const mode = config.fireModes[weapon.currentFireModeIndex];
    this.ui.hud.setAmmoStatus(mode.kind, weapon.ammoInMag, weapon.ammoReserve, weapon.reloadTimer > 0);
    this.ui.hud.setHealth(player.health, player.maxHealth);

    const spreadRange = config.maxSpread - config.baseSpread;
    const spreadFraction = spreadRange > 0 ? (weapon.currentSpread - config.baseSpread) / spreadRange : 0;
    this.ui.hud.setCrosshairSpread(spreadFraction);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Escape" || this.ui.settingsVisible) return;
    if (this.mode === "playing") {
      event.preventDefault();
      this.setMode("paused");
    } else if (this.mode === "paused") {
      event.preventDefault();
      this.resumeGame();
    }
  };
}
