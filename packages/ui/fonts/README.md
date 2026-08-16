# Fonts

**Playfair Display** — the display face, used by all three apps for headings.

## Why it is committed rather than fetched

`next/font/google` downloads font files from `fonts.googleapis.com` **at build
time**. That makes every build depend on an external service being reachable,
and on 2026-08-15 it stopped being reachable from GitHub's runners — two
consecutive CI runs failed with `Module not found: Can't resolve
'@vercel/turbopack-next/internal/font/google/font'` after twelve
`Error while requesting resource` warnings. The same failure had already
appeared once on a developer machine.

A build that needs the network to succeed is a build that fails for reasons
having nothing to do with the code, at times nobody chooses. Committing the file
makes the build deterministic and offline-capable, and it is what Next's own
documentation recommends when reliability matters.

## What this file is

| | |
|---|---|
| File | `playfair-display-latin.woff2` |
| Source | Google Fonts, Playfair Display v40 |
| Subset | latin only — the apps request `subsets: ['latin']` |
| Weights | **700–900 in one file.** Playfair Display is a *variable* font, so a single file covers every weight the apps use rather than one file per weight |
| Size | 38 KB |

## Licence

Playfair Display is licensed under the **SIL Open Font License 1.1**, which
permits bundling and redistribution with software. See `OFL.txt`.

## Updating it

Fetch the CSS with a browser user-agent (Google serves `woff2` only to modern
UAs), take the URL from the `/* latin */` block, and replace the file:

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -A "$UA" "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&display=swap"
```

Check the first four bytes are `wOF2` before committing — a blocked or
rate-limited request returns an HTML error page with a `.woff2` filename, which
fails much later and less obviously.
