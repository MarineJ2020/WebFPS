import * as THREE from "three";
import { BLOCKOUT_MAP_01 } from "../data/maps/blockoutMap01";
import type { VolumeKind } from "../data/maps/MapDefinition";
import type { Vec3 } from "../core/entities/Entity";
import { createButton, createNumberInput, createPanel, createSelect } from "../ui/components/NativeControls";
import {
  cloneEditableMapDocument,
  createId,
  editableFromMap,
  mapFromEditable,
  type EditableAISpawn,
  type EditableMapDocument,
  type EditableMapVolume,
  type EditableNavMeshRegion,
} from "./EditableMapDocument";

const STORAGE_KEY = "webfps.editor.map.v1";
const GRID_STEP = 0.25;
const VOLUME_KINDS: VolumeKind[] = ["floor", "wall", "ramp", "cover"];

type Selection =
  | { type: "volume"; index: number }
  | { type: "playerSpawn" }
  | { type: "botSpawn"; index: number }
  | { type: "patrolPoint"; botIndex: number; pointIndex: number }
  | { type: "navRegion"; index: number }
  | { type: "navPoint"; regionIndex: number; pointIndex: number };

export interface LevelEditorActions {
  getVolumeMeshes: () => THREE.Mesh[];
  onDocumentChange: (document: EditableMapDocument) => void;
  onPlay: (document: EditableMapDocument) => void;
  onExit: () => void;
}

export class LevelEditor {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly actions: LevelEditorActions;
  private readonly root: HTMLDivElement;
  private readonly listRoot: HTMLDivElement;
  private readonly propertyRoot: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly importInput: HTMLInputElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly markerGroup = new THREE.Group();
  private readonly grid = new THREE.GridHelper(48, 48, 0x445566, 0x223344);
  private readonly selectionHelper = new THREE.BoxHelper(new THREE.Object3D(), 0xffe066);
  private documentState = editableFromMap(BLOCKOUT_MAP_01, "Blockout Map 01", "blockout-map-01");
  private selection: Selection = { type: "volume", index: 0 };
  private active = false;

  constructor(
    container: HTMLElement,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    actions: LevelEditorActions,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.actions = actions;
    this.root = document.createElement("div");
    this.root.className = "level-editor-root";
    this.root.style.display = "none";

    const panel = createPanel("level-editor-panel");
    this.root.appendChild(panel);

    const title = document.createElement("h2");
    title.textContent = "Level Editor";
    panel.appendChild(title);

    const toolbar = document.createElement("div");
    toolbar.className = "editor-toolbar";
    toolbar.appendChild(createButton("Play From Editor", () => this.actions.onPlay(cloneEditableMapDocument(this.documentState)), "primary"));
    toolbar.appendChild(createButton("Main Menu", () => this.actions.onExit()));
    toolbar.appendChild(createButton("Save", () => this.saveLocal()));
    toolbar.appendChild(createButton("Load", () => this.loadLocal()));
    toolbar.appendChild(createButton("Export", () => this.exportJson()));
    toolbar.appendChild(createButton("Import", () => this.importInput.click()));
    panel.appendChild(toolbar);

    this.importInput = document.createElement("input");
    this.importInput.type = "file";
    this.importInput.accept = "application/json,.json";
    this.importInput.style.display = "none";
    this.importInput.addEventListener("change", () => this.importJson());
    panel.appendChild(this.importInput);

    this.status = document.createElement("div");
    this.status.className = "editor-status";
    panel.appendChild(this.status);

    this.listRoot = document.createElement("div");
    this.listRoot.className = "editor-list";
    panel.appendChild(this.listRoot);

    this.propertyRoot = document.createElement("div");
    this.propertyRoot.className = "editor-properties";
    panel.appendChild(this.propertyRoot);

    container.appendChild(this.root);

    this.grid.visible = false;
    this.grid.position.y = 0.01;
    this.scene.add(this.grid);
    this.markerGroup.visible = false;
    this.scene.add(this.markerGroup);
    this.selectionHelper.visible = false;
    this.scene.add(this.selectionHelper);
    this.domElement.addEventListener("pointerdown", this.onPointerDown);
  }

