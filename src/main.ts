// @ts-ignore
// should ignore the import error
import "./style.css";
import { decodeSSPM, SSPMParseError, formatMs, blobToObjectURL } from "./parser.js";
import { GameplayRenderer, NOTE_TEXTURE_URL } from "./renderer.js";
import { Difficulty, getDifficultyColor, getDifficultyName, type SSPMMap } from "./types.js";
import type { Note } from "./types.js";

const dropzone = document.getElementById("dropzone") as HTMLDivElement;
const coverImg = document.getElementById("cover") as HTMLImageElement;
const coverPreviewDialog = document.getElementById("cover_preview_dialog") as HTMLDialogElement;
const coverPreviewImg = document.getElementById("cover_preview") as HTMLImageElement;
const coverPreviewCloseButton = document.getElementById("cover_preview_close") as HTMLButtonElement;
const songEl = document.getElementById("song") as HTMLElement;
const artistEl = document.getElementById("artist") as HTMLElement;
const versionEl = document.getElementById("version") as HTMLElement;
const diffEl = document.getElementById("difficulty") as HTMLElement;
const diffNameEl = document.getElementById("difficulty_name") as HTMLElement;
const lengthEl = document.getElementById("length") as HTMLElement;
const notesEl = document.getElementById("notes") as HTMLElement;
const mappersEl = document.getElementById("mappers") as HTMLElement;
const audioEl = document.getElementById("audio") as HTMLAudioElement;
const gameplayCanvas = document.getElementById("gameplay") as HTMLCanvasElement;
const gameplaySettingsDialog = document.getElementById("gameplay_settings") as HTMLDialogElement;
const gameplaySettingsButton = document.getElementById("gameplay_settings_button") as HTMLButtonElement;
const gameplaySettingsCloseButton = document.getElementById("gameplay_settings_close") as HTMLButtonElement;
const autoCursorToggle = document.getElementById("auto_cursor") as HTMLInputElement;
const noteSpeedSlider = document.getElementById("note_speed") as HTMLInputElement;
const noteSpeedValue = document.getElementById("note_speed_value") as HTMLOutputElement;
const noteDepthSlider = document.getElementById("note_depth") as HTMLInputElement;
const noteDepthValue = document.getElementById("note_depth_value") as HTMLOutputElement;
const jsonEl = document.getElementById("json") as HTMLPreElement;
const downloadAllBtn = document.getElementById("download_all") as HTMLButtonElement;
const toast = document.getElementById("toast") as HTMLDivElement;

let activeObjectURLs: string[] = [];
let currentMap: SSPMMap | null = null;
let gameplaySettingsCloseTimer: ReturnType<typeof setTimeout> | null = null;
let coverPreviewCloseTimer: ReturnType<typeof setTimeout> | null = null;

const textEncoder = new TextEncoder();
const emptyNotes: readonly Note[] = [];
const GAMEPLAY_SETTINGS_ANIMATION_MS = 180;
const COVER_PREVIEW_ANIMATION_MS = 180;
const desktopCoverPreviewQuery = window.matchMedia(
  "(min-width: 721px) and (hover: hover) and (pointer: fine)"
);
const gameplayRenderer = new GameplayRenderer({
  canvas: gameplayCanvas,
  audio: audioEl,
  noteTextureUrl: NOTE_TEXTURE_URL,
  difficulty: Difficulty.NA,
});

gameplayRenderer.setAutoCursorEnabled(autoCursorToggle.checked);
syncGameplaySettings();

interface ZipSourceEntry {
  name: string;
  data: Uint8Array;
}

interface CompressedZipData {
  method: 0 | 8;
  data: Uint8Array;
}

interface ZipEntryRecord {
  nameBytes: Uint8Array;
  data: Uint8Array;
  compressedData: Uint8Array;
  compressionMethod: 0 | 8;
  crc32: number;
  localHeaderOffset: number;
  modifiedTime: number;
  modifiedDate: number;
}

function revokeActiveURLs(): void {
  for (const url of activeObjectURLs) {
    URL.revokeObjectURL(url);
  }

  activeObjectURLs = [];
}

