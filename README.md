# Better Swagger UI

A minimal Swagger UI rewrite in SolidJS. Paste a link to an existing Swagger UI page, upload an OpenAPI file, or paste YAML/JSON spec content.

## Stack

- **SolidJS** + Vite
- **Tailwind CSS** + Lucide icons
- **openapi-types** — OpenAPI TypeScript types
- **yaml** — OpenAPI YAML parsing
- **highlight.js** — JSON syntax highlighting
- **@tanstack/solid-virtual** — virtualized response viewer for large JSON payloads
- **marked** + **dompurify** — operation descriptions

## Development

```bash
npm install
npm run dev
```

To bypass CORS while developing, start the dev server with the local proxy enabled:

```bash
npm run dev:proxy
```

This routes cross-origin requests through `/__proxy` on the local Vite dev server only. Regular `npm run dev`, Vercel deployments, and production builds call APIs directly from the browser, so the target API must allow CORS or be on the same origin.

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
npm test              # Vitest unit tests
npm run test:watch    # Vitest watch mode
npm run test:coverage # Coverage report for src/lib
npm run test:e2e      # Playwright E2E (starts dev + fixture servers)
npm run test:e2e:ui   # Playwright interactive UI
```

E2E tests use OpenAPI fixtures in `tests/fixtures/`, served by the dev server at `/fixtures/` (same origin, no CORS issues).

## Limitations (MVP)

- No OAuth redirect flows (authorization code, implicit, OpenID Connect)
- Cross-origin specs require CORS on the API host in production builds
