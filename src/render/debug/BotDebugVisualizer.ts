import * as THREE from "three";
import type { AICharacter } from "../../core/entities/AICharacter";
import { AI_EYE_HEIGHT, AI_FOV_HALF_ANGLE, AI_VIEW_RANGE } from "../../core/entities/AICharacter";
import type { BotStateName } from "../../core/ai/FSM/BotStateMachine";

const TOGGLE_KEY = "Backquote";
const LABEL_HEIGHT_ABOVE_HEAD = 2.1;

const STATE_COLORS: Record<BotStateName, string> = {
  idle: "#999999",
  patrol: "#4aa3ff",
  search: "#ffcc00",
  attack: "#ff3333",
  flee: "#33ff88",
};

interface BotDebugEntry {
  label: THREE.Sprite;
  labelMaterial: THREE.SpriteMaterial;
  labelCanvas: HTMLCanvasElement;
  labelContext: CanvasRenderingContext2D;
  lastLabelText: string;
  targetLine: THREE.Line;
  fovCone: THREE.LineSegments;
}

/**
 * Minimal always-computed, toggle-visible overlay for eyeballing bot AI: a state-colored label
 * over each bot's head, a line to whatever it's currently pursuing (patrol point / last-known
 * player position / player), and its FOV cone. Press ` (backquote) to toggle.
 */
export class BotDebugVisualizer {
  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();
  private readonly entries = new Map<string, BotDebugEntry>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.visible = false;
    this.scene.add(this.group);
    document.addEventListener("keydown", this.onKeyDown);
  }

  sync(bots: readonly AICharacter[]): void {
    if (!this.group.visible) return;

    for (const bot of bots) {
      let entry = this.entries.get(bot.id);
      if (!entry) {
        entry = this.createEntry();
        this.entries.set(bot.id, entry);
      }
      this.updateEntry(entry, bot);
    }
  }

  dispose(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    this.scene.remove(this.group);
    for (const entry of this.entries.values()) {
      entry.labelMaterial.map?.dispose();
      entry.labelMaterial.dispose();
      entry.targetLine.geometry.dispose();
      (entry.targetLine.material as THREE.Material).dispose();
      entry.fovCone.geometry.dispose();
      (entry.fovCone.material as THREE.Material).dispose();
    }
    this.entries.clear();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === TOGGLE_KEY) this.group.visible = !this.group.visible;
  };

  private createEntry(): BotDebugEntry {
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const labelContext = labelCanvas.getContext("2d")!;
    const labelMaterial = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(labelCanvas),
      depthTest: false,
      transparent: true,
    });
    const label = new THREE.Sprite(labelMaterial);
    label.scale.set(1.6, 0.4, 1);
    this.group.add(label);

    const targetLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: "#ffffff", depthTest: false }),
    );
    this.group.add(targetLine);

    const fovCone = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineBasicMaterial({ color: "#999999", depthTest: false, transparent: true, opacity: 0.6 }),
    );
    this.group.add(fovCone);

    return { label, labelMaterial, labelCanvas, labelContext, lastLabelText: "", targetLine, fovCone };
  }

  private updateEntry(entry: BotDebugEntry, bot: AICharacter): void {
    const state = bot.fsm.currentName;
    const color = STATE_COLORS[state];

    const labelText = bot.isDead ? `${bot.id} dead` : `${bot.id} ${state} ${Math.ceil(bot.health)}hp`;
    if (labelText !== entry.lastLabelText) {
      entry.lastLabelText = labelText;
      drawLabel(entry.labelCanvas, entry.labelContext, labelText, color);
      entry.labelMaterial.map!.needsUpdate = true;
    }
    entry.label.position.set(bot.position.x, bot.position.y + LABEL_HEIGHT_ABOVE_HEAD, bot.position.z);
    entry.label.visible = true;

    const target = pursuitTarget(bot);
    const linePositions = entry.targetLine.geometry.attributes.position as THREE.BufferAttribute;
    if (target) {
      linePositions.setXYZ(0, bot.position.x, bot.position.y + AI_EYE_HEIGHT, bot.position.z);
      linePositions.setXYZ(1, target.x, target.y + 0.2, target.z);
      linePositions.needsUpdate = true;
      (entry.targetLine.material as THREE.LineBasicMaterial).color.set(color);
      entry.targetLine.visible = true;
    } else {
      entry.targetLine.visible = false;
    }

    const eye = new THREE.Vector3(bot.position.x, bot.position.y + AI_EYE_HEIGHT, bot.position.z);
    const leftAngle = bot.yaw + AI_FOV_HALF_ANGLE;
    const rightAngle = bot.yaw - AI_FOV_HALF_ANGLE;
    const conePositions = entry.fovCone.geometry.attributes.position as THREE.BufferAttribute;
    conePositions.setXYZ(0, eye.x, eye.y, eye.z);
    conePositions.setXYZ(1, eye.x + Math.sin(leftAngle) * AI_VIEW_RANGE, eye.y, eye.z + Math.cos(leftAngle) * AI_VIEW_RANGE);
    conePositions.setXYZ(2, eye.x, eye.y, eye.z);
    conePositions.setXYZ(3, eye.x + Math.sin(rightAngle) * AI_VIEW_RANGE, eye.y, eye.z + Math.cos(rightAngle) * AI_VIEW_RANGE);
    conePositions.needsUpdate = true;
    (entry.fovCone.material as THREE.LineBasicMaterial).color.set(state === "attack" ? color : "#999999");
  }
}

function pursuitTarget(bot: AICharacter): { x: number; y: number; z: number } | null {
  switch (bot.fsm.currentName) {
    case "patrol":
      return bot.patrolPoints[bot.patrolIndex] ?? null;
    case "search":
      return bot.lastKnownPlayerPosition;
    default:
      return null;
  }
}

function drawLabel(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, text: string, color: string): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "28px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}
