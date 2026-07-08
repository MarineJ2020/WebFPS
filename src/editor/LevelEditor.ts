import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
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
  type EditableSpawnPoint,
  type SpawnKind,
  type SpawnTeam,
} from "./EditableMapDocument";

const STORAGE_KEY = "webfps.editor.map.v1";
const GRID_STEP = 0.25;
const LOOK_SENSITIVITY = 0.003;
const FLY_SPEED = 9;
const FAST_FLY_MULTIPLIER = 3;
const PAN_SPEED = 0.018;
const WHEEL_DOLLY_SPEED = 0.025;
const VOLUME_KINDS: VolumeKind[] = ["floor", "wall", "ramp", "cover"];
const SPAWN_TEAMS: SpawnTeam[] = ["A", "B"];
const SPAWN_KINDS: SpawnKind[] = ["player", "bot"];
const HISTORY_LIMIT = 80;
const TOOL_SHORTCUTS = {
  KeyQ: "select",
  KeyW: "translate",
  KeyE: "rotate",
  KeyR: "scale",
} as const;

type EditorTool = "select" | "translate" | "rotate" | "scale";

type Selection =
  | { type: "volume"; index: number }
  | { type: "playerSpawn" }
  | { type: "botSpawn"; index: number }
  | { type: "patrolPoint"; botIndex: number; pointIndex: number }
  | { type: "spawnPoint"; index: number }
  | { type: "spawnPatrolPoint"; spawnIndex: number; pointIndex: number }
  | { type: "navRegion"; index: number }
  | { type: "navPoint"; regionIndex: number; pointIndex: number };

interface HistoryEntry {
  document: EditableMapDocument;
  selection: Selection;
}

