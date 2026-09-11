# MtbScope Phase 1 audit

**Date:** 2026-09-11  
**Scope:** read-only review of https://github.com/Harsh4873/genes and the live site https://harsh.bet/genes (MtbScope / H37Rv gene tools).  
**Not in this PR:** product fixes. This file is the audit report.

Method: source review of every URL builder and search/literature path; HEAD/GET probes of live third-party URLs (2026-09-11); catalog queries against `public/data/genes.json`; GitHub Actions run history; live Pages HTML/asset sizes. The Selection Lab ciphertext was not decrypted. No unpublished Ioerger Lab results are reported here.

---

## Executive summary

The catalog search and gene pages are fast once `genes.json` is in memory. The main user-facing failures are elsewhere:

1. **AlphaFold links do not land on a structure.** MtbScope emits an ORF text-search URL. The TB Genome Portal emits a UniProt accession entry URL. That is why people fall back to the portal.
2. **GeneLookup cannot take a gene plus an extra term** (`Rv0001 rifampin`, `essential`, etc.) and does not search papers with that extra term.
3. **Literature exists only on GeneLookup**, is Europe PMC only, is ranked by citation count, and the UI throws away PMID / PMCID / DOI even though the client already parsed them.
4. **Portal enrichment is 59 days old** and the Monday freshness workflow will not re-scrape gene pages unless the protein-table HTML bytes change.

P0 is AlphaFold (and the missing UniProt accession that makes a correct AlphaFold URL impossible). Everything else below is ranked by user impact.

---

## P0 — broken or unusable for the stated job

### P0.1 AlphaFold DB links search by Rv id instead of opening a model

**Where:** `src/lib/external.ts`, `EXTERNAL_LINKS` entry `id: 'alphafold'`, `href`.

**Callers (same builder, no other AlphaFold URL exists):**

- `src/pages/GeneDetail.tsx` — “External resources” list (`EXTERNAL_LINKS.map`)
- `src/pages/GeneLookup.tsx` — GenePanel “Elsewhere” chips (`EXTERNAL_LINKS.map`)

**Currently emits (Rv0001):**

```
https://alphafold.ebi.ac.uk/search/text/Rv0001
```

That is an SPA search route. It HTTP 200s (shell HTML, title “AlphaFold Protein Structure Database”) and does **not** identify a UniProt accession or an AF entry. AlphaFold indexes structures by UniProt accession / AF id, not H37Rv locus tags. The `gene` argument on `href(orf, gene)` is ignored.

**What it should emit:**

AlphaFold DB v6 standardised entry URLs to wrap the UniProt accession:

```
https://alphafold.ebi.ac.uk/entry/AF-{uniprotAccession}-F1
```

Worked example for Rv0001 / dnaA (UniProt `P9WNW3`, confirmed via UniProt REST and `GET https://alphafold.ebi.ac.uk/api/prediction/P9WNW3`):

```
https://alphafold.ebi.ac.uk/entry/AF-P9WNW3-F1
```

API metadata: `entryId=AF-P9WNW3-F1`, `uniprotAccession=P9WNW3`, `gene=dnaA`, H37Rv. Same pattern for katG / Rv1908c → UniProt `P9WIE5` → `https://alphafold.ebi.ac.uk/entry/AF-P9WIE5-F1`.

**Why users fall back to the TB Genome Portal:** the portal gene page (e.g. `https://orca2.tamu.edu/U19/pages/Rv0001.html`) already embeds a UniProt accession and links

```
https://www.alphafold.ebi.ac.uk/entry/P9WNW3
```

That is the **pre-v6** entry form (`/entry/{uniprot}` without the `AF-…-F1` wrapper). v6 release notes say the old `/entry/{uniprot}` form no longer takes you directly to a specific model page; the preferred form is `/entry/AF-{ac}-F1`. The portal link is therefore degraded after v6, but it still carries the accession. MtbScope never gets that far because `public/data/genes.json` has no UniProt field (`RawGene` in `src/lib/types.ts` is ORF / symbol / coords / product / class only).

