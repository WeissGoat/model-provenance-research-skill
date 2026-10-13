import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const MODEL_FILE_PATTERN = /(?:^|[\s"'(<\[{,])((?:(?:[^\\/\s"'<>]+[\\/])*)[^\\/\s"'<>]+\.(?:safetensors|ckpt|pt|pth|bin|onnx|gguf))(?=$|[\s"',;)\]}>])/gi;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function compareReferences(left, right) {
  return left.name.localeCompare(right.name, 'en') || left.location.localeCompare(right.location, 'en');
}

function deduplicate(references) {
  const seen = new Set();
  return references
    .filter((reference) => {
      const key = reference.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareReferences);
}

function referenceFromMatch(match, location) {
  const context = match.replace(/^[\s"'(<\[{,]+/, '');
  const normalized = path.win32.basename(context.replaceAll('/', '\\'));
  return { name: normalized, location, context };
}

export function extractReferencesFromText(text, location = '$') {
  const references = [];
  for (const [index, line] of String(text).split(/\r?\n/).entries()) {
    MODEL_FILE_PATTERN.lastIndex = 0;
    let match;
    while ((match = MODEL_FILE_PATTERN.exec(line)) !== null) {
      references.push(referenceFromMatch(match[1], `${location}:${index + 1}`));
    }
  }
  return deduplicate(references);
}

export function extractReferencesFromJson(value, location = '$') {
  const references = [];
  const visit = (item, currentLocation) => {
    if (typeof item === 'string') {
      references.push(...extractReferencesFromText(item, currentLocation).map((reference) => ({
        ...reference,
        location: currentLocation,
      })));
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${currentLocation}[${index}]`));
      return;
    }
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        visit(child, `${currentLocation}.${key}`);
      }
    }
  };
  visit(value, location);
  return deduplicate(references);
}

function readNullTerminated(buffer, start) {
  const end = buffer.indexOf(0, start);
  if (end === -1) return null;
  return { value: buffer.subarray(start, end).toString('utf8'), next: end + 1 };
}

function parsePngTextChunk(type, data) {
  const keyword = readNullTerminated(data, 0);
  if (!keyword) return null;
  if (type === 'tEXt') return data.subarray(keyword.next).toString('utf8');
  if (type === 'zTXt') {
    if (keyword.next >= data.length) return null;
    return inflateSync(data.subarray(keyword.next + 1)).toString('utf8');
  }
  if (type === 'iTXt') {
    if (keyword.next + 2 > data.length) return null;
    const compressed = data[keyword.next] === 1;
    let cursor = keyword.next + 2;
    const language = readNullTerminated(data, cursor);
    if (!language) return null;
    cursor = language.next;
    const translated = readNullTerminated(data, cursor);
    if (!translated) return null;
    const text = data.subarray(translated.next);
    return (compressed ? inflateSync(text) : text).toString('utf8');
  }
  return null;
}

export function extractPngText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG file');
  }

  const texts = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      try {
        const text = parsePngTextChunk(type, buffer.subarray(dataStart, dataEnd));
        if (text) texts.push(text);
      } catch {
        // Keep scanning metadata when one compressed chunk is malformed.
      }
    }
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
  return texts;
}

function extractPngReferences(buffer) {
  const references = [];
  for (const [index, text] of extractPngText(buffer).entries()) {
    try {
      references.push(...extractReferencesFromJson(JSON.parse(text), `$.pngText[${index}]`));
    } catch {
      references.push(...extractReferencesFromText(text, `$.pngText[${index}]`));
    }
  }
  return deduplicate(references);
}

export async function extractArtifact(input) {
  const artifact = typeof input === 'string'
    ? { path: input, data: await readFile(input) }
    : input;
  const extension = path.extname(artifact.path).toLowerCase();
  if (extension === '.png') {
    return { path: artifact.path, kind: 'png', references: extractPngReferences(artifact.data) };
  }

  const text = artifact.data.toString('utf8');
  if (extension === '.json') {
    try {
      return { path: artifact.path, kind: 'json', references: extractReferencesFromJson(JSON.parse(text)) };
    } catch {
      return { path: artifact.path, kind: 'json', references: extractReferencesFromText(text) };
    }
  }
  return { path: artifact.path, kind: 'text', references: extractReferencesFromText(text) };
}

async function runCli(paths) {
  if (paths.length === 0) throw new Error('Usage: node extract_model_references.mjs <artifact-path> [...artifact-paths]');
  const artifacts = [];
  const errors = [];
  for (const artifactPath of paths) {
    try {
      artifacts.push(await extractArtifact(artifactPath));
    } catch (error) {
      errors.push({ path: artifactPath, error: error.message });
      console.error(`${artifactPath}: ${error.message}`);
    }
  }
  if (artifacts.length === 0) {
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify({ artifacts, errors }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