type ShiftDragDuplicate =
  | { type: "volume"; index: number; snapshot: EditableMapVolume }
  | { type: "spawnPoint"; index: number; snapshot: EditableSpawnPoint };

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
  private readonly mapNameInput: HTMLInputElement;
  private readonly status: HTMLDivElement;
  private readonly importInput: HTMLInputElement;
  private readonly toolButtons = new Map<EditorTool, HTMLButtonElement>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly markerGroup = new THREE.Group();
  private readonly grid = new THREE.GridHelper(48, 48, 0x445566, 0x223344);
  private readonly selectionHelper = new THREE.BoxHelper(new THREE.Object3D(), 0xffe066);
  private readonly transformProxy = new THREE.Object3D();
  private readonly transformControls: TransformControls;
  private readonly transformHelper: THREE.Object3D;
  private readonly heldKeys = new Set<string>();
  private readonly cameraForward = new THREE.Vector3();
  private readonly cameraRight = new THREE.Vector3();
  private readonly cameraUp = new THREE.Vector3();
  private documentState = editableFromMap(BLOCKOUT_MAP_01, "Blockout Map 01", "blockout-map-01");
  private selection: Selection = { type: "volume", index: 0 };
  private history: HistoryEntry[] = [];
  private historyIndex = -1;
  private restoringHistory = false;
  private tool: EditorTool = "translate";
  private active = false;
  private rightMouseLook = false;
  private middleMousePan = false;
  private transformDragging = false;
  private transformStartVolume: { index: number; halfExtents: Vec3 } | null = null;
  private shiftDragDuplicate: ShiftDragDuplicate | null = null;

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
    this.transformControls = new TransformControls(this.camera, this.domElement);
    this.transformHelper = this.transformControls.getHelper();
    this.root = document.createElement("div");
    this.root.className = "level-editor-root";
    this.root.style.display = "none";

    const sceneToolbar = document.createElement("div");
    sceneToolbar.className = "editor-scene-toolbar";
    sceneToolbar.appendChild(this.createToolButton("select", "Q", "Select"));
    sceneToolbar.appendChild(this.createToolButton("translate", "W", "Move"));
    sceneToolbar.appendChild(this.createToolButton("rotate", "E", "Rotate"));
    sceneToolbar.appendChild(this.createToolButton("scale", "R", "Scale"));
    sceneToolbar.appendChild(createButton("Focus", () => this.focusSelection()));
    this.root.appendChild(sceneToolbar);

    const help = document.createElement("div");
    help.className = "editor-shortcuts";
    help.textContent = "RMB + WASD/QE fly | MMB pan | Wheel zoom | F frame | Del delete | Ctrl+C duplicate | Shift-drag copy";
    this.root.appendChild(help);

    const topBar = document.createElement("div");
    topBar.className = "editor-topbar";
    this.root.appendChild(topBar);

    const title = document.createElement("h2");
    title.textContent = "Level Editor";
    topBar.appendChild(title);

    this.mapNameInput = document.createElement("input");
    this.mapNameInput.className = "editor-name-input";
    this.mapNameInput.value = this.documentState.name;
    this.mapNameInput.addEventListener("change", () => {
      this.documentState.name = this.mapNameInput.value || "Untitled Map";
      this.emitDocumentChange(false);
      this.renderPanel();
    });
    topBar.appendChild(this.mapNameInput);

    const toolbar = document.createElement("div");
    toolbar.className = "editor-toolbar";
    toolbar.appendChild(createButton("Play From Editor", () => this.actions.onPlay(cloneEditableMapDocument(this.documentState)), "primary"));
    toolbar.appendChild(createButton("Main Menu", () => this.actions.onExit()));
    toolbar.appendChild(createButton("Undo", () => this.undo()));
    toolbar.appendChild(createButton("Redo", () => this.redo()));
    toolbar.appendChild(createButton("Save", () => this.saveLocal()));
    toolbar.appendChild(createButton("Load", () => this.loadLocal()));
    toolbar.appendChild(createButton("Export", () => this.exportJson()));
    toolbar.appendChild(createButton("Import", () => this.importInput.click()));
    topBar.appendChild(toolbar);

    this.importInput = document.createElement("input");
    this.importInput.type = "file";
    this.importInput.accept = "application/json,.json";
    this.importInput.style.display = "none";
    this.importInput.addEventListener("change", () => this.importJson());
    topBar.appendChild(this.importInput);

    this.status = document.createElement("div");
    this.status.className = "editor-status";
    topBar.appendChild(this.status);

    const hierarchyPanel = createPanel("editor-dock editor-hierarchy-panel");
    const hierarchyHeader = document.createElement("div");
    hierarchyHeader.className = "editor-dock-header";
    hierarchyHeader.textContent = "Hierarchy";
    hierarchyPanel.appendChild(hierarchyHeader);

    this.listRoot = document.createElement("div");
    this.listRoot.className = "editor-hierarchy";
    hierarchyPanel.appendChild(this.listRoot);
    this.root.appendChild(hierarchyPanel);

    const inspectorPanel = createPanel("editor-dock editor-inspector-panel");
    const inspectorHeader = document.createElement("div");
    inspectorHeader.className = "editor-dock-header";
    inspectorHeader.textContent = "Inspector";
    inspectorPanel.appendChild(inspectorHeader);

    this.propertyRoot = document.createElement("div");
    this.propertyRoot.className = "editor-inspector";
    inspectorPanel.appendChild(this.propertyRoot);
    this.root.appendChild(inspectorPanel);

    container.appendChild(this.root);

    this.grid.visible = false;
    this.grid.position.y = 0.01;
    this.scene.add(this.grid);
    this.markerGroup.visible = false;
    this.scene.add(this.markerGroup);
    this.selectionHelper.visible = false;
    this.scene.add(this.selectionHelper);
    this.transformProxy.visible = false;
    this.scene.add(this.transformProxy);
    this.transformHelper.visible = false;
    this.transformControls.enabled = false;
    this.transformControls.setTranslationSnap(GRID_STEP);
    this.transformControls.setRotationSnap(THREE.MathUtils.degToRad(5));
    this.transformControls.setScaleSnap(0.1);
    this.scene.add(this.transformHelper);
    this.transformControls.addEventListener("dragging-changed", this.onTransformDraggingChanged);
    this.transformControls.addEventListener("objectChange", this.onTransformObjectChange);
    this.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.domElement.addEventListener("pointermove", this.onPointerMove);
    this.domElement.addEventListener("pointerup", this.onPointerUp);
    this.domElement.addEventListener("wheel", this.onWheel, { passive: false });
    this.domElement.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    this.updateToolButtons();
  }

  show(): void {
    this.active = true;
    this.root.style.display = "block";
    this.grid.visible = true;
    this.markerGroup.visible = true;
    this.selectionHelper.visible = true;
    this.transformControls.enabled = true;
    this.configureCamera();
    this.recordHistory();
    this.emitDocumentChange();
    this.renderPanel();
  }

  hide(): void {
    this.active = false;
    this.root.style.display = "none";
    this.grid.visible = false;
    this.markerGroup.visible = false;
    this.selectionHelper.visible = false;
    this.transformControls.enabled = false;
    this.transformHelper.visible = false;
    this.transformControls.detach();
    this.rightMouseLook = false;
    this.middleMousePan = false;
    this.heldKeys.clear();
  }

  update(dt = 0): void {
    if (!this.active) return;
    this.updateEditorCamera(dt);
    this.updateSelectionHelper();
  }

  dispose(): void {
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.domElement.removeEventListener("wheel", this.onWheel);
    this.domElement.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    this.transformControls.removeEventListener("dragging-changed", this.onTransformDraggingChanged);
    this.transformControls.removeEventListener("objectChange", this.onTransformObjectChange);
    this.scene.remove(this.grid);
    this.scene.remove(this.markerGroup);
    this.scene.remove(this.selectionHelper);
    this.scene.remove(this.transformProxy);
    this.scene.remove(this.transformHelper);
    this.transformControls.dispose();
  }

  private configureCamera(): void {
    this.camera.position.set(0, 26, 42);
    this.camera.rotation.order = "YXZ";
    this.camera.lookAt(0, 0, 18);
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  }

  private renderPanel(): void {
    this.listRoot.replaceChildren();
    this.propertyRoot.replaceChildren();
    this.mapNameInput.value = this.documentState.name;

    this.renderVolumeList();
    this.renderSpawnList();
    this.renderNavMeshList();
    this.renderProperties();
  }

  private createToolButton(tool: EditorTool, shortcut: string, label: string): HTMLButtonElement {
    const button = createButton(`${shortcut} ${label}`, () => this.setTool(tool));
    button.classList.add("editor-tool-button");
    this.toolButtons.set(tool, button);
    return button;
  }

  private setTool(tool: EditorTool): void {
    this.tool = tool;
    this.updateToolButtons();
    this.updateTransformAttachment();
  }

  private updateToolButtons(): void {
    for (const [tool, button] of this.toolButtons) {
      button.classList.toggle("selected", tool === this.tool);
    }
  }

  private undo(): void {
    if (this.historyIndex <= 0) {
      this.setStatus("Nothing to undo.");
      return;
    }
    this.restoreHistory(this.historyIndex - 1);
  }

  private redo(): void {
    if (this.historyIndex >= this.history.length - 1) {
      this.setStatus("Nothing to redo.");
      return;
    }
    this.restoreHistory(this.historyIndex + 1);
  }

  private recordHistory(): void {
    if (this.restoringHistory) return;
    const entry: HistoryEntry = {
      document: cloneEditableMapDocument(this.documentState),
      selection: { ...this.selection } as Selection,
    };
    const serialized = JSON.stringify(entry);
    if (this.history[this.historyIndex] && JSON.stringify(this.history[this.historyIndex]) === serialized) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(entry);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  private restoreHistory(index: number): void {
    const entry = this.history[index];
    if (!entry) return;
    this.restoringHistory = true;
    this.historyIndex = index;
    this.documentState = cloneEditableMapDocument(entry.document);
    this.selection = { ...entry.selection } as Selection;
    this.emitDocumentChange();
    this.restoringHistory = false;
    this.setStatus(index < this.history.length - 1 ? "Undo." : "Redo.");
  }

  private renderVolumeList(): void {
    this.appendSectionHeading(this.listRoot, "Volumes");
    const buttons = document.createElement("div");
    buttons.className = "editor-button-row";
    for (const kind of VOLUME_KINDS) {
      buttons.appendChild(createButton(`Add ${kind}`, () => this.addVolume(kind)));
    }
    this.listRoot.appendChild(buttons);

    const rendered = new Set<string>();
    const renderBranch = (parentId: string | undefined, depth: number) => {
      for (const [index, volume] of this.documentState.volumes.entries()) {
        if ((volume.parentId || undefined) !== parentId || rendered.has(volume.id)) continue;
        rendered.add(volume.id);
        this.listRoot.appendChild(
          this.createListButton(this.volumeLabel(volume, index), { type: "volume", index }, { icon: volume.hidden ? "Hide" : "Box", depth }),
        );
        renderBranch(volume.id, depth + 1);
      }
    };
    renderBranch(undefined, 0);
    for (const [index, volume] of this.documentState.volumes.entries()) {
      if (rendered.has(volume.id)) continue;
      this.listRoot.appendChild(
        this.createListButton(this.volumeLabel(volume, index), { type: "volume", index }, { icon: "Box", depth: 0 }),
      );
    }
  }

  private renderSpawnList(): void {
    this.appendSectionHeading(this.listRoot, "Spawns");
    const buttons = document.createElement("div");
    buttons.className = "editor-button-row";
    buttons.appendChild(createButton("Add Player", () => this.addSpawnPoint("player")));
    buttons.appendChild(createButton("Add Bot", () => this.addSpawnPoint("bot")));
    this.listRoot.appendChild(buttons);

    const spawnPoints = this.getSpawnPoints();
    for (const [spawnIndex, spawn] of spawnPoints.entries()) {
      this.listRoot.appendChild(
        this.createListButton(this.spawnLabel(spawn, spawnIndex), { type: "spawnPoint", index: spawnIndex }, { icon: spawn.kind === "bot" ? "AI" : "P" }),
      );
      for (const [pointIndex] of spawn.patrolPoints.entries()) {
        this.listRoot.appendChild(
          this.createListButton(
            `Patrol ${pointIndex + 1}`,
            { type: "spawnPatrolPoint", spawnIndex, pointIndex },
            { icon: "Pt", depth: 1 },
          ),
        );
      }
    }
  }

  private renderNavMeshList(): void {
    this.appendSectionHeading(this.listRoot, "Navmesh");
    this.listRoot.appendChild(createButton("Add Region", () => this.addNavRegion()));
    for (const [regionIndex, region] of this.documentState.navMeshRegions.entries()) {
      this.listRoot.appendChild(
        this.createListButton(`Region ${regionIndex + 1}`, { type: "navRegion", index: regionIndex }, { icon: "Nav" }),
      );
      for (const [pointIndex] of region.points.entries()) {
        this.listRoot.appendChild(
          this.createListButton(
            `Point ${pointIndex + 1}`,
            { type: "navPoint", regionIndex, pointIndex },
            { icon: "Pt", depth: 1 },
          ),
        );
      }
    }
  }

  private renderProperties(): void {
    this.appendInspectorObjectHeader();
    switch (this.selection.type) {
      case "volume":
        this.renderVolumeProperties(this.documentState.volumes[this.selection.index], this.selection.index);
        break;
      case "playerSpawn":
        this.renderPlayerSpawnProperties();
        break;
      case "botSpawn":
        this.renderBotSpawnProperties(this.documentState.spawnPoints.ai[this.selection.index], this.selection.index);
        break;
      case "patrolPoint":
        this.renderPatrolPointProperties(this.selection.botIndex, this.selection.pointIndex);
        break;
      case "spawnPoint":
        this.renderSpawnPointProperties(this.getSpawnPoints()[this.selection.index], this.selection.index);
        break;
      case "spawnPatrolPoint":
        this.renderSpawnPatrolPointProperties(this.selection.spawnIndex, this.selection.pointIndex);
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
    this.appendComponent("Transform", (body) => {
      this.appendVec3Editor("Position", volume.position, { y: true }, body);
      this.appendVec3Editor("Rotation", volume.rotationDegrees, { y: true, step: 5, snap: false }, body);
      this.appendVec3Editor("Half Extents", volume.halfExtents, { y: true, min: 0.1 }, body);
    });
    this.appendComponent("Volume", (body) => {
      body.appendChild(this.createTextField("Name", volume.name, (value) => {
        volume.name = value || this.volumeLabel(volume, index);
        this.emitDocumentChange();
      }));
      body.appendChild(createSelect("Kind", volume.kind, VOLUME_KINDS, (kind) => {
        volume.kind = kind;
        this.emitDocumentChange();
      }));
      body.appendChild(this.createParentSelect(volume));
      this.appendObjectFlags(body, volume);
      this.appendInspectorActions(body, [
        createButton("Duplicate", () => this.duplicateVolume(index)),
        createButton("Focus", () => this.focusSelection()),
        createButton("Delete", () => this.deleteVolume(index)),
      ]);
    });
  }

  private renderPlayerSpawnProperties(): void {
    this.appendComponent("Transform", (body) => {
      this.appendVec3Editor("Position", this.documentState.spawnPoints.player, { y: true }, body);
    });
    this.appendComponent("Player Spawn", (body) => {
      const note = document.createElement("p");
      note.className = "editor-note";
      note.textContent = "The local player starts here when this map is played.";
      body.appendChild(note);
    });
  }

  private renderBotSpawnProperties(spawn: EditableAISpawn | undefined, index: number): void {
    if (!spawn) return;
    this.appendComponent("Transform", (body) => {
      this.appendVec3Editor("Position", spawn.position, { y: true }, body);
    });
    this.appendComponent("AI Spawn", (body) => {
      const note = document.createElement("p");
      note.className = "editor-note";
      note.textContent = `${spawn.patrolPoints.length} patrol point(s)`;
      body.appendChild(note);
      this.appendInspectorActions(body, [
        createButton("Add Patrol Point", () => this.addPatrolPoint(index)),
        createButton("Delete Bot", () => this.deleteBotSpawn(index)),
      ]);
    });
  }

  private renderSpawnPointProperties(spawn: EditableSpawnPoint | undefined, index: number): void {
    if (!spawn) return;
    this.appendComponent("Transform", (body) => {
      this.appendVec3Editor("Position", spawn.position, { y: true }, body);
    });
    this.appendComponent("Spawn Point", (body) => {
      body.appendChild(this.createTextField("Name", spawn.name, (value) => {
        spawn.name = value || this.spawnLabel(spawn, index);
        this.emitDocumentChange();
      }));
      body.appendChild(createSelect("Kind", spawn.kind, SPAWN_KINDS, (kind) => {
        spawn.kind = kind;
        this.emitDocumentChange();
      }));
      body.appendChild(createSelect("Team", spawn.team, SPAWN_TEAMS, (team) => {
        spawn.team = team;
        this.emitDocumentChange();
      }));
      this.appendObjectFlags(body, spawn);
      const note = document.createElement("p");
      note.className = "editor-note";
      note.textContent =
        spawn.kind === "bot"
          ? "Bot spawns become AI in playtest. Patrol points are used as its route."
          : "Player spawns are used for Team A/B player starts and future multiplayer teams.";
      body.appendChild(note);
      const actions = [
        createButton("Duplicate", () => this.duplicateSpawnPoint(index)),
        createButton("Delete", () => this.deleteSpawnPoint(index)),
      ];
      if (spawn.kind === "bot") actions.unshift(createButton("Add Patrol", () => this.addSpawnPatrolPoint(index)));
      this.appendInspectorActions(body, actions);
    });
  }

  private renderSpawnPatrolPointProperties(spawnIndex: number, pointIndex: number): void {
    const point = this.getSpawnPoints()[spawnIndex]?.patrolPoints[pointIndex];
    if (!point) return;
    this.appendComponent("Transform", (body) => {
      this.appendVec3Editor("Position", point.position, { y: true }, body);
    });
    this.appendComponent("Spawn Patrol Point", (body) => {
      this.appendInspectorActions(body, [
        createButton("Delete Patrol Point", () => this.deleteSpawnPatrolPoint(spawnIndex, pointIndex)),
      ]);
    });
  }

  private renderPatrolPointProperties(botIndex: number, pointIndex: number): void {
    const point = this.documentState.spawnPoints.ai[botIndex]?.patrolPoints[pointIndex];
    if (!point) return;
    this.appendComponent("Transform", (body) => {
      this.appendVec3Editor("Position", point.position, { y: true }, body);
    });
    this.appendComponent("Patrol Point", (body) => {
      this.appendInspectorActions(body, [
        createButton("Delete Patrol Point", () => this.deletePatrolPoint(botIndex, pointIndex)),
      ]);
    });
  }

  private renderNavRegionProperties(region: EditableNavMeshRegion | undefined, index: number): void {
    if (!region) return;
    this.appendComponent("NavMesh Region", (body) => {
      const note = document.createElement("p");
      note.className = "editor-note";
      note.textContent = `${region.points.length} vertices. Regions are sorted into a convex loop when the map runs.`;
      body.appendChild(note);
      this.appendInspectorActions(body, [
        createButton("Add Point", () => this.addNavPoint(index)),
        createButton("Delete Region", () => this.deleteNavRegion(index)),
      ]);
    });
  }

  private renderNavPointProperties(regionIndex: number, pointIndex: number): void {
    const point = this.documentState.navMeshRegions[regionIndex]?.points[pointIndex];
    if (!point) return;
    this.appendComponent("Transform", (body) => {
      this.appendVec3Editor("Position", point, { y: true }, body);
    });
    this.appendComponent("NavMesh Vertex", (body) => {
      this.appendInspectorActions(body, [
        createButton("Delete Point", () => this.deleteNavPoint(regionIndex, pointIndex)),
      ]);
    });
  }

  private appendVec3Editor(
    label: string,
    value: Vec3,
    options: { y?: boolean; step?: number; min?: number; snap?: boolean } = {},
    parent?: HTMLElement,
  ): void {
    const target = parent ?? this.propertyRoot;
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
    target.appendChild(group);
  }

  private appendInspectorObjectHeader(): void {
    const header = document.createElement("div");
    header.className = "inspector-object-header";

    const title = document.createElement("div");
    title.className = "inspector-object-title";
    title.textContent = this.selectionDisplayName();
    header.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "inspector-object-meta";
    meta.textContent = this.selectionTypeLabel();
    header.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "inspector-object-actions";
    actions.appendChild(createButton("Focus", () => this.focusSelection()));
    if (this.selection.type !== "playerSpawn") {
      actions.appendChild(createButton("Delete", () => this.deleteSelection()));
    }
    header.appendChild(actions);

    this.propertyRoot.appendChild(header);
  }

  private appendComponent(title: string, build: (body: HTMLDivElement) => void): void {
    const component = document.createElement("div");
    component.className = "inspector-component";

    const header = document.createElement("div");
    header.className = "inspector-component-header";
    header.textContent = title;
    component.appendChild(header);

    const body = document.createElement("div");
    body.className = "inspector-component-body";
    build(body);
    component.appendChild(body);

    this.propertyRoot.appendChild(component);
  }

  private appendInspectorActions(parent: HTMLElement, buttons: HTMLButtonElement[]): void {
    const actions = document.createElement("div");
    actions.className = "inspector-actions";
    for (const button of buttons) actions.appendChild(button);
    parent.appendChild(actions);
  }

  private createTextField(label: string, value: string, onChange: (value: string) => void): HTMLLabelElement {
    const row = document.createElement("label");
    row.className = "ui-field";

    const text = document.createElement("span");
    text.textContent = label;
    row.appendChild(text);

    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.addEventListener("change", () => onChange(input.value.trim()));
    row.appendChild(input);

    return row;
  }

  private createToggle(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
    const row = document.createElement("label");
    row.className = "ui-field checkbox-field";

    const text = document.createElement("span");
    text.textContent = label;
    row.appendChild(text);

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    row.appendChild(input);

    return row;
  }

  private appendObjectFlags(
    parent: HTMLElement,
    object: { enabled: boolean; hidden: boolean; frozen: boolean },
  ): void {
    parent.appendChild(this.createToggle("Enabled In Play", object.enabled !== false, (checked) => {
      object.enabled = checked;
      this.emitDocumentChange();
    }));
    parent.appendChild(this.createToggle("Hidden", object.hidden === true, (checked) => {
      object.hidden = checked;
      this.emitDocumentChange();
    }));
    parent.appendChild(this.createToggle("Frozen", object.frozen === true, (checked) => {
      object.frozen = checked;
      this.emitDocumentChange();
    }));
  }

  private createParentSelect(volume: EditableMapVolume): HTMLLabelElement {
    const options = ["Scene Root", ...this.documentState.volumes
      .filter((candidate) => candidate.id !== volume.id && !this.isDescendantOf(candidate.id, volume.id))
      .map((candidate) => candidate.name || candidate.kind)];
    const ids = ["", ...this.documentState.volumes
      .filter((candidate) => candidate.id !== volume.id && !this.isDescendantOf(candidate.id, volume.id))
      .map((candidate) => candidate.id)];

    const row = document.createElement("label");
    row.className = "ui-field";
    const text = document.createElement("span");
    text.textContent = "Parent";
    row.appendChild(text);

    const select = document.createElement("select");
    for (let i = 0; i < options.length; i++) {
      const option = document.createElement("option");
      option.value = ids[i];
      option.textContent = options[i];
      select.appendChild(option);
    }
    select.value = volume.parentId ?? "";
    select.addEventListener("change", () => {
      volume.parentId = select.value || undefined;
      this.emitDocumentChange();
    });
    row.appendChild(select);
    return row;
  }

  private createListButton(
    label: string,
    selection: Selection,
    options: { icon?: string; depth?: number } = {},
  ): HTMLButtonElement {
    const button = createButton(label, () => {
      this.selection = selection;
      this.renderPanel();
      this.updateSelectionHelper();
      this.updateTransformAttachment();
    });
    button.classList.add("hierarchy-row", `depth-${options.depth ?? 0}`);
    button.textContent = "";

    const icon = document.createElement("span");
    icon.className = "hierarchy-icon";
    icon.textContent = options.icon ?? "Obj";
    button.appendChild(icon);

    const name = document.createElement("span");
    name.className = "hierarchy-name";
    name.textContent = label;
    button.appendChild(name);

    if (selectionEquals(this.selection, selection)) button.classList.add("selected");
    return button;
  }

  private addVolume(kind: VolumeKind): void {
    this.documentState.volumes.push({
      id: createId("volume"),
      name: `${titleCase(kind)} ${this.documentState.volumes.length + 1}`,
      kind,
      halfExtents: kind === "wall" ? { x: 2, y: 2, z: 0.25 } : { x: 1, y: 0.5, z: 1 },
      position: { x: 0, y: kind === "floor" ? -0.5 : 0.5, z: 18 },
      rotationDegrees: { x: kind === "ramp" ? -15 : 0, y: 0, z: 0 },
      enabled: true,
      hidden: false,
      frozen: false,
    });
    this.selection = { type: "volume", index: this.documentState.volumes.length - 1 };
    this.emitDocumentChange();
  }

  private duplicateVolume(index: number): void {
    const source = this.documentState.volumes[index];
    if (!source) return;
    this.documentState.volumes.push(this.createVolumeDuplicate(source, {
      position: { x: source.position.x + 1, y: source.position.y, z: source.position.z + 1 },
    }));
    this.selection = { type: "volume", index: this.documentState.volumes.length - 1 };
    this.emitDocumentChange();
  }

  private deleteVolume(index: number): void {
    if (this.documentState.volumes.length <= 1) return;
    this.documentState.volumes.splice(index, 1);
    this.selection = { type: "volume", index: Math.max(0, index - 1) };
    this.emitDocumentChange();
  }

  private addSpawnPoint(kind: SpawnKind): void {
    const spawnPoints = this.getSpawnPoints();
    spawnPoints.push({
      id: createId("spawn"),
      name: `Team ${kind === "player" ? "A" : "B"} ${titleCase(kind)} Spawn ${spawnPoints.length + 1}`,
      kind,
      team: kind === "player" ? "A" : "B",
      position: { x: kind === "player" ? 0 : 4, y: 0.1, z: kind === "player" ? 6 : 24 },
      enabled: true,
      hidden: false,
      frozen: false,
      patrolPoints: kind === "bot" ? [{ id: createId("patrol"), position: { x: 4, y: 0.1, z: 26 } }] : [],
    });
    this.selection = { type: "spawnPoint", index: spawnPoints.length - 1 };
    this.emitDocumentChange();
  }

  private duplicateSpawnPoint(index: number): void {
    const spawnPoints = this.getSpawnPoints();
    const source = spawnPoints[index];
    if (!source) return;
    spawnPoints.push(this.createSpawnPointDuplicate(source, {
      position: { x: source.position.x + 1, y: source.position.y, z: source.position.z + 1 },
    }));
    this.selection = { type: "spawnPoint", index: spawnPoints.length - 1 };
    this.emitDocumentChange();
  }

  private duplicateSelected(): void {
    if (this.selection.type === "volume") {
      this.duplicateVolume(this.selection.index);
      return;
    }

    if (this.selection.type === "spawnPoint") {
      this.duplicateSpawnPoint(this.selection.index);
      return;
    }

    this.setStatus("Select a volume or spawn point to duplicate.");
  }

  private createVolumeDuplicate(
    source: EditableMapVolume,
    overrides: Partial<EditableMapVolume> = {},
  ): EditableMapVolume {
    return {
      ...cloneVolume(source),
      ...overrides,
      id: createId("volume"),
      name: overrides.name ?? `${source.name} Copy`,
    };
  }

  private createSpawnPointDuplicate(
    source: EditableSpawnPoint,
    overrides: Partial<EditableSpawnPoint> = {},
  ): EditableSpawnPoint {
    const copy = cloneSpawnPoint(source);
    return {
      ...copy,
      ...overrides,
      id: createId("spawn"),
      name: overrides.name ?? `${source.name} Copy`,
      patrolPoints: (overrides.patrolPoints ?? copy.patrolPoints).map((point) => ({
        id: createId("patrol"),
        position: { ...point.position },
      })),
    };
  }

  private deleteSpawnPoint(index: number): void {
    const spawnPoints = this.getSpawnPoints();
    if (spawnPoints.length <= 1) {
      this.setStatus("At least one spawn point is required.");
      return;
    }
    spawnPoints.splice(index, 1);
    this.selection = { type: "spawnPoint", index: Math.max(0, index - 1) };
    this.emitDocumentChange();
  }

  private addSpawnPatrolPoint(spawnIndex: number): void {
    const spawn = this.getSpawnPoints()[spawnIndex];
    if (!spawn) return;
    const last = spawn.patrolPoints.at(-1)?.position ?? spawn.position;
    spawn.patrolPoints.push({
      id: createId("patrol"),
      position: { x: last.x + 1, y: last.y, z: last.z + 1 },
    });
    this.selection = { type: "spawnPatrolPoint", spawnIndex, pointIndex: spawn.patrolPoints.length - 1 };
    this.emitDocumentChange();
  }

  private deleteSpawnPatrolPoint(spawnIndex: number, pointIndex: number): void {
    const points = this.getSpawnPoints()[spawnIndex]?.patrolPoints;
    if (!points) return;
    points.splice(pointIndex, 1);
    this.selection = { type: "spawnPoint", index: spawnIndex };
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
    this.transformControls.detach();
    this.actions.onDocumentChange(cloneEditableMapDocument(this.documentState));
    this.applyVolumeEditorState();
    this.rebuildMarkers();
    if (rerender) this.renderPanel();
    this.updateSelectionHelper();
    this.updateTransformAttachment();
    this.recordHistory();
  }

  private rebuildMarkers(): void {
    clearGroup(this.markerGroup);
    const spawnPoints = this.getSpawnPoints();
    for (const spawn of spawnPoints) {
      if (spawn.hidden) continue;
      const color = spawn.kind === "bot" ? 0xff5577 : spawn.team === "A" ? 0x55ff88 : 0x55aaff;
      this.markerGroup.add(makeMarker(spawn.position, spawn.enabled ? color : 0x777777, 0.24));
      for (const point of spawn.patrolPoints) {
        this.markerGroup.add(makeMarker(point.position, 0xffdd55, 0.14));
        this.markerGroup.add(makeLine(spawn.position, point.position, 0xffdd55));
      }
    }

    for (const region of this.documentState.navMeshRegions) {
      this.markerGroup.add(makeLoop(region.points, 0x55ddff));
    }
  }

  private applyVolumeEditorState(): void {
    const meshes = this.actions.getVolumeMeshes();
    for (const [index, volume] of this.documentState.volumes.entries()) {
      const mesh = meshes[index];
      if (!mesh) continue;
      mesh.visible = !volume.hidden;
      const material = mesh.material;
      const opacity = volume.enabled === false ? 0.35 : 1;
      if (Array.isArray(material)) {
        for (const item of material) {
          item.transparent = opacity < 1;
          item.opacity = opacity;
        }
      } else {
        material.transparent = opacity < 1;
        material.opacity = opacity;
      }
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

  private updateTransformAttachment(): void {
    if (!this.active || this.tool === "select") {
      this.transformControls.detach();
      this.transformHelper.visible = false;
      return;
    }

    if (this.selection.type === "volume") {
      const volume = this.documentState.volumes[this.selection.index];
      if (volume?.frozen) {
        this.transformControls.detach();
        this.transformHelper.visible = false;
        this.setStatus("Selected volume is frozen.");
        return;
      }
      const mesh = this.actions.getVolumeMeshes()[this.selection.index];
      if (!mesh) {
        this.transformControls.detach();
        this.transformHelper.visible = false;
        return;
      }
      this.transformControls.setMode(this.tool);
      this.transformControls.attach(mesh);
      this.transformHelper.visible = true;
      return;
    }

    if (this.tool !== "translate") {
      this.transformControls.detach();
      this.transformHelper.visible = false;
      this.setStatus("Only volume objects support rotate/scale. Use W Move for markers.");
      return;
    }

    const point = this.getSelectedPoint();
    if (this.isSelectedPointFrozen()) {
      this.transformControls.detach();
      this.transformHelper.visible = false;
      this.setStatus("Selected marker is frozen.");
      return;
    }
    if (!point) {
      this.transformControls.detach();
      this.transformHelper.visible = false;
      return;
    }

    this.transformProxy.position.set(point.x, point.y, point.z);
    this.transformControls.setMode("translate");
    this.transformControls.attach(this.transformProxy);
    this.transformHelper.visible = true;
  }

  private getSelectedPoint(): Vec3 | null {
    switch (this.selection.type) {
      case "playerSpawn":
        return this.documentState.spawnPoints.player;
      case "botSpawn":
        return this.documentState.spawnPoints.ai[this.selection.index]?.position ?? null;
      case "patrolPoint":
        return this.documentState.spawnPoints.ai[this.selection.botIndex]?.patrolPoints[this.selection.pointIndex]?.position ?? null;
      case "spawnPoint":
        return this.getSpawnPoints()[this.selection.index]?.position ?? null;
      case "spawnPatrolPoint":
        return this.getSpawnPoints()[this.selection.spawnIndex]?.patrolPoints[this.selection.pointIndex]?.position ?? null;
      case "navPoint":
        return this.documentState.navMeshRegions[this.selection.regionIndex]?.points[this.selection.pointIndex] ?? null;
      default:
        return null;
    }
  }

  private isSelectedPointFrozen(): boolean {
    switch (this.selection.type) {
      case "spawnPoint":
        return this.getSpawnPoints()[this.selection.index]?.frozen === true;
      case "playerSpawn":
      case "botSpawn":
      case "patrolPoint":
      case "spawnPatrolPoint":
      case "navPoint":
        return false;
      case "volume":
      case "navRegion":
        return false;
    }
  }

  private selectionDisplayName(): string {
    switch (this.selection.type) {
      case "volume":
        return `Volume ${this.selection.index + 1}`;
      case "playerSpawn":
        return "Player Spawn";
      case "botSpawn":
        return `Bot ${this.selection.index + 1}`;
      case "patrolPoint":
        return `Bot ${this.selection.botIndex + 1} Patrol ${this.selection.pointIndex + 1}`;
      case "spawnPoint":
        return this.getSpawnPoints()[this.selection.index]?.name ?? `Spawn ${this.selection.index + 1}`;
      case "spawnPatrolPoint":
        return `${this.getSpawnPoints()[this.selection.spawnIndex]?.name ?? "Spawn"} Patrol ${this.selection.pointIndex + 1}`;
      case "navRegion":
        return `NavMesh Region ${this.selection.index + 1}`;
      case "navPoint":
        return `NavMesh Region ${this.selection.regionIndex + 1} Point ${this.selection.pointIndex + 1}`;
    }
  }

  private selectionTypeLabel(): string {
    switch (this.selection.type) {
      case "volume":
        return this.documentState.volumes[this.selection.index]?.kind ?? "Volume";
      case "playerSpawn":
        return "Player start marker";
      case "botSpawn":
        return "AI spawn marker";
      case "patrolPoint":
        return "AI patrol marker";
      case "spawnPoint": {
        const spawn = this.getSpawnPoints()[this.selection.index];
        return spawn ? `Team ${spawn.team} ${spawn.kind} spawn` : "Spawn point";
      }
      case "spawnPatrolPoint":
        return "Spawn patrol marker";
      case "navRegion":
        return "Walkable AI navigation polygon";
      case "navPoint":
        return "Navigation polygon vertex";
    }
  }

  private getSelectionCenter(): THREE.Vector3 | null {
    if (this.selection.type === "volume") {
      const mesh = this.actions.getVolumeMeshes()[this.selection.index];
      if (!mesh) return null;
      return mesh.getWorldPosition(new THREE.Vector3());
    }

    if (this.selection.type === "navRegion") {
      const region = this.documentState.navMeshRegions[this.selection.index];
      if (!region || region.points.length === 0) return null;
      const sum = region.points.reduce<THREE.Vector3>(
        (acc, point) => acc.add(new THREE.Vector3(point.x, point.y, point.z)),
        new THREE.Vector3(),
      );
      return sum.divideScalar(region.points.length);
    }

    const point = this.getSelectedPoint();
    return point ? new THREE.Vector3(point.x, point.y, point.z) : null;
  }

  private focusSelection(): void {
    const center = this.getSelectionCenter() ?? new THREE.Vector3(0, 0, 18);
    this.camera.position.copy(center).add(new THREE.Vector3(0, 7, 10));
    this.camera.lookAt(center);
  }

  private syncTransformObject(): void {
    if (this.selection.type === "volume") {
      const volume = this.documentState.volumes[this.selection.index];
      const mesh = this.actions.getVolumeMeshes()[this.selection.index];
      if (!volume || !mesh) return;

      volume.position = {
        x: snap(mesh.position.x),
        y: snap(mesh.position.y),
        z: snap(mesh.position.z),
      };
      volume.rotationDegrees = {
        x: round(THREE.MathUtils.radToDeg(mesh.rotation.x), 2),
        y: round(THREE.MathUtils.radToDeg(mesh.rotation.y), 2),
        z: round(THREE.MathUtils.radToDeg(mesh.rotation.z), 2),
      };

      if (this.tool === "scale") {
        const snapshot = this.ensureVolumeTransformStart(this.selection.index);
        volume.halfExtents = {
          x: Math.max(0.1, snap(snapshot.halfExtents.x * Math.abs(mesh.scale.x))),
          y: Math.max(0.1, snap(snapshot.halfExtents.y * Math.abs(mesh.scale.y))),
          z: Math.max(0.1, snap(snapshot.halfExtents.z * Math.abs(mesh.scale.z))),
        };
      }
      this.updateSelectionHelper();
      return;
    }

    const point = this.getSelectedPoint();
    if (!point) return;
    point.x = snap(this.transformProxy.position.x);
    point.y = snap(this.transformProxy.position.y);
    point.z = snap(this.transformProxy.position.z);
    this.rebuildMarkers();
  }

  private ensureVolumeTransformStart(index: number): { index: number; halfExtents: Vec3 } {
    if (this.transformStartVolume?.index === index) return this.transformStartVolume;
    const volume = this.documentState.volumes[index];
    this.transformStartVolume = {
      index,
      halfExtents: volume ? { ...volume.halfExtents } : { x: 1, y: 1, z: 1 },
    };
    return this.transformStartVolume;
  }

  private beginShiftDragDuplicate(): void {
    this.shiftDragDuplicate = null;
    if (!this.isShiftHeld()) return;

    if (this.selection.type === "volume") {
      const volume = this.documentState.volumes[this.selection.index];
      if (!volume) return;
      this.shiftDragDuplicate = { type: "volume", index: this.selection.index, snapshot: cloneVolume(volume) };
      this.setStatus("Shift-drag duplicate: original will stay in place.");
      return;
    }

    if (this.selection.type === "spawnPoint") {
      const spawn = this.getSpawnPoints()[this.selection.index];
      if (!spawn) return;
      this.shiftDragDuplicate = { type: "spawnPoint", index: this.selection.index, snapshot: cloneSpawnPoint(spawn) };
      this.setStatus("Shift-drag duplicate: original will stay in place.");
    }
  }

  private finishShiftDragDuplicate(): boolean {
    const pending = this.shiftDragDuplicate;
    this.shiftDragDuplicate = null;
    if (!pending) return false;

    if (pending.type === "volume") {
      const moved = this.documentState.volumes[pending.index];
      if (!moved) return false;
      const duplicate = this.createVolumeDuplicate(moved, { name: `${pending.snapshot.name} Copy` });
      this.documentState.volumes[pending.index] = pending.snapshot;
      this.documentState.volumes.push(duplicate);
      this.selection = { type: "volume", index: this.documentState.volumes.length - 1 };
      this.setStatus(`Duplicated ${pending.snapshot.name}.`);
      return true;
    }

    const spawnPoints = this.getSpawnPoints();
    const moved = spawnPoints[pending.index];
    if (!moved) return false;
    const duplicate = this.createSpawnPointDuplicate(moved, { name: `${pending.snapshot.name} Copy` });
    spawnPoints[pending.index] = pending.snapshot;
    spawnPoints.push(duplicate);
    this.selection = { type: "spawnPoint", index: spawnPoints.length - 1 };
    this.setStatus(`Duplicated ${pending.snapshot.name}.`);
    return true;
  }

  private isShiftHeld(): boolean {
    return this.heldKeys.has("ShiftLeft") || this.heldKeys.has("ShiftRight");
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.active) return;

    if (event.button === 2) {
      event.preventDefault();
      this.rightMouseLook = true;
      this.domElement.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button === 1) {
      event.preventDefault();
      this.middleMousePan = true;
      this.domElement.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0 || this.transformDragging) return;

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
      this.updateTransformAttachment();
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.active || this.transformDragging) return;

    if (this.rightMouseLook) {
      event.preventDefault();
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.y -= event.movementX * LOOK_SENSITIVITY;
      this.camera.rotation.x = THREE.MathUtils.clamp(
        this.camera.rotation.x - event.movementY * LOOK_SENSITIVITY,
        -Math.PI / 2 + 0.02,
        Math.PI / 2 - 0.02,
      );
      return;
    }

    if (this.middleMousePan) {
      event.preventDefault();
      this.getCameraBasis();
      this.camera.position.addScaledVector(this.cameraRight, -event.movementX * PAN_SPEED);
      this.camera.position.addScaledVector(this.cameraUp, event.movementY * PAN_SPEED);
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2) this.rightMouseLook = false;
    if (event.button === 1) this.middleMousePan = false;
    if (this.domElement.hasPointerCapture(event.pointerId)) {
      this.domElement.releasePointerCapture(event.pointerId);
    }
  };

  private onWheel = (event: WheelEvent): void => {
    if (!this.active) return;
    event.preventDefault();
    this.camera.getWorldDirection(this.cameraForward);
    this.camera.position.addScaledVector(this.cameraForward, -event.deltaY * WHEEL_DOLLY_SPEED);
  };

  private onContextMenu = (event: MouseEvent): void => {
    if (this.active) event.preventDefault();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.active || isTypingTarget(event.target)) return;
    this.heldKeys.add(event.code);

    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyY") {
      event.preventDefault();
      this.redo();
      return;
    }

    if (this.rightMouseLook) {
      event.preventDefault();
      return;
    }

    const tool = TOOL_SHORTCUTS[event.code as keyof typeof TOOL_SHORTCUTS];
    if (tool) {
      event.preventDefault();
      this.setTool(tool);
      return;
    }

    if (event.code === "KeyF") {
      event.preventDefault();
      this.focusSelection();
    } else if (event.code === "Delete" || event.code === "Backspace") {
      event.preventDefault();
      this.deleteSelection();
    } else if ((event.code === "KeyD" || event.code === "KeyC") && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.duplicateSelected();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code);
  };

  private onTransformDraggingChanged = (event: { value?: unknown }): void => {
    this.transformDragging = event.value === true;
    if (this.transformDragging) {
      this.beginShiftDragDuplicate();
      if (this.selection.type === "volume") this.ensureVolumeTransformStart(this.selection.index);
      return;
    }

    const duplicatedFromDrag = this.finishShiftDragDuplicate();
    this.transformStartVolume = null;
    if (duplicatedFromDrag) {
      this.emitDocumentChange();
      return;
    }

    this.emitDocumentChange();
  };

  private onTransformObjectChange = (): void => {
    this.syncTransformObject();
  };

  private updateEditorCamera(dt: number): void {
    if (!this.rightMouseLook || dt <= 0) return;

    this.getCameraBasis();
    const speed = FLY_SPEED * (this.heldKeys.has("ShiftLeft") || this.heldKeys.has("ShiftRight") ? FAST_FLY_MULTIPLIER : 1);
    const moveDistance = speed * dt;

    if (this.heldKeys.has("KeyW")) this.camera.position.addScaledVector(this.cameraForward, moveDistance);
    if (this.heldKeys.has("KeyS")) this.camera.position.addScaledVector(this.cameraForward, -moveDistance);
    if (this.heldKeys.has("KeyD")) this.camera.position.addScaledVector(this.cameraRight, moveDistance);
    if (this.heldKeys.has("KeyA")) this.camera.position.addScaledVector(this.cameraRight, -moveDistance);
    if (this.heldKeys.has("KeyE")) this.camera.position.y += moveDistance;
    if (this.heldKeys.has("KeyQ")) this.camera.position.y -= moveDistance;
  }

  private getCameraBasis(): void {
    this.camera.getWorldDirection(this.cameraForward).normalize();
    this.cameraRight.crossVectors(this.cameraForward, this.camera.up).normalize();
    this.cameraUp.crossVectors(this.cameraRight, this.cameraForward).normalize();
  }

  private deleteSelection(): void {
    switch (this.selection.type) {
      case "volume":
        this.deleteVolume(this.selection.index);
        break;
      case "botSpawn":
        this.deleteBotSpawn(this.selection.index);
        break;
      case "patrolPoint":
        this.deletePatrolPoint(this.selection.botIndex, this.selection.pointIndex);
        break;
      case "spawnPoint":
        this.deleteSpawnPoint(this.selection.index);
        break;
      case "spawnPatrolPoint":
        this.deleteSpawnPatrolPoint(this.selection.spawnIndex, this.selection.pointIndex);
        break;
      case "navRegion":
        this.deleteNavRegion(this.selection.index);
        break;
      case "navPoint":
        this.deleteNavPoint(this.selection.regionIndex, this.selection.pointIndex);
        break;
      case "playerSpawn":
        this.setStatus("Player spawn cannot be deleted.");
        break;
    }
  }

  private getSpawnPoints(): EditableSpawnPoint[] {
    if (!this.documentState.spawnPoints.points) this.documentState.spawnPoints.points = [];
    return this.documentState.spawnPoints.points;
  }

  private volumeLabel(volume: EditableMapVolume, index: number): string {
    const prefix = volume.enabled === false ? "[Off] " : volume.frozen ? "[Frozen] " : "";
    return `${prefix}${volume.name || `${titleCase(volume.kind)} ${index + 1}`}`;
  }

  private spawnLabel(spawn: EditableSpawnPoint, index: number): string {
    const prefix = spawn.enabled === false ? "[Off] " : spawn.frozen ? "[Frozen] " : "";
    return `${prefix}${spawn.name || `Team ${spawn.team} ${titleCase(spawn.kind)} Spawn ${index + 1}`}`;
  }

  private isDescendantOf(candidateId: string, ancestorId: string): boolean {
    let current = this.documentState.volumes.find((volume) => volume.id === candidateId);
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = this.documentState.volumes.find((volume) => volume.id === current?.parentId);
    }
    return false;
  }

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

export function runtimeMapFromEditor(
  document: EditableMapDocument,
  options: { includeDisabled?: boolean; includeHidden?: boolean } = {},
) {
  return mapFromEditable(document, options);
}

function snap(value: number): number {
  return Math.round(value / GRID_STEP) * GRID_STEP;
}

function round(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function cloneVolume(volume: EditableMapVolume): EditableMapVolume {
  return JSON.parse(JSON.stringify(volume)) as EditableMapVolume;
}

function cloneSpawnPoint(spawn: EditableSpawnPoint): EditableSpawnPoint {
  return JSON.parse(JSON.stringify(spawn)) as EditableSpawnPoint;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
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
