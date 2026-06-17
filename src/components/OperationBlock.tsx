import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import type { OpenAPIV3 } from 'openapi-types'
import { ChevronDown, ChevronUp, Download, LoaderCircle, Lock, Play } from '../icons'
import type { OperationItem } from '../lib/operations'
import { methodColor, methodExpandedBg, methodHeaderBg } from '../lib/operations'
import {
  getRequestBodySchema,
  getResponseSchemas,
  primaryJsonMedia,
  schemaTypeLabel,
} from '../lib/schema'
import { MarkdownText } from './MarkdownText'
import { ParamInput } from './ParamInput'
import { RequestBodyPanel, ResponsesSchemaView } from './SchemaViews'
import { VirtualJsonViewer } from './VirtualJsonViewer'
import { CopyButton } from './CopyButton'
import { AuthorizeDialog } from './AuthorizeDialog'
import { useAuth } from '../lib/auth-context'
import {
  emptyParamValues,
  resolveParameterMeta,
  validateAllParams,
  validateParamValue,
  type ParamInputMeta,
} from '../lib/param-schema'
import { parseResponseBody, resolveDownloadName } from '../lib/response-body'
import { buildAcceptHeader } from '../lib/accept-header'
import { buildUrl } from '../lib/build-request-url'
import { proxyFetch } from '../lib/proxy-fetch'
import {
  dmBorder,
  dmBorderT,
  dmMuted,
  dmParamName,
  dmParamType,
  dmPath,
  dmSchemaPanel,
  dmSectionHeading,
} from '../lib/dm-classes'

interface OperationBlockProps {
  item: OperationItem
  spec: OpenAPIV3.Document
  serverUrl: string
  specUrl: string
  expanded: boolean
  autoTryItOut: boolean
  onTryItOutDismiss: () => void
  onAuthorizeFromLock?: () => void
  onToggle: () => void
}

interface TryItResult {
  status: number
  statusText: string
  durationMs: number
  body: unknown
  contentType: string | null
  copyText: string
  isFile: boolean
  blob?: Blob
  fileName: string | null
  contentDisposition: string | null
  requestUrl: string
}

