import { KeyBindings } from "./KeyBindings";
import { DEFAULT_MOUSE_SENSITIVITY } from "../config/constants";
import { emptyPlayerCommand, type PlayerCommand } from "../core/simulation/commands/PlayerCommand";

const FIRE_BUTTON = 0;

export class InputManager {
  private readonly lockTarget: HTMLElement;
  private readonly heldCodes = new Set<string>();
  private pendingYawDelta = 0;
  private pendingPitchDelta = 0;
  private pendingJump = false;
  private pendingReload = false;
  private pendingSwitchFireMode = false;
  private fireHeld = false;
  sensitivity = DEFAULT_MOUSE_SENSITIVITY;

  constructor(lockTarget: HTMLElement) {
    this.lockTarget = lockTarget;
    this.lockTarget.addEventListener("click", this.onClickRequestLock);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
  }

  get isPointerLocked(): boolean {
    return document.pointerLockElement === this.lockTarget;
  }

  consumeCommand(): PlayerCommand {
    const command = emptyPlayerCommand();

    if (this.heldCodes.has(KeyBindings.get("moveForward"))) command.moveZ += 1;
    if (this.heldCodes.has(KeyBindings.get("moveBack"))) command.moveZ -= 1;
    if (this.heldCodes.has(KeyBindings.get("moveRight"))) command.moveX += 1;
    if (this.heldCodes.has(KeyBindings.get("moveLeft"))) command.moveX -= 1;

    command.yawDelta = this.pendingYawDelta;
    command.pitchDelta = this.pendingPitchDelta;
    command.jumpRequested = this.pendingJump;

    const locked = this.isPointerLocked;
    command.fireHeld = locked && this.fireHeld;
    command.reloadRequested = locked && this.pendingReload;
    command.switchFireModeRequested = locked && this.pendingSwitchFireMode;

    this.pendingYawDelta = 0;
    this.pendingPitchDelta = 0;
    this.pendingJump = false;
    this.pendingReload = false;
    this.pendingSwitchFireMode = false;

    return command;
  }

  dispose(): void {
    this.lockTarget.removeEventListener("click", this.onClickRequestLock);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("mousemove", this.onMouseMove);
  }

  private onClickRequestLock = (): void => {
    this.lockTarget.requestPointerLock();
  };

  private onPointerLockChange = (): void => {
    if (this.isPointerLocked) {
      document.addEventListener("mousemove", this.onMouseMove);
    } else {
      document.removeEventListener("mousemove", this.onMouseMove);
      this.fireHeld = false;
    }
  };

  private onMouseMove = (event: MouseEvent): void => {
    this.pendingYawDelta -= event.movementX * this.sensitivity;
    this.pendingPitchDelta -= event.movementY * this.sensitivity;
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (event.button === FIRE_BUTTON) this.fireHeld = true;
  };

  private onMouseUp = (event: MouseEvent): void => {
    if (event.button === FIRE_BUTTON) this.fireHeld = false;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    this.heldCodes.add(event.code);
    if (event.code === KeyBindings.get("jump")) {
      this.pendingJump = true;
    } else if (event.code === KeyBindings.get("reload")) {
      this.pendingReload = true;
    } else if (event.code === KeyBindings.get("switchFireMode")) {
      this.pendingSwitchFireMode = true;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.heldCodes.delete(event.code);
  };
}
