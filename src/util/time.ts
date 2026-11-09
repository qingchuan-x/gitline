import { moment } from "obsidian";
import type { GitLineSettings } from "../types";

/** 时间格式化，基于 Obsidian 自带的类型化 moment（零额外依赖）。 */
export function formatTime(unixSec: number, settings: GitLineSettings): string {
  try {
    const t = moment.unix(unixSec);
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
    return moment.unix(unixSec).format("YYYY-MM-DD");
  } catch {
    return "";
  }
}