**Tests:** `tests/external.test.ts` only asserts the TB Genome Portal builder. AlphaFold, UniProt, Mycobrowser, KEGG, STRING, and NCBI have **no URL contract tests**.

**Repro:**

1. Open https://harsh.bet/genes/#/gene/Rv0001 (or GeneLookup → `dnaA`).
2. Click **AlphaFold DB**.
3. Land on a text-search page for `Rv0001`, not DnaA’s model.
4. Open the same gene on the portal (`TB Genome Portal` / `https://orca2.tamu.edu/U19/pages/Rv0001.html`) and click **AlphaFold model** — that URL at least contains `P9WNW3`.

**Phase 2 (named only):** add UniProt accessions to the catalog or enrichment scrape (the portal HTML already has `https://www.uniprot.org/uniprot/P9WNW3`); point AlphaFold at `entry/AF-{ac}-F1`; add an `external.test.ts` contract for it.

---

## P1 — wrong, thin, or slow enough to change what people do

### P1.1 UniProt is a search URL, not the protein record

**Where:** `src/lib/external.ts`, `EXTERNAL_LINKS` entry `id: 'uniprot'`, `href`.  
**Callers:** same GeneDetail / GeneLookup lists as AlphaFold.

**Currently emits:**

```
https://www.uniprot.org/uniprotkb?query=Rv0001+AND+organism_id:83332
```

REST confirms that query returns Swiss-Prot `P9WNW3`. The `gene` symbol argument is ignored. The query string is not `encodeURIComponent`’d (the raw `+` happens to mean space, so it works).

**Should emit (direct record, matching the portal):**

```
https://www.uniprot.org/uniprotkb/P9WNW3
```

Portal today: `https://www.uniprot.org/uniprot/P9WNW3` (legacy `/uniprot/` path; still HTTP 200). Canonical is `/uniprotkb/{ac}`.

**Repro:** Gene page → **UniProt** → search result page instead of DnaA. Portal → **UniProt** → the accession.

This is the same missing-accession root cause as P0.1. Fixing UniProt mapping also fixes AlphaFold.

### P1.2 GeneLookup cannot parse “gene + extra term”, and literature never sees the extra term

**Desired:** `Rv0001 rifampin`, `rpoB essential`, `PPE`, then related papers.

**Current query surface:**

| Surface | Function | What it matches | Extra term (rifampin / essential / …) | Papers |
|---|---|---|---|---|
| Nav / hero search | `searchGenes()` in `src/lib/search.ts`, limit 8 | ORF, symbol, product. AND of whitespace tokens. | Token must appear in ORF/symbol/product or the whole query is empty | Navigates to `#/gene/{orf}` — **no literature** |
| GeneLookup box | same `searchGenes()`, limit 12 | same | same | After a hit is clicked, `geneLiterature(gene)` with **gene identifiers only** |
| Browse filter | `Browser.tsx` haystack `orf gene annotation` | same AND-of-tokens | same | none |
| GenePrioritize | not a search | pathway chips + weight sliders | n/a | optional Europe PMC **counts** for top 40 |

Ran against the live 4,018-gene catalog:

| Query | Matching genes |
|---|---|
| `Rv0001` / `dnaA` | 1 |
| `Rv0001 rifampin` | **0** |
| `katG rifampin` | **0** |
| `rpoB rifampicin` | **0** |
| `essential` | **0** (no product line contains that word; synthetic essentiality was removed from the UI) |
| `Rv0001 essential` | **0** |
| `PPE` | 71 (product “PPE family protein …”) |
| `type VII secretion` | 24 |
| `gyrase` | 2 |
| `alpha-mannosidase` | 1 |

**Literature query** (`src/lib/literature.ts` `geneQuery`):

```
(TITLE_ABS:"{orf}" OR TITLE_ABS:"{symbol}") AND (tuberculosis OR mycobacterium)
```

