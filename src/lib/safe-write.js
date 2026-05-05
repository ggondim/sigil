import { copyFile, writeFile, access } from 'node:fs/promises';

const BAK_SUFFIX = '.smara.bak';

// Wraps fs.writeFile with two safety guarantees:
//  - if `path` already exists and a .smara.bak doesn't, copy the original to .bak
//    BEFORE writing — preserves the user's pre-smara content so they can restore
//    by hand if something goes wrong. The .bak is written exactly once per file:
//    later smara init runs see it exists and don't clobber the original snapshot.
//  - if dryRun is true, no filesystem write happens at all; the function returns
//    the planned action so callers can render a preview.
export async function safeWrite(path, content, { dryRun = false } = {}) {
  const existed = await fileExists(path);
  const action = existed ? 'modify' : 'create';
  const bytes = Buffer.byteLength(content, 'utf8');

  if (dryRun) return { path, action, bytes, wrote: false, backedUp: false };

  let backedUp = false;
  if (existed) {
    const bakPath = `${path}${BAK_SUFFIX}`;
    if (!(await fileExists(bakPath))) {
      await copyFile(path, bakPath);
      backedUp = true;
    }
  }

  await writeFile(path, content, 'utf8');
  return { path, action, bytes, wrote: true, backedUp };
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
