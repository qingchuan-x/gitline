import { execFile } from "child_process";
import { dirname } from "path";
import { promisify } from "util";

const execFileP = promisify(execFile);

/** 执行 git 命令，返回 stdout 字符串。失败抛错。 */
export async function runGit(args: string[], cwd: string, maxBuffer = 64 * 1024 * 1024): Promise<string> {
  const { stdout } = await execFileP("git", args, { cwd, maxBuffer, encoding: "utf8" });
  return stdout;
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

/**
 * 根据一个文件的绝对路径向上找 git 仓库根。
 * 以文件所在目录为 cwd 调用 rev-parse，天然支持嵌套仓库 / vault 根即仓库根。
 * 返回绝对路径（已去换行）；不在任何仓库返回 null。
 */
export async function getRepoRoot(absFilePath: string): Promise<string | null> {
  const dir = dirname(absFilePath);
  try {
    const out = await runGit(["rev-parse", "--show-toplevel"], dir);
    const root = out.replace(/\r?\n/g, "").trim();
    return root || null;
  } catch {
    return null;
  }
}