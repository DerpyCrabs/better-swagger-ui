# Better Swagger UI

A minimal Swagger UI rewrite in SolidJS. Paste a link to an existing Swagger UI page, upload an OpenAPI file, or paste YAML/JSON spec content.

## Stack

- **SolidJS** + [Vite+](https://viteplus.dev/) (`vp`)
- **Tailwind CSS** + Lucide icons
- **openapi-types** — OpenAPI TypeScript types
- **yaml** — OpenAPI YAML parsing
- **highlight.js** — JSON syntax highlighting
- **@tanstack/solid-virtual** — virtualized response viewer for large JSON payloads
- **marked** + **dompurify** — operation descriptions

## Development

Install the Vite+ CLI once (`vp`), then:

```bash
vp install
vp dev
```

To bypass CORS while developing, start the dev server with the local proxy enabled:

```bash
vp run dev:proxy
```

This routes cross-origin requests through `/__proxy` on the local Vite+ / Vite dev server only. Regular `vp dev`, Vercel deployments, and production builds call APIs directly from the browser, so the target API must allow CORS or be on the same origin.

## Usage

1. Open the app (default dev URL: `http://localhost:5173`)
2. Load a spec in one of three ways:
   - Paste a Swagger UI URL, e.g. `https://example.com/swagger-ui/index.html`
   - Upload an OpenAPI `.yaml`, `.yml`, or `.json` file
   - Paste raw YAML or JSON spec content into the URL field
3. For Swagger UI URLs, the resolver tries, in order:
   - `?url=` / `?configUrl=` query params
   - URLs embedded in the Swagger UI page or `swagger-initializer.js`
   - Common paths (`/v3/api-docs`, `/swagger.json`, `/openapi.yaml`, …)
4. Browse operations and use **Execute** to send requests

## Testing

```bash
vp test               # Vitest unit tests (watch)
vp test run           # Vitest unit tests (CI)
vp run test:coverage  # Coverage report for src/lib
vp run test:e2e       # Playwright E2E (starts dev + fixture servers)
vp run test:e2e:ui    # Playwright interactive UI
vp check              # Format, lint, and type-check
```

E2E tests use OpenAPI fixtures in `tests/fixtures/`, served by the dev server at `/fixtures/` (same origin, no CORS issues).

## Limitations (MVP)

- No OAuth redirect flows (authorization code, implicit, OpenID Connect)
- Cross-origin specs require CORS on the API host in production builds
