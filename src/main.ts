import "./style.css";
import { Game } from "./app/Game";

const app = document.querySelector<HTMLDivElement>("#app")!;
const game = new Game(app);
await game.init();
game.start();

if (import.meta.env.DEV) {
  (window as unknown as { __game: Game }).__game = game;
}
