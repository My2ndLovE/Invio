// Database adapter for supporting both local SQLite and Cloudflare D1
// Making the interface async-first to support D1
export interface Database {
    query<T = unknown[]>(sql: string, params?: unknown[]): Promise<T[]>;
    execute(sql: string, params?: unknown[]): Promise<void>;
    close?(): void;
}

// Adapter for Deno SQLite
export class SQLiteAdapter implements Database {
    private db: any;

    constructor(db: any) {
        this.db = db;
    }

    async query<T = unknown[]>(sql: string, params?: unknown[]): Promise<T[]> {
        // Deno SQLite is synchronous, so we wrap it in a promise
        return this.db.query(sql, params) as T[];
    }

    async execute(sql: string, params?: unknown[]): Promise<void> {
        this.db.execute(sql, params);
    }

    close(): void {
        this.db.close();
    }
}

// Adapter for Cloudflare D1
export class D1Adapter implements Database {
    private db: any;

    constructor(db: any) {
        this.db = db;
    }

    async query<T = unknown[]>(sql: string, params?: unknown[]): Promise<T[]> {
        // D1 uses .raw() to return an array of arrays, which matches our existing row mapping
        const result = await this.db.prepare(sql).bind(...(params || [])).raw();
        return result as T[];
    }

    async execute(sql: string, params?: unknown[]): Promise<void> {
        await this.db.prepare(sql).bind(...(params || [])).run();
    }
}
