import type { IFileParser } from "./types.js";
import {
  type SSPMMap,
  type CustomData,
  CustomDataType,
  type Difficulty,
  getDifficultyName,
  SSPM_SIGNATURE,
  SSPM_VERSION,
} from "./types.js";

export class SSPMParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSPMParseError";
  }
}

export class FileParser implements IFileParser {
  private readonly data: DataView;
  private readonly raw: Uint8Array;
  private _offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.raw = new Uint8Array(buffer);
    this.data = new DataView(buffer);
  }

  get byteLength(): number {
    return this.raw.byteLength;
  }

  get offset(): number {
    return this._offset;
  }

  seek(offset: number): void {
    this.assertBounds(offset, 0);
    this._offset = offset;
  }

  skip(length: number): void {
    this.assertBounds(this._offset, length);
    this._offset += length;
  }

  tell(): number {
    return this._offset;
  }

  get(length: number): Uint8Array {
    this.assertBounds(this._offset, length);

    const slice = this.raw.slice(this._offset, this._offset + length);

    this._offset += length;

    return slice;
  }

  getString(length: number): string {
    return new TextDecoder().decode(this.get(length));
  }

  getUint8(): number {
    this.assertBounds(this._offset, 1);

    return this.data.getUint8(this._offset++);
  }

  getBool(): boolean {
    return this.getUint8() !== 0;
  }

  getUint16(): number {
    this.assertBounds(this._offset, 2);

    const value = this.data.getUint16(this._offset, true);

    this._offset += 2;

    return value;
  }

  getUint32(): number {
    this.assertBounds(this._offset, 4);

    const value = this.data.getUint32(this._offset, true);

    this._offset += 4;

    return value;
  }

  getUint64(): number {
    const low = this.getUint32();
    const high = this.getUint32();

    return high * 0x1_0000_0000 + low;
  }

  getFloat(): number {
    this.assertBounds(this._offset, 4);

    const value = this.data.getFloat32(this._offset, true);

    this._offset += 4;

    return value;
  }

  private assertBounds(pos: number, length: number): void {
    if (pos < 0 || pos + length > this.raw.byteLength) {
      throw new SSPMParseError(
        `Out-of-bounds read: tried to read ${length} byte(s) at offset ${pos} (buffer is ${this.raw.byteLength} bytes)`
      );
    }
  }
}

function splitMapName(mapName: string): { artist: string; song: string } {
  const index = mapName.indexOf(" - ");

  if (index === -1) {
    return {
      artist: "",
      song: mapName,
    };
  }

  return {
    artist: mapName.slice(0, index),
    song: mapName.slice(index + 3),
  };
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")} (${ms} ms)`;
}

export function blobToObjectURL(blob: Blob | null): string | null {
  if (!blob) {
    return null;
  }

  return URL.createObjectURL(blob);
}

function parseCustomData(
  parser: FileParser,
  offset: number
): CustomData {
  parser.seek(offset);

  const fieldCount = parser.getUint16();
  const data: CustomData = {};

  for (let i = 0; i < fieldCount; i++) {
    const keyLength = parser.getUint16();
    const key = parser.getString(keyLength);
    const type = parser.getUint8();

    let value: string | null = null;

    if (type === CustomDataType.ShortString) {
      const length = parser.getUint16();
      value = parser.getString(length);
    } else if (type === CustomDataType.LongString) {
      const length = parser.getUint32();
      value = parser.getString(length);
    }

    data[key] = value;
  }

  return data;
}

function parseDifficulty(value: number): Difficulty {
  // Match C# enum casting: keep the numeric byte while typing known values.
  return value as Difficulty;
}

export async function decodeSSPM(file: File): Promise<SSPMMap> {
  const buffer = await file.arrayBuffer();
  const parser = new FileParser(buffer);

  const signature = parser.getString(4);

  if (signature !== SSPM_SIGNATURE) {
    throw new SSPMParseError(
      `Invalid signature: expected "SS+m", got "${signature}"`
    );
  }

  const version = parser.getUint16();

  if (version !== SSPM_VERSION) {
    throw new SSPMParseError(
      `Unsupported SSPM version: ${version} (only v2 is supported)`
    );
  }

  parser.skip(4);
  parser.skip(20);

  const mapLengthMs = parser.getUint32();
  const noteCount = parser.getUint32();
  const markerCount = parser.getUint32();
  const difficulty = parseDifficulty(parser.getUint8());

  parser.skip(2);

  const hasAudio = parser.getBool();
  const hasCover = parser.getBool();

  parser.skip(1);

  const customDataOffset = parser.getUint64();
  const customDataLength = parser.getUint64();

  const audioOffset = parser.getUint64();
  const audioLength = parser.getUint64();

  const coverOffset = parser.getUint64();
  const coverLength = parser.getUint64();

  parser.skip(16);

  const markerOffset = parser.getUint64();

  parser.skip(8);

  const idLength = parser.getUint16();
  const mapId = parser.getString(idLength);

  const mapNameLength = parser.getUint16();
  const mapName = parser.getString(mapNameLength);

  const { artist, song } = splitMapName(mapName);

  const songNameLength = parser.getUint16();

  parser.skip(songNameLength);

  const mapperCount = parser.getUint16();
  const mappers: string[] = [];

  for (let i = 0; i < mapperCount; i++) {
    const length = parser.getUint16();

    mappers.push(parser.getString(length));
  }

  let customData: CustomData = {};

  if (customDataOffset > 0 && customDataLength > 0) {
    validateSectionBounds(
      "custom data",
      customDataOffset,
      customDataLength,
      buffer.byteLength
    );

    customData = parseCustomData(parser, customDataOffset);
  }

  const difficultyName = getDifficultyName(
    difficulty,
    customData["difficulty_name"]
  );

  let audioBlob: Blob | null = null;

  if (hasAudio && audioLength > 0) {
    validateSectionBounds(
      "audio",
      audioOffset,
      audioLength,
      buffer.byteLength
    );

    audioBlob = new Blob([
      buffer.slice(audioOffset, audioOffset + audioLength),
    ]);
  }

  let coverBlob: Blob | null = null;

  if (hasCover && coverLength > 0) {
    validateSectionBounds(
      "cover",
      coverOffset,
      coverLength,
      buffer.byteLength
    );

    coverBlob = new Blob(
      [buffer.slice(coverOffset, coverOffset + coverLength)],
      {
        type: "image/png",
      }
    );
  }

  void markerOffset;

  return {
    version,
    mapId,
    song,
    artist,
    difficulty,
    difficultyName,
    mapLengthMs,
    noteCount,
    markerCount,
    mappers,
    customData,
    audioBlob,
    coverBlob,
  };
}

function validateSectionBounds(
  name: string,
  offset: number,
  length: number,
  fileSize: number
): void {
  if (offset + length > fileSize) {
    throw new SSPMParseError(
      `${name} section [${offset}..${offset + length}) exceeds file size (${fileSize})`
    );
  }
}
