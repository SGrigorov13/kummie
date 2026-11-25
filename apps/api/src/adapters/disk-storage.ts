import { mkdir, readFile, rm, writeFile, rename } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { StorageAdapter, StoredFile } from "./storage";

/** Keys are lower-case paths such as `products/<uuid>/<uuid>-960.webp` — nothing else is stored or served. */
const KEY = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\.(avif|webp)$/;

export function isStorageKey(key: string): boolean {
  return KEY.test(key) && key.length <= 200;
}

/**
 * Files on the hosting account's disk (ARCHITECTURE §10). In production the folder lies outside
 * the deployed app, so a new release never deletes photos, and JetBackup covers it.
 */
export class DiskStorage implements StorageAdapter {
  readonly name = "disk";
  private readonly root: string;

  constructor(
    root: string,
    private readonly baseUrl: string,
  ) {
    this.root = resolve(root);
  }

  private pathOf(key: string): string {
    if (!isStorageKey(key)) throw new Error(`Invalid storage key: ${key}`);
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return path;
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<StoredFile> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    // Write next to the target and rename, so a half-written file is never served.
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, body);
    await rename(temp, path);
    return { key, contentType, sizeBytes: body.byteLength, publicUrl: this.publicUrl(key) };
  }

  async get(key: string): Promise<Uint8Array | null> {
    if (!isStorageKey(key)) return null;
    try {
      return new Uint8Array(await readFile(this.pathOf(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  publicUrl(key: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}/${key}`;
  }
}

/** Keeps files in memory (tests). */
export class MemoryStorage implements StorageAdapter {
  readonly name = "memory";
  readonly files = new Map<string, Uint8Array>();
  constructor(private readonly baseUrl = "http://media.test") {}
  async put(key: string, body: Uint8Array, contentType: string): Promise<StoredFile> {
    if (!isStorageKey(key)) throw new Error(`Invalid storage key: ${key}`);
    this.files.set(key, body);
    return { key, contentType, sizeBytes: body.byteLength, publicUrl: this.publicUrl(key) };
  }
  async get(key: string): Promise<Uint8Array | null> {
    return this.files.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }
  publicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}
