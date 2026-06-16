# Better Swagger UI

A minimal Swagger UI rewrite in SolidJS. Paste a link to an existing Swagger UI page and the app resolves the OpenAPI spec automatically.

## Stack

- **SolidJS** + Vite
- **Tailwind CSS** + Lucide icons
- **openapi-types** — OpenAPI TypeScript types
- **highlight.js** — JSON syntax highlighting
- **@tanstack/solid-virtual** — virtualized response viewer for large JSON payloads
- **marked** + **dompurify** — operation descriptions

## Development

```bash
npm install
npm run dev
```

Requests to external Swagger/OpenAPI hosts go through a built-in dev/preview proxy at `/api/proxy?url=...` to avoid browser CORS limits.

## Usage

1. Open the app (default dev URL: `http://localhost:5173`)
2. Paste a Swagger UI URL, e.g. `https://example.com/swagger-ui/index.html`
3. The resolver tries, in order:
   - `?url=` / `?configUrl=` query params
   - URLs embedded in the Swagger UI page or `swagger-initializer.js`
   - Common paths (`/v3/api-docs`, `/swagger.json`, …)
4. Browse operations in the sidebar and use **Try it out** to execute requests

## Limitations (MVP)

- No YAML paste/upload — Swagger UI links only
- Simple parameter support (path, query, header) + raw JSON body
- No auth flows (OAuth2, etc.)
- Proxy required for cross-origin specs (included in Vite dev/preview)
