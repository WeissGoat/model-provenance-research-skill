---
name: model-provenance-research
description: Use when locating or validating missing AI model artifacts from filenames, hashes, local model directories, workflow JSON, PNG metadata, or logs, especially when exact files must be distinguished from renamed or similar substitutes.
---

# Model Provenance Research

Locate model files by evidence, not by name similarity alone. Use the bundled
scripts for deterministic local inspection; use public registries, release
records, and community discussions only within the evidence rules below.

## Workflow

1. Identify the model reference and whether it is active, bypassed, disabled,
   unexecuted, or merely contextual in its source artifact.
2. For JSON, PNG, or logs, extract references before searching:

   ```powershell
   node scripts/extract_model_references.mjs 'C:\path\to\workflow.json'
   node scripts/extract_model_references.mjs 'C:\path\to\generated.png'
   ```

3. Inventory only local directories the user supplied:

   ```powershell
   node scripts/inventory_models.mjs 'C:\path\to\models'
   ```

4. Generate a search ladder from each filename before declaring a no-hit:

   ```powershell
   node scripts/derive_search_queries.mjs 'Long_Model_Name.safetensors'
   ```

   Search the exact basename first, then the stem without extension, normalized
   spaces, semantic title, semantic title plus base-model token, and distinctive
   training fragments. For example, split attached descriptors such as
   `artistlike` into `artist like` and preserve fragments such as `CKRF0.3`,
   `dim64conv16alpha1`, or `ScheduleFree-shift2-SNR5`.
   Also parse detector and utility filenames into likely creator/family,
   purpose, generation, and release tokens. Search combinations such as
   `PitHandDetailer`, `hand detailer`, `Pitpe11 hand`, `v2 v9c`, and
   `ADetailer bbox hand`; do not require every token to appear in one query.
5. Compare exact basenames and SHA256 before considering renamed or fuzzy
   candidates. Safetensors metadata may show model family or base model, but
   does not prove binary identity.
6. Account for registry search limitations. Model-registry query APIs commonly
   search model-card titles but not version names or uploaded filenames. A
   zero-result title query is not a filename search and is not an internet-wide
   no-hit.
7. Use search engines, registry mirrors, and other full-text indexes for
   discovery when official title search misses. Search the semantic title and
   training fragments, inspect the candidate card, and recover its official
   model/version ID. Treat mirror content as an untrusted lead only.
8. Verify the discovered version against an authoritative or immutable file
   record: official version API, release asset, Hugging Face revision, or Git
   LFS pointer. Require the exact uploaded basename plus byte size and full
   SHA256 when available. Prefer a direct version endpoint over a model-card UI.
9. Inspect archive contents when the release asset is a ZIP or other bundle.
   The public asset name may be generic or normalized while the exact requested
   model exists only as an archive member. Record and verify three identities
   separately: release asset name/hash, archive member path, and extracted
   member hash. Do not infer an exact match from the archive title alone.
10. Cross-check a release against locally verified sibling files when names
   indicate a model bundle or the remote basename differs. Multiple sibling
   SHA256 matches in one immutable release provide strong corroboration.
11. If still unresolved, reverse-search the workflow author, model creator,
    adjacent model names, local sidecars, and safetensors metadata. Use Discord
    and other community material only to find aliases, host links, and
    provenance leads. Do not use a message alone to prove file identity.

## Second-Pass Recovery

Run this pass before reporting an unresolved model when exact-name and official
registry title searches fail:

1. Remove the extension, separators, counters, and obvious packaging suffixes;
   retain meaningful version and training tokens separately.
2. Search the semantic purpose plus ecosystem terms, such as `beautiful skin
   LoCon`, `hand detailer ADetailer`, or `bbox foot ADetailer`.
3. Search distinctive creator/family and version-token combinations without
   quoting the full filename.
4. Use search-engine snippets, registry mirrors, SeaArt pages, and community
   links only to recover an official model or version ID.
5. Query the official version endpoint and enumerate every file. If an asset is
   an archive, download it only with authorization, list its members, and look
   for the requested basename inside it.
6. When no identity-grade evidence exists, rank compatible substitutes by
   architecture, detector type (`bbox` versus `segm`), target class, model
   family, publication date, and community usage. Install under an alias only
   with explicit authorization and report that it is not the original binary.

## Discovery Traps

- Do not stop after an exact quoted search. Long training filenames are often
  absent from general search indexes even when the model card is public.
- Do not assume the uploaded filename resembles the model title. A file named
  `Sexy_Detailer.safetensors` may live under a longer descriptive model title.
- Do not assume the downloadable asset name matches the contained model name.
  A release named `handDetailer_v2V9c.zip` may contain the exact requested
  `PitHandDetailer-v2-Test-v9c.pt` member.
- Do not treat registry mirrors as download authorities. Use them to discover
  IDs, then return to the official registry API for filename, size, hash, and
  download URL.
- Do not treat a successful HTTP response as a successful model download.
  Authenticated registries may return login HTML. Check expected size or file
  signature and always verify the authoritative SHA256 before installation.
- Distinguish `no result`, `request failed`, `rate limited`, `login required`,
  and `result not indexed`; these are different evidence states.

## Evidence Classes

| Class | Requirement | Conclusion |
| --- | --- | --- |
| `verified-exact` | Candidate file SHA256 equals the requested or local reference SHA256. | Exact binary identified. |
| `verified-release` | An authoritative or immutable version record exposes the exact requested basename, byte size, and full SHA256. When the basename differs, require corroborating known sibling hashes or equivalent release evidence. | Exact release file identified; verify downloaded bytes before calling it exact locally. |
| `plausible` | Name, metadata, prompts, or community evidence agrees without identity-grade hash proof. | Candidate only, not a faithful replacement. |
| `not-a-substitute` | Similar name or purpose but incompatible hash, base model, version, or architecture. | Exclude from faithful-reproduction recommendations. |
| `unresolved` | No adequate candidate or validation record was found. | State search coverage and the next evidence needed. |

Use `verified-release` before a remote file is downloaded. Promote it to
`verified-exact` only after hashing the downloaded file:

```powershell
Get-FileHash 'C:\path\to\downloaded-model.safetensors' -Algorithm SHA256
```

## Report Format

For each reference, report:

- Dependency state and source artifact location.
- Local matches with full path, size, SHA256, and relevant metadata.
- Public candidates with immutable URLs, revisions, sizes, and SHA256 values.
- Evidence class, verification rationale, exclusions, and unresolved gaps.
- Inaccessible hosts, rate limiting, truncated search coverage, and genuine no-hit
  results as distinct outcomes.

Emit script JSON unchanged when it is useful for follow-up automation. Keep the
written conclusion concise and label confidence accurately.

## Safety Boundaries

- Do not download, move, rename, overwrite, or substitute a model file without
  explicit user authorization.
- Do not search arbitrary local paths that the user has not supplied.
- Do not claim a model is absent from the internet because one registry or
  search engine has no hit.
- Do not expose credentials, tokens, or private source material while reading
  artifacts or community records.
