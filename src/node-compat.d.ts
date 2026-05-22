declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  pid: number;
  stdin: AsyncIterable<Buffer | string>;
};

declare const console: {
  log(value?: unknown, ...optionalParams: unknown[]): void;
  error(value?: unknown, ...optionalParams: unknown[]): void;
};

declare class Buffer extends Uint8Array {
  static concat(chunks: readonly Buffer[]): Buffer;
  static from(value: string | ArrayBuffer | ArrayBufferView): Buffer;
  static isBuffer(value: unknown): value is Buffer;
  toString(encoding?: string): string;
}

declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(value: string | Uint8Array): {
      digest(encoding: 'hex' | 'base64'): string;
    };
  };
  export function randomUUID(): string;
}

declare module 'node:fs' {
  export function chmodSync(path: string, mode: number): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function renameSync(oldPath: string, newPath: string): void;
  export function rmSync(path: string, options?: { force?: boolean; recursive?: boolean }): void;
  export function statSync(path: string): { isDirectory(): boolean };
  export function writeFileSync(path: string, data: string, encoding?: 'utf8'): void;
}

declare module 'node:path' {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
}

declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): {
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): { changes: number };
    };
  }
}
