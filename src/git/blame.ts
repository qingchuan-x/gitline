import type { BlameLine, BlameResult } from "../types";
import { getRepoRoot, runGit } from "./gitRunner";
import { relative, sep } from "path";

export interface BlameOptions {
  ignoreWhitespace: boolean;
}

const UNCOMMITTED_SHA = /^0+$/;

/**
 * 对单个文件执行 git blame --porcelain，返回 行号(1-based) -> BlameLine。
 * 文件不在仓库 / git 报错 → null。
 */
export async function blameFile(absFilePath: string, opts: BlameOptions): Promise<BlameResult | null> {
  const repoRoot = await getRepoRoot(absFilePath);
  if (!repoRoot) return null;

  const rel = relative(repoRoot, absFilePath).split(sep).join("/");
  const args = ["blame", "--porcelain", "--encoding=UTF-8"];
  if (opts.ignoreWhitespace) args.push("-w");
  args.push("--", rel);

  let out: string;
  try {
    out = await runGit(args, repoRoot);
  } catch {
    return null;
  }
  return parsePorcelain(out);
}

/**
 * 解析 porcelain 输出。
 * 注意 porcelain 稀疏格式：同一 commit 的每组只有首行 header 带元数据 + numLines，
 * 后续行是「续行 header」（只有 sha/orig/final，无元数据），续行归属当前组。
 */
export function parsePorcelain(output: string): BlameResult {
  const result: BlameResult = new Map<number, BlameLine>();
  const lines = output.split("\n");
  const n = lines.length;
  let i = 0;
  let current: BlameLine | null = null;

  while (i < n) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    // 内容行：归属已在 header 阶段按 numLines/续行分配完毕，这里仅跳过
    if (line.startsWith("\t")) { i++; continue; }

    const parts = line.split(/\s+/);
    if (parts.length < 3) { i++; continue; }
    const sha = parts[0];
    const finalLine = parseInt(parts[2], 10);
    if (isNaN(finalLine) || finalLine < 1) { i++; continue; }
    let numLines = parts.length >= 4 ? parseInt(parts[3], 10) : 1;
    if (isNaN(numLines) || numLines < 1) numLines = 1;

    // 读取元数据；若下一行直接是内容行（无元数据）→ 这是续行 header
    i++;
    let author = "";
    let authorTime = 0;
    let summary = "";
    let fileName = "";
    let hasMeta = false;
    while (i < n && !lines[i].startsWith("\t")) {
      const meta = lines[i];
      hasMeta = true;
      if (meta.startsWith("author ")) author = meta.slice(7);
      else if (meta.startsWith("author-time ")) authorTime = parseInt(meta.slice(12), 10) || 0;
      else if (meta.startsWith("summary ")) summary = meta.slice(8);
      else if (meta.startsWith("filename ")) fileName = meta.slice(9);
      i++;
    }

    if (hasMeta) {
      current = {
        sha,
        author,
        time: authorTime,
        message: summary,
        fileName,
        uncommitted: UNCOMMITTED_SHA.test(sha),
      };
      // numLines 个连续行同属本组（后续续行 header 会再次命中，覆盖为同一对象）
      for (let k = 0; k < numLines; k++) result.set(finalLine + k, current);
    } else if (current) {
      // 续行 header：归属当前组
      result.set(finalLine, current);
    }

    // 消费本 header 对应的 1 个内容行
    if (i < n && lines[i].startsWith("\t")) i++;
  }

  return result;
}