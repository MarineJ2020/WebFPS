import RAPIER from "@dimforge/rapier3d-compat";
import { PhysicsWorld } from "./PhysicsWorld";

export interface CharacterControllerOptions {
  radius: number;
  halfHeight: number;
  spawn: { x: number; y: number; z: number };
  maxSlopeClimbRadians: number;
  autoStepMaxHeight: number;
  autoStepMinWidth: number;
  snapToGroundDistance: number;
}

/**
 * Wraps a Rapier kinematic capsule + character controller. `spawn`/`position`/`move`
 * all operate in "feet space" (ground contact point) rather than the capsule's
 * center, since that's the natural coordinate for spawn points and camera eye-height.
 */
export class CharacterController {
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly centerOffsetY: number;
  private grounded = false;

  constructor(physics: PhysicsWorld, options: CharacterControllerOptions) {
    this.centerOffsetY = options.halfHeight + options.radius;

    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        options.spawn.x,
        options.spawn.y + this.centerOffsetY,
        options.spawn.z,
      ),
    );
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(options.halfHeight, options.radius),
      this.body,
    );

    this.controller = physics.world.createCharacterController(0.02);
    this.controller.setMaxSlopeClimbAngle(options.maxSlopeClimbRadians);
    this.controller.enableAutostep(
      options.autoStepMaxHeight,
      options.autoStepMinWidth,
      true,
    );
    this.controller.enableSnapToGround(options.snapToGroundDistance);
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get position(): { x: number; y: number; z: number } {
    const center = this.body.translation();
    return { x: center.x, y: center.y - this.centerOffsetY, z: center.z };
  }

  move(desiredTranslation: { x: number; y: number; z: number }): {
    x: number;
    y: number;
    z: number;
  } {
    this.controller.computeColliderMovement(this.collider, desiredTranslation);
    this.grounded = this.controller.computedGrounded();

    const correction = this.controller.computedMovement();
    const current = this.body.translation();
    const next = {
      x: current.x + correction.x,
      y: current.y + correction.y,
      z: current.z + correction.z,
    };
    this.body.setNextKinematicTranslation(next);
    return { x: next.x, y: next.y - this.centerOffsetY, z: next.z };
  }
}