  show(): void {
    this.active = true;
    this.root.style.display = "block";
    this.grid.visible = true;
    this.markerGroup.visible = true;
    this.selectionHelper.visible = true;
    this.configureCamera();
    this.emitDocumentChange();
    this.renderPanel();
  }

  hide(): void {
    this.active = false;
    this.root.style.display = "none";
    this.grid.visible = false;
    this.markerGroup.visible = false;
    this.selectionHelper.visible = false;
  }

  update(): void {
    if (this.active) this.updateSelectionHelper();
  }

  dispose(): void {
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.scene.remove(this.grid);
    this.scene.remove(this.markerGroup);
    this.scene.remove(this.selectionHelper);
  }

  private configureCamera(): void {
    this.camera.position.set(0, 26, 42);
    this.camera.lookAt(0, 0, 18);
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  }

  private renderPanel(): void {
    this.listRoot.replaceChildren();
    this.propertyRoot.replaceChildren();

    const nameInput = document.createElement("input");
    nameInput.className = "editor-name-input";
    nameInput.value = this.documentState.name;
    nameInput.addEventListener("change", () => {
      this.documentState.name = nameInput.value || "Untitled Map";
      this.emitDocumentChange(false);
    });
    this.listRoot.appendChild(nameInput);

    this.renderVolumeList();
    this.renderSpawnList();
    this.renderNavMeshList();
    this.renderProperties();
  }

  private renderVolumeList(): void {
    this.appendSectionHeading(this.listRoot, "Volumes");
    const buttons = document.createElement("div");
    buttons.className = "editor-button-row";
    for (const kind of VOLUME_KINDS) {
      buttons.appendChild(createButton(`Add ${kind}`, () => this.addVolume(kind)));
    }
    this.listRoot.appendChild(buttons);

    for (const [index, volume] of this.documentState.volumes.entries()) {
      this.listRoot.appendChild(this.createListButton(`${index + 1}. ${volume.kind}`, { type: "volume", index }));
    }
  }

  private renderSpawnList(): void {
    this.appendSectionHeading(this.listRoot, "Spawns");
    this.listRoot.appendChild(this.createListButton("Player Spawn", { type: "playerSpawn" }));
    this.listRoot.appendChild(createButton("Add Bot", () => this.addBotSpawn()));
    for (const [botIndex, bot] of this.documentState.spawnPoints.ai.entries()) {
      this.listRoot.appendChild(this.createListButton(`Bot ${botIndex + 1}`, { type: "botSpawn", index: botIndex }));
      for (const [pointIndex] of bot.patrolPoints.entries()) {
        this.listRoot.appendChild(
          this.createListButton(`  Patrol ${pointIndex + 1}`, { type: "patrolPoint", botIndex, pointIndex }),
        );
      }
    }
  }

  private renderNavMeshList(): void {
    this.appendSectionHeading(this.listRoot, "Navmesh");
    this.listRoot.appendChild(createButton("Add Region", () => this.addNavRegion()));
    for (const [regionIndex, region] of this.documentState.navMeshRegions.entries()) {
      this.listRoot.appendChild(this.createListButton(`Region ${regionIndex + 1}`, { type: "navRegion", index: regionIndex }));
      for (const [pointIndex] of region.points.entries()) {
        this.listRoot.appendChild(
          this.createListButton(`  Point ${pointIndex + 1}`, { type: "navPoint", regionIndex, pointIndex }),
        );
      }
    }
  }

  private renderProperties(): void {
    this.appendSectionHeading(this.propertyRoot, "Properties");
    switch (this.selection.type) {
      case "volume":
        this.renderVolumeProperties(this.documentState.volumes[this.selection.index], this.selection.index);
        break;
      case "playerSpawn":
        this.appendVec3Editor("Position", this.documentState.spawnPoints.player, { y: true });
        break;
      case "botSpawn":
        this.renderBotSpawnProperties(this.documentState.spawnPoints.ai[this.selection.index], this.selection.index);
        break;
      case "patrolPoint":
        this.renderPatrolPointProperties(this.selection.botIndex, this.selection.pointIndex);
        break;
      case "navRegion":
        this.renderNavRegionProperties(this.documentState.navMeshRegions[this.selection.index], this.selection.index);
        break;
      case "navPoint":
        this.renderNavPointProperties(this.selection.regionIndex, this.selection.pointIndex);
        break;
    }
  }