There is no parameter for a user extra term. `lookupState.ts` stores `q`, `gene`, `weights`, `path`, `page` — not a paper filter.

Europe PMC check of what an extra term would do (2026-09-11):

| Query | hitCount (TITLE_ABS) |
|---|---|
| dnaA / Rv0001 + organism | 129 |
| same **AND** `TITLE_ABS:"rifampin"` | **1** |
| rpoB / Rv0667 + organism | 2440 |
| same **AND** rifampin/rifampicin | 1544 |

So the extra term is both inexpressible in the UI and, for some genes, the difference between “reviews that mention dnaA” and “the one paper that actually pairs the gene with the drug.”

**Repro:**

1. https://harsh.bet/genes/#/lookup
2. Type `Rv0001 rifampin` → “Nothing in the catalog matches.”
3. Type `dnaA`, open the panel → papers about dnaA / tuberculosis, not rifampin.
4. `/` in the header, pick `dnaA` → gene page with **no paper list at all**.

### P1.3 Papers: ranking, deep-links, and metadata

**Fetch:** `geneLiterature()` / `literatureCount()` → Europe PMC REST `src/lib/literature.ts`. CORS is open (`Access-Control-Allow-Origin: *`). No PubMed E-utilities, no PMC, no UniProt literature, no Mycobrowser citations.

**Ranking:** `sort: 'CITED desc'`. Highest-cited records win, not best match to the gene.

**Repro:** look up `dnaA`. Top hit on 2026-09-11 was *Restricted structural gene polymorphism in the Mycobacterium tuberculosis complex* (1997, 735 citations) — a phylogeny paper that mentions dnaA, not a DnaA-function paper.

**UI (`PaperRow` in `src/pages/GeneLookup.tsx`):**

- Title links only to `https://europepmc.org/article/${source}/${id}` (`toPaper()`).
- `Paper.pmid`, `Paper.pmcid`, `Paper.doi` are parsed and then **never rendered**. No PubMed, PMC, DOI, or PDF control.
- Authors (`authorString`) are parsed and never shown.
- Journal, year, citation count, preprint / OA tags only.
- Hard cap 25, no “next page”.
- Full-text widening when TITLE_ABS is empty is explained; good.
- No tests for `literature.ts`.

### P1.4 Literature is missing from the gene page (and from nav search)

Nav and hero search call `navigate('gene/${orf}')` (`GeneSearch.tsx`). Gene pages have annotations, plots, sequence, and external chips — **zero papers**. GeneLookup is not linked from the home feature cards (`Home.tsx` promotes Browse, Compare, Selection Lab, Datasets, About).

**Repro:** `/` → `katG` → land on `#/gene/Rv1908c` with no literature. Discovering papers requires knowing the GeneLookup nav item exists, searching again, and clicking the hit.

### P1.5 Whole-genome enrichment JSON on every gene / compare / lookup view

`public/data/portal-enrichment.json` is **2.88 MB** (4,018 sequences, ~1.34M aa characters). `loadPortalEnrichment()` fetches and parses the entire file to show one ORF (`usePortalEnrichment.ts`, Compare, GeneLookup). Live GET of https://harsh.bet/genes/data/portal-enrichment.json was 2,881,218 bytes.

`genes.json` is a more reasonable 541 KB and is enough for search/browse.

**Repro:** DevTools network on `#/gene/Rv0001` — one request for the full enrichment blob before pN/pS / sequence appear.

### P1.6 Enrichment snapshot is stale, and CI will not refresh it on its own

- File header: `"builtAt":"2026-07-14T22:04:19.213Z"` (~59 days before this audit).
- `.github/workflows/check-data-freshness.yml` runs Mondays, compares **only** `scripts/source/H37Rv.prot_table.html` to `https://orca2.tamu.edu/U19/pages/H37Rv3.prot_table.html`.
- `data:enrich` runs **only if that table drifted**. Last eight scheduled runs (through 2026-09-07) finished in 15–29s with `stale=false` — no scrape, no commit, no Pages deploy from that workflow.
- Last Pages deploy: 2026-08-18 (`Remove CLAUDE.md…`). Live `index.html` `Last-Modified: Tue, 18 Aug 2026 14:16:28 GMT`.

