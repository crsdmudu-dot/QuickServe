# KwikServe Marketing Website

Public marketing website for KwikServe — trusted on-demand home services in Nairobi.

This is a standalone Next.js App Router application (static export). It lives at `apps/website/` inside the KwikServe monorepo and has its own `node_modules`, React, and toolchain — completely separate from the Expo app.

## Getting started

```bash
cd apps/website
npm install
```

## Development

```bash
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

## Testing

```bash
npm test
```

Runs the Vitest suite (with React Testing Library).

## Build (static export)

```bash
npm run build
```

Outputs a fully-static site to `out/`. Every page is pre-rendered as HTML — no Node.js server required at runtime.

Run the build from this folder: the pages read their approved texts from `content/` at build time.

## Approved texts (Terms, Privacy, account deletion, Support, FAQ)

These five pages have no words of their own. Each renders one approved Markdown file inside one element marked `data-legal-doc="<id>"` (see `content/legal-pages.ts` and `components/LegalDocument.tsx`):

| Page | Approved file | Version line |
|---|---|---|
| `/terms/` | the file named by `content/terms-release.json` (`textFile`, checked against `textSha256`) | yes |
| `/privacy/` | `content/privacy.md` | yes |
| `/delete-account/` | `content/delete-account.md` | yes |
| `/support/` | `content/support.md` | no |
| `/faq/` | `content/faq.md` | no |

- The version line `Version <label> · Effective <date>` comes from the owner's approval record `content/terms-release.json`. Without the record there is no version line; an invalid record, or a Terms file whose bytes do not match `textSha256`, stops the build.
- Without its approved file a page shows a short notice and has no `data-legal-doc` container, so such a build cannot pass the release check.
- The Markdown reader (`lib/legal-markdown.ts`) supports a small subset (headings, paragraphs, one-level lists, bold, italics, links). Anything else stops the build with the file and line.
- `scripts/check-legal-pages.mjs --out out` compares each built page's `data-legal-doc` text with its approved file (PM stage 127 F-127-5).
- The approved files are protected from line-ending conversion by `.gitattributes` (`apps/website/content/*.md -text`).

## Deploy target

- Production: **kwikserve.co.ke** and **www.kwikserve.co.ke**, served by the separate Cloudflare Worker `kwikserve-website` (static assets from `out/`, configured in `wrangler.jsonc` in this folder). The admin Worker `quickserve` is a different Worker and is not touched.
- The website is NOT connected to Workers Builds. It is deployed only by a reviewed, owner-approved `npx wrangler deploy -c apps/website/wrangler.jsonc` from the repository root, after `npm run check:terms-release` prints `TERMS RELEASE OK` and `npm run build` here has produced `out/`.
