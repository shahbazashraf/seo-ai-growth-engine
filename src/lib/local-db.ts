import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_API_BASE_URL?.split('/functions/v1')[0] || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[local-db] Supabase configuration is missing or incomplete.', {
    hasUrl: !!SUPABASE_URL,
    hasKey: !!SUPABASE_ANON_KEY,
    apiUrl: import.meta.env.VITE_API_BASE_URL
  });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DB_NAME = 'seo-growth-engine-db';
const DB_VERSION = 7;

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
  seo_actions: { key: string; value: any; indexes: { 'by-createdAt': string, 'by-status': string } };
  performance_snapshots: { key: string; value: any; indexes: { 'by-createdAt': string, 'by-projectId': string } };
  indexationRecords: { key: string; value: any; indexes: { 'by-lastChecked': string, 'by-contentId': string } };
  rankingSnapshots: { key: string; value: any; indexes: { 'by-snapshotDate': string, 'by-contentId': string } };
  outreachRecords: { key: string; value: any; indexes: { 'by-createdAt': string, 'by-status': string, 'by-contentId': string } };
  runLogs: { key: string; value: any; indexes: { 'by-runAt': string } };
  distributionCampaigns: { key: string; value: any; indexes: { 'by-createdAt': string, 'by-status': string, 'by-contentId': string } };
  distributionCampaignTargets: { key: string; value: any; indexes: { 'by-createdAt': string, 'by-status': string, 'by-campaignId': string, 'by-scheduledFor': string } };
}

const STORE_NAMES = [
  'audits',
  'projects',
  'keywords',
  'articles',
  'generated_content',
  'automation_settings',
  'backlinks',
  'backlink_opportunities',
  'sites',
  'platform_credentials',
  'distribution_logs',
  'content_lab',
  'seo_actions',
  'performance_snapshots',
  'indexationRecords',
  'rankingSnapshots',
  'outreachRecords',
  'runLogs',
  'distributionCampaigns',
  'distributionCampaignTargets',
] as const;

type StoreNames = typeof STORE_NAMES[number];

