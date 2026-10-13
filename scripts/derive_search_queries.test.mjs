import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveSearchQueries } from './derive_search_queries.mjs';

function values(input) {
  return deriveSearchQueries(input).queries.map((query) => query.value);
}

test('derives semantic and training-fragment queries from long training filenames', () => {
  const queries = values('style/nyalialike-CKRF0.3-V1.02-locon-dim64conv16alpha1-ScheduleFree-shift2-SNR5-000023.safetensors');

  assert.ok(queries.includes('nyalia like'));
  assert.ok(queries.includes('nyalialike CKRF0.3'));
  assert.ok(queries.includes('nyalia like CKRF0.3'));
  assert.ok(queries.includes('dim64conv16alpha1'));
  assert.ok(queries.includes('ScheduleFree-shift2-SNR5'));
});

test('normalizes separator-based descriptive filenames', () => {
  const queries = values('Sexy_Detailer.safetensors');

  assert.ok(queries.includes('Sexy_Detailer.safetensors'));
  assert.ok(queries.includes('Sexy Detailer'));
});

test('deduplicates case-insensitive query variants', () => {
  const result = deriveSearchQueries('detailer-detailer.safetensors');
  const lowered = result.queries.map((query) => query.value.toLowerCase());

  assert.equal(new Set(lowered).size, lowered.length);
});
