import { InputManager } from "../input/InputManager";
import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import { emptyPlayerCommand } from "../core/simulation/commands/PlayerCommand";
import type { SimulationWorld } from "../core/simulation/SimulationWorld";
import { getWeaponConfig } from "../data/weapons/weaponTypes";
import { createImportedLevel, getSelectableLevels, type SelectableLevel } from "../data/levels/LevelRegistry";
import { createDefaultSessionDefinition, type GameSessionDefinition } from "../data/session/GameSessionDefinition";
import { AuthService } from "../firebase/AuthService";
import { getFirebaseConfig } from "../firebase/FirebaseApp";
import { ProfileService } from "../firebase/ProfileService";
import { resizeAvatarToWebp } from "../profile/AvatarService";
import {
  calculateKda,
  createGuestSession,
  defaultStats,
  type AuthSession,
  type PlayerProfile,
  type PlayerSession,
} from "../profile/ProfileTypes";
import { SettingsStore } from "../ui/SettingsStore";
import { UIRoot } from "../ui/UIRoot";
import { RenderWorld } from "../render/RenderWorld";
import { LevelEditor, runtimeMapFromEditor } from "../editor/LevelEditor";
import { GameLoop } from "./GameLoop";
import type { GameModeState } from "./GameModeState";
import { SessionController } from "./SessionController";
import { Scoreboard, type ScoreboardRow } from "../ui/hud/Scoreboard";
import { OnlineMultiplayerClient } from "../net/OnlineMultiplayerClient";
import { NetworkSnapshotBuffer } from "../net/NetworkSnapshotBuffer";
import type { LanCharacterSnapshot, LanMatchSnapshot } from "../net/LanProtocol";
import type { OnlineServerMessage } from "../net/OnlineProtocolTypes";

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
  private readonly authService = new AuthService();
  private readonly profileService = new ProfileService();
  private readonly onlineClient: OnlineMultiplayerClient;
  private simulation: SimulationWorld | null = null;
  private mode: GameModeState = "mainMenu";
  private readonly scores = new Map<string, ScoreboardRow>();
  private readonly pendingRespawns = new Set<string>();
  private scoreUnsubscribers: Array<() => void> = [];
  private playerSession: PlayerSession = createGuestSession();
  private playerProfile: PlayerProfile | null = null;
  private readonly menuLevels: SelectableLevel[] = getSelectableLevels();
  private selectedLevelId = this.menuLevels[0]?.id ?? "";
  private onlineLatestSnapshot: LanMatchSnapshot | null = null;
  private readonly onlineSnapshotBuffer = new NetworkSnapshotBuffer();
  private onlineWeaponConfigId = "";
  private onlineLocalDead = false;

  constructor(container: HTMLElement) {
    this.renderWorld = new RenderWorld(container);
    this.inputManager = new InputManager(this.renderWorld.domElement);
    this.ui = new UIRoot(container, this.settingsStore);
    this.scoreboard = this.ui.scoreboard ?? new Scoreboard(container);
    this.onlineClient = new OnlineMultiplayerClient({
      onStatus: (message, connected) => this.ui.mainMenu.setOnlineStatus(message, connected),
      onMessage: (message) => {
        this.handleOnlineMessage(message);
      },
    });
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
    this.syncLevelSelector();
    this.authService.onChange((session) => void this.handleFirebaseSession(session));
    this.authService.start();
    this.applyProfileView();
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
      onSelectLevel: (levelId) => this.selectMenuLevel(levelId),
      onImportLevel: (json, fileName) => this.importMenuLevel(json, fileName),
      onSignInGoogle: () => void this.signInGoogle(),
      onContinueGuest: () => this.continueAsGuest(),
      onSignOut: () => void this.signOut(),
      onUploadAvatar: (file) => void this.uploadAvatar(file),
      onJoinOnline: () => void this.joinOnline(),
      onOpenEditor: () => this.openEditor(),
      onOpenSettings: () => this.ui.settingsMenu.show(),
    });

    this.ui.setOnlineLobbyActions({
      onCreateRoom: (roomName) => this.onlineClient.createRoom(roomName, this.playerDisplayName(), this.selectedMenuLevel().map),
      onJoinRoom: (roomId) => this.onlineClient.joinRoom(roomId, this.playerDisplayName()),
      onRefreshRooms: () => this.joinOnline(),
      onSetTeam: (team) => this.onlineClient.setTeam(team),
      onStartMatch: () => this.onlineClient.startMatch(),
      onLeave: () => {
        this.onlineClient.leaveRoom();
        this.ui.onlineLobbyMenu.showBrowser();
      },
      onBack: () => {
        this.onlineClient.disconnect();
        this.showMainMenu();
      },
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

    this.ui.matchFlowOverlay.onVoteRematch = () => this.onlineClient.voteRematch();
    this.ui.matchFlowOverlay.onReturnToLobby = () => this.onlineClient.returnToLobby();
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
    this.sessions.clear();
    this.onlineClient.disconnect();
    this.levelEditor.hide();
    this.renderWorld.clearSimulationBindings();
    this.clearDeathmatchBindings();
    this.clearOnlineMatch();
    this.setMode("mainMenu");
  }

  private openEditor(): void {
    this.simulation = null;
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

    const simulation = this.simulation;
    if (this.onlineLatestSnapshot && (this.mode === "playing" || this.mode === "dead")) {
      const command = this.mode === "playing" ? this.inputManager.consumeCommand() : emptyPlayerCommand();
      if (this.mode === "playing") this.onlineClient.sendInput(command);

      const localPlayer = this.onlineLatestSnapshot.players.find((player) => player.id === this.onlineClient.selfId);
      const renderSnapshot = this.onlineSnapshotBuffer.sample() ?? this.onlineLatestSnapshot;
      const renderLocalPlayer = renderSnapshot.players.find((player) => player.id === this.onlineClient.selfId) ?? localPlayer;
      if (localPlayer && renderLocalPlayer) {
        this.renderWorld.updateNetwork(frameDelta, renderLocalPlayer, renderSnapshot, command.yawDelta, command.pitchDelta);
        this.updateOnlineHUD(localPlayer);
        this.updateOnlineScoreboard(this.onlineLatestSnapshot);
        this.updateOnlineDeathState(localPlayer);
      }
      this.renderWorld.render();
      return;
    }

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

  private async handleFirebaseSession(session: AuthSession | null): Promise<void> {
    if (!session) {
      if (this.playerSession.kind !== "guest") this.continueAsGuest();
      this.applyProfileView();
      return;
    }

    this.playerSession = session;
    try {
      this.playerProfile = await this.profileService.loadOrCreateProfile(session);
      this.applyProfileView();
      this.ui.mainMenu.setStatus(`Signed in as ${this.playerProfile.customization.displayName}.`);
    } catch (error) {
      this.playerProfile = null;
      this.applyProfileView();
      this.ui.mainMenu.setStatus(error instanceof Error ? `Profile load failed: ${error.message}` : "Profile load failed.");
    }
  }

  private async signInGoogle(): Promise<void> {
    try {
      await this.authService.signInWithGoogle();
    } catch (error) {
      this.ui.mainMenu.setStatus(error instanceof Error ? error.message : "Google sign-in failed.");
    }
  }

  private continueAsGuest(): void {
    this.playerSession = this.authService.createGuest("Guest");
    this.playerProfile = null;
    this.applyProfileView();
    this.ui.mainMenu.setStatus("Using an ephemeral guest profile.");
  }

  private async signOut(): Promise<void> {
    try {
      await this.authService.signOut();
      this.continueAsGuest();
    } catch (error) {
      this.ui.mainMenu.setStatus(error instanceof Error ? error.message : "Sign out failed.");
    }
  }

  private async uploadAvatar(file: File): Promise<void> {
    try {
      const avatarDataUrl = await resizeAvatarToWebp(file);
      if (this.playerSession.kind === "guest") {
        this.playerSession = { ...this.playerSession, avatarDataUrl };
        this.applyProfileView();
        this.ui.mainMenu.setStatus("Guest avatar updated for this session.");
        return;
      }
      const profile = this.playerProfile ?? await this.profileService.loadOrCreateProfile(this.playerSession);
      this.playerProfile = {
        ...profile,
        customization: {
          ...profile.customization,
          avatarDataUrl,
          avatarUrl: null,
        },
      };
      await this.profileService.saveCustomization(this.playerSession.uid, this.playerProfile.customization);
      this.applyProfileView();
      this.ui.mainMenu.setStatus("Avatar resized to 512x512 WebP and saved to profile.");
    } catch (error) {
      this.ui.mainMenu.setStatus(error instanceof Error ? `Avatar update failed: ${error.message}` : "Avatar update failed.");
    }
  }

  private async joinOnline(): Promise<void> {
    await this.onlineClient.connect(this.playerSession);
    this.ui.onlineLobbyMenu.setStatus("Connecting to online server...");
    this.ui.onlineLobbyMenu.showBrowser();
    this.setMode("onlineLobby");
  }

  private async handleOnlineMessage(message: OnlineServerMessage): Promise<void> {
    switch (message.type) {
      case "profileSummary":
        this.ui.onlineLobbyMenu.setStatus(`Connected as ${message.profile.displayName}.`);
        break;
      case "onlineRoomList":
        this.ui.onlineLobbyMenu.setRooms(message.rooms);
        this.ui.onlineLobbyMenu.setStatus(message.rooms.length > 0 ? "Choose a room or create a new one." : "No open rooms yet. Create one to host.");
        break;
      case "onlineLobby":
        this.ui.onlineLobbyMenu.setLobby(message.lobby, this.onlineClient.selfId);
        this.setMode("onlineLobby");
        break;
      case "onlineMatchStarted":
        this.levelEditor.hide();
        this.clearDeathmatchBindings();
        this.clearOnlineMatch();
        this.renderWorld.loadMap(message.map);
        this.onlineWeaponConfigId = "";
        this.setMode("playing");
        break;
      case "onlineSnapshot":
        await this.applyOnlineSnapshot(message.snapshot);
        break;
      case "error":
        this.ui.mainMenu.setStatus(message.message);
        this.ui.onlineLobbyMenu.setStatus(message.message);
        break;
    }
  }

  private async applyOnlineSnapshot(snapshot: LanMatchSnapshot): Promise<void> {
    this.onlineLatestSnapshot = snapshot;
    this.onlineSnapshotBuffer.push(snapshot);
    const localPlayer = snapshot.players.find((player) => player.id === this.onlineClient.selfId);
    if (!localPlayer) return;
    if (this.onlineWeaponConfigId !== localPlayer.weapon.configId) {
      this.onlineWeaponConfigId = localPlayer.weapon.configId;
      await this.renderWorld.bindNetworkWeapon(localPlayer.weapon.configId);
    }
  }

  private updateOnlineHUD(player: LanCharacterSnapshot): void {
    this.ui.hud.setAmmoStatus(player.weapon.fireModeKind, player.weapon.ammoInMag, player.weapon.ammoReserve, player.weapon.reloadTimer > 0);
    this.ui.hud.setHealth(player.health, player.maxHealth);
    this.ui.hud.setCrosshairSpread(0);
  }

  private updateOnlineScoreboard(snapshot: LanMatchSnapshot): void {
    this.scoreboard.setRows([...snapshot.players, ...snapshot.bots].map((character) => ({
      id: character.id,
      name: character.id === this.onlineClient.selfId ? `${character.name} (You)` : character.name,
      team: character.team,
      kills: character.kills,
      deaths: character.deaths,
      ping: 0,
    })));
    this.ui.matchFlowOverlay.update(snapshot);
  }

  private updateOnlineDeathState(player: LanCharacterSnapshot): void {
    if (player.dead) {
      const kill = this.onlineLatestSnapshot?.kills.find((event) => event.victimId === player.id);
      this.ui.deathScreen.setRespawnCountdown(player.respawnRemaining, kill?.killerName);
      if (!this.onlineLocalDead) {
        this.onlineLocalDead = true;
        this.setMode("dead");
      }
      return;
    }

    if (this.onlineLocalDead && this.mode === "dead") this.setMode("playing");
    this.onlineLocalDead = false;
  }

  private applyProfileView(): void {
    const firebaseConfigured = Boolean(getFirebaseConfig());
    if (this.playerSession.kind === "guest") {
      const stats = defaultStats();
      this.ui.mainMenu.setProfile({
        displayName: this.playerSession.displayName,
        avatarUrl: null,
        avatarDataUrl: this.playerSession.avatarDataUrl,
        accentColor: this.playerSession.accentColor,
        isGuest: true,
        firebaseConfigured,
        ...stats,
        kda: calculateKda(stats),
      });
      return;
    }

    const profile = this.playerProfile;
    const stats = profile?.stats ?? defaultStats();
    this.ui.mainMenu.setProfile({
      displayName: profile?.customization.displayName ?? this.playerSession.displayName,
      avatarUrl: profile?.customization.avatarUrl ?? this.playerSession.photoUrl,
      avatarDataUrl: profile?.customization.avatarDataUrl ?? null,
      accentColor: profile?.customization.accentColor ?? "#6bb8ff",
      isGuest: false,
      firebaseConfigured,
      ...stats,
      kda: calculateKda(stats),
    });
  }

  private importMenuLevel(json: string, fileName: string): void {
    try {
      const level = createImportedLevel(json, fileName);
      const uniqueLevel = this.withUniqueLevelId(level);
      this.menuLevels.push(uniqueLevel);
      this.selectedLevelId = uniqueLevel.id;
      this.syncLevelSelector();
      this.ui.mainMenu.setStatus(`Loaded level "${uniqueLevel.name}" for Start/Host/Join.`);
    } catch (error) {
      this.ui.mainMenu.setStatus(error instanceof Error ? `Level import failed: ${error.message}` : "Level import failed.");
    }
  }

  private createMenuSessionDefinition(): GameSessionDefinition {
    return createDefaultSessionDefinition(this.selectedMenuLevel().map);
  }

  private selectMenuLevel(levelId: string): void {
    const level = this.menuLevels.find((candidate) => candidate.id === levelId);
    if (!level) return;
    this.selectedLevelId = level.id;
    this.ui.mainMenu.setStatus(`Selected level "${level.name}".`);
  }

  private selectedMenuLevel(): SelectableLevel {
    return this.menuLevels.find((level) => level.id === this.selectedLevelId) ?? this.menuLevels[0];
  }

  private syncLevelSelector(): void {
    this.ui.mainMenu.setLevels(this.menuLevels.map((level) => ({
      id: level.id,
      name: level.name,
      source: level.source,
    })), this.selectedLevelId);
  }

  private withUniqueLevelId(level: SelectableLevel): SelectableLevel {
    if (!this.menuLevels.some((candidate) => candidate.id === level.id)) return level;
    let suffix = 2;
    let id = `${level.id}-${suffix}`;
    while (this.menuLevels.some((candidate) => candidate.id === id)) id = `${level.id}-${++suffix}`;
    return { ...level, id };
  }

  private clearDeathmatchBindings(): void {
    for (const unsubscribe of this.scoreUnsubscribers) unsubscribe();
    this.scoreUnsubscribers = [];
    this.pendingRespawns.clear();
    this.scoreboard.setVisible(false);
  }

  private clearOnlineMatch(): void {
    this.onlineLatestSnapshot = null;
    this.onlineSnapshotBuffer.clear();
    this.onlineWeaponConfigId = "";
    this.onlineLocalDead = false;
  }

  private playerDisplayName(): string {
    if (this.playerSession.kind === "guest") return this.playerSession.displayName;
    return this.playerProfile?.customization.displayName ?? this.playerSession.displayName;
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
