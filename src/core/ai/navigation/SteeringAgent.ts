import * as YUKA from "yuka";
import type { Vec3 } from "../../entities/Entity";

/**
 * Wraps a yuka.Vehicle purely as a steering-force calculator. Rapier owns authoritative
 * position/collision for bots (same as the player); this never lets yuka integrate position
 * itself - callers sync position in, read a desired XZ direction out.
 */
export class SteeringAgent {
  private readonly vehicle: YUKA.Vehicle;
  private readonly seekBehavior = new YUKA.SeekBehavior();
  private readonly fleeBehavior = new YUKA.FleeBehavior();
  private readonly followPathBehavior = new YUKA.FollowPathBehavior();
  private readonly forceScratch = new YUKA.Vector3();

  constructor(maxSpeed: number) {
    this.vehicle = new YUKA.Vehicle();
    this.vehicle.maxSpeed = maxSpeed;
  }

  syncPosition(position: Vec3): void {
    this.vehicle.position.set(position.x, position.y, position.z);
  }

  seekDirection(target: Vec3): Vec3 {
    this.seekBehavior.target.set(target.x, target.y, target.z);
    this.forceScratch.set(0, 0, 0);
    this.seekBehavior.calculate(this.vehicle, this.forceScratch);
    return toXZDirection(this.forceScratch);
  }

  fleeDirection(threat: Vec3, panicDistance: number): Vec3 {
    this.fleeBehavior.target.set(threat.x, threat.y, threat.z);
    this.fleeBehavior.panicDistance = panicDistance;
    this.forceScratch.set(0, 0, 0);
    this.fleeBehavior.calculate(this.vehicle, this.forceScratch);
    return toXZDirection(this.forceScratch);
  }

  followPathDirection(waypoints: Vec3[], nextWaypointDistance = 1): Vec3 {
    const path = new YUKA.Path();
    for (const point of waypoints) {
      path.add(new YUKA.Vector3(point.x, point.y, point.z));
    }
    this.followPathBehavior.path = path;
    this.followPathBehavior.nextWaypointDistance = nextWaypointDistance;
    this.forceScratch.set(0, 0, 0);
    this.followPathBehavior.calculate(this.vehicle, this.forceScratch);
    return toXZDirection(this.forceScratch);
  }
}

function toXZDirection(force: YUKA.Vector3): Vec3 {
  const lengthXZ = Math.hypot(force.x, force.z);
  if (lengthXZ < 1e-6) return { x: 0, y: 0, z: 0 };
  return { x: force.x / lengthXZ, y: 0, z: force.z / lengthXZ };
}
