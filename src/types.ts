/** 一行 Git 归属信息 */
export interface BlameLine {
  sha: string;
  author: string;
  /** unix 秒 */
  time: number;
  message: string;
  uncommitted: boolean;
  fileName: string;
}

/** key = 行号(1-based) -> BlameLine */
export type BlameResult = Map<number, BlameLine>;

export interface GitLineSettings {
  /** 设置结构版本号，用于自动迁移 */
  settingsVersion: number;
  /** 总开关 */
  enabled: boolean;
  /** 显示格式模板：支持 {date} {time} {author} {message} {hash} */
  format: string;
  /** 相对时间 / 绝对时间 */
  timeStyle: "relative" | "absolute";
  /** moment 格式串 */
  absoluteFormat: string;
  /** 未提交行显示「未提交」 */
  showUncommitted: boolean;
  /** 映射 git blame -w */
  ignoreWhitespace: boolean;
  /** 状态栏显示当前行提交人 */
  showStatusBar: boolean;
  /** LRU 缓存文件数上限 */
  cacheMaxFiles: number;
}