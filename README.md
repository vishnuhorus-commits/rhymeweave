# RhymeWeaver — Living Library of Language

Dark teal and gold writing tools with no build step or external JavaScript dependencies.

## One complete sorting path

1. Open `index.html` in Edge or Chrome on Windows, or serve this folder over HTTPS.
2. Choose **Creative Studio → Review Sorter**.
3. Paste text or choose one UTF-8 `.txt` file (up to 25 MB).
4. Press **Clean · Sort A–Z**.
5. Download clean candidates, review, duplicates, source text copy, and the process log before closing.

The sorter keeps at least three words per line, normalizes whitespace and case, removes punctuation, deduplicates within the batch, and sorts A–Z. Apostrophes are removed without splitting contractions; other punctuation separates words. Non-ASCII letters and encoding damage go to review. This is a mechanical filter, not an alliteration or quality judge.

Short, blank, noise, obvious code and duplicate records remain in review with source line numbers and reasons. Sorting leaves the source textarea unchanged. Source-text export preserves loaded text, not original file bytes or encoding. Keep the original file. Previews are capped at 500 records; downloads contain the full batch.

No automatic saving, master merging, folder watching, or cloud connection is implemented. The approved HP master and Google candidate are untouched. Sorting again replaces the current batch in memory; download first.

## Other tools

- Rhyme Finder, A–Z words, phrase chains and writing prompts require a user-supplied JSONL dictionary: one object per line with `word` (or `entry`) and `rhyme_key` (or `rhyme_key_unstressed`). Regular JSON arrays and plain text lists are not supported by that loader.
- Alliteration Lines randomly selects words by first letter, not pronunciation or grammatical quality.
- Image Prompt Forge creates text prompts, not images.
- Text Analyzer counts starting letters and groups dictionary rhyme keys, falling back to spelling suffixes. Suffix matches are not verified rhymes.
- Reference Library, Archive Vault, Universal Search and Meme Studio are planned. Search is disabled.
- `horus-command-center.html` is retained unchanged; its dashboard claims are not verified by this repair.

## Hosted offline shell

The manifest and service worker are wired on HTTPS or localhost. Both PNG icons are included. After a successful online visit, the shell is cached. Installation status does not mean user text or dictionaries are stored. Reloading requires importing data again.

The worker prefers the network, falls back to the cached shell offline, and cleans only caches with the `rhymeweave-` prefix. It does not return HTML for arbitrary missing assets.

Verify GitHub Pages publishes the intended branch and root directory. A branch or commit link opens source code, not the running app. This repair does not enable Pages, merge itself, or prove live deployment.

Local HTML works without a service worker; local-file installation is not promised. For home-screen installation, first use a verified HTTPS deployment with the browser's install or Add to Home Screen option.

## Validation

Run `node tests/core.cjs` with Node for sorting and export-payload checks. These passed during preparation. With Node, Playwright, and its Chromium browser available, run `node tests/smoke.cjs` for browser checks on a local server. That browser run remains unverified: the Chromium download timed out in the preparation environment. Neither test certifies live deployment or testing on a physical HP/iPad.
