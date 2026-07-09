import { InputManager } from "../input/InputManager";
import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import { emptyPlayerCommand } from "../core/simulation/commands/PlayerCommand";
import type { SimulationWorld } from "../core/simulation/SimulationWorld";
import { getWeaponConfig } from "../data/weapons/weaponTypes";
import { createDefaultSessionDefinition, type GameSessionDefinition } from "../data/session/GameSessionDefinition";
import { SettingsStore } from "../ui/SettingsStore";
import { UIRoot } from "../ui/UIRoot";
import { RenderWorld } from "../render/RenderWorld";
import { LevelEditor, runtimeMapFromEditor } from "../editor/LevelEditor";
import type { EditableMapDocument } from "../editor/EditableMapDocument";
import type { MapDefinition } from "../data/maps/MapDefinition";
import { GameLoop } from "./GameLoop";
import type { GameModeState } from "./GameModeState";
import { SessionController } from "./SessionController";
import { Scoreboard, type ScoreboardRow } from "../ui/hud/Scoreboard";
import { LanMultiplayerClient } from "../net/LanMultiplayerClient";
import type { LanLobbyState, LanMatchSnapshot, LanRoomSummary } from "../net/LanProtocol";
import { ASSAULT_RIFLE_01 } from "../data/weapons/weaponTypes";

const RESPAWN_SECONDS = 3;

export class Game {
  private readonly renderWorld: RenderWorld;
  private readonly inputManager: InputManager;
  private readonly settingsStore = new SettingsStore();
  private readonly ui: UIRoot;
  private readonly scoreboard: Scoreboard;
  private readonly loop = new GameLoop();
  private readonly sessions = new SessionController();
  private readonly levelEditor: LevelEditor;
  private simulation: SimulationWorld | null = null;
  private mode: GameModeState = "mainMenu";
  private readonly scores = new Map<string, ScoreboardRow>();
  private readonly pendingRespawns = new Set<string>();
  private scoreUnsubscribers: Array<() => void> = [];
  private readonly lanClient: LanMultiplayerClient;
  private lanSelfId = "";
  private lanLobby: LanLobbyState | null = null;
  private lanSnapshot: LanMatchSnapshot | null = null;
  private lanMatchActive = false;
  private lanWeaponBound = false;
  private lastKillerName = "";
  private importedMenuLevel: { name: string; map: MapDefinition } | null = null;

