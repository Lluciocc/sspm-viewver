import type { Note } from "./types.js";

export const NOTE_TEXTURE_URL =
  "https://raw.githubusercontent.com/Rhythia/Client/master/textures/squircle_blank.png";

const SCROLL_SPEED_PX_PER_MS = 0.48;
const POST_HIT_VISIBLE_MS = 180;
const MIN_APPROACH_MS = 650;
const MAX_APPROACH_MS = 1450;
const MIN_NOTE_SCALE = 0.18;
const POST_HIT_SCALE_BOOST = 0.28;
const GRID_LINE_COLOR = "rgba(255, 255, 255, 0.18)";
const GRID_FILL_COLOR = "rgba(255, 255, 255, 0.035)";
const HIT_LINE_COLOR = "rgba(255, 46, 166, 0.82)";
const NOTE_FALLBACK_COLOR = "#ffffff";
const NOTE_SHADOW_COLOR = "rgba(255, 46, 166, 0.75)";
const MAX_DEVICE_PIXEL_RATIO = 2;

export interface GameplayRendererOptions {
  canvas: HTMLCanvasElement;
  audio: HTMLAudioElement;
  noteTextureUrl: string;
}

export class GameplayRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly audio: HTMLAudioElement;
  private readonly noteImage: HTMLImageElement;
  private readonly resizeObserver: ResizeObserver;
  private rafId: number | null = null;
  private textureReady = false;
  private cssWidth = 0;
  private cssHeight = 0;
  private devicePixelRatio = 1;
  private gridLeft = 0;
  private gridTop = 0;
  private gridSize = 0;
  private hitLineY = 0;
  private noteSize = 32;
  private approachMs = MAX_APPROACH_MS;
  private noteTimes = new Float64Array(0);
  private noteXs = new Float32Array(0);
  private noteYs = new Float32Array(0);
  private noteCount = 0;

  constructor(options: GameplayRendererOptions) {
    this.canvas = options.canvas;
    this.audio = options.audio;

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

    this.resize();
  }

  setNotes(notes: readonly Note[]): void {
    const sortedNotes = notes
      .filter((note: Note) => Number.isFinite(note.ms))
      .slice()
      .sort((a: Note, b: Note) => a.ms - b.ms);

    this.noteCount = sortedNotes.length;
    this.noteTimes = new Float64Array(this.noteCount);
    this.noteXs = new Float32Array(this.noteCount);
    this.noteYs = new Float32Array(this.noteCount);

    for (let i = 0; i < sortedNotes.length; i++) {
      const note = sortedNotes[i];

      if (note === undefined) {
        continue;
      }

      this.noteTimes[i] = note.ms;
      this.noteXs[i] = Number.isFinite(note.x) ? note.x : 0;
      this.noteYs[i] = Number.isFinite(note.y) ? note.y : 0;
    }

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
    if (this.audio.paused || this.audio.ended) {
      this.drawFrame();
    }
  };

  private readonly handleFrame = (): void => {
    this.rafId = null;
    this.drawFrame();

    if (!this.audio.paused && !this.audio.ended) {
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

    this.gridSize = Math.min(width * 0.72, height * 0.62);
    this.gridLeft = (width - this.gridSize) * 0.5;
    this.gridTop = height * 0.52 - this.gridSize * 0.5;
    this.hitLineY = this.gridTop + this.gridSize * 0.5;
    this.noteSize = Math.max(22, Math.min(42, this.gridSize * 0.12));
    this.approachMs = this.clamp(
      this.gridSize / SCROLL_SPEED_PX_PER_MS,
      MIN_APPROACH_MS,
      MAX_APPROACH_MS
    );

    this.drawFrame();
  }

  private drawFrame(): void {
    const ctx = this.ctx;
    const width = this.cssWidth;
    const height = this.cssHeight;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, width, height);

    this.drawStage();
    this.drawNotes(this.audio.currentTime * 1000);
  }

  private drawStage(): void {
    const ctx = this.ctx;
    const left = this.gridLeft;
    const top = this.gridTop;
    const size = this.gridSize;
    const cellSize = size / 3;

    ctx.fillStyle = GRID_FILL_COLOR;
    ctx.fillRect(left, top, size, size);

    ctx.lineWidth = 1;
    ctx.strokeStyle = GRID_LINE_COLOR;

    for (let i = 0; i <= 3; i++) {
      const position = i * cellSize;

      ctx.beginPath();
      ctx.moveTo(left + position, top);
      ctx.lineTo(left + position, top + size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(left, top + position);
      ctx.lineTo(left + size, top + position);
      ctx.stroke();
    }

    ctx.lineWidth = 3;
    ctx.strokeStyle = HIT_LINE_COLOR;
    ctx.shadowColor = HIT_LINE_COLOR;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(left, this.hitLineY);
    ctx.lineTo(left + size, this.hitLineY);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  private drawNotes(currentTimeMs: number): void {
    const startTimeMs = currentTimeMs - POST_HIT_VISIBLE_MS;
    const endTimeMs = currentTimeMs + this.approachMs;
    let noteIndex = this.findFirstVisibleNote(startTimeMs);

    this.ctx.shadowColor = NOTE_SHADOW_COLOR;
    this.ctx.shadowBlur = 12;

    for (; noteIndex < this.noteCount; noteIndex++) {
      const noteTime = this.noteTimes[noteIndex] ?? 0;

      if (noteTime > endTimeMs) {
        break;
      }

      const timeUntilHitMs = noteTime - currentTimeMs;
      const targetX = this.normalizedXToCanvas(this.noteXs[noteIndex] ?? 0);
      const targetY = this.normalizedYToCanvas(this.noteYs[noteIndex] ?? 0);
      const lateMs = currentTimeMs - noteTime;
      const alpha = lateMs > 0 ? Math.max(0, 1 - lateMs / POST_HIT_VISIBLE_MS) : 1;
      const approachProgress = this.getApproachProgress(timeUntilHitMs);
      const noteScale = this.getNoteScale(approachProgress, lateMs);
      const size = this.noteSize * noteScale;
      const halfSize = size * 0.5;

      this.drawNote(targetX - halfSize, targetY - halfSize, size, alpha);
    }

    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  private drawNote(x: number, y: number, size: number, alpha: number): void {
    const ctx = this.ctx;

    ctx.globalAlpha = alpha;

    if (this.textureReady) {
      ctx.drawImage(this.noteImage, x, y, size, size);

      return;
    }

    ctx.fillStyle = NOTE_FALLBACK_COLOR;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, size * 0.24);
    ctx.fill();
  }

  private findFirstVisibleNote(startTimeMs: number): number {
    let low = 0;
    let high = this.noteCount;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const noteTime = this.noteTimes[mid] ?? 0;

      if (noteTime < startTimeMs) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  private normalizedXToCanvas(x: number): number {
    const normalized = this.clampNormalized(x);

    return this.gridLeft + (normalized + 1) * 0.5 * this.gridSize;
  }

  private normalizedYToCanvas(y: number): number {
    const normalized = this.clampNormalized(y);

    return this.gridTop + (1 - (normalized + 1) * 0.5) * this.gridSize;
  }

  private getApproachProgress(timeUntilHitMs: number): number {
    if (timeUntilHitMs <= 0) {
      return 1;
    }

    return 1 - this.clamp(timeUntilHitMs / this.approachMs, 0, 1);
  }

  private getNoteScale(progress: number, lateMs: number): number {
    if (lateMs > 0) {
      return 1 + POST_HIT_SCALE_BOOST * this.clamp(lateMs / POST_HIT_VISIBLE_MS, 0, 1);
    }

    const easedProgress = 1 - Math.pow(1 - progress, 3);

    return MIN_NOTE_SCALE + (1 - MIN_NOTE_SCALE) * easedProgress;
  }

  private clampNormalized(value: number): number {
    return this.clamp(value, -1, 1);
  }

  private clamp(value: number, min: number, max: number): number {
    if (value < min) {
      return min;
    }

    if (value > max) {
      return max;
    }

    return value;
  }
}
