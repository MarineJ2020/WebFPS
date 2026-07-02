export class DeathScreen {
  private readonly root: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      display: "none",
      position: "absolute",
      inset: "0",
      background: "rgba(40, 0, 0, 0.75)",
      color: "#fff",
      font: "14px monospace",
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

    const restartButton = document.createElement("button");
    restartButton.textContent = "Restart";
    Object.assign(restartButton.style, {
      font: "16px monospace",
      padding: "8px 20px",
      cursor: "pointer",
    } satisfies Partial<CSSStyleDeclaration>);
    restartButton.addEventListener("click", () => window.location.reload());
    this.root.appendChild(restartButton);

    container.appendChild(this.root);
  }

  show(): void {
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }
}
