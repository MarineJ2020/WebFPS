export class DeathScreen {
  private readonly root: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly menuButton: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      display: "none",
      position: "absolute",
      inset: "0",
      background: "rgba(40, 0, 0, 0.75)",
      color: "#fff",
      font: "14px system-ui, sans-serif",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      zIndex: "20",
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement("h1");
    title.textContent = "YOU DIED";
    Object.assign(title.style, {
      fontSize: "48px",
      color: "#d9453d",
      letterSpacing: "4px",
      marginBottom: "20px",
      textShadow: "0 0 12px #000",
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(title);

    this.message = document.createElement("div");
    this.message.textContent = "Respawning soon...";
    Object.assign(this.message.style, {
      marginBottom: "18px",
      fontSize: "18px",
      color: "rgba(255, 255, 255, 0.86)",
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.message);

    this.restartButton = document.createElement("button");
    this.restartButton.textContent = "Restart";
    Object.assign(this.restartButton.style, {
      font: "16px system-ui, sans-serif",
      padding: "8px 20px",
      cursor: "pointer",
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.restartButton);

    this.menuButton = document.createElement("button");
    this.menuButton.textContent = "Main Menu";
    Object.assign(this.menuButton.style, {
      font: "16px system-ui, sans-serif",
      padding: "8px 20px",
      marginTop: "10px",
      cursor: "pointer",
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.menuButton);

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