Portal gene pages (AlphaFold / UniProt hrefs, annotation text) can change without the protein table’s bytes changing. Those changes never reach MtbScope.

**Repro:** open Actions → “Check dataset freshness” → recent green jobs ~20s. Datasets page still describes a freshness model that implies enrichment is kept in step with the catalog.

### P1.7 Hashless URLs 404 except Selection Lab

Routing is hash-based (`src/lib/router.ts`). Only `public/selection/index.html` exists as a real path stub (`/genes/selection/` → `#/selection`).

| URL | HTTP |
|---|---|
| https://harsh.bet/genes/ | 200 |
| https://harsh.bet/genes/#/lookup | 200 (hash ignored by server) |
| https://harsh.bet/genes/lookup | **404** |
| https://harsh.bet/genes/lookup/ | **404** |
| https://harsh.bet/genes/browse | **404** |
| https://harsh.bet/genes/gene/Rv0001 | **404** |
| https://harsh.bet/genes/selection/ | 200 |

**Repro:** paste `https://harsh.bet/genes/lookup` into a new tab (no hash). GitHub Pages 404. Same for a gene permalink without `#/`.

### P1.8 NCBI Gene is a keyword search; STRING is a CGI task URL with no accession

**NCBI** (`external.ts` `id: 'ncbi'`):

```
https://www.ncbi.nlm.nih.gov/gene/?term=Rv0001+Mycobacterium+tuberculosis
```

HTTP 200 search page. Direct record for DnaA is `/gene/887102` (not in the catalog). No NCBI Protein builder.

**STRING** (`id: 'string'`):

```
https://string-db.org/cgi/network?identifiers=Rv0001&species=83332
```

This audit host received **HTTP 403** (WAF) on both HEAD and GET, including `/network/83332.Rv0001`. In-browser behaviour was not verified here. The URL still keys off the locus tag, not UniProt `P9WNW3`.

---

## P2 — polish, coverage gaps, mobile, errors

### P2.1 Mycobrowser builder is fine; no TBDB / PATRIC / BV-BRC / BioCyc / PubMed / PMC builders

**Mycobrowser** (`external.ts` `id: 'mycobrowser'`):

```
https://mycobrowser.epfl.ch/genes/${orf}
```

GET of `/genes/Rv0001` returns the dnaA gene page (HTTP 200). ORF is not encoded (fine for `Rv####`). `/gene/Rv0001` (singular) is 404 — do not “fix” by dropping the `s`.

**TB Genome Portal** (`id: 'tbportal'` and `portalGenePage()` in `src/lib/portalPlots.ts`):

```
https://orca2.tamu.edu/U19/pages/${encodeURIComponent(orf)}.html
```

HTTP 200. Historical builder `https://orca2.tamu.edu/U19/genes/detail/${orf}/` is 404 (already replaced; covered by `tests/external.test.ts`).

**TBDB:** annotations are scraped strings only (`scripts/enrich-portal.mjs`, `portalEnrichment.ts`). There is **no** TBDB href in MtbScope. The portal still emits `http://tbdb.bu.edu/cgi-bin/GeneDetails.html?id=SRv0001`, which returned **HTTP 500** from this host. Mycobrowser’s own TBDB link (`http://tbdb.bu.edu/cgi-bin/GeneDetails.html?id=Rv0001`) also 500s. Do not copy those.

**PATRIC:** scraped product text only. PATRIC is now BV-BRC; no `bv-brc.org` URL is built. `https://www.bv-brc.org/` was 403 from this host (WAF).

**KEGG** (`id: 'kegg'` plus a **hardcoded duplicate** in `GeneDetail.tsx` sequence fallback): `https://www.genome.jp/dbget-bin/www_bget?mtu:${orf}` — HTTP 200, ~2s. Also `https://www.kegg.jp/entry/mtu:Rv0001` works.

