export const enum Difficulty {
  NA = 0,
  Easy = 1,
  Medium = 2,
  Hard = 3,
  Logic = 4,
  Tasukete = 5,
}

export const enum CustomDataType {
  ShortString = 9,   // length: uint16
  LongString = 11,   // length: uint32
}

export const DifficultyColors = {
  [Difficulty.NA]: "#9a9a9a",
  [Difficulty.Easy]: "#5cff72",
  [Difficulty.Medium]: "#ffcc25",
  [Difficulty.Hard]: "#e20000",
  [Difficulty.Logic]: "#ff13c8",
  [Difficulty.Tasukete]: "#ff2ea6",
} as const satisfies Record<Difficulty, string>;

export function getDifficultyName(
  difficulty: Difficulty,
  customName?: string | null
): string {
  if (customName !== undefined && customName !== null) {
    return customName;
  }

  switch (difficulty) {
    case Difficulty.NA:
      return "N/A";
    case Difficulty.Easy:
      return "Easy";
    case Difficulty.Medium:
      return "Medium";
    case Difficulty.Hard:
      return "Hard";
    case Difficulty.Logic:
      return "Logic";
    case Difficulty.Tasukete:
      return "Tasukete";
    default:
      return "N/A";
  }
}

export function getDifficultyColor(difficulty: Difficulty): string {
  switch (difficulty) {
    case Difficulty.NA:
    case Difficulty.Easy:
    case Difficulty.Medium:
    case Difficulty.Hard:
    case Difficulty.Logic:
    case Difficulty.Tasukete:
      return DifficultyColors[difficulty];
    default:
      return DifficultyColors[Difficulty.NA];
  }
}

export const SSPM_SIGNATURE = "SS+m" as const;
export const SSPM_VERSION = 2 as const;

export const HEADER = {
  SIGNATURE_LEN: 4,
  VERSION_LEN: 2,
  RESERVED_1: 4,
  RESERVED_2: 20,
  OFFSET_SECTION: 16,     // customData + audio offset+length = 4x uint64
  COVER_SECTION: 16,      // cover offset+length = 2x uint64
  MARKER_SECTION: 16,     // marker offset+length = 2x uint64
} as const;

export interface Note {
  ms: number;
  x: number;
  y: number;
  quantum: boolean;
  offgrid: boolean;
}

export interface Marker {
  ms: number;
  type: number;
}

export type CustomData = Record<string, string | null>;

export interface SSPMMap {
  version: number;
  mapId: string;
  song: string;
  artist: string;
  difficulty: Difficulty;
  difficultyName: string;
  mapLengthMs: number;
  noteCount: number;
  notes?: readonly Note[];
  markerCount: number;
  mappers: string[];
  customData: CustomData;
  audioBlob: Blob | null;
  coverBlob: Blob | null;
}

export interface IFileParser {
  readonly byteLength: number;
  readonly offset: number;
  seek(offset: number): void;
  skip(length: number): void;
  tell(): number;
  get(length: number): Uint8Array;
  getString(length: number): string;
  getUint8(): number;
  getBool(): boolean;
  getUint16(): number;
  getUint32(): number;
  getUint64(): number;
  getFloat(): number;
}