  private renderVolumeProperties(volume: EditableMapVolume | undefined, index: number): void {
    if (!volume) return;
    this.propertyRoot.appendChild(createSelect("Kind", volume.kind, VOLUME_KINDS, (kind) => {
      volume.kind = kind;
      this.emitDocumentChange();
    }));
    this.appendVec3Editor("Position", volume.position, { y: true });
    this.appendVec3Editor("Half Extents", volume.halfExtents, { y: true, min: 0.1 });
    this.appendVec3Editor("Rotation Degrees", volume.rotationDegrees, { y: true, step: 5, snap: false });
    this.propertyRoot.appendChild(createButton("Duplicate Volume", () => this.duplicateVolume(index)));
    this.propertyRoot.appendChild(createButton("Delete Volume", () => this.deleteVolume(index)));
  }

  private renderBotSpawnProperties(spawn: EditableAISpawn | undefined, index: number): void {
    if (!spawn) return;
    this.appendVec3Editor("Position", spawn.position, { y: true });
    this.propertyRoot.appendChild(createButton("Add Patrol Point", () => this.addPatrolPoint(index)));
    this.propertyRoot.appendChild(createButton("Delete Bot", () => this.deleteBotSpawn(index)));
  }

  private renderPatrolPointProperties(botIndex: number, pointIndex: number): void {
    const point = this.documentState.spawnPoints.ai[botIndex]?.patrolPoints[pointIndex];
    if (!point) return;
    this.appendVec3Editor("Position", point.position, { y: true });
    this.propertyRoot.appendChild(createButton("Delete Patrol Point", () => this.deletePatrolPoint(botIndex, pointIndex)));
  }

  private renderNavRegionProperties(region: EditableNavMeshRegion | undefined, index: number): void {
    if (!region) return;
    const note = document.createElement("p");
    note.className = "editor-note";
    note.textContent = "Regions are sorted into a convex loop when the map runs.";
    this.propertyRoot.appendChild(note);
    this.propertyRoot.appendChild(createButton("Add Point", () => this.addNavPoint(index)));
    this.propertyRoot.appendChild(createButton("Delete Region", () => this.deleteNavRegion(index)));
  }

  private renderNavPointProperties(regionIndex: number, pointIndex: number): void {
    const point = this.documentState.navMeshRegions[regionIndex]?.points[pointIndex];
    if (!point) return;
    this.appendVec3Editor("Position", point, { y: true });
    this.propertyRoot.appendChild(createButton("Delete Point", () => this.deleteNavPoint(regionIndex, pointIndex)));
  }

  private appendVec3Editor(
    label: string,
    value: Vec3,
    options: { y?: boolean; step?: number; min?: number; snap?: boolean } = {},
  ): void {
    const group = document.createElement("div");
    group.className = "editor-field-group";
    const heading = document.createElement("h4");
    heading.textContent = label;
    group.appendChild(heading);

    const axes: Array<keyof Vec3> = options.y ? ["x", "y", "z"] : ["x", "z"];
    for (const axis of axes) {
      group.appendChild(createNumberInput(axis.toUpperCase(), value[axis], {
        step: options.step ?? GRID_STEP,
        min: options.min,
        onChange: (next) => {
          value[axis] = options.snap === false ? next : snap(next);
          this.emitDocumentChange();
        },
      }));
    }
    this.propertyRoot.appendChild(group);
  }

  private createListButton(label: string, selection: Selection): HTMLButtonElement {
    const button = createButton(label, () => {
      this.selection = selection;
      this.renderPanel();
      this.updateSelectionHelper();
    });
    if (selectionEquals(this.selection, selection)) button.classList.add("selected");
    return button;
  }