**PubMed / PMC:** only `portalGenomegaMapPaperUrl()` → `https://pubmed.ncbi.nlm.nih.gov/32167543/` (static GenomegaMap citation; NCBI returned HTTP 203, page exists). No per-gene PubMed/PMC search.

**BioCyc:** present on the portal gene page, absent here.

### P2.2 Home / About / OG copy still describe removed panels

- `index.html` `og:description`: “essentiality, expression and fitness data” — those panels were removed.
- `Layout.tsx` footer: “Analytical panels are representative demonstration data.”
- About “working links” list Mycobrowser, KEGG, UniProt, portal — not AlphaFold / STRING / NCBI, and not GeneLookup.

### P2.3 Browse still carries dead essentiality state

`browserState.ts` still parses `ess` and `sort=essentiality`. `Browser.tsx` maps essentiality sort back to position and never shows an essentiality filter. Typing `essential` in browse matches nothing (P1.2).

### P2.4 GeneLookup UX vs nav search

- Lookup hits are buttons, not a combobox: no arrow/Enter contract (`GeneSearch.tsx` has one; Lookup does not).
- Clicking a hit **clears** `q`, so the extra-term-to-be cannot ride in the URL even later.
- Prioritize table is 9 columns; at `max-width: 860px` the product column shrinks but the table is not swapped for cards (browse is, at 760px). Horizontal scroll on a phone.
- “Fetch literature for the top 40” is concurrency 4 against Europe PMC, polite but slow; failures are omitted from the map (displayed as em dash, same as “not fetched”).

### P2.5 Error states

Good: catalog load failure + retry (`App.tsx`); unknown ORF; unknown hash route; literature HTTP error shown in the gene panel; wrong Selection Lab passphrase; empty search copy.

Gaps:

- `loadPortalEnrichment()` on HTTP failure **swallows** the error and caches an empty `Map` (`portalEnrichment.ts`). Gene pages then say “pN/pS not in the local enrichment snapshot yet” — looks like missing data, not a network fault. No retry.
- `copyLink` / Compare share: `clipboard.writeText` `.catch(() => {})` — silent failure on insecure contexts / denied permission.
- Hotlinked TMHMM/omega/operon images: `PortalFigure` falls back to a labelled synthetic sketch (`derive.ts`). Correctly badged “representative”. If TAMU is down, every gene looks like it has a plot.
- External chips have no live check; a 404/empty AlphaFold search still looks like a working link.

### P2.6 Mobile

- Viewport meta and `viewport-fit=cover` present. Nav collapses to a menu at 900px; search goes full width. `/` shortcut is desktop-oriented (a `kbd` “/” is shown).
- Browse → card list at 760px: good.
- Compare board: horizontal scroll + snap; five-gene presets are awkward on a phone.
- GeneLookup rank table and paper list are usable but cramped; no card layout.
- Theme toggle and skip-link exist.

### P2.7 GitHub Actions / Pages (beyond P1.6)

- `deploy-pages.yml` on `main` and `workflow_dispatch`: tests, typecheck, catalog count 4018, `/genes/` asset paths, ciphertext-only selection. Last run succeeded (2026-08-18).
- Freshness workflow concurrency group is separate from `pages`, so a manual deploy and a refresh cannot stomp each other badly; bot `GITHUB_TOKEN` pushes would not retrigger deploy, which is why refresh deploys inline — correct.
- No workflow_dispatch-only “re-enrich even if the table is unchanged.”
- HTML `Cache-Control: max-age=600` (GitHub Pages/Fastly). Fine for HTML; hashed JS/CSS (`index-RxHOOGHE.js` ~305 KB, CSS ~32 KB).
- No `404.html` SPA fallback (hash routing makes this less urgent except P1.7).

### P2.8 Search highlight does not split tokens

`highlight()` in `src/lib/format.ts` looks for the **entire** query string. Nav results for `type VII secretion` will not mark `type` / `VII` / `secretion` separately even though `searchGenes` ANDs those tokens.

