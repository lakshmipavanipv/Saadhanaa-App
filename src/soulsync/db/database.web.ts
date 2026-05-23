/**
 * Web stub for the Soulsync SQLite database.
 *
 * expo-sqlite ships a WASM build for web but the WASM asset isn't
 * bundled by default in this project. To unblock browser previews
 * we provide an in-memory shim with the same surface so the rest of
 * the Soulsync code paths don't crash. Native (Android / iOS) uses
 * the real expo-sqlite via database.native.ts.
 */
type Params = readonly any[];

interface FakeDB {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: Params): Promise<void>;
  getFirstAsync<T>(sql: string, ...params: Params): Promise<T | undefined>;
  getAllAsync<T>(sql: string, ...params: Params): Promise<T[]>;
}

const noopDb: FakeDB = {
  async execAsync() {},
  async runAsync() {},
  async getFirstAsync() { return undefined; },
  async getAllAsync<T>() { return [] as T[]; },
};

export const DB_NAME = 'soulsync.db';

export const getDB = async (): Promise<FakeDB> => noopDb;
