import type { Note, Difficulty } from "./types.js";
import { getDifficultyColor } from "./types.js";

export const NOTE_TEXTURE_URL =
  "https://raw.githubusercontent.com/Rhythia/Client/master/textures/squircle_blank.png";

const APPROACH_TIME = 550;
const SPAWN_Z = -1500;
const HIT_Z = 0;
const CELL_SIZE = 100;
const GRID_CELLS = 3;
const CAMERA_FOCAL_LENGTH = 900;
const NOTE_SIZE = 68;
const FAR_NOTE_ALPHA = 0.18;
const NEAR_GLOW_BLUR = 22;
const MAX_DEVICE_PIXEL_RATIO = 2;
const BACK_GRID_ALPHA = 0.18;
const GRID_LINE_COLOR = "rgba(255, 255, 255, 0.18)";
const GRID_FILL_COLOR = "rgba(255, 255, 255, 0.035)";
const NOTE_FALLBACK_COLOR = "#ffffff";
const QUANTUM_DEBUG_COLOR = "rgba(74, 217, 255, 0.72)";
const OFFGRID_DEBUG_COLOR = "rgba(255, 204, 37, 0.78)";
const DEBUG_GRID_COLOR = "rgba(74, 217, 255, 0.16)";

export interface GameplayRendererOptions {
  canvas: HTMLCanvasElement;
  audio: HTMLAudioElement;
  noteTextureUrl: string;
  difficulty: Difficulty;
}

interface VisualizerNote {
  readonly time: number;
  readonly x: number;
  readonly y: number;
  readonly quantum: boolean;
  readonly offgrid: boolean;
}

class MapParser {
  static normalizeNotes(notes: readonly Note[]): VisualizerNote[] {
    return notes
      .filter((note: Note) => Number.isFinite(note.ms))
      .map((note: Note): VisualizerNote => ({
        time: note.ms,
        x: note.x + 1,
        y: 1 - note.y,
        quantum: note.quantum,
        offgrid: note.offgrid,
      }))
      .sort((a: VisualizerNote, b: VisualizerNote) => a.time - b.time);
  }
}

class AudioPlayer {
  private readonly audio: HTMLAudioElement;

  constructor(audio: HTMLAudioElement) {
    this.audio = audio;
  }

  get currentTimeMs(): number {
    return this.audio.currentTime * 1000;
  }

  get paused(): boolean {
    return this.audio.paused;
  }

  get ended(): boolean {
    return this.audio.ended;
  }
}

class NoteManager {
  private times = new Float64Array(0);
  private xs = new Float64Array(0);
  private ys = new Float64Array(0);
  private quantumFlags = new Uint8Array(0);
  private offgridFlags = new Uint8Array(0);
  private count = 0;

  setNotes(notes: readonly VisualizerNote[]): void {
    this.count = notes.length;
    this.times = new Float64Array(this.count);
    this.xs = new Float64Array(this.count);
    this.ys = new Float64Array(this.count);
    this.quantumFlags = new Uint8Array(this.count);
    this.offgridFlags = new Uint8Array(this.count);

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];

      if (note === undefined) {
        continue;
      }

