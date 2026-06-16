import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import type { OpenAPIV3 } from 'openapi-types'
import { ChevronDown, ChevronUp, LoaderCircle, Lock, Play } from 'lucide-solid'
import type { OperationItem } from '../lib/operations'
import { methodColor } from '../lib/operations'
import {
  getRequestBodySchema,
  getResponseSchemas,
  primaryJsonMedia,
  schemaTypeLabel,
} from '../lib/schema'
import { MarkdownText } from './MarkdownText'
import { RequestBodySchemaView, ResponsesSchemaView } from './SchemaViews'
import { VirtualJsonViewer } from './VirtualJsonViewer'

interface OperationBlockProps {
  item: OperationItem
  spec: OpenAPIV3.Document
  serverUrl: string
  specUrl: string
  secured: boolean
  expanded: boolean
  autoTryItOut: boolean
  onTryItOutDismiss: () => void
  onToggle: () => void
}

interface ParamField {
  name: string
  in: OpenAPIV3.ParameterObject['in']
  required: boolean
  description?: string
  schemaType: string
  value: string
}

interface TryItResult {
  status: number
  statusText: string
  durationMs: number
  body: unknown
  contentType: string | null
}

function paramSchemaType(param: OpenAPIV3.ParameterObject): string {
  const schema = param.schema
  if (!schema || '$ref' in schema) return 'string'

  if ('type' in schema && schema.type === 'array') {
    const items = schema.items
    if (items && 'type' in items && typeof items.type === 'string') {
      return `array[${items.type}]`
    }
    return 'array'
  }

  if ('type' in schema && schema.type) return schema.type
  return 'string'
}

function resolveParameters(item: OperationItem): ParamField[] {
  return (item.operation.parameters ?? [])
    .filter((param): param is OpenAPIV3.ParameterObject => !('$ref' in param))
    .filter((param) => param.in === 'path' || param.in === 'query' || param.in === 'header')
    .map((param) => ({
      name: param.name,
      in: param.in,
      required: Boolean(param.required),
      description: param.description,
      schemaType: paramSchemaType(param),
      value: '',
    }))
}

