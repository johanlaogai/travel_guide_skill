import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeFileAtomic(filePath, data, options = {}) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, data, options);
  await fs.rename(tmp, filePath);
}

export async function writeJsonAtomic(filePath, value) {
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeTextAtomic(filePath, value) {
  await writeFileAtomic(filePath, value, 'utf8');
}

export async function replaceDirAtomic(targetDir, populate) {
  const parent = path.dirname(targetDir);
  await ensureDir(parent);
  const base = path.basename(targetDir);
  const tmp = path.join(parent, `.${base}.${process.pid}.${Date.now()}.tmp`);
  const backup = path.join(parent, `.${base}.${process.pid}.${Date.now()}.bak`);
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(tmp, { recursive: true });
  try {
    await populate(tmp);
  } catch (error) {
    await fs.rm(tmp, { recursive: true, force: true });
    throw error;
  }
  let moved = false;
  try {
    await fs.rename(targetDir, backup);
    moved = true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      await fs.rm(tmp, { recursive: true, force: true });
      throw error;
    }
  }
  try {
    await fs.rename(tmp, targetDir);
  } catch (error) {
    if (moved) await fs.rename(backup, targetDir).catch(() => {});
    await fs.rm(tmp, { recursive: true, force: true });
    throw error;
  }
  if (moved) await fs.rm(backup, { recursive: true, force: true });
}

export async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 解析失败：${filePath}\n${error.message}`);
  }
}

export async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
