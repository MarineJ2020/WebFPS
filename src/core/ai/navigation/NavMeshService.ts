import * as YUKA from "yuka";
import type { Vec3 } from "../../entities/Entity";

export class NavMeshService {
  private readonly navMesh: YUKA.NavMesh;

  constructor(regions: Vec3[][]) {
    this.navMesh = new YUKA.NavMesh();
    const polygons = regions.map((points) => {
      const polygon = new YUKA.Polygon();
      polygon.fromContour(points.map((p) => new YUKA.Vector3(p.x, p.y, p.z)));
      return polygon;
    });
    this.navMesh.fromPolygons(polygons);
  }

  /** Shortest path between two points, inclusive of the destination. Empty if unreachable. */
  findPath(from: Vec3, to: Vec3): Vec3[] {
    const path = this.navMesh.findPath(
      new YUKA.Vector3(from.x, from.y, from.z),
      new YUKA.Vector3(to.x, to.y, to.z),
    );
    return path.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  }
}
