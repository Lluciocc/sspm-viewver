import "./style.css";
import { decodeSSPM, SSPMParseError, formatMs, blobToObjectURL } from "./parser.js";
import { getDifficultyColor, getDifficultyName, type SSPMMap } from "./types.js";

const dropzone = document.getElementById("dropzone") as HTMLDivElement;
const coverImg = document.getElementById("cover") as HTMLImageElement;
const songEl = document.getElementById("song") as HTMLElement;
const artistEl = document.getElementById("artist") as HTMLElement;
const versionEl = document.getElementById("version") as HTMLElement;
const diffEl = document.getElementById("difficulty") as HTMLElement;
const diffNameEl = document.getElementById("difficulty_name") as HTMLElement;
const lengthEl = document.getElementById("length") as HTMLElement;
const notesEl = document.getElementById("notes") as HTMLElement;
const mappersEl = document.getElementById("mappers") as HTMLElement;
const audioEl = document.getElementById("audio") as HTMLAudioElement;
const jsonEl = document.getElementById("json") as HTMLPreElement;
const toast = document.getElementById("toast") as HTMLDivElement;

let activeObjectURLs: string[] = [];

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

function renderMap(map: SSPMMap): void {
  revokeActiveURLs();

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
    coverImg.style.visibility = "visible";
  } else {
    coverImg.removeAttribute("src");
    coverImg.style.visibility = "hidden";
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

async function loadMap(file: File): Promise<void> {
  try {
    const map = await decodeSSPM(file);
    renderMap(map);
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

dropzone.addEventListener("dragover", (e: DragEvent) => {
  e.preventDefault();
  dropzone.classList.add("drag-over");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("drag-over");
});

dropzone.addEventListener("drop", async (e: DragEvent) => {
  e.preventDefault();

  dropzone.classList.remove("drag-over");

  const file = e.dataTransfer?.files[0];

  if (file) {
    await loadMap(file);
  }
});
