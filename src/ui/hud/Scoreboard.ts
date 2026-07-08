export interface ScoreboardRow {
  id: string;
  name: string;
  team: string;
  kills: number;
  deaths: number;
  ping?: number;
}

export class Scoreboard {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "scoreboard-overlay";
    this.root.style.display = "none";

    const panel = document.createElement("div");
    panel.className = "scoreboard-panel";
    this.root.appendChild(panel);

    const title = document.createElement("div");
    title.className = "scoreboard-title";
    title.textContent = "Deathmatch";
    panel.appendChild(title);

    const header = document.createElement("div");
    header.className = "scoreboard-row scoreboard-header";
    header.innerHTML = "<span>Player</span><span>Team</span><span>K</span><span>D</span><span>Ping</span>";
    panel.appendChild(header);

    this.body = document.createElement("div");
    this.body.className = "scoreboard-body";
    panel.appendChild(this.body);

    container.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "flex" : "none";
  }

  setRows(rows: readonly ScoreboardRow[]): void {
    this.body.replaceChildren();
    const sorted = [...rows].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
    for (const row of sorted) {
      const element = document.createElement("div");
      element.className = "scoreboard-row";
      element.innerHTML = `<span>${escapeHtml(row.name)}</span><span>${escapeHtml(row.team)}</span><span>${row.kills}</span><span>${row.deaths}</span><span>${row.ping ?? "-"} </span>`;
      this.body.appendChild(element);
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}