export function OperationBlock(props: OperationBlockProps) {
  const auth = useAuth()
  const [authorizeOpen, setAuthorizeOpen] = createSignal(false)
  const [tryItOut, setTryItOut] = createSignal(false)
  const paramDefs = createMemo(() => resolveParameterMeta(props.spec, props.item))
  const [paramValues, setParamValues] = createStore<Record<string, string>>({})
  const [paramErrors, setParamErrors] = createStore<Record<string, string>>({})
  const [body, setBody] = createSignal('{}')
  const [bodyError, setBodyError] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [result, setResult] = createSignal<TryItResult | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = createSignal<string | null>(null)

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
    setParamValues(reconcile(emptyParamValues(resolveParameterMeta(props.spec, props.item))))
    setParamErrors(reconcile({}))
    setBody(defaultBodyText())
    setBodyError(null)
    setError(null)
    setResult(null)
    setFilePreviewUrl(null)
  })

  createEffect(() => {
    const res = result()
    if (!res?.isFile || !res.blob || !res.contentType?.startsWith('image/')) {
      setFilePreviewUrl(null)
      return
    }

    const nextUrl = URL.createObjectURL(res.blob)
    setFilePreviewUrl(nextUrl)
    onCleanup(() => URL.revokeObjectURL(nextUrl))
  })

  createEffect(() => {
    setTryItOut(props.expanded && props.autoTryItOut)
  })

  const hasRequestBody = () => Boolean(props.item.operation.requestBody)
  const hasJsonRequestBody = createMemo(() => {
    const info = requestBodyInfo()
    return Boolean(info && primaryBodyMedia())
  })

  const exampleBodyData = createMemo(() => {
    try {
      return JSON.parse(defaultBodyText())
    } catch {
      return defaultBodyText()
    }
  })

  const clearParamError = (name: string) => {
    if (!paramErrors[name]) return
    setParamErrors((state) => {
      const next = { ...state }
      delete next[name]
      return next
    })
  }

  const updateParam = (name: string, value: string) => {
    setParamValues(name, value)
    clearParamError(name)
  }

  const validateParam = (param: ParamInputMeta) => {
    const message = validateParamValue(param, paramValues[param.name] ?? '')
    if (message) {
      setParamErrors(param.name, message)
      return
    }
    clearParamError(param.name)
  }

  const cancelTryItOut = () => {
    setTryItOut(false)
    setParamValues(reconcile(emptyParamValues(paramDefs())))
    setParamErrors(reconcile({}))
    setBody(defaultBodyText())
    setBodyError(null)
    setError(null)
    setResult(null)
    setFilePreviewUrl(null)
    props.onTryItOutDismiss()
  }

  const execute = async () => {
    const validationErrors = validateAllParams(paramDefs(), paramValues)
    setParamErrors(reconcile(validationErrors))
    if (Object.keys(validationErrors).length > 0) {
      setError('Fix parameter validation errors before executing')
      return
    }

    if (hasRequestBody() && props.item.method !== 'get' && props.item.method !== 'head') {
      try {
        JSON.parse(body())
        setBodyError(null)
      } catch {
        setBodyError('Request body must be valid JSON')
        setError('Fix request body validation errors before executing')
        return
      }
    }

    setLoading(true)
    setError(null)
    setResult(null)

    const started = performance.now()
    const url = buildUrl(props.serverUrl, props.specUrl, props.item.path, paramDefs(), paramValues)

    const headers: Record<string, string> = {
      Accept: buildAcceptHeader(props.item.operation),
      ...auth.getRequestHeaders(),
    }

    for (const param of paramDefs()) {
      const value = paramValues[param.name]
      if (param.in === 'header' && value) {
        headers[param.name] = value
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
      const response = await proxyFetch(url, init)
      const parsed = await parseResponseBody(response, url)

      setResult({
        status: response.status,
        statusText: response.statusText,
        durationMs: Math.round(performance.now() - started),
        body: parsed.body,
        contentType: parsed.contentType,
        copyText: parsed.copyText,
        isFile: parsed.isFile,
        blob: parsed.blob,
        fileName: parsed.fileName,
        contentDisposition: parsed.contentDisposition,
        requestUrl: url,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const summary = () => props.item.operation.summary ?? ''

  const downloadFile = (res: TryItResult) => {
    if (!res.blob) return
    const objectUrl = URL.createObjectURL(res.blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = resolveDownloadName(
      res.fileName,
      res.contentDisposition,
      res.contentType,
      res.requestUrl,
    )
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  return (
    <div
      data-op-id={props.item.id}
      data-testid={`operation-${props.item.id}`}
      class={`scroll-mt-24 mb-[10px] overflow-hidden rounded border ${dmBorder}`}
    >
      <div
        data-op-header
        class={`flex w-full items-stretch transition ${methodHeaderBg(props.item.method, props.expanded)} ${
          props.expanded
            ? 'border-b border-zinc-300/70 shadow-[inset_0_-1px_0_rgba(0,0,0,0.05)] dark:border-dm-border dark:shadow-none'
            : ''
        }`}
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 flex-nowrap items-center gap-2.5 px-3 py-2 text-left sm:gap-3"
          onClick={props.onToggle}
        >
          <span
            class={`inline-flex w-[4.75rem] shrink-0 items-center justify-center rounded px-2 py-0.5 text-[11px] font-bold uppercase ring-1 ring-inset ${methodColor(props.item.method)}`}
          >
            {props.item.method}
          </span>
          <span class={`shrink-0 whitespace-nowrap ${dmPath}`}>
            {props.item.path}
          </span>
          <Show when={summary()}>
            <span
              class={`min-w-0 flex-1 truncate text-sm ${dmMuted}`}
              title={summary()}
            >
              {summary()}
            </span>
          </Show>
          <span class="ml-auto shrink-0 text-zinc-400 dark:text-dm-muted">
            {props.expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </button>
        <Show when={auth.hasAnyScheme()}>
          <button
            type="button"
            data-testid="operation-authorize-lock"
            title="Authorize"
            aria-label="Authorize"
            onClick={() => setAuthorizeOpen(true)}
            class="shrink-0 px-2.5 text-zinc-400 transition hover:text-zinc-700 dark:text-dm-muted dark:hover:text-dm-text"
          >
            <Lock size={15} />
          </button>
        </Show>
      </div>
      <AuthorizeDialog
        open={authorizeOpen()}
        onClose={() => setAuthorizeOpen(false)}
        onAuthorized={() => props.onAuthorizeFromLock?.()}
      />

      <Show when={props.expanded}>
        <div class={`px-3 py-3 ${methodExpandedBg(props.item.method)}`}>
          <Show when={props.item.operation.description && props.item.operation.summary}>
            <div class="mb-2 text-sm">
              <MarkdownText content={props.item.operation.description} />
            </div>
          </Show>

          <div class="mb-1 flex items-center justify-between">
            <span class={dmSectionHeading}>
              Parameters
            </span>
            <Show
              when={tryItOut()}
              fallback={
                <button
                  type="button"
                  data-testid="try-it-out"
                  class="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-dm-border dark:bg-dm-surface dark:text-dm-text dark:hover:bg-dm-surface-hover"
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
                data-testid="cancel-try-it-out"
                class="rounded-md border border-zinc-300 bg-transparent px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-white/80 dark:border-dm-border dark:text-dm-muted dark:hover:bg-dm-surface-hover"
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
            when={paramDefs().length > 0 || (hasRequestBody() && !hasJsonRequestBody())}
            fallback={
              <Show when={!hasJsonRequestBody()}>
                <p class={`py-1 text-xs ${dmMuted}`}>No parameters</p>
              </Show>
            }
          >
            <div class="overflow-x-auto rounded-md bg-white/70 dark:bg-dm-surface">
              <table class="w-full border-collapse text-[13px]">
                <thead>
                  <tr class="text-left text-zinc-700 dark:text-dm-muted">
                    <th class="w-[26%] px-2 py-1.5 text-xs font-semibold">Name</th>
                    <th class="px-2 py-1.5 text-xs font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={paramDefs()}>
                    {(param) => (
                      <tr class={`${dmBorderT} align-top`}>
                        <td class="px-2 py-2 pr-3">
                          <div class={dmParamName}>
                            {param.name}
                            {param.required ? (
                              <span class="text-rose-600 dark:text-rose-400"> *</span>
                            ) : null}
                          </div>
                          <div class={`mt-0.5 text-[11px] leading-snug ${dmParamType}`}>
                            <span class="font-mono">{param.schemaType}</span>
                            <Show when={param.enumValues?.length}>
                              <span> ({param.enumValues!.join(' | ')})</span>
                            </Show>
                          </div>
                          <div class={`mt-px text-[10px] ${dmMuted}`}>{param.in}</div>
                        </td>
                        <td class="px-2 py-2">
                          <Show
                            when={tryItOut()}
                            fallback={
                              <Show
                                when={param.description}
                                fallback={<span class={dmMuted}>—</span>}
                              >
                                <p class="text-zinc-700 dark:text-dm-muted">{param.description}</p>
                              </Show>
                            }
                          >
                            <Show when={param.description}>
                              <p class={`mb-1 text-[11px] leading-tight ${dmMuted}`}>
                                {param.description}
                              </p>
                            </Show>
                            <ParamInput
                              meta={param}
                              value={paramValues[param.name] ?? ''}
                              error={paramErrors[param.name]}
                              onInput={(value) => updateParam(param.name, value)}
                              onBlur={() => validateParam(param)}
                            />
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>

                  <Show when={hasRequestBody() && !hasJsonRequestBody()}>
                    <tr class={`${dmBorderT} align-top`}>
                      <td class="px-2 py-2 pr-3">
                        <div class={dmParamName}>body</div>
                        <div class={`mt-0.5 text-[11px] leading-snug ${dmParamType}`}>
                          <span class="font-mono">{bodyTypeLabel()}</span>
                        </div>
                        <div class={`mt-px text-[10px] ${dmMuted}`}>body</div>
                      </td>
                      <td class="px-2 py-2">
                        <Show when={tryItOut()} fallback={<span class={dmMuted}>—</span>}>
                          <div class="space-y-0.5">
                            <div class="flex max-w-lg items-start gap-2">
                              <textarea
                                rows={4}
                                value={body()}
                                onClick={(event) => event.stopPropagation()}
                                onInput={(event) => {
                                  setBody(event.currentTarget.value)
                                  if (bodyError()) setBodyError(null)
                                }}
                                onBlur={() => {
                                  try {
                                    JSON.parse(body())
                                    setBodyError(null)
                                  } catch {
                                    setBodyError('Request body must be valid JSON')
                                  }
                                }}
                                class={`min-w-0 flex-1 rounded-md border bg-white px-2 py-1 font-mono text-[13px] text-zinc-900 outline-none focus:ring-2 dark:border-dm-border dark:bg-dm-input dark:text-dm-text ${
                                  bodyError()
                                    ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/30 dark:border-rose-500'
                                    : 'border-zinc-300 focus:border-sky-500 focus:ring-sky-500/30 dark:focus:border-sky-500 dark:focus:ring-sky-500/40'
                                }`}
                              />
                              <CopyButton text={body} label="Copy" class="shrink-0" />
                            </div>
                            <Show when={bodyError()}>
                              <p class="text-[11px] text-rose-600 dark:text-rose-400">{bodyError()}</p>
                            </Show>
                          </div>
                        </Show>
                      </td>
                    </tr>
                  </Show>
                </tbody>
              </table>
            </div>
          </Show>

          <Show when={hasJsonRequestBody() && requestBodyInfo()}>
            {(info) => (
              <RequestBodyPanel
                spec={props.spec}
                info={info()}
                tryItOut={tryItOut()}
                exampleViewer={<VirtualJsonViewer data={exampleBodyData()} maxHeight="16rem" />}
                editor={
                  <div class="space-y-0.5">
                    <div class="flex max-w-lg items-start gap-2">
                      <textarea
                        rows={6}
                        value={body()}
                        onClick={(event) => event.stopPropagation()}
                        onInput={(event) => {
                          setBody(event.currentTarget.value)
                          if (bodyError()) setBodyError(null)
                        }}
                        onBlur={() => {
                          try {
                            JSON.parse(body())
                            setBodyError(null)
                          } catch {
                            setBodyError('Request body must be valid JSON')
                          }
                        }}
                        class={`min-w-0 flex-1 rounded-md border bg-white px-2 py-1 font-mono text-[13px] text-zinc-900 outline-none focus:ring-2 dark:border-dm-border dark:bg-dm-input dark:text-dm-text ${
                          bodyError()
                            ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/30 dark:border-rose-500'
                            : 'border-zinc-300 focus:border-sky-500 focus:ring-sky-500/30 dark:focus:border-sky-500 dark:focus:ring-sky-500/40'
                        }`}
                      />
                      <CopyButton text={body} label="Copy" class="shrink-0" />
                    </div>
                    <Show when={bodyError()}>
                      <p class="text-[11px] text-rose-600 dark:text-rose-400">{bodyError()}</p>
                    </Show>
                  </div>
                }
              />
            )}
          </Show>

          <Show when={tryItOut()}>
            <div class="mt-2">
              <button
                type="button"
                data-testid="execute"
                disabled={loading()}
                onClick={(event) => {
                  event.stopPropagation()
                  void execute()
                }}
                class="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
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
            <p class="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              {error()}
            </p>
          </Show>

          <Show when={result()}>
            {(res) => (
              <div class={`mt-2 space-y-1.5 ${dmSchemaPanel}`}>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class={dmSectionHeading}>
                    Response
                  </div>
                  <div class="flex items-center gap-2">
                    <Show when={res().isFile}>
                      <button
                        type="button"
                        data-testid="download-response"
                        title="Download"
                        aria-label="Download"
                        onClick={(event) => {
                          event.stopPropagation()
                          downloadFile(res())
                        }}
                        class="inline-flex items-center rounded border border-zinc-400 p-1 text-zinc-700 hover:bg-white dark:border-dm-border dark:text-dm-text dark:hover:bg-dm-surface-hover"
                      >
                        <Download size={12} />
                      </button>
                    </Show>
                    <Show when={!res().isFile || res().copyText}>
                      <CopyButton text={() => res().copyText} label="Copy" />
                    </Show>
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-3 text-sm">
                  <span
                    data-testid="response-status"
                    class={`rounded px-2 py-0.5 font-medium ${
                      res().status >= 200 && res().status < 300
                        ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-400'
                        : 'bg-rose-600/20 text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {res().status} {res().statusText}
                  </span>
                  <span class={dmMuted}>{res().durationMs} ms</span>
                  <Show when={res().contentType}>
                    <span class={`font-mono text-xs ${dmMuted}`}>{res().contentType}</span>
                  </Show>
                </div>
                <div data-testid="response-body">
                <Show
                  when={res().isFile}
                  fallback={<VirtualJsonViewer data={res().body} maxHeight="32rem" />}
                >
                  <div class="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-dm-surface">
                    <p class="text-zinc-700 dark:text-dm-text">
                      File response
                      <Show when={res().fileName}>
                        {(name) => (
                          <span class={`ml-1 font-mono ${dmMuted}`}>({name()})</span>
                        )}
                      </Show>
                    </p>
                    <Show when={filePreviewUrl()}>
                      {(previewUrl) => (
                        <img
                          src={previewUrl()}
                          alt={res().fileName ?? 'Response image'}
                          class="mt-2 max-h-64 max-w-full rounded border border-zinc-200 dark:border-dm-border"
                        />
                      )}
                    </Show>
                  </div>
                </Show>
                </div>
              </div>
            )}
          </Show>

          <ResponsesSchemaView spec={props.spec} responses={responseSchemas()} />
        </div>
      </Show>
    </div>
  )
}
