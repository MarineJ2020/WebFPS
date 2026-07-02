export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export abstract class Entity {
  readonly id: string;
  position: Vec3;

  constructor(id: string, position: Vec3) {
    this.id = id;
    this.position = position;
  }
}
