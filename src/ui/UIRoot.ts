import type { GameModeState } from "../app/GameModeState";
import type { SettingsStore } from "./SettingsStore";
import { HUD } from "./hud/HUD";
import { DeathScreen } from "./menus/DeathScreen";
import { LoadingOverlay } from "./menus/LoadingOverlay";
import { MainMenu, type MainMenuActions } from "./menus/MainMenu";
import { PauseMenu, type PauseMenuActions } from "./menus/PauseMenu";
import { SettingsMenu } from "./menus/SettingsMenu";

export class UIRoot {
  readonly hud: HUD;
  readonly mainMenu: MainMenu;
  readonly pauseMenu: PauseMenu;
  readonly settingsMenu: SettingsMenu;
  readonly deathScreen: DeathScreen;
  private readonly loadingOverlay: LoadingOverlay;

  constructor(container: HTMLElement, settingsStore: SettingsStore) {
    this.hud = new HUD(container);
    this.mainMenu = new MainMenu(container);
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

  setDeathActions(actions: { onRestart: () => void; onMainMenu: () => void }): void {
    this.deathScreen.setActions(actions);
  }

  showMode(mode: GameModeState): void {
    this.settingsMenu.hide();
    this.hud.setVisible(mode === "playing" || mode === "paused");
    this.mainMenu.hide();
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