function resolveServerUrl(serverUrl: string, specUrl: string): string {
  if (/^https?:\/\//i.test(serverUrl)) return serverUrl
  return new URL(serverUrl, new URL(specUrl).origin).href
}

function buildUrl(
  serverUrl: string,
  specUrl: string,
  path: string,
  params: ParamField[],
): string {
  let resolvedPath = path
  const query = new URLSearchParams()

  for (const param of params) {
    if (!param.value) continue
    if (param.in === 'path') {
      resolvedPath = resolvedPath.replace(`{${param.name}}`, encodeURIComponent(param.value))
    } else if (param.in === 'query') {
      query.set(param.name, param.value)
    }
  }

  const base = resolveServerUrl(serverUrl, specUrl).replace(/\/$/, '')
  const url = `${base}${resolvedPath}`
  const queryString = query.toString()
  return queryString ? `${url}?${queryString}` : url
}

export function OperationBlock(props: OperationBlockProps) {
  const [tryItOut, setTryItOut] = createSignal(false)
  const [params, setParams] = createSignal<ParamField[]>([])
  const [body, setBody] = createSignal('{}')
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [result, setResult] = createSignal<TryItResult | null>(null)

  const requestBodyInfo = createMemo(() =>
    getRequestBodySchema(props.spec, props.item.operation.requestBody),
  )
  const responseSchemas = createMemo(() =>
    getResponseSchemas(props.spec, props.item.operation.responses),
  )
  const primaryBodyMedia = createMemo(() => {
    const info = requestBodyInfo()
    return info ? primaryJsonMedia(info) : null
  })

  const defaultBodyText = () => {
    const example = primaryBodyMedia()?.example
    if (example === undefined || example === null) return '{}'
    return JSON.stringify(example, null, 2)
  }

  const bodyTypeLabel = () => {
    const media = primaryBodyMedia()
    if (media?.schemaName) return media.schemaName
    const schema = props.item.operation.requestBody
    if (schema && !('$ref' in schema)) {
      const content = Object.values(schema.content)[0]
      if (content?.schema) return schemaTypeLabel(props.spec, content.schema)
    }
    return 'object'
  }

  createEffect(() => {
    props.item.id
    setParams(resolveParameters(props.item).map((param) => ({ ...param, value: '' })))
    setBody(defaultBodyText())
    setError(null)
    setResult(null)
  })

  createEffect(() => {
    setTryItOut(props.expanded && props.autoTryItOut)
  })

  const hasRequestBody = () => Boolean(props.item.operation.requestBody)

  const updateParam = (name: string, value: string) => {
    setParams((current) =>
      current.map((param) => (param.name === name ? { ...param, value } : param)),
    )
  }

  const cancelTryItOut = () => {
    setTryItOut(false)
    setParams(resolveParameters(props.item).map((param) => ({ ...param, value: '' })))
    setBody(defaultBodyText())
    setError(null)
    setResult(null)
    props.onTryItOutDismiss()
  }

  const execute = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    const started = performance.now()
    const url = buildUrl(props.serverUrl, props.specUrl, props.item.path, params())

    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
    }

    for (const param of params()) {
      if (param.in === 'header' && param.value) {
        headers[param.name] = param.value
      }
    }

    const init: RequestInit = {
      method: props.item.method.toUpperCase(),
      headers,
    }

    if (hasRequestBody() && props.item.method !== 'get' && props.item.method !== 'head') {
      headers['Content-Type'] = 'application/json'
      init.body = body()
    }

    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
      const response = await fetch(proxyUrl, init)
      const contentType = response.headers.get('content-type')
      const raw = await response.text()

      let parsed: unknown = raw
      if (contentType?.includes('json')) {
        try {
          parsed = JSON.parse(raw)
        } catch {
          parsed = raw
        }
      }

      setResult({
        status: response.status,
        statusText: response.statusText,
        durationMs: Math.round(performance.now() - started),
        body: parsed,
        contentType,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const summary = () => props.item.operation.summary ?? ''

  return (
    <div
      data-op-id={props.item.id}
      class="scroll-mt-24 border-b border-zinc-200 last:border-b-0 dark:border-zinc-800"
    >
      <button
        type="button"
        class={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-900/60 ${
          props.expanded ? 'bg-zinc-50 dark:bg-zinc-900/40' : ''
        }`}
        onClick={props.onToggle}
      >
        <span
          class={`inline-flex w-[4.75rem] shrink-0 items-center justify-center rounded px-2 py-0.5 text-[11px] font-bold uppercase ring-1 ring-inset ${methodColor(props.item.method)}`}
        >
          {props.item.method}
        </span>
        <span class="min-w-0 flex-1">
          <span class="font-mono text-sm text-zinc-800 dark:text-zinc-200">{props.item.path}</span>
          <Show when={summary()}>
            <span class="ml-2 text-sm text-zinc-500">{summary()}</span>
          </Show>
        </span>
        <span class="flex shrink-0 items-center gap-2 text-zinc-400 dark:text-zinc-500">
          <Show when={props.secured}>
            <Lock size={15} />
          </Show>
          {props.expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>

      <Show when={props.expanded}>
        <div class="border-t border-zinc-300 bg-zinc-100/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/40">
          <Show when={props.item.operation.description && props.item.operation.summary}>
            <div class="mb-2 border-b border-zinc-300 pb-2 text-sm dark:border-zinc-700">
              <MarkdownText content={props.item.operation.description} />
            </div>
          </Show>

          <div class="mb-1.5 flex items-center justify-between border-b-2 border-zinc-800 pb-1 dark:border-zinc-300">
            <span class="text-xs font-bold tracking-wide text-zinc-900 uppercase dark:text-zinc-100">
              Parameters
            </span>
            <Show
              when={tryItOut()}
              fallback={
                <button
                  type="button"
                  class="rounded border border-zinc-400 px-2.5 py-0.5 text-xs font-semibold text-zinc-800 hover:bg-white dark:border-zinc-500 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  onClick={(event) => {
                    event.stopPropagation()
                    setTryItOut(true)
                  }}
                >
                  Try it out
                </button>
              }
            >
              <button
                type="button"
                class="rounded border border-rose-500 px-2.5 py-0.5 text-xs font-semibold text-rose-600 hover:bg-white dark:border-rose-600 dark:text-rose-400 dark:hover:bg-zinc-800"
                onClick={(event) => {
                  event.stopPropagation()
                  cancelTryItOut()
                }}
              >
                Cancel
              </button>
            </Show>
          </div>

          <Show
            when={params().length > 0 || hasRequestBody()}
            fallback={<p class="py-1 text-xs text-zinc-600 dark:text-zinc-400">No parameters</p>}
          >
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-[13px]">
                <thead>
                  <tr class="text-left text-zinc-700 dark:text-zinc-300">
                    <th class="w-[26%] py-1 pr-3 text-xs font-semibold">Name</th>
                    <th class="py-1 text-xs font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={params()}>
                    {(param) => (
                      <tr class="border-t border-zinc-300 align-top dark:border-zinc-700">
                        <td class="py-1.5 pr-3">
                          <div class="font-semibold text-zinc-900 dark:text-zinc-100">
                            {param.name}
                            {param.required ? (
                              <span class="text-rose-600 dark:text-rose-400"> *</span>
                            ) : null}
                          </div>
                          <div class="mt-px font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                            {param.schemaType}
                            <span class="text-zinc-500 dark:text-zinc-500"> · {param.in}</span>
                          </div>
                        </td>
                        <td class="py-1.5">
                          <Show
                            when={tryItOut()}
                            fallback={
                              <Show
                                when={param.description}
                                fallback={<span class="text-zinc-500 dark:text-zinc-500">—</span>}
                              >
                                <p class="text-zinc-700 dark:text-zinc-300">{param.description}</p>
                              </Show>
                            }
                          >
                            <Show when={param.description}>
                              <p class="mb-0.5 text-[11px] leading-tight text-zinc-600 dark:text-zinc-400">
                                {param.description}
                              </p>
                            </Show>
                            <input
                              type="text"
                              value={param.value}
                              placeholder={param.name}
                              onClick={(event) => event.stopPropagation()}
                              onInput={(event) =>
                                updateParam(param.name, event.currentTarget.value)
                              }
                              class="w-full max-w-sm rounded border border-zinc-400 bg-white px-2 py-1 text-[13px] text-zinc-900 placeholder:text-zinc-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                            />
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>

                  <Show when={hasRequestBody()}>
                    <tr class="border-t border-zinc-300 align-top dark:border-zinc-700">
                      <td class="py-1.5 pr-3">
                        <div class="font-semibold text-zinc-900 dark:text-zinc-100">body</div>
                        <div class="mt-px font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                          {bodyTypeLabel()}
                          <span class="text-zinc-500 dark:text-zinc-500"> · body</span>
                        </div>
                      </td>
                      <td class="py-1.5">
                        <Show when={tryItOut()} fallback={<span class="text-zinc-500 dark:text-zinc-500">—</span>}>
                          <textarea
                            rows={4}
                            value={body()}
                            onClick={(event) => event.stopPropagation()}
                            onInput={(event) => setBody(event.currentTarget.value)}
                            class="w-full max-w-lg rounded border border-zinc-400 bg-white px-2 py-1 font-mono text-[13px] text-zinc-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </Show>
                      </td>
                    </tr>
                  </Show>
                </tbody>
              </table>
            </div>
          </Show>

          <Show when={requestBodyInfo()}>
            {(info) => <RequestBodySchemaView info={info()} />}
          </Show>

          <ResponsesSchemaView responses={responseSchemas()} />

          <Show when={tryItOut()}>
            <div class="mt-2 border-t border-zinc-300 pt-2 dark:border-zinc-700">
              <button
                type="button"
                disabled={loading()}
                onClick={(event) => {
                  event.stopPropagation()
                  void execute()
                }}
                class="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {loading() ? (
                  <LoaderCircle size={16} class="animate-spin" />
                ) : (
                  <Play size={16} />
                )}
                Execute
              </button>
            </div>
          </Show>

          <Show when={error()}>
            <p class="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              {error()}
            </p>
          </Show>

          <Show when={result()}>
            {(res) => (
              <div class="mt-2 space-y-1.5 border-t border-zinc-300 pt-2 dark:border-zinc-700">
                <div class="text-xs font-bold tracking-wide text-zinc-900 uppercase dark:text-zinc-100">
                  Response
                </div>
                <div class="flex flex-wrap items-center gap-3 text-sm">
                  <span
                    class={`rounded px-2 py-0.5 font-medium ${
                      res().status >= 200 && res().status < 300
                        ? 'bg-emerald-600/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-600/20 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {res().status} {res().statusText}
                  </span>
                  <span class="text-zinc-500">{res().durationMs} ms</span>
                </div>
                <VirtualJsonViewer data={res().body} maxHeight="32rem" />
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}
