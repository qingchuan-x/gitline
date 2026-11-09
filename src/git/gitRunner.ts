import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * 执行 git 命令，返回 stdout 字符串。失败抛错。
 * 始终使用 execFile + 参数数组：不经过 shell，也不接受用户提供的命令字符串。
 */
export function runGit(args: string[], cwd: string, maxBuffer = 64 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer, encoding: "utf8", shell: false, windowsHide: true },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** 探测 git 是否可用（PATH 中存在 git 且能执行） */
export async function isGitAvailable(cwd: string): Promise<boolean> {
  try {
    await runGit(["--version"], cwd, 1024 * 1024);
    return true;
  } catch {
    return false;
  }
}

interface RepoMeta {
  repoRoot: string;
  gitDir: string;
}

/** 同目录的仓库定位结果缓存，避免每次移动光标都执行 rev-parse */
const repoMetaCache = new Map<string, RepoMeta | null>();

async function resolveRepoMeta(absFilePath: string): Promise<RepoMeta | null> {
  const dir = dirname(absFilePath);
  const cached = repoMetaCache.get(dir);
  if (cached !== undefined) return cached;

  let meta: RepoMeta | null = null;
  try {
    const out = await runGit(["rev-parse", "--show-toplevel", "--absolute-git-dir"], dir);
    const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (lines.length >= 2) meta = { repoRoot: lines[0], gitDir: lines[1] };
  } catch {
    meta = null;
  }
  repoMetaCache.set(dir, meta);
  return meta;
}

/**
 * 根据一个文件的绝对路径向上找 git 仓库根。
 * 以文件所在目录为 cwd 调用 rev-parse，天然支持嵌套仓库 / vault 根即仓库根。
 * 返回绝对路径（已去换行）；不在任何仓库返回 null。
 */
export async function getRepoRoot(absFilePath: string): Promise<string | null> {
  return (await resolveRepoMeta(absFilePath))?.repoRoot ?? null;
}

/**
 * 返回影响 blame 结果的仓库状态指纹。
 * HEAD 覆盖 commit/reset/切分支；index 的大小和 mtime 覆盖 add/unstage 等暂存区变化。
 * 文件本身的 mtime 仍由上层 cache key 单独维护。
 */
export async function getGitStateVersion(absFilePath: string): Promise<string | null> {
  const meta = await resolveRepoMeta(absFilePath);
  if (!meta) return null;

  let head = "unborn";
  try {
    head = (await runGit(["rev-parse", "--verify", "HEAD"], meta.repoRoot)).trim() || "unborn";
  } catch {
    // 尚无首次提交的仓库
  }

  let index = "no-index";
  try {
    const st = statSync(join(meta.gitDir, "index"));
    index = `${st.size}::${st.mtimeMs}`;
  } catch {
    // 尚未 add 的仓库可能还没有 index
  }
  return `${head}::${index}`;
}
