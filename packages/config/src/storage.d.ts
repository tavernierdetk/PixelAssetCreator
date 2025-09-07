export declare const ASSET_ROOT: string;
export declare const charDir: (slug: string) => string;
export declare function ensureDir(p: string): Promise<void>;
export declare function writeLiteDef(slug: string, data: unknown): Promise<string>;
export declare function readLiteDef(slug: string): Promise<any>;
