import type { BlameResult } from "../types";

interface CacheEntry {
  /** null = 已缓存"无结果"（负缓存，避免重复跑 git） */
  result: BlameResult | null;
  lastUsed: number;
}

/**
 * 简单 LRU。key = 绝对路径 + mtime + blame 选项（保存后 / 切换选项后自动失效）。
 * get 返回 undefined 表示未命中，null 表示命中"无结果"。
 */
export class BlameCache {
  private map = new Map<string, CacheEntry>();
  constructor(private maxFiles: number) {}

  keyFor(absFilePath: string, mtimeMs: number, ignoreWhitespace: boolean): string {
    return `${absFilePath}::${mtimeMs}::${ignoreWhitespace ? "w" : "n"}`;
  }

  get(key: string): BlameResult | null | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    e.lastUsed = Date.now();
    // 刷新最近使用
    this.map.delete(key);
    this.map.set(key, e);
    return e.result;
  }

  set(key: string, result: BlameResult | null): void {
    this.map.delete(key);
    this.map.set(key, { result, lastUsed: Date.now() });
    this.evict();
  }

  resize(maxFiles: number): void {
    this.maxFiles = maxFiles;
    this.evict();
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  private evict(): void {
    while (this.map.size > this.maxFiles) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.map) {
        if (v.lastUsed < oldestTime) {
          oldestTime = v.lastUsed;
          oldestKey = k;
        }
      }
      if (oldestKey === null) break;
      this.map.delete(oldestKey);
    }
  }
}