function trackURL(url: string | null): string | null {
  if (url) {
    activeObjectURLs.push(url);
  }

  return url;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showError(message: string): void {
  toast.textContent = message;
  toast.classList.add("show");

  if (toastTimer !== null) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

function getSliderValue(slider: HTMLInputElement): number {
  const value = Number(slider.value);

  return Number.isFinite(value) ? value : 1;
}

function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}x`;
}

function syncNoteSpeedSetting(): void {
  const noteSpeed = getSliderValue(noteSpeedSlider);

  noteSpeedValue.value = formatMultiplier(noteSpeed);
  gameplayRenderer.setNoteSpeed(noteSpeed);
}

function syncNoteDepthSetting(): void {
  const noteDepth = getSliderValue(noteDepthSlider);

  noteDepthValue.value = formatMultiplier(noteDepth);
  gameplayRenderer.setNoteDepth(noteDepth);
}

function syncGameplaySettings(): void {
  syncNoteSpeedSetting();
  syncNoteDepthSetting();
}

function openGameplaySettings(): void {
  if (gameplaySettingsCloseTimer !== null) {
    clearTimeout(gameplaySettingsCloseTimer);
    gameplaySettingsCloseTimer = null;
  }

  gameplaySettingsDialog.classList.remove("is-closing");

  if (gameplaySettingsDialog.open) {
    return;
  }

  if (typeof gameplaySettingsDialog.showModal === "function") {
    gameplaySettingsDialog.showModal();
  } else {
    gameplaySettingsDialog.setAttribute("open", "");
  }
}

function finishGameplaySettingsClose(): void {
  gameplaySettingsDialog.classList.remove("is-closing");
  gameplaySettingsCloseTimer = null;

  if (typeof gameplaySettingsDialog.close === "function") {
    gameplaySettingsDialog.close();
  } else {
    gameplaySettingsDialog.removeAttribute("open");
  }
}

function closeGameplaySettings(): void {
  if (!gameplaySettingsDialog.open || gameplaySettingsCloseTimer !== null) {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishGameplaySettingsClose();

    return;
  }

  gameplaySettingsDialog.classList.add("is-closing");
  gameplaySettingsCloseTimer = setTimeout(
    finishGameplaySettingsClose,
    GAMEPLAY_SETTINGS_ANIMATION_MS
  );
}

function hasVisibleCover(): boolean {
  return coverImg.currentSrc !== "" || coverImg.src !== "";
}

function openCoverPreview(): void {
  if (!desktopCoverPreviewQuery.matches || !hasVisibleCover()) {
    return;
  }

  if (coverPreviewCloseTimer !== null) {
    clearTimeout(coverPreviewCloseTimer);
    coverPreviewCloseTimer = null;
  }

  coverPreviewDialog.classList.remove("is-closing");
  coverPreviewImg.src = coverImg.currentSrc || coverImg.src;
  coverPreviewImg.alt = coverImg.alt || "Cover preview";

  if (coverPreviewDialog.open) {
    return;
  }

  if (typeof coverPreviewDialog.showModal === "function") {
    coverPreviewDialog.showModal();
  } else {
    coverPreviewDialog.setAttribute("open", "");
  }
}

function finishCoverPreviewClose(): void {
  coverPreviewDialog.classList.remove("is-closing");
  coverPreviewCloseTimer = null;

  if (typeof coverPreviewDialog.close === "function") {
    coverPreviewDialog.close();
  } else {
    coverPreviewDialog.removeAttribute("open");
  }
}

function closeCoverPreview(): void {
  if (!coverPreviewDialog.open || coverPreviewCloseTimer !== null) {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishCoverPreviewClose();

    return;
  }

  coverPreviewDialog.classList.add("is-closing");
  coverPreviewCloseTimer = setTimeout(
    finishCoverPreviewClose,
    COVER_PREVIEW_ANIMATION_MS
  );
}

function getParsedNotes(map: SSPMMap): readonly Note[] {
  return map.notes ?? emptyNotes;
}

function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "sspm-map";
}

function getZipFileName(map: SSPMMap): string {
  const song = sanitizeFileName(map.song || map.mapId || "unknown-song");
  const artist = sanitizeFileName(map.artist || "unknown-artist");

  return `sspm_viewver_${song}_${artist}.zip`;
}

function createExportData(map: SSPMMap): Record<string, unknown> {
  return {
    version: map.version,
    mapId: map.mapId,
    song: map.song,
    artist: map.artist,
    difficulty: map.difficulty,
    difficultyName: map.difficultyName,
    mapLengthMs: map.mapLengthMs,
    noteCount: map.noteCount,
    markerCount: map.markerCount,
    mappers: map.mappers,
    notes: map.notes ?? [],
    customData: map.customData,
    hasAudio: map.audioBlob !== null,
    hasCover: map.coverBlob !== null,
  };
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let i = 0; i < table.length; i++) {
    let value = i;

    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) !== 0
        ? 0xedb88320 ^ (value >>> 1)
        : value >>> 1;
    }

    table[i] = value >>> 0;
  }

  return table;
}

const crc32Table = createCrc32Table();

function getCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = (crc >>> 8) ^ (crc32Table[(crc ^ byte) & 0xff] ?? 0);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function bytesToArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength);

  new Uint8Array(buffer).set(data);

  return buffer;
}

function getDosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(date.getFullYear(), 1980);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);

  return {
    date: dosDate,
    time: dosTime,
  };
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

function writeBytes(target: Uint8Array, offset: number, source: Uint8Array): void {
  target.set(source, offset);
}

function createLocalFileHeader(entry: ZipEntryRecord): Uint8Array {
  const header = new Uint8Array(30 + entry.nameBytes.byteLength);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, entry.compressionMethod, true);
  view.setUint16(10, entry.modifiedTime, true);
  view.setUint16(12, entry.modifiedDate, true);
  view.setUint32(14, entry.crc32, true);
  view.setUint32(18, entry.compressedData.byteLength, true);
  view.setUint32(22, entry.data.byteLength, true);
  view.setUint16(26, entry.nameBytes.byteLength, true);
  view.setUint16(28, 0, true);
  writeBytes(header, 30, entry.nameBytes);

  return header;
}

function createCentralDirectoryHeader(entry: ZipEntryRecord): Uint8Array {
  const header = new Uint8Array(46 + entry.nameBytes.byteLength);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, entry.compressionMethod, true);
  view.setUint16(12, entry.modifiedTime, true);
  view.setUint16(14, entry.modifiedDate, true);
  view.setUint32(16, entry.crc32, true);
  view.setUint32(20, entry.compressedData.byteLength, true);
  view.setUint32(24, entry.data.byteLength, true);
  view.setUint16(28, entry.nameBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.localHeaderOffset, true);
  writeBytes(header, 46, entry.nameBytes);

  return header;
}

function createEndOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number
): Uint8Array {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return header;
}

async function compressZipEntryData(data: Uint8Array): Promise<CompressedZipData> {
  if (!("CompressionStream" in globalThis)) {
    return {
      method: 0,
      data,
    };
  }

  try {
    const compressedStream = new Blob([bytesToArrayBuffer(data)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    const compressedData = new Uint8Array(
      await new Response(compressedStream).arrayBuffer()
    );

    return {
      method: 8,
      data: compressedData,
    };
  } catch {
    return {
      method: 0,
      data,
    };
  }
}

async function createZipBlob(entries: ZipSourceEntry[]): Promise<Blob> {
  const fileParts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  const records: ZipEntryRecord[] = [];
  const modified = getDosDateTime(new Date());
  let offset = 0;

  for (const sourceEntry of entries) {
    const compressed = await compressZipEntryData(sourceEntry.data);
    const record: ZipEntryRecord = {
      nameBytes: textEncoder.encode(sourceEntry.name),
      data: sourceEntry.data,
      compressedData: compressed.data,
      compressionMethod: compressed.method,
      crc32: getCrc32(sourceEntry.data),
      localHeaderOffset: offset,
      modifiedTime: modified.time,
      modifiedDate: modified.date,
    };
    const localFileHeader = createLocalFileHeader(record);

    fileParts.push(localFileHeader, record.compressedData);
    records.push(record);
    offset += localFileHeader.byteLength + record.compressedData.byteLength;
  }

  const centralDirectoryOffset = offset;

  for (const record of records) {
    const centralDirectoryHeader = createCentralDirectoryHeader(record);

    centralDirectoryParts.push(centralDirectoryHeader);
    offset += centralDirectoryHeader.byteLength;
  }

  const centralDirectory = concatBytes(centralDirectoryParts);
  const endOfCentralDirectory = createEndOfCentralDirectory(
    records.length,
    centralDirectory.byteLength,
    centralDirectoryOffset
  );

  const zipBytes = concatBytes([
    concatBytes(fileParts),
    centralDirectory,
    endOfCentralDirectory,
  ]);

  return new Blob([bytesToArrayBuffer(zipBytes)], { type: "application/zip" });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.style.display = "none";

  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

async function downloadMapAssets(map: SSPMMap): Promise<void> {
  const entries: ZipSourceEntry[] = [
    {
      name: "data.json",
      data: textEncoder.encode(JSON.stringify(createExportData(map), null, 2)),
    },
  ];

  if (map.coverBlob !== null) {
    entries.push({
      name: "cover.png",
      data: new Uint8Array(await map.coverBlob.arrayBuffer()),
    });
  }

  if (map.audioBlob !== null){
    entries.push({
      name : "audio.wav",
      data: new Uint8Array(await map.audioBlob.arrayBuffer()),
    });
  }

  const zipBlob = await createZipBlob(entries);

  downloadBlob(zipBlob, getZipFileName(map));

  if (map.coverBlob === null) {
    showError("No cover found; ZIP contains JSON only.");
  }
}

function renderMap(map: SSPMMap): void {
  revokeActiveURLs();
  currentMap = map;
  downloadAllBtn.disabled = false;
  gameplayRenderer.setNotes(getParsedNotes(map));
  gameplayRenderer.setDifficulty(map.difficulty);

  songEl.textContent = map.song || "(untitled)";
  artistEl.textContent = map.artist;
  versionEl.textContent = String(map.version);
  diffEl.textContent = getDifficultyName(map.difficulty);
  diffNameEl.textContent = map.difficultyName;

  const difficultyColor = getDifficultyColor(map.difficulty);

  diffEl.style.setProperty("--difficulty-color", difficultyColor);

  lengthEl.textContent = formatMs(map.mapLengthMs);
  notesEl.textContent = String(map.noteCount);
  mappersEl.textContent = map.mappers.join(", ") || "—";
  jsonEl.textContent = JSON.stringify(map.customData, null, 2);

  const coverURL = trackURL(blobToObjectURL(map.coverBlob));

  if (coverURL) {
    coverImg.src = coverURL;
    coverImg.alt = `${map.song || "Map"} cover`;
    coverImg.tabIndex = 0;
    coverImg.setAttribute("role", "button");
    coverImg.setAttribute("aria-label", "Open cover preview");
    coverPreviewImg.src = coverURL;
    coverPreviewImg.alt = coverImg.alt;
    coverImg.style.visibility = "visible";
  } else {
    coverImg.removeAttribute("src");
    coverImg.removeAttribute("alt");
    coverImg.removeAttribute("role");
    coverImg.removeAttribute("aria-label");
    coverImg.tabIndex = -1;
    coverPreviewImg.removeAttribute("src");
    coverPreviewImg.removeAttribute("alt");
    coverImg.style.visibility = "hidden";
    closeCoverPreview();
  }

  const audioURL = trackURL(blobToObjectURL(map.audioBlob));

  if (audioURL) {
    audioEl.src = audioURL;
    audioEl.style.display = "block";
  } else {
    audioEl.removeAttribute("src");
    audioEl.style.display = "none";
  }
}

downloadAllBtn.addEventListener("click", () => {
  if (currentMap === null) {
    showError("Load a map before downloading.");

    return;
  }

  downloadAllBtn.disabled = true;
  downloadAllBtn.textContent = "Preparing...";

  downloadMapAssets(currentMap)
    .catch((err: unknown) => {
      if (err instanceof Error) {
        showError(err.message);
      } else {
        showError("Unable to create ZIP.");
      }
    })
    .finally(() => {
      downloadAllBtn.disabled = false;
      downloadAllBtn.textContent = "Download ZIP";
    });
});

autoCursorToggle.addEventListener("change", () => {
  gameplayRenderer.setAutoCursorEnabled(autoCursorToggle.checked);
});

noteSpeedSlider.addEventListener("input", syncNoteSpeedSetting);
noteDepthSlider.addEventListener("input", syncNoteDepthSetting);

gameplaySettingsButton.addEventListener("click", () => {
  openGameplaySettings();
});

gameplaySettingsCloseButton.addEventListener("click", () => {
  closeGameplaySettings();
});

gameplaySettingsDialog.addEventListener("click", (event: MouseEvent) => {
  if (event.target === gameplaySettingsDialog) {
    closeGameplaySettings();
  }
});

gameplaySettingsDialog.addEventListener("cancel", (event: Event) => {
  event.preventDefault();
  closeGameplaySettings();
});

gameplaySettingsDialog.addEventListener("close", () => {
  if (gameplaySettingsCloseTimer !== null) {
    clearTimeout(gameplaySettingsCloseTimer);
    gameplaySettingsCloseTimer = null;
  }

  gameplaySettingsDialog.classList.remove("is-closing");
});

coverImg.addEventListener("click", () => {
  openCoverPreview();
});

coverImg.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openCoverPreview();
  }
});

coverPreviewCloseButton.addEventListener("click", () => {
  closeCoverPreview();
});

coverPreviewDialog.addEventListener("click", (event: MouseEvent) => {
  if (event.target === coverPreviewDialog) {
    closeCoverPreview();
  }
});

coverPreviewDialog.addEventListener("cancel", (event: Event) => {
  event.preventDefault();
  closeCoverPreview();
});

coverPreviewDialog.addEventListener("close", () => {
  if (coverPreviewCloseTimer !== null) {
    clearTimeout(coverPreviewCloseTimer);
    coverPreviewCloseTimer = null;
  }

  coverPreviewDialog.classList.remove("is-closing");
});

desktopCoverPreviewQuery.addEventListener("change", () => {
  if (!desktopCoverPreviewQuery.matches) {
    closeCoverPreview();
  }
});

async function playLoadedAudio(): Promise<void> {
  try {
    audioEl.currentTime = 0;
    await audioEl.play();
  } catch {
    showError("Autoplay was blocked. Press play to start the gameplay.");
  }
}

async function loadMap(file: File): Promise<void> {
  try {
    const map = await decodeSSPM(file);

    renderMap(map);

    if (map.audioBlob !== null) {
      await playLoadedAudio();
    }
  } catch (err) {
    if (err instanceof SSPMParseError) {
      showError(`Parse error: ${err.message}`);
    } else if (err instanceof Error) {
      showError(err.message);
    } else {
      showError("An unknown error occurred.");
    }

    console.error(err);
  }
}

dropzone.addEventListener("click", () => {
  const input = document.createElement("input");

  input.type = "file";
  input.accept = ".sspm";

  input.onchange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];

    if (file) {
      await loadMap(file);
    }
  };

  input.click();
});

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

dropzone.addEventListener("dragover", () => {
  dropzone.classList.add("drag-over");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("drag-over");
});

dropzone.addEventListener("drop", async (e: DragEvent) => {
  dropzone.classList.remove("drag-over");

  const files = e.dataTransfer?.files;

  if (!files || files.length === 0) {
    showError("No file dropped.");

    return;
  }

  const file = files.item(0);

  if (!file) {
    showError("No file dropped.");

    return;
  }

  console.log("Dropped file:", file);

  await loadMap(file);
});