      this.times[i] = note.time;
      this.xs[i] = note.x;
      this.ys[i] = note.y;
      this.quantumFlags[i] = note.quantum ? 1 : 0;
      this.offgridFlags[i] = note.offgrid ? 1 : 0;
    }
  }

  getVisibleStartIndex(currentTimeMs: number): number {
    return this.lowerBound(currentTimeMs);
  }

  getVisibleEndIndex(currentTimeMs: number): number {
    return this.upperBound(currentTimeMs + APPROACH_TIME);
  }

  getTime(index: number): number {
    return this.times[index] ?? 0;
  }

  getX(index: number): number {
    return this.xs[index] ?? 1;
  }

  getY(index: number): number {
    return this.ys[index] ?? 1;
  }

  isQuantum(index: number): boolean {
    return this.quantumFlags[index] === 1;
  }

  isOffgrid(index: number): boolean {
    return this.offgridFlags[index] === 1;
  }

  private lowerBound(value: number): number {
    let low = 0;
    let high = this.count;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const time = this.times[mid] ?? 0;

      if (time < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  private upperBound(value: number): number {
    let low = 0;
    let high = this.count;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const time = this.times[mid] ?? 0;

      if (time <= value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }
}

class Camera {
  projectScale(z: number): number {
    return CAMERA_FOCAL_LENGTH / (CAMERA_FOCAL_LENGTH - z);
  }

  getZ(progress: number): number {
    return SPAWN_Z + progress * (HIT_Z - SPAWN_Z);
  }
}

class Projection {
  private centerX = 0;
  private centerY = 0;

  resize(width: number, height: number): void {
    this.centerX = width * 0.5;
    this.centerY = height * 0.52;
  }

  get screenCenterX(): number {
    return this.centerX;
  }

  get screenCenterY(): number {
    return this.centerY;
  }

  getWorldX(noteX: number): number {
    return noteX * CELL_SIZE - CELL_SIZE;
  }

  getWorldY(noteY: number): number {
    return noteY * CELL_SIZE - CELL_SIZE;
  }

  getScreenX(noteX: number, scale: number): number {
    return this.centerX + this.getWorldX(noteX) * scale;
  }

  getScreenY(noteY: number, scale: number): number {
    return this.centerY + this.getWorldY(noteY) * scale;
  }
}

export class GameplayRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly audio: HTMLAudioElement;
  private readonly audioPlayer: AudioPlayer;
  private readonly noteManager = new NoteManager();
  private readonly camera = new Camera();
  private readonly projection = new Projection();
  private readonly noteImage: HTMLImageElement;
  private readonly resizeObserver: ResizeObserver;
  private rafId: number | null = null;
  private textureReady = false;
  private quantumDebugEnabled = false;
  private cssWidth = 0;
  private cssHeight = 0;
  private devicePixelRatio = 1;
  private gridSize = CELL_SIZE * GRID_CELLS;
  private difficultyColor: string;

  constructor(options: GameplayRendererOptions) {
    this.canvas = options.canvas;
    this.audio = options.audio;
    this.audioPlayer = new AudioPlayer(options.audio);

    const context = this.canvas.getContext("2d", { alpha: false });

    if (context === null) {
      throw new Error("Canvas2D is not available.");
    }

    this.ctx = context;
    this.noteImage = new Image();
    this.noteImage.crossOrigin = "anonymous";
    this.noteImage.onload = this.handleTextureLoad;
    this.noteImage.onerror = this.handleTextureError;
    this.noteImage.src = options.noteTextureUrl;

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.canvas);
    window.addEventListener("resize", this.handleResize);
    this.audio.addEventListener("play", this.handlePlay);
    this.audio.addEventListener("pause", this.handlePause);
    this.audio.addEventListener("ended", this.handlePause);
    this.audio.addEventListener("seeked", this.handleAudioPositionChange);
    this.audio.addEventListener("timeupdate", this.handleAudioPositionChange);
    this.audio.addEventListener("loadedmetadata", this.handleAudioPositionChange);
    this.difficultyColor = getDifficultyColor(options.difficulty);

    this.resize();
  }

  setDifficulty(difficulty: Difficulty): void {
    this.difficultyColor = getDifficultyColor(difficulty);
    this.drawFrame();
  }

  setNotes(notes: readonly Note[]): void {
    this.noteManager.setNotes(MapParser.normalizeNotes(notes));
    this.drawFrame();
  }

  setQuantumDebugEnabled(enabled: boolean): void {
    this.quantumDebugEnabled = enabled;
    this.drawFrame();
  }

  destroy(): void {
    this.stop();
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.handleResize);
    this.audio.removeEventListener("play", this.handlePlay);
    this.audio.removeEventListener("pause", this.handlePause);
    this.audio.removeEventListener("ended", this.handlePause);
    this.audio.removeEventListener("seeked", this.handleAudioPositionChange);
    this.audio.removeEventListener("timeupdate", this.handleAudioPositionChange);
    this.audio.removeEventListener("loadedmetadata", this.handleAudioPositionChange);
    this.noteImage.onload = null;
    this.noteImage.onerror = null;
  }

  private readonly handleTextureLoad = (): void => {
    this.textureReady = true;
    this.drawFrame();
  };

  private readonly handleTextureError = (): void => {
    this.textureReady = false;
    this.drawFrame();
  };

  private readonly handleResize = (): void => {
    this.resize();
  };

  private readonly handlePlay = (): void => {
    this.start();
  };

  private readonly handlePause = (): void => {
    this.stop();
    this.drawFrame();
  };

  private readonly handleAudioPositionChange = (): void => {
    if (this.audioPlayer.paused || this.audioPlayer.ended) {
      this.drawFrame();
    }
  };

  private readonly handleFrame = (): void => {
    this.rafId = null;
    this.drawFrame();

    if (!this.audioPlayer.paused && !this.audioPlayer.ended) {
      this.start();
    }
  };

  private start(): void {
    if (this.rafId !== null) {
      return;
    }

    this.rafId = requestAnimationFrame(this.handleFrame);
  }

  private stop(): void {
    if (this.rafId === null) {
      return;
    }

    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width));
    const height = Math.max(1, Math.floor(bounds.height));
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);

    if (
      width === this.cssWidth &&
      height === this.cssHeight &&
      ratio === this.devicePixelRatio
    ) {
      this.drawFrame();

      return;
    }

    this.cssWidth = width;
    this.cssHeight = height;
    this.devicePixelRatio = ratio;
    this.canvas.width = Math.floor(width * ratio);
    this.canvas.height = Math.floor(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.projection.resize(width, height);

    this.drawFrame();
  }

  private drawFrame(): void {
    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    this.drawReferenceGrid();
    this.drawNotes(this.audioPlayer.currentTimeMs);
  }

  private drawReferenceGrid(): void {
    this.drawPerspectiveGridLayer(SPAWN_Z, BACK_GRID_ALPHA);
    this.drawPerspectiveConnectors();
    this.drawPerspectiveGridLayer(HIT_Z, 1);
  }

  private drawPerspectiveGridLayer(z: number, alpha: number): void {
    const ctx = this.ctx;
    const scale = this.camera.projectScale(z);
    const cell = CELL_SIZE * scale;
    const size = this.gridSize * scale;
    const left = this.projection.screenCenterX - size * 0.5;
    const top = this.projection.screenCenterY - size * 0.5;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = GRID_FILL_COLOR;
    ctx.fillRect(left, top, size, size);
    ctx.lineWidth = Math.max(1, scale);
    ctx.strokeStyle = z === HIT_Z ? GRID_LINE_COLOR : DEBUG_GRID_COLOR;

    for (let i = 0; i <= GRID_CELLS; i++) {
      const position = i * cell;

      ctx.beginPath();
      ctx.moveTo(left + position, top);
      ctx.lineTo(left + position, top + size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(left, top + position);
      ctx.lineTo(left + size, top + position);
      ctx.stroke();
    }

    if (z === HIT_Z) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.difficultyColor;
      ctx.shadowColor = this.difficultyColor;
      ctx.shadowBlur = 16;
      ctx.strokeRect(left, top, size, size);
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;
  }

  private drawPerspectiveConnectors(): void {
    const ctx = this.ctx;
    const farScale = this.camera.projectScale(SPAWN_Z);
    const nearSize = this.gridSize;
    const farSize = this.gridSize * farScale;
    const centerX = this.projection.screenCenterX;
    const centerY = this.projection.screenCenterY;
    const nearLeft = centerX - nearSize * 0.5;
    const nearTop = centerY - nearSize * 0.5;
    const farLeft = centerX - farSize * 0.5;
    const farTop = centerY - farSize * 0.5;

    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = DEBUG_GRID_COLOR;
    ctx.lineWidth = 1;

    this.drawConnector(nearLeft, nearTop, farLeft, farTop);
    this.drawConnector(nearLeft + nearSize, nearTop, farLeft + farSize, farTop);
    this.drawConnector(nearLeft, nearTop + nearSize, farLeft, farTop + farSize);
    this.drawConnector(
      nearLeft + nearSize,
      nearTop + nearSize,
      farLeft + farSize,
      farTop + farSize
    );

    ctx.globalAlpha = 1;
  }

  private drawConnector(fromX: number, fromY: number, toX: number, toY: number): void {
    const ctx = this.ctx;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  }

  private drawNotes(currentTimeMs: number): void {
    const startIndex = this.noteManager.getVisibleStartIndex(currentTimeMs);
    let noteIndex = this.noteManager.getVisibleEndIndex(currentTimeMs);

    for (noteIndex -= 1; noteIndex >= startIndex; noteIndex--) {
      const time = this.noteManager.getTime(noteIndex);
      const delta = time - currentTimeMs;

      if (delta > APPROACH_TIME || delta < 0) {
        continue;
      }

      const progress = 1 - delta / APPROACH_TIME;
      const z = this.camera.getZ(progress);
      const scale = this.camera.projectScale(z);
      const noteX = this.noteManager.getX(noteIndex);
      const noteY = this.noteManager.getY(noteIndex);
      const screenX = this.projection.getScreenX(noteX, scale);
      const screenY = this.projection.getScreenY(noteY, scale);
      const offgridScale = this.getOffgridScale(noteX, noteY);
      const quantumScale = this.noteManager.isQuantum(noteIndex) ? 0.94 : 1;
      const size = NOTE_SIZE * scale * offgridScale * quantumScale;
      const alpha = FAR_NOTE_ALPHA + (1 - FAR_NOTE_ALPHA) * progress;
      const glow = 2 + (NEAR_GLOW_BLUR - 2) * progress;

      this.ctx.shadowColor = this.difficultyColor;
      this.ctx.shadowBlur = glow;
      this.drawNote(
        screenX - size * 0.5,
        screenY - size * 0.5,
        size,
        alpha,
        this.noteManager.isQuantum(noteIndex),
        this.noteManager.isOffgrid(noteIndex)
      );
    }

    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  private drawNote(
    x: number,
    y: number,
    size: number,
    alpha: number,
    quantum: boolean,
    offgrid: boolean
  ): void {
    const ctx = this.ctx;
    const radius = size * (quantum ? 0.32 : 0.24);

    ctx.globalAlpha = alpha;

    if (this.textureReady) {
      ctx.drawImage(this.noteImage, x, y, size, size);
    } else {
      ctx.fillStyle = NOTE_FALLBACK_COLOR;
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, radius);
      ctx.fill();
    }

    if (this.quantumDebugEnabled && (quantum || offgrid)) {
      ctx.lineWidth = Math.max(1, size * 0.08);
      ctx.strokeStyle = offgrid ? OFFGRID_DEBUG_COLOR : QUANTUM_DEBUG_COLOR;
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, radius);
      ctx.stroke();
    }
  }

  private getOffgridScale(x: number, y: number): number {
    const distance = Math.max(Math.abs(x - 1), Math.abs(y - 1));

    if (distance <= 1) {
      return 1;
    }

    return Math.max(0.34, 1 / (1 + (distance - 1) * 0.42));
  }
}