---

## URL builder inventory (complete)

Every user-facing or scrape URL constructed in-repo. “Emit for Rv0001” is the exact string unless noted.

| id / function | File | Currently emits | Live check (2026-09-11) | Should emit |
|---|---|---|---|---|
| `alphafold` `href` | `src/lib/external.ts` | `https://alphafold.ebi.ac.uk/search/text/Rv0001` | 200 SPA search, not a model | `https://alphafold.ebi.ac.uk/entry/AF-P9WNW3-F1` |
| `uniprot` `href` | `src/lib/external.ts` | `https://www.uniprot.org/uniprotkb?query=Rv0001+AND+organism_id:83332` | 200 search; REST hits `P9WNW3` | `https://www.uniprot.org/uniprotkb/P9WNW3` |
| `mycobrowser` `href` | `src/lib/external.ts` | `https://mycobrowser.epfl.ch/genes/Rv0001` | 200 dnaA page | keep; optionally encode ORF |
| `tbportal` `href` | `src/lib/external.ts` | `https://orca2.tamu.edu/U19/pages/Rv0001.html` | 200 | keep (already the portal per-gene page) |
| `kegg` `href` | `src/lib/external.ts` | `https://www.genome.jp/dbget-bin/www_bget?mtu:Rv0001` | 200, slow | keep |
| `string` `href` | `src/lib/external.ts` | `https://string-db.org/cgi/network?identifiers=Rv0001&species=83332` | 403 from audit host | UniProt or `83332.P9WNW3` once mapping exists |
| `ncbi` `href` | `src/lib/external.ts` | `https://www.ncbi.nlm.nih.gov/gene/?term=Rv0001+Mycobacterium+tuberculosis` | 200 search | `/gene/{GeneID}` if mapped |
| `portalGenePage` | `src/lib/portalPlots.ts` | same as `tbportal` | 200 | keep |
| `portalTmhmmUrl` | `src/lib/portalPlots.ts` | `…/pages/images/Rv0001.gif` | 200 | keep |
| `portalOperonUrl` | `src/lib/portalPlots.ts` | `…/operon_images/Rv0001.svg` | 200; GeneDetail also tries `.png` (200) | keep |
| `portalOmegaPlotUrl` | `src/lib/portalPlots.ts` | `https://orca1.tamu.edu/selection/mtb_genomes.10k/output/Rv0001.omega_plot.png` | 200 | keep |
| `portalVariantsUrl` | `src/lib/portalPlots.ts` | `…/Rv0001.variants.txt` | 200 | keep |
| `portalOmegaCollectionUrl` | `src/lib/portalPlots.ts` | `…/mtb_genomes.10k/index.html` | 200 | keep |
| `portalGenomegaMapPaperUrl` | `src/lib/portalPlots.ts` | `https://pubmed.ncbi.nlm.nih.gov/32167543/` | 203/page exists | keep |
| KEGG fallback | `src/pages/GeneDetail.tsx` (hardcoded) | same as `kegg` | 200 | use `EXTERNAL_LINKS` instead of duplicating |
| Europe PMC API `url()` | `src/lib/literature.ts` | `https://www.ebi.ac.uk/europepmc/webservices/rest/search?…` | 200 + CORS `*` | keep; add extra-term + sort options |
| `toPaper().url` | `src/lib/literature.ts` | `https://europepmc.org/article/${source}/${id}` | not clicked in this audit | also expose PubMed/PMC/DOI |
| catalog snapshot | `scripts/build-dataset.mjs` `UPSTREAM_URL` | `https://orca2.tamu.edu/U19/pages/H37Rv3.prot_table.html` | used by weekly check | keep |
| enrich scrape | `scripts/enrich-portal.mjs` `BASE` | `https://orca2.tamu.edu/U19/pages/{orf}.html` | 200 | also scrape UniProt / AlphaFold hrefs already on that page |
| footer / About | `Layout.tsx`, `About.tsx` | `https://orca2.tamu.edu/U19/` | 200 | keep |

