import type { LanMatchSnapshot } from "../../net/LanProtocol";
import { createButton } from "../components/NativeControls";

export class MatchFlowOverlay {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly actions: HTMLDivElement;
  private readonly rematchButton: HTMLButtonElement;
  private readonly lobbyButton: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "match-flow-overlay";

    this.text = document.createElement("div");
    this.text.className = "match-flow-text";
    this.root.appendChild(this.text);

    this.actions = document.createElement("div");
    this.actions.className = "match-flow-actions";
    this.rematchButton = createButton("Vote Rematch", () => this.onVoteRematch?.(), "primary");
    this.lobbyButton = createButton("Return to Lobby", () => this.onReturnToLobby?.());
    this.actions.appendChild(this.rematchButton);
    this.actions.appendChild(this.lobbyButton);
    this.root.appendChild(this.actions);

    container.appendChild(this.root);
    this.setVisible(false);
  }

  onVoteRematch: (() => void) | null = null;
  onReturnToLobby: (() => void) | null = null;

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "grid" : "none";
  }

  update(snapshot: LanMatchSnapshot): void {
    const remaining = Math.ceil(Math.max(0, snapshot.phaseRemaining));
    this.actions.style.display = snapshot.phase === "roundEnd" || snapshot.phase === "rematch" ? "flex" : "none";
    this.setVisible(snapshot.phase !== "live");

    if (snapshot.phase === "warmup") {
      this.text.textContent = `Warmup ${remaining}s`;
    } else if (snapshot.phase === "countdown") {
      this.text.textContent = `Match starts in ${remaining}s`;
    } else if (snapshot.phase === "roundEnd") {
      this.text.textContent = `${snapshot.winner ?? "Round over"} wins. Scoreboard ${remaining}s`;
    } else if (snapshot.phase === "rematch") {
      this.text.textContent = `Rematch? ${snapshot.rematchVotes}/${snapshot.rematchNeeded} votes · ${remaining}s`;
    } else {
      this.text.textContent = "";
    }
  }
}
