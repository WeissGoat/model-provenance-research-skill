import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_EXTENSIONS = new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.onnx', '.gguf']);
const MAX_SAFETENSORS_HEADER_BYTES = 16 * 1024 * 1024;

function comparePath(left, right) {
  return left.localeCompare(right, 'en');
}

export async function walkFiles(root, includeAll = false, relativePath = '') {
  const directory = path.join(root, relativePath);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const childRelativePath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, includeAll, childRelativePath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (includeAll || DEFAULT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(childRelativePath);
    }
  }
  return files.sort(comparePath);
}

export function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function readSafetensorsHeader(filePath) {
  let handle;
  try {
    handle = await open(filePath, 'r');
    const lengthBuffer = Buffer.alloc(8);
    const lengthRead = await handle.read(lengthBuffer, 0, lengthBuffer.length, 0);
    if (lengthRead.bytesRead !== lengthBuffer.length) return { error: 'truncated safetensors header length' };

    const length = lengthBuffer.readBigUInt64LE();
    if (length === 0n) return { error: 'zero-length safetensors header' };
    if (length > BigInt(MAX_SAFETENSORS_HEADER_BYTES)) return { error: 'safetensors header exceeds 16 MiB limit' };

    const headerBuffer = Buffer.alloc(Number(length));
    const headerRead = await handle.read(headerBuffer, 0, headerBuffer.length, 8);
    if (headerRead.bytesRead !== headerBuffer.length) return { error: 'truncated safetensors header' };

    const header = JSON.parse(headerBuffer.toString('utf8'));
    return { metadata: header.__metadata__ ?? {}, header };
  } catch (error) {
    return { error: `unable to parse safetensors header: ${error.message}` };
  } finally {
    await handle?.close();
  }
}

export async function inventory(root, includeAll = false) {
  const resolvedRoot = path.resolve(root);
  const files = await walkFiles(resolvedRoot, includeAll);
  const records = [];
  for (const relativePath of files) {
    const filePath = path.join(resolvedRoot, relativePath);
    const extension = path.extname(filePath).toLowerCase();
    const fileStat = await stat(filePath);
    records.push({
      path: relativePath.split(path.sep).join('/'),
      name: path.basename(filePath),
      bytes: fileStat.size,
      sha256: await sha256(filePath),
      safetensors: extension === '.safetensors' ? await readSafetensorsHeader(filePath) : null,
    });
  }
  return { root: resolvedRoot, files: records };
}

async function runCli(args) {
  const includeAll = args.includes('--include-all');
  const roots = args.filter((argument) => argument !== '--include-all');
  if (roots.length !== 1) throw new Error('Usage: node inventory_models.mjs <directory> [--include-all]');
  const rootStat = await stat(roots[0]);
  if (!rootStat.isDirectory()) throw new Error(`Not a directory: ${roots[0]}`);
  process.stdout.write(`${JSON.stringify(await inventory(roots[0], includeAll), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
