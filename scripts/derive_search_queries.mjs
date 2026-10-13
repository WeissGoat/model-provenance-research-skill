#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MODEL_EXTENSION = /\.(?:safetensors|ckpt|pt|pth|bin|onnx)$/i;
const TRAINING_TOKEN = /^(?:ckrf|noob|illustrious|pony|anima|sdxl|sd1?5|flux|v(?:pred)?\d|e?pred|locon|lora|lokr|loha|lycoris|dim\d|conv\d|alpha\d|schedulefree|shift\d|snr\d|\d{6,})/i;
const ATTACHED_DESCRIPTOR = /^(.*?)(like|style|detailer|slider|enhancer|booster)$/i;

function addQuery(result, seen, kind, value) {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean || seen.has(clean.toLowerCase())) return;
  seen.add(clean.toLowerCase());
  result.push({ kind, value: clean });
}

function splitAttachedDescriptor(value) {
  const match = value.match(ATTACHED_DESCRIPTOR);
  if (!match || !match[1]) return value;
  return `${match[1]} ${match[2]}`;
}

export function deriveSearchQueries(input) {
  const basename = path.basename(input);
  const stem = basename.replace(MODEL_EXTENSION, '');
  const segments = stem.split(/[-_]+/).filter(Boolean);
  const trainingIndex = segments.findIndex((segment) => TRAINING_TOKEN.test(segment));
  const semanticSegments = trainingIndex > 0 ? segments.slice(0, trainingIndex) : segments;
  const trainingSegments = trainingIndex > 0 ? segments.slice(trainingIndex) : [];
  const semanticCompact = semanticSegments.join(' ');
  const semanticSplit = semanticSegments.map(splitAttachedDescriptor).join(' ');
  const normalized = stem.replace(/[-_\\/]+/g, ' ');
  const baseToken = trainingSegments.find((segment) => /^(?:ckrf|noob|illustrious|pony|anima|sdxl|sd1?5|flux)/i.test(segment));
  const scheduleIndex = trainingSegments.findIndex((segment) => /^schedulefree$/i.test(segment));

  const queries = [];
  const seen = new Set();
  addQuery(queries, seen, 'exact-basename', basename);
  addQuery(queries, seen, 'exact-stem', stem);
  addQuery(queries, seen, 'semantic-title', semanticCompact);
  addQuery(queries, seen, 'semantic-title', semanticSplit);
  addQuery(queries, seen, 'normalized-filename', normalized);

  if (baseToken) {
    addQuery(queries, seen, 'semantic-plus-base', `${semanticCompact} ${baseToken}`);
    addQuery(queries, seen, 'semantic-plus-base', `${semanticSplit} ${baseToken}`);
  }

  for (const segment of trainingSegments) {
    if (/^(?:ckrf|dim\d|schedulefree|snr\d)/i.test(segment)) {
      addQuery(queries, seen, 'training-fragment', segment);
    }
  }

  if (scheduleIndex >= 0) {
    addQuery(
      queries,
      seen,
      'training-fragment',
      trainingSegments.slice(scheduleIndex, scheduleIndex + 3).join('-'),
    );
  }

  return { input, basename, stem, queries };
}

async function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    console.error('Usage: node derive_search_queries.mjs <model-file> [model-file ...]');
    process.exitCode = 1;
    return;
  }
  const results = inputs.map(deriveSearchQueries);
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
