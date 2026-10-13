import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inventory, readSafetensorsHeader } from './inventory_models.mjs';

async function makeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'model-inventory-'));
  const nested = path.join(root, 'nested');
  await mkdir(nested);

  const header = Buffer.from(JSON.stringify({
    __metadata__: { ss_base_model_version: 'sdxl_base_v1-0' },
    'lora_unet.test': { dtype: 'F16', shape: [1], data_offsets: [0, 2] },
  }));
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(header.length));
  const modelPath = path.join(root, 'sample.safetensors');
  await writeFile(modelPath, Buffer.concat([length, header, Buffer.from([0, 0])]));
  await writeFile(path.join(nested, 'detector.pth'), 'detector');
  await writeFile(path.join(root, 'notes.txt'), 'not a model');
  return { root, modelPath };
}

test('reads safetensors metadata without loading tensor data', async () => {
  const { root, modelPath } = await makeFixture();
  try {
    const header = await readSafetensorsHeader(modelPath);
    assert.equal(header.metadata.ss_base_model_version, 'sdxl_base_v1-0');
    assert.equal(header.header['lora_unet.test'].dtype, 'F16');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('inventories model extensions with SHA256 and deterministic order', async () => {
  const { root, modelPath } = await makeFixture();
  try {
    const result = await inventory(root);
    assert.deepEqual(result.files.map((file) => file.path), ['nested/detector.pth', 'sample.safetensors']);
    assert.equal(result.files[1].sha256, createHash('sha256').update(await (await import('node:fs/promises')).readFile(modelPath)).digest('hex'));
    assert.equal(result.files[1].safetensors.metadata.ss_base_model_version, 'sdxl_base_v1-0');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('includes non-model files only when requested', async () => {
  const { root } = await makeFixture();
  try {
    const result = await inventory(root, true);
    const notes = result.files.find((file) => file.path === 'notes.txt');
    assert.ok(notes);
    assert.equal(notes.safetensors, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
