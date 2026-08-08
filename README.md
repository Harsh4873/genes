# MtbScope

MtbScope is a fast, comparison-first browser for the *Mycobacterium tuberculosis* H37Rv genome, published at
`harsh.bet/genes/`. It is an independent reimagining of the [TB Genome Portal](https://orca2.tamu.edu/U19/) with instant
search, multi-facet browsing, and a side-by-side panel for four or more genes at once.

## Features

- **Whole-genome search** — every one of the 4,018 protein-coding genes, searchable by Rv id, gene symbol, or product
  description with ranked autocomplete. Press <kbd>/</kbd> anywhere to focus it.
- **Gene browser** — multi-facet filtering (functional class, strand, essentiality) and sortable columns across the whole
  genome, paginated for speed.
- **Gene pages** — genomic neighbourhood map, per-study essentiality table, transcriptional-response chart, TnSeq fitness and
  protein stats, GO terms, and live links to Mycobrowser, KEGG, UniProt, STRING, AlphaFold and NCBI.
- **Comparison panel** — pin up to eight genes into aligned columns and read their essentiality, an expression heatmap across
  14 conditions, fitness and protein data together. Shareable and bookmarkable by URL.
- **Selection Lab** (`/genes/selection/`) — a differential-selection workspace over the whole genome; see below.
- **Light / dark themes**, responsive layout, no backend and no tracking.

## Selection Lab

The Lab compares selection pressure gene by gene between two cohorts of *M. tuberculosis* clinical isolates, across all 4,018
annotated genes, by three independent methods. The study is unpublished, so the Lab is locked (see "Access control") and this
README describes the machinery rather than the findings.

- **GenomegaMap posteriors** for ω (dN/dS) per cohort with 95% credible intervals, and **DPD** = P(ω_DB > ω_NDB) from paired
  posterior draws.
- **pN/pS** from the nonsynonymous and synonymous counts per cohort, compared as Δlog₂(pN/pS), with a Pearson 2x2 χ² on the
  same counts.
- **codeml branch model**, fitting one ω per cohort clade (M2) against a single shared ω (M0) and testing the difference by
  likelihood ratio.

What it does with them:

- **Live thresholds.** DPD, the ω floor and the allele floor are sliders, and the **filter chain** shows how many genes each
  criterion removes on the way to the final set rather than only the result. One click restores the criteria the study
  applies.
- **Genome-wide plots** — DPD against Δlog₂(pN/pS), signed 2ΔLL against DPD, and ω against ω — each downloadable as SVG.
- **Gene panel** — posterior means and intervals, the 2x2 mutation table, possible-site counts, χ², the branch-model fit or
  the reason the gene could not be fitted, and a criterion-by-criterion verdict.
- **Provenance** — the alignment sizes, model settings and commands behind each number, plus the snapshot checksum.
- **CSV export** of the current view.

Every ratio, P-value and significance call is **recomputed in the browser** from the measured counts and posterior summaries
(`src/lib/selectionStats.ts`) rather than read out of the source sheet, so the thresholds move and the numbers move with them.
The recomputation is checked against the values the sheet publishes, and the agreement is reported on the page.

### Access control

The manuscript is in preparation, so the Lab is locked and the dataset is published **encrypted**. GitHub Pages is static
files with no server to check a password against, so a prompt in front of a readable file would be theatre; instead the file
itself is ciphertext:

- `public/data/selection.enc` — AES-256-GCM, key derived from a passphrase with PBKDF2-SHA256 over 600,000 iterations, the
  payload gzipped before encryption. The salt and IV are fresh per build.
- The passphrase is entered in the browser, derives the key there, and is never sent anywhere. It is remembered in
  `sessionStorage` for the tab and dropped by the **Lock** button.
- A wrong passphrase fails at the GCM authentication tag, so wrong and tampered are both rejected rather than half-decrypted.
- Neither the source snapshots nor the plaintext dataset are in this repository; the Pages workflow additionally refuses to
  publish an artifact containing `data/selection.json`.

Because the ciphertext is public, its security is the passphrase's: use a long one, and treat rotation as protecting future
publication rather than what has already been fetched.

To rebuild and republish it:

```sh
# snapshots live in ./private (gitignored), passphrase in ./.selection-passphrase or $SELECTION_PASSPHRASE
npm run data:selection    # build:selection (outside public/) then encrypt:selection
```

The dataset assertions in `tests/selection.test.ts` decrypt the published file when the passphrase is available and skip when
it is not; the statistics themselves are covered either way, and `tests/lockbox.test.ts` covers the seal/open round trip.

## Data

- The gene **catalog** — locus (Rv id), gene symbol, coordinates, strand, protein length, and product description — is the
  H37Rv reference annotation, shipped as a static asset (`public/data/genes.json`).
- The catalog is built from the checked-in upstream snapshot at `scripts/source/H37Rv.prot_table.html`. Generated JSON records
  the schema version, canonical upstream URL, snapshot path, and SHA-256 checksum; it intentionally has no build timestamp, so
  rebuilding an unchanged snapshot is byte-for-byte reproducible.
- Analytical panels on gene and compare pages — essentiality, expression, TnSeq fitness, protein biophysics, vulnerability
  and the codon-wise omega sketch — are **representative demonstration data** generated deterministically from each gene
  (`src/lib/derive.ts`). They are seeded from real properties so patterns are plausible and stable, but they are not
  experimental measurements. The UI labels them as representative; see the About page.
- The **selection dataset** (`public/data/selection.enc`) is the exception: real, unpublished analysis output, so it ships
  encrypted (see "Access control"). It is built from two snapshots kept outside the repository — `selection-db-ndb.tsv`
  (per-gene model results) and `selection-cohort.tsv` (cohort composition, aggregated; the per-isolate sheet is not used) —
  and records its own schema version, method descriptions and SHA-256 checksums of both snapshots. Like the catalog it
  carries no build timestamp, so an unchanged snapshot rebuilds to the same JSON (the ciphertext differs each time, because
  the salt and IV are fresh).

### Updating the catalog snapshot

`npm run data:check` fetches the canonical
`https://orca2.tamu.edu/U19/pages/H37Rv3.prot_table.html` source and compares its bytes with the checked-in snapshot. It never
writes files and exits nonzero when the source has drifted.

A scheduled GitHub Action runs that check every Monday. **When drift is detected it automatically** runs
`npm run data:refresh` and `npm run data:enrich`, commits the updated snapshot / `genes.json` / enrichment file to `main`,
and redeploys Pages from that same workflow (bot pushes do not retrigger the normal Pages workflow). You can also trigger the
same job manually from the Actions tab.

Locally, after reviewing an upstream change yourself:

```sh
npm run data:refresh   # replace snapshot + rebuild genes.json
npm run data:enrich    # re-scrape annotations, pN/pS, sequences
```

`npm run build:data` remains the offline command for rebuilding the JSON from the current checked-in snapshot.

## Development

```sh
npm ci
npm run build:data       # regenerate public/data/genes.json from scripts/source/
npm run data:selection   # rebuild + re-encrypt public/data/selection.enc (needs ./private + passphrase)
npm run data:check       # read-only comparison of the snapshot with upstream
npm test
npm run typecheck
npm run build
npm run dev
```

The Vite base, manifest scope and canonical URL all use `/genes/`.

## Deployment

The `main` branch is deployed as the standalone `Harsh4873/genes` GitHub Pages project site. The workflow verifies the test
suite, TypeScript, the 4,018-gene catalog, and the `/genes/` asset and manifest paths before publishing.

## Credit

Original portal and annotation curation by the TB Genome Portal team (Texas A&M, Harvard, Weill Cornell, UMass, Broad
Institute) and Mycobrowser (EPFL). This is an independent educational reimplementation and is not affiliated with those groups.