let dbPromise: Promise<IDBPDatabase<LocalDBSchema>> | null = null;
let remotePausedUntil = 0;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<LocalDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        STORE_NAMES.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName as StoreNames, { keyPath: 'id' });
            // Add common index
            if (storeName === 'platform_credentials') {
              (store as any).createIndex('by-connectedAt', 'connectedAt');
            } else if (storeName === 'indexationRecords') {
              (store as any).createIndex('by-lastChecked', 'lastChecked');
            } else if (storeName === 'rankingSnapshots') {
              (store as any).createIndex('by-snapshotDate', 'snapshotDate');
            } else if (storeName === 'runLogs') {
              (store as any).createIndex('by-runAt', 'runAt');
            } else if (storeName === 'distributionCampaignTargets') {
              (store as any).createIndex('by-scheduledFor', 'scheduledFor');
            } else {
              (store as any).createIndex('by-createdAt', 'createdAt');
            }

            // Add specific indexes
            if (storeName === 'keywords' || storeName === 'articles' || storeName === 'performance_snapshots') {
              (store as any).createIndex('by-projectId', 'projectId');
            }
            if (storeName === 'indexationRecords' || storeName === 'rankingSnapshots') {
              (store as any).createIndex('by-contentId', 'contentId');
            }
            if (storeName === 'outreachRecords') {
              (store as any).createIndex('by-contentId', 'contentId');
            }
            if (storeName === 'distributionCampaigns') {
              (store as any).createIndex('by-contentId', 'contentId');
            }
            if (storeName === 'distributionCampaignTargets') {
              (store as any).createIndex('by-campaignId', 'campaignId');
            }
            if (storeName === 'distribution_logs' || storeName === 'content_lab' || storeName === 'seo_actions') {
              (store as any).createIndex('by-status', 'status');
            }
            if (storeName === 'outreachRecords') {
              (store as any).createIndex('by-status', 'status');
            }
            if (storeName === 'distributionCampaigns' || storeName === 'distributionCampaignTargets') {
              (store as any).createIndex('by-status', 'status');
            }
            if (storeName === 'backlinks') {
              (store as any).createIndex('by-siteUrl', 'siteUrl');
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

class Table<T extends Record<string, any>> {
  constructor(private name: StoreNames) {}

  private get currentUserId() {
    // Note: We use supabase.auth.getSession() or user from context.
    // Since this is a static lib, we'll try to get it from the client session.
    return null; // Will be handled inside methods to ensure freshness
  }

  private async getCurrentUser() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
  }

  private async withTimeout<R>(promise: Promise<R>, timeoutMs: number = 15000): Promise<R> {
    return Promise.race([
      promise,
      new Promise<R>((_, reject) => setTimeout(() => reject(new Error(`Database operation timed out after ${timeoutMs / 1000}s`)), timeoutMs))
    ]);
  }

  private async shouldTryRemote() {
    const user = await this.getCurrentUser();
    return Boolean(user) && Date.now() > remotePausedUntil;
  }

  private pauseRemoteAfterFailure() {
    remotePausedUntil = Date.now() + 60_000;
  }

  private async createRemote(record: T): Promise<T> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Authentication required for remote operations');

    console.log(`[localDB] createRemote starting for ${this.name}...`);
    try {
      const { data, error } = await this.withTimeout(
        Promise.resolve(supabase.from(this.name).upsert({ ...record, user_id: user.id }).select().single())
      );
      if (error) throw error;
      console.log(`[localDB] createRemote finished successfully for ${this.name}`);
      return data as unknown as T;
    } catch (err) {
      console.error(`[localDB] createRemote FAILED for ${this.name}`, err);
      throw err;
    }
  }

  private async updateRemote(id: string, data: Partial<T>): Promise<T> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Authentication required for remote operations');

    console.log(`[localDB] updateRemote starting for ${this.name}/${id}...`);
    try {
      const { data: updated, error } = await this.withTimeout(
        Promise.resolve(supabase.from(this.name).update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id).select().single())
      );
      if (error) throw error;
      console.log(`[localDB] updateRemote finished successfully for ${this.name}`);
      return updated as unknown as T;
    } catch (err) {
      console.error(`[localDB] updateRemote FAILED for ${this.name}`, err);
      throw err;
    }
  }

  private async getRemote(id: string): Promise<T | null> {
    const user = await this.getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase.from(this.name).select('*').eq('id', id).eq('user_id', user.id).single();
    if (error || !data) return null;
    return data as unknown as T;
  }

  private async deleteRemote(id: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) return;
    await supabase.from(this.name).delete().eq('id', id).eq('user_id', user.id);
  }

  private async listRemote(options?: {
    where?: Partial<T>;
    orderBy?: { [K in keyof T]?: 'asc' | 'desc' };
    limit?: number;
    select?: Array<keyof T>;
  }): Promise<T[]> {
    const user = await this.getCurrentUser();
    if (!user) return [];

    let query = supabase.from(this.name).select(options?.select ? options.select.join(',') : '*').eq('user_id', user.id);

    if (options?.where) {
      for (const [key, value] of Object.entries(options.where)) {
        query = query.eq(key, value);
      }
    }

    if (options?.orderBy) {
      const field = Object.keys(options.orderBy)[0];
      const dir = options.orderBy[field as keyof T] === 'desc';
      query = query.order(field, { ascending: !dir });
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as unknown as T[];
  }


  async create(data: Partial<T>): Promise<T> {
    const now = new Date().toISOString();
    const currentUserId = this.currentUserId;
    const raw = data as Record<string, any>;
    const record = {
      ...raw,
      id: raw.id || uuidv4(),
      userId: raw.userId || currentUserId || null,
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now,
    } as unknown as T;

    console.log(`[localDB] Creating record in ${this.name}`, { 
      id: record.id, 
      isRemote: !!currentUserId 
    });

    const isRemote = await this.shouldTryRemote();
    if (isRemote) {
      try {
        return await this.createRemote(record);
      } catch (err) {
        this.pauseRemoteAfterFailure();
        console.warn(`[localDB] Falling back to IndexedDB for create in ${this.name} after remote failure/timeout`, err);
      }
    }

    const db = await getDb();
    await db.put(this.name, record);
    return record;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const isRemote = await this.shouldTryRemote();
    if (isRemote) {
      try {
        return await this.updateRemote(id, data);
      } catch (err) {
        this.pauseRemoteAfterFailure();
        console.warn(`[localDB] Falling back to IndexedDB for update in ${this.name} after remote failure/timeout`, err);
      }
    }

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
    const isRemote = await this.shouldTryRemote();
    if (isRemote) {
      return this.getRemote(id);
    }

    const db = await getDb();
    const record = await db.get(this.name, id);
    return record ?? null;
  }

  async delete(id: string): Promise<void> {
    const isRemote = await this.shouldTryRemote();
    if (isRemote) {
      return this.deleteRemote(id);
    }

    const db = await getDb();
    await db.delete(this.name, id);
  }

  async list(options?: {
    where?: Partial<T>;
    orderBy?: { [K in keyof T]?: 'asc' | 'desc' };
    limit?: number;
    select?: Array<keyof T>;
  }): Promise<T[]> {
    const isRemote = await this.shouldTryRemote();
    if (isRemote) {
      return this.listRemote(options);
    }

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
  table: <T extends Record<string, any>>(name: string) => {
    return new Table<T>(name as StoreNames);
  }
};