  private addVolume(kind: VolumeKind): void {
    this.documentState.volumes.push({
      id: createId("volume"),
      kind,
      halfExtents: kind === "wall" ? { x: 2, y: 2, z: 0.25 } : { x: 1, y: 0.5, z: 1 },
      position: { x: 0, y: kind === "floor" ? -0.5 : 0.5, z: 18 },
      rotationDegrees: { x: kind === "ramp" ? -15 : 0, y: 0, z: 0 },
    });
    this.selection = { type: "volume", index: this.documentState.volumes.length - 1 };
    this.emitDocumentChange();
  }

  private duplicateVolume(index: number): void {
    const source = this.documentState.volumes[index];
    if (!source) return;
    this.documentState.volumes.push({
      ...cloneEditableMapDocument({ ...this.documentState, volumes: [source] }).volumes[0],
      id: createId("volume"),
      position: { x: source.position.x + 1, y: source.position.y, z: source.position.z + 1 },
    });
    this.selection = { type: "volume", index: this.documentState.volumes.length - 1 };
    this.emitDocumentChange();
  }

  private deleteVolume(index: number): void {
    if (this.documentState.volumes.length <= 1) return;
    this.documentState.volumes.splice(index, 1);
    this.selection = { type: "volume", index: Math.max(0, index - 1) };
    this.emitDocumentChange();
  }

  private addBotSpawn(): void {
    this.documentState.spawnPoints.ai.push({
      id: createId("bot"),
      position: { x: 0, y: 0.1, z: 24 },
      patrolPoints: [{ id: createId("patrol"), position: { x: 0, y: 0.1, z: 24 } }],
    });
    this.selection = { type: "botSpawn", index: this.documentState.spawnPoints.ai.length - 1 };
    this.emitDocumentChange();
  }

  private deleteBotSpawn(index: number): void {
    this.documentState.spawnPoints.ai.splice(index, 1);
    this.selection = { type: "playerSpawn" };
    this.emitDocumentChange();
  }

  private addPatrolPoint(botIndex: number): void {
    const spawn = this.documentState.spawnPoints.ai[botIndex];
    if (!spawn) return;
    const last = spawn.patrolPoints.at(-1)?.position ?? spawn.position;
    spawn.patrolPoints.push({
      id: createId("patrol"),
      position: { x: last.x + 1, y: last.y, z: last.z + 1 },
    });
    this.selection = { type: "patrolPoint", botIndex, pointIndex: spawn.patrolPoints.length - 1 };
    this.emitDocumentChange();
  }

  private deletePatrolPoint(botIndex: number, pointIndex: number): void {
    const points = this.documentState.spawnPoints.ai[botIndex]?.patrolPoints;
    if (!points) return;
    points.splice(pointIndex, 1);
    this.selection = { type: "botSpawn", index: botIndex };
    this.emitDocumentChange();
  }

  private addNavRegion(): void {
    this.documentState.navMeshRegions.push({
      id: createId("nav"),
      points: [
        { x: -1, y: 0, z: 17 },
        { x: -1, y: 0, z: 19 },
        { x: 1, y: 0, z: 19 },
        { x: 1, y: 0, z: 17 },
      ],
    });
    this.selection = { type: "navRegion", index: this.documentState.navMeshRegions.length - 1 };
    this.emitDocumentChange();
  }

  private deleteNavRegion(index: number): void {
    this.documentState.navMeshRegions.splice(index, 1);
    this.selection = { type: "volume", index: 0 };
    this.emitDocumentChange();
  }

  private addNavPoint(regionIndex: number): void {
    const region = this.documentState.navMeshRegions[regionIndex];
    if (!region) return;
    const last = region.points.at(-1) ?? { x: 0, y: 0, z: 18 };
    region.points.push({ x: last.x + 1, y: last.y, z: last.z });
    this.selection = { type: "navPoint", regionIndex, pointIndex: region.points.length - 1 };
    this.emitDocumentChange();
  }

  private deleteNavPoint(regionIndex: number, pointIndex: number): void {
    const points = this.documentState.navMeshRegions[regionIndex]?.points;
    if (!points || points.length <= 3) return;
    points.splice(pointIndex, 1);
    this.selection = { type: "navRegion", index: regionIndex };
    this.emitDocumentChange();
  }