  constructor(container: HTMLElement) {
    this.renderWorld = new RenderWorld(container);
    this.inputManager = new InputManager(this.renderWorld.domElement);
    this.ui = new UIRoot(container, this.settingsStore);
    this.scoreboard = this.ui.scoreboard ?? new Scoreboard(container);
    this.levelEditor = new LevelEditor(
      container,
      this.renderWorld.sceneManager.scene,
      this.renderWorld.camera,
      this.renderWorld.domElement,
      {
        getVolumeMeshes: () => this.renderWorld.getMapMeshes(),
        onDocumentChange: (document) => {
          this.renderWorld.loadMap(runtimeMapFromEditor(document, { includeDisabled: true, includeHidden: true }));
        },
        onPlay: (document) => {
          void this.startGame(createDefaultSessionDefinition(runtimeMapFromEditor(document)));
        },
        onExit: () => this.showMainMenu(),
      },
    );

    this.wireUI();
    this.lanClient = new LanMultiplayerClient({
      onConnectionChange: (message, connected) => this.ui.mainMenu.setLanConnectionStatus(message, connected),
      onWelcome: (clientId) => {
        this.lanSelfId = clientId;
      },
      onRoomList: (rooms) => this.onLanRoomList(rooms),
      onLobby: (lobby) => this.onLanLobby(lobby),
      onMatchStarted: (_roomId, map) => void this.onLanMatchStarted(map),
      onSnapshot: (snapshot) => this.onLanSnapshot(snapshot),
      onError: (message) => this.ui.mainMenu.setStatus(message),
    });
    this.applySettings(this.settingsStore.get());
    this.settingsStore.onChange((settings) => this.applySettings(settings));
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
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
      onStartGame: () => void this.startGame(this.createMenuSessionDefinition()),
      onCreateLanRoom: (roomName, playerName) => this.createLanRoom(roomName, playerName),
      onJoinLanRoom: (roomId, playerName) => this.joinLanRoom(roomId, playerName),
      onImportLevel: (json, fileName) => this.importMenuLevel(json, fileName),
      onClearImportedLevel: () => {
        this.importedMenuLevel = null;
        this.ui.mainMenu.setStatus("Using built-in blockout level.");
      },
      onOpenEditor: () => this.openEditor(),
      onOpenSettings: () => this.ui.settingsMenu.show(),
    });

    this.ui.setPauseMenuActions({
      onResume: () => this.resumeGame(),
      onRestart: () => void this.restartGame(),
      onOpenSettings: () => this.ui.settingsMenu.show(),
      onMainMenu: () => this.showMainMenu(),
    });

    this.ui.setLocalLobbyActions({
      onSetTeam: (team) => this.lanClient.setTeam(team),
      onStartMatch: () => this.lanClient.startMatch(),
      onLeave: () => this.showMainMenu(),
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
    this.bindDeathmatch(this.simulation);
    this.setMode("playing");
  }

  private async restartGame(): Promise<void> {
    if (this.lanMatchActive) {
      this.ui.deathScreen.setRespawnCountdown(0);
      return;
    }

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
    this.bindDeathmatch(this.simulation);
    this.setMode("playing");
  }

  private resumeGame(): void {
    if (!this.simulation) return;
    this.setMode("playing");
  }

  private showMainMenu(): void {
    this.simulation = null;
    if (this.lanLobby || this.lanMatchActive) this.lanClient.leaveRoom();
    this.lanLobby = null;
    this.lanSnapshot = null;
    this.lanMatchActive = false;
    this.lanWeaponBound = false;
    this.sessions.clear();
    this.levelEditor.hide();
    this.renderWorld.clearSimulationBindings();
    this.clearDeathmatchBindings();
    this.setMode("mainMenu");
  }

  private openEditor(): void {
    this.simulation = null;
    if (this.lanLobby || this.lanMatchActive) this.lanClient.leaveRoom();
    this.lanLobby = null;
    this.lanSnapshot = null;
    this.lanMatchActive = false;
    this.lanWeaponBound = false;
    this.sessions.clear();
    this.renderWorld.clearSimulationBindings();
    this.clearDeathmatchBindings();
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
      this.levelEditor.update(frameDelta);
      this.renderWorld.render();
      return;
    }

    if (this.lanMatchActive && this.lanSnapshot && (this.mode === "playing" || this.mode === "dead")) {
      this.tickLanMatch(frameDelta);
      this.renderWorld.render();
      return;
    }

    const simulation = this.simulation;
    if (simulation && this.mode === "playing") {
      const command = simulation.player.health > 0 ? this.inputManager.consumeCommand() : emptyPlayerCommand();
      const commandsByEntityId = new Map<string, PlayerCommand>([[simulation.player.id, command]]);
      stepFixed((fixedDt) => simulation.update(fixedDt, commandsByEntityId));

      this.renderWorld.update(frameDelta, simulation, command.yawDelta, command.pitchDelta);
      this.updateHUD(simulation);

      if (simulation.player.health <= 0) {
        this.scheduleRespawn(simulation.player.id);
        this.ui.deathScreen.setRespawnCountdown(RESPAWN_SECONDS);
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

  private tickLanMatch(frameDelta: number): void {
    const snapshot = this.lanSnapshot;
    if (!snapshot) return;
    const localPlayer = snapshot.players.find((player) => player.id === this.lanSelfId);
    if (!localPlayer) return;

    const command = this.mode === "playing" && !localPlayer.dead
      ? this.inputManager.consumeCommand()
      : emptyPlayerCommand();
    this.lanClient.sendInput(command);
    this.renderWorld.updateNetwork(frameDelta, localPlayer, snapshot, command.yawDelta, command.pitchDelta);
    this.updateNetworkHUD(localPlayer);
    this.updateNetworkScoreboard(snapshot);

    if (localPlayer.dead) {
      this.ui.deathScreen.setRespawnCountdown(localPlayer.respawnRemaining, this.lastKillerName);
      if (this.mode !== "dead") this.setMode("dead");
    } else if (this.mode === "dead") {
      this.lastKillerName = "";
      this.setMode("playing");
    }
  }

  private updateNetworkHUD(player: LanMatchSnapshot["players"][number]): void {
    this.ui.hud.setAmmoStatus(
      player.weapon.fireModeKind,
      player.weapon.ammoInMag,
      player.weapon.ammoReserve,
      player.weapon.reloadTimer > 0,
    );
    this.ui.hud.setHealth(player.health, player.maxHealth);
    this.ui.hud.setCrosshairSpread(0);
  }

  private updateNetworkScoreboard(snapshot: LanMatchSnapshot): void {
    this.scoreboard.setRows([...snapshot.players, ...snapshot.bots].map((character) => ({
      id: character.id,
      name: character.name,
      team: character.team,
      kills: character.kills,
      deaths: character.deaths,
      ping: 0,
    })));
  }

  private bindDeathmatch(simulation: SimulationWorld): void {
    this.clearDeathmatchBindings();
    this.scores.clear();
    this.pendingRespawns.clear();

    this.scores.set(simulation.player.id, {
      id: simulation.player.id,
      name: "You",
      team: "A",
      kills: 0,
      deaths: 0,
      ping: 0,
    });
    for (const [index, bot] of simulation.aiCharacters.entries()) {
      this.scores.set(bot.id, {
        id: bot.id,
        name: `Bot ${index + 1}`,
        team: "B",
        kills: 0,
        deaths: 0,
        ping: 0,
      });
    }

    this.scoreUnsubscribers = [
      simulation.events.on("characterKilled", ({ killerId, victimId }) => {
        const killer = this.scores.get(killerId);
        const victim = this.scores.get(victimId);
        if (killer && killerId !== victimId) killer.kills += 1;
        if (victim) victim.deaths += 1;
        this.scheduleRespawn(victimId);
        this.updateScoreboard();
      }),
    ];
    this.updateScoreboard();
  }

  private createLanRoom(roomName: string, playerName: string): void {
    this.simulation = null;
    this.sessions.clear();
    this.clearDeathmatchBindings();
    this.lanClient.createRoom(roomName.trim() || "WebFPS Room", playerName);
    this.ui.mainMenu.setStatus("Creating LAN room...");
  }

  private joinLanRoom(roomId: string, playerName: string): void {
    const id = roomId.trim();
    if (!id) {
      this.ui.mainMenu.setStatus("Choose a room or enter a room id.");
      return;
    }
    this.simulation = null;
    this.sessions.clear();
    this.clearDeathmatchBindings();
    this.lanClient.joinRoom(id, playerName);
    this.ui.mainMenu.setStatus("Joining LAN room...");
  }

  private importMenuLevel(json: string, fileName: string): void {
    try {
      const parsed = JSON.parse(json) as unknown;
      const map = isEditableMapDocument(parsed)
        ? runtimeMapFromEditor(parsed)
        : coerceMapDefinition(parsed);
      this.importedMenuLevel = {
        name: isEditableMapDocument(parsed) ? parsed.name || fileName : fileName.replace(/\.json$/i, ""),
        map,
      };
      this.ui.mainMenu.setImportedLevelLabel(fileName);
      this.ui.mainMenu.setStatus(`Loaded level "${this.importedMenuLevel.name}" for Start/Host/Join.`);
    } catch (error) {
      this.importedMenuLevel = null;
      this.ui.mainMenu.setImportedLevelLabel(null);
      this.ui.mainMenu.setStatus(error instanceof Error ? `Level import failed: ${error.message}` : "Level import failed.");
    }
  }

  private createMenuSessionDefinition(): GameSessionDefinition {
    return createDefaultSessionDefinition(this.importedMenuLevel?.map);
  }

  private onLanRoomList(rooms: LanRoomSummary[]): void {
    this.ui.mainMenu.setLanRooms(rooms);
  }

  private onLanLobby(lobby: LanLobbyState): void {
    this.lanLobby = lobby;
    this.ui.localLobbyMenu.setLobby(lobby, this.lanSelfId);
    if (!this.lanMatchActive) this.setMode("localLobby");
  }

  private async onLanMatchStarted(map: MapDefinition): Promise<void> {
    this.lanMatchActive = true;
    this.lanSnapshot = null;
    this.lanWeaponBound = false;
    this.simulation = null;
    this.sessions.clear();
    this.clearDeathmatchBindings();
    this.levelEditor.hide();
    this.setMode("loading");
    this.renderWorld.loadMap(map);
    await this.renderWorld.bindNetworkWeapon(ASSAULT_RIFLE_01.id);
    this.lanWeaponBound = true;
    this.setMode("playing");
  }

  private onLanSnapshot(snapshot: LanMatchSnapshot): void {
    this.lanSnapshot = snapshot;
    const localKill = snapshot.kills.find((kill) => kill.victimId === this.lanSelfId);
    if (localKill) this.lastKillerName = localKill.killerName;
    if (!this.lanWeaponBound) {
      const localPlayer = snapshot.players.find((player) => player.id === this.lanSelfId);
      if (localPlayer) {
        void this.renderWorld.bindNetworkWeapon(localPlayer.weapon.configId).then(() => {
          this.lanWeaponBound = true;
        });
      }
    }
  }

  private clearDeathmatchBindings(): void {
    for (const unsubscribe of this.scoreUnsubscribers) unsubscribe();
    this.scoreUnsubscribers = [];
    this.pendingRespawns.clear();
    this.scoreboard.setVisible(false);
  }

  private scheduleRespawn(entityId: string): void {
    const simulation = this.simulation;
    if (!simulation || this.pendingRespawns.has(entityId)) return;
    this.pendingRespawns.add(entityId);
    window.setTimeout(() => {
      if (this.simulation !== simulation) return;
      simulation.respawnCharacter(entityId);
      this.pendingRespawns.delete(entityId);
      if (entityId === simulation.player.id && this.mode === "dead") this.setMode("playing");
    }, RESPAWN_SECONDS * 1000);
  }

  private updateScoreboard(): void {
    const localRows = [...this.scores.values()];
    this.scoreboard.setRows(localRows);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Tab" && this.mode === "playing") {
      event.preventDefault();
      this.scoreboard.setVisible(true);
      return;
    }
    if (event.code !== "Escape" || this.ui.settingsVisible) return;
    if (this.mode === "playing") {
      event.preventDefault();
      this.setMode("paused");
    } else if (this.mode === "paused") {
      event.preventDefault();
      this.resumeGame();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === "Tab") {
      event.preventDefault();
      this.scoreboard.setVisible(false);
    }
  };
}

function isEditableMapDocument(value: unknown): value is EditableMapDocument {
  return isRecord(value)
    && value.version === 1
    && Array.isArray(value.volumes)
    && isRecord(value.spawnPoints)
    && Array.isArray(value.navMeshRegions);
}

function coerceMapDefinition(value: unknown): MapDefinition {
  if (
    isRecord(value)
    && Array.isArray(value.volumes)
    && Array.isArray(value.navMeshRegions)
    && isRecord(value.spawnPoints)
    && isRecord(value.spawnPoints.player)
    && Array.isArray(value.spawnPoints.ai)
  ) {
    return value as unknown as MapDefinition;
  }
  throw new Error("JSON is not a WebFPS editor level or runtime map.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