**Not built anywhere (missing vs desired source list):**

| Source | In app today |
|---|---|
| PubMed search / per-paper PubMed | static GenomegaMap PMID only |
| PMC | no |
| Europe PMC | **yes** (GeneLookup only) |
| UniProt API / direct accession | search URL only |
| Mycobrowser | outbound link only (no API) |
| TB Genome Portal | outbound + scrape + hotlinked plots |
| AlphaFold | outbound **search** only; no API, no entry id |
| PATRIC / BV-BRC | PATRIC **text** on gene page; no URL |
| NCBI Gene / Protein | Gene **search** URL only |
| TBDB | scraped product string; live DB is dead (HTTP 500) |

All `EXTERNAL_LINKS.href` implementations take `(orf, gene)` and **ignore `gene`**.

---

## Speed and ease of use

**Fast:** in-memory `searchGenes` over 4,018 records (substring, ranked). `/` focuses nav search. Browse pagination (50). Hash URLs for lookup weights / compare gene lists.

**Slow or clumsy:**

1. First gene/compare/lookup view waits on 2.88 MB enrichment (P1.5).
2. Opening a gene on GeneLookup always hits Europe PMC (fine); opening the same gene from the header does not (P1.4).
3. Home does not offer GeneLookup as a primary action.
4. Lookup search is a second, weaker control (no combobox, limit 12, extra terms fail closed).
5. TAMU plot images are hotlinked (extra RTT, no local cache control). KEGG gene page ~2s.
6. GenePrioritize literature fetch: 40 serial-ish Europe PMC count calls, concurrency 4.

**Navigation map today:** Overview → Browse / Compare / Lab. Papers live on a side door. External structure/protein links from gene pages are the AlphaFold miss (P0.1).

---

## Paper-result quality (detail)

`geneQuery('title-abstract')` scoping is the right idea (README’s relA 10,390 → 214 story). Gaps:

- Organism constraint is the tokens `tuberculosis OR mycobacterium`, not taxid 1773 / 83332 — noisier than it needs to be.
- `CITED desc` over-promotes old methods/phylogeny papers (dnaA example in P1.3).
- No relevance sort, no date sort toggle, no “open access only.”
- Fallback to full text is correct for rare loci; the UI says so.
- Counts used in GenePrioritize are TITLE_ABS only (`literatureCount`), so a gene that only appears in full text scores as zero papers if the count job ran — inconsistent with the panel’s widening behaviour.
- Deep-link quality: Europe PMC article URL is a reasonable default; omitting PubMed / DOI / PMCID is the hole.

---

## Phase 2 notes (do not implement here)

1. Scrape or map UniProt accessions (portal gene pages already expose them). Drive AlphaFold `entry/AF-{ac}-F1` and UniProt `/uniprotkb/{ac}` from that map. Contract-test every `EXTERNAL_LINKS` id.
2. Split Lookup queries into gene tokens vs extra tokens; pass extra tokens into `geneQuery`. Keep catalog AND-search for the gene part.
3. Put a paper list on the gene page (or route nav search into Lookup when a gene is chosen).
4. Render PMID / PMCID / DOI / authors; offer sort by date vs citations.
5. Refresh enrichment on a schedule independent of protein-table bytes; consider splitting sequences out of the 2.88 MB blob.
6. Add `public/lookup/index.html` (and browse/gene stubs) mirroring `public/selection/index.html`, or a Pages 404 fallback.

---

## Audit limits

- STRING and BV-BRC returned 403 from this environment; in-browser status may differ.
- AlphaFold `/search/text/Rv0001` was not driven through the SPA’s search API beyond HTTP 200 + empty-of-accession HTML. The portal comparison and the v6 entry-id rule are the evidence that the builder is the wrong kind of URL.
- Selection Lab ciphertext was not opened. No study findings are included.
- `AGENTS.md` is gitignored and was not in the worktree.