  private emitDocumentChange(rerender = true): void {
    this.actions.onDocumentChange(cloneEditableMapDocument(this.documentState));
    this.rebuildMarkers();
    this.updateSelectionHelper();
    if (rerender) this.renderPanel();
  }

  private rebuildMarkers(): void {
    clearGroup(this.markerGroup);
    this.markerGroup.add(makeMarker(this.documentState.spawnPoints.player, 0x55ff88, 0.24));

    for (const bot of this.documentState.spawnPoints.ai) {
      this.markerGroup.add(makeMarker(bot.position, 0xff5577, 0.22));
      for (const point of bot.patrolPoints) {
        this.markerGroup.add(makeMarker(point.position, 0xffdd55, 0.14));
        this.markerGroup.add(makeLine(bot.position, point.position, 0xffdd55));
      }
    }

    for (const region of this.documentState.navMeshRegions) {
      this.markerGroup.add(makeLoop(region.points, 0x55ddff));
    }
  }

  private updateSelectionHelper(): void {
    if (!this.active || this.selection.type !== "volume") {
      this.selectionHelper.visible = false;
      return;
    }
    const mesh = this.actions.getVolumeMeshes()[this.selection.index];
    if (!mesh) {
      this.selectionHelper.visible = false;
      return;
    }
    this.selectionHelper.setFromObject(mesh);
    this.selectionHelper.visible = true;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.active || event.button !== 0) return;
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this.actions.getVolumeMeshes();
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return;
    const index = meshes.indexOf(hit.object as THREE.Mesh);
    if (index >= 0) {
      this.selection = { type: "volume", index };
      this.renderPanel();
      this.updateSelectionHelper();
    }
  };

  private saveLocal(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.documentState));
    this.setStatus("Saved to browser storage.");
  }

  private loadLocal(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.setStatus("No saved editor map found.");
      return;
    }
    this.documentState = JSON.parse(raw) as EditableMapDocument;
    this.selection = { type: "volume", index: 0 };
    this.setStatus("Loaded saved editor map.");
    this.emitDocumentChange();
  }

  private exportJson(): void {
    const blob = new Blob([JSON.stringify(this.documentState, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${this.documentState.id || "webfps-map"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.setStatus("Exported JSON.");
  }

  private importJson(): void {
    const file = this.importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      this.documentState = JSON.parse(String(reader.result)) as EditableMapDocument;
      this.selection = { type: "volume", index: 0 };
      this.setStatus(`Imported ${file.name}.`);
      this.emitDocumentChange();
      this.importInput.value = "";
    });
    reader.readAsText(file);
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
  }

  private appendSectionHeading(parent: HTMLElement, label: string): void {
    const heading = document.createElement("h3");
    heading.textContent = label;
    parent.appendChild(heading);
  }
}

export function defaultEditableMapDocument(): EditableMapDocument {
  return editableFromMap(BLOCKOUT_MAP_01, "Blockout Map 01", "blockout-map-01");
}

export function runtimeMapFromEditor(document: EditableMapDocument) {
  return mapFromEditable(document);
}

function snap(value: number): number {
  return Math.round(value / GRID_STEP) * GRID_STEP;
}

function selectionEquals(a: Selection, b: Selection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function makeMarker(position: Vec3, color: number, radius: number): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 8),
    new THREE.MeshBasicMaterial({ color, depthTest: false }),
  );
  marker.position.set(position.x, position.y + radius, position.z);
  return marker;
}

function makeLine(from: Vec3, to: Vec3, color: number): THREE.Line {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y + 0.15, from.z),
      new THREE.Vector3(to.x, to.y + 0.15, to.z),
    ]),
    new THREE.LineBasicMaterial({ color, depthTest: false }),
  );
}

function makeLoop(points: readonly Vec3[], color: number): THREE.LineSegments {
  const vertices: THREE.Vector3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    vertices.push(new THREE.Vector3(a.x, a.y + 0.05, a.z), new THREE.Vector3(b.x, b.y + 0.05, b.z));
  }
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(vertices),
    new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 }),
  );
}

function clearGroup(group: THREE.Group): void {
  while (group.children.length) {
    const child = group.children.pop()!;
    group.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  }
}
