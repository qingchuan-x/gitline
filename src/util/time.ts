import type { GitLineSettings } from "../types";

/** 取 Obsidian 全局 moment；非浏览器环境返回 null */
function moment(): any {
  const w = typeof window !== "undefined" ? window : null;
  return w && (w as any).moment;
}

/**
 * 时间格式化，基于 Obsidian 自带的全局 moment（零额外依赖）。
 * 若 moment 不可用 / 非浏览器环境则回退为 unix 秒。
 */
export function formatTime(unixSec: number, settings: GitLineSettings): string {
  try {
    const m = moment();
    if (!m || typeof m.unix !== "function") return String(unixSec);
    const t = m.unix(unixSec);
    if (settings.timeStyle === "absolute") {
      return t.format(settings.absoluteFormat || "YYYY-MM-DD HH:mm");
    }
    return t.fromNow();
  } catch {
    return String(unixSec);
  }
}

/** 日期占位符 {date}：固定 YYYY-MM-DD，与时间样式无关 */
export function formatDate(unixSec: number): string {
  if (!unixSec) return "";
  try {
    const m = moment();
    if (!m || typeof m.unix !== "function") return "";
    return m.unix(unixSec).format("YYYY-MM-DD");
  } catch {
    return "";
  }
}