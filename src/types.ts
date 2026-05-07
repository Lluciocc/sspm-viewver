export const enum Difficulty {
  Easy = 0,
  Medium = 1,
  Hard = 2,
  Logic = 3,
  Tasukete = 4,
}

export const enum CustomDataType {
  ShortString = 9,   // length: uint16
  LongString = 11,   // length: uint32
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
  difficulty: number;
  difficultyName: string;
  mapLengthMs: number;
  noteCount: number;
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
