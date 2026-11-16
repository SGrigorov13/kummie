/**
 * File storage adapter. First implementation: disk under the cPanel account, served by Apache with
 * long cache headers; object storage only if disk or IO limits bite (ARCHITECTURE §10).
 * Product images only — never artist photos, logos or album art in our own assets.
 */

export type StoredFile = {
  key: string;
  contentType: string;
  sizeBytes: number;
  publicUrl: string;
};

export interface StorageAdapter {
  readonly name: string;
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredFile>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}
