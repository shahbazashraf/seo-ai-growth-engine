import { openDB, DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'seo-growth-engine-db';
const DB_VERSION = 1;

interface LocalDBSchema extends DBSchema {
  audits: { key: string; value: any; indexes: { 'by-createdAt': string } };
  projects: { key: string; value: any; indexes: { 'by-createdAt': string } };
  keywords: { key: string; value: any; indexes: { 'by-createdAt': string, 'by-projectId': string } };
  articles: { key: string; value: any; indexes: { 'by-createdAt': string, 'by-projectId': string } };
  generated_content: { key: string; value: any; indexes: { 'by-createdAt': string } };
  automation_settings: { key: string; value: any; indexes: { 'by-createdAt': string } };
  backlinks: { key: string; value: any; indexes: { 'by-createdAt': string, 'by-siteUrl': string } };
  backlink_opportunities: { key: string; value: any; indexes: { 'by-createdAt': string } };
  sites: { key: string; value: any; indexes: { 'by-createdAt': string } };
  platform_credentials: { key: string; value: any; indexes: { 'by-connectedAt': string } };
  distribution_logs: { key: string; value: any; indexes: { 'by-createdAt': string, 'by-status': string } };
  content_lab: { key: string; value: any; indexes: { 'by-createdAt': string, 'by-status': string } };
}

type StoreNames = keyof LocalDBSchema;

let dbPromise: Promise<IDBPDatabase<LocalDBSchema>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<LocalDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const stores: Array<StoreNames> = [
          'audits', 'projects', 'keywords', 'articles', 'generated_content',
          'automation_settings', 'backlinks', 'backlink_opportunities', 'sites',
          'platform_credentials', 'distribution_logs', 'content_lab'
        ];

        stores.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            // Add common index
            if (storeName === 'platform_credentials') {
              store.createIndex('by-connectedAt', 'connectedAt');
            } else {
              store.createIndex('by-createdAt', 'createdAt');
            }

            // Add specific indexes
            if (storeName === 'keywords' || storeName === 'articles') {
              store.createIndex('by-projectId', 'projectId');
            }
            if (storeName === 'distribution_logs' || storeName === 'content_lab') {
              store.createIndex('by-status', 'status');
            }
            if (storeName === 'backlinks') {
              store.createIndex('by-siteUrl', 'siteUrl');
            }
          }
        });
      },
    });
  }
  return dbPromise;
}

export function uuidv4() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0,
          v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
}

class Table<T extends { id: string; [key: string]: any }> {
  constructor(private name: StoreNames) {}

  async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & Partial<T>): Promise<T> {
    const db = await getDb();
    const now = new Date().toISOString();
    const record = {
      ...data,
      id: data.id || uuidv4(),
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    } as T;
    
    await db.put(this.name, record);
    return record;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const db = await getDb();
    const existing = await db.get(this.name, id);
    if (!existing) throw new Error(`Record with id ${id} not found in ${this.name}`);
    
    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    } as T;
    
    await db.put(this.name, updated);
    return updated;
  }

  async get(id: string): Promise<T | null> {
    const db = await getDb();
    const record = await db.get(this.name, id);
    return record ?? null;
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(this.name, id);
  }

  async list(options?: {
    where?: Partial<T>;
    orderBy?: { [K in keyof T]?: 'asc' | 'desc' };
    limit?: number;
    select?: Array<keyof T>;
  }): Promise<T[]> {
    const db = await getDb();
    let records = await db.getAll(this.name);

    if (options?.where) {
      records = records.filter(record => {
        for (const [key, value] of Object.entries(options.where!)) {
          if (record[key] !== value) return false;
        }
        return true;
      });
    }

    if (options?.orderBy) {
      const field = Object.keys(options.orderBy)[0] as keyof T;
      const dir = options.orderBy[field] === 'desc' ? -1 : 1;
      records.sort((a, b) => {
        if (a[field] < b[field]) return -1 * dir;
        if (a[field] > b[field]) return 1 * dir;
        return 0;
      });
    }

    if (options?.limit && options.limit > 0) {
      records = records.slice(0, options.limit);
    }

    if (options?.select) {
      records = records.map(record => {
        const picked: any = {};
        options.select!.forEach(k => picked[k] = record[k]);
        return picked as T;
      });
    }

    return records;
  }

  async count(options?: { where?: Partial<T> }): Promise<number> {
    const records = await this.list({ where: options?.where });
    return records.length;
  }
}

export const localDB = {
  table: <T extends { id: string; [key: string]: any }>(name: string) => {
    return new Table<T>(name as StoreNames);
  }
};
