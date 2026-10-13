import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractArtifact,
  extractReferencesFromJson,
  extractReferencesFromText,
  extractPngText,
} from './extract_model_references.mjs';

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, typeBuffer, data, Buffer.alloc(4)]);
}

function pngWithText(text) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk('tEXt', Buffer.from(`prompt\0${text}`, 'utf8'))]);
}

test('extracts model references from nested JSON strings', () => {
  const result = extractReferencesFromJson({
    nodes: [{ inputs: { model: 'models/portrait.safetensors', vae: 'vae/model.ckpt' } }],
  });

  assert.deepEqual(result.map((item) => item.name), ['model.ckpt', 'portrait.safetensors']);
  assert.equal(result[0].location, '$.nodes[0].inputs.vae');
  assert.equal(result[1].context, 'models/portrait.safetensors');
});

test('extracts text references with line locations and removes duplicates', () => {
  const result = extractReferencesFromText('load detector.pt\nload detector.pt\nuse adapters/detail.safetensors');

  assert.deepEqual(result.map((item) => item.name), ['detail.safetensors', 'detector.pt']);
  assert.equal(result[1].location, '$:1');
});

test('extracts model references from PNG text chunks', () => {
  const result = extractPngText(pngWithText('adapter.safetensors'));

  assert.deepEqual(result, ['adapter.safetensors']);
});

test('classifies JSON, text, and PNG artifacts', async () => {
  const jsonResult = await extractArtifact({ path: 'workflow.json', data: Buffer.from('{"model":"x.safetensors"}') });
  const textResult = await extractArtifact({ path: 'run.log', data: Buffer.from('y.pth') });
  const pngResult = await extractArtifact({ path: 'output.png', data: pngWithText('z.onnx') });

  assert.equal(jsonResult.kind, 'json');
  assert.equal(textResult.kind, 'text');
  assert.equal(pngResult.kind, 'png');
  assert.equal(jsonResult.references[0].name, 'x.safetensors');
  assert.equal(textResult.references[0].name, 'y.pth');
  assert.equal(pngResult.references[0].name, 'z.onnx');
});
