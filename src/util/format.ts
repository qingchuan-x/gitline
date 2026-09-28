import type { BlameLine, GitLineSettings } from "../types";
import { formatDate, formatTime } from "./time";

/** 按设置模板渲染一行 blame 文案；返回空串表示不渲染 */
export function formatBlame(info: BlameLine, settings: GitLineSettings): string {
  if (info.uncommitted) {
    return settings.showUncommitted ? "未提交" : "";
  }
  const t = info.time ? formatTime(info.time, settings) : "";
  const d = info.time ? formatDate(info.time) : "";
  let s = settings.format
    .replace(/\{date\}/g, d)
    .replace(/\{time\}/g, t)
    .replace(/\{author\}/g, info.author || "")
    .replace(/\{hash\}/g, info.sha.slice(0, 7))
    .replace(/\{message\}/g, info.message || "");
  // 合并空白并去首尾，避免模板留白产生多余空格
  s = s.replace(/\s+/g, " ").trim();
  return s;
}