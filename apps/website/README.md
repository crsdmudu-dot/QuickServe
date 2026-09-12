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

## Deploy target

- Production: **quickserve.co.ke**
- Future: **app.quickserve.co.ke** (mobile deep-link landing), **admin.quickserve.co.ke** (ops portal)
