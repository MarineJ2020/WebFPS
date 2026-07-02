import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  readonly world: RAPIER.World;

  private constructor(world: RAPIER.World) {
    this.world = world;
  }

  static async create(gravityY = -9.81): Promise<PhysicsWorld> {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
    return new PhysicsWorld(world);
  }

  createStaticCuboid(
    halfExtents: { x: number; y: number; z: number },
    position: { x: number; y: number; z: number },
    rotation?: { x: number; y: number; z: number; w: number },
  ): RAPIER.Collider {
    let bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    if (rotation) {
      bodyDesc = bodyDesc.setRotation(rotation);
    }
    const body = this.world.createRigidBody(bodyDesc);
    const desc = RAPIER.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z,
    );
    return this.world.createCollider(desc, body);
  }

  step(): void {
    this.world.step();
  }
}
