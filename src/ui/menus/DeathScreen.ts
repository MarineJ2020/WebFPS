import { createButton } from "../components/NativeControls";

export class DeathScreen {
  private readonly root: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly menuButton: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "death-overlay";
    this.root.style.display = "none";

    const title = document.createElement("div");
    title.className = "death-title";
    title.textContent = "You Died";
    this.root.appendChild(title);

    this.message = document.createElement("div");
    this.message.className = "death-message";
    this.message.textContent = "Respawning soon...";
    this.root.appendChild(this.message);

    const actions = document.createElement("div");
    actions.className = "death-actions";
    this.restartButton = createButton("Restart", () => {}, "primary");
    this.menuButton = createButton("Main Menu", () => {});
    actions.appendChild(this.restartButton);
    actions.appendChild(this.menuButton);
    this.root.appendChild(actions);

    container.appendChild(this.root);
  }

  setActions(actions: { onRestart: () => void; onMainMenu: () => void }): void {
    this.restartButton.onclick = actions.onRestart;
    this.menuButton.onclick = actions.onMainMenu;
  }

  show(): void {
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  setRespawnCountdown(secondsRemaining: number, killerName?: string): void {
    const seconds = Math.ceil(Math.max(0, secondsRemaining));
    const killerText = killerName ? `Killed by ${killerName}. ` : "";
    this.message.textContent = `${killerText}Respawning in ${seconds}s`;
  }
}
