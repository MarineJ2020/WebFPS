import type { GameModeState } from "../app/GameModeState";
import type { SettingsStore } from "./SettingsStore";
import { HUD } from "./hud/HUD";
import { MatchFlowOverlay } from "./hud/MatchFlowOverlay";
import { Scoreboard } from "./hud/Scoreboard";
import { DeathScreen } from "./menus/DeathScreen";
import { LoadingOverlay } from "./menus/LoadingOverlay";
import { LocalLobbyMenu, type LocalLobbyActions } from "./menus/LocalLobbyMenu";
import { MainMenu, type MainMenuActions } from "./menus/MainMenu";
import { OnlineLobbyMenu, type OnlineLobbyActions } from "./menus/OnlineLobbyMenu";
import { PauseMenu, type PauseMenuActions } from "./menus/PauseMenu";
import { SettingsMenu } from "./menus/SettingsMenu";

export class UIRoot {
  readonly hud: HUD;
  readonly matchFlowOverlay: MatchFlowOverlay;
  readonly scoreboard: Scoreboard;
  readonly mainMenu: MainMenu;
  readonly localLobbyMenu: LocalLobbyMenu;
  readonly onlineLobbyMenu: OnlineLobbyMenu;
  readonly pauseMenu: PauseMenu;
  readonly settingsMenu: SettingsMenu;
  readonly deathScreen: DeathScreen;
  private readonly loadingOverlay: LoadingOverlay;

  constructor(container: HTMLElement, settingsStore: SettingsStore) {
    this.hud = new HUD(container);
    this.matchFlowOverlay = new MatchFlowOverlay(container);
    this.scoreboard = new Scoreboard(container);
    this.mainMenu = new MainMenu(container);
    this.localLobbyMenu = new LocalLobbyMenu(container);
    this.onlineLobbyMenu = new OnlineLobbyMenu(container);
    this.pauseMenu = new PauseMenu(container);
    this.settingsMenu = new SettingsMenu(container, settingsStore);
    this.deathScreen = new DeathScreen(container);
    this.loadingOverlay = new LoadingOverlay(container);
  }

  get settingsVisible(): boolean {
    return this.settingsMenu.isVisible;
  }

  setMainMenuActions(actions: MainMenuActions): void {
    this.mainMenu.setActions(actions);
  }

  setPauseMenuActions(actions: PauseMenuActions): void {
    this.pauseMenu.setActions(actions);
  }

  setLocalLobbyActions(actions: LocalLobbyActions): void {
    this.localLobbyMenu.setActions(actions);
  }

  setOnlineLobbyActions(actions: OnlineLobbyActions): void {
    this.onlineLobbyMenu.setActions(actions);
  }

  setDeathActions(actions: { onRestart: () => void; onMainMenu: () => void }): void {
    this.deathScreen.setActions(actions);
  }

  showMode(mode: GameModeState): void {
    this.settingsMenu.hide();
    this.hud.setVisible(mode === "playing" || mode === "paused");
    if (mode !== "playing" && mode !== "dead") this.matchFlowOverlay.setVisible(false);
    this.mainMenu.hide();
    this.localLobbyMenu.hide();
    this.onlineLobbyMenu.hide();
    this.pauseMenu.hide();
    this.deathScreen.hide();
    this.loadingOverlay.hide();

    switch (mode) {
      case "mainMenu":
        this.mainMenu.show();
        break;
      case "loading":
        this.loadingOverlay.show("Loading match...");
        break;
      case "localLobby":
        this.localLobbyMenu.show();
        break;
      case "onlineLobby":
        this.onlineLobbyMenu.show();
        break;
      case "paused":
        this.pauseMenu.show();
        break;
      case "dead":
        this.deathScreen.show();
        break;
      case "editing":
      case "playing":
        break;
    }
  }
}
