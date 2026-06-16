import { For, Show } from 'solid-js'
import type { OpenAPIV3 } from 'openapi-types'
import type { MediaSchemaInfo, RequestBodySchemaInfo, ResponseSchemaInfo } from '../lib/schema'
import { SchemaModel } from './SchemaModel'
import { VirtualJsonViewer } from './VirtualJsonViewer'

interface SchemaSectionProps {
  spec: OpenAPIV3.Document
  title: string
  media: MediaSchemaInfo
  description?: string
}

function SchemaSection(props: SchemaSectionProps) {
  return (
    <div class="space-y-1.5">
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          {props.media.contentType}
        </span>
        <Show when={props.media.schemaName}>
          <span class="font-mono text-sky-700 dark:text-sky-400">{props.media.schemaName}</span>
        </Show>
      </div>
      <Show when={props.description}>
        <p class="text-xs text-zinc-600 dark:text-zinc-400">{props.description}</p>
      </Show>
      <Show
        when={props.media.properties.length > 0}
        fallback={
          <Show when={props.media.example !== null && props.media.example !== undefined}>
            <VirtualJsonViewer data={props.media.example} maxHeight="16rem" />
          </Show>
        }
      >
        <SchemaModel spec={props.spec} properties={props.media.properties} />
      </Show>
    </div>
  )
}

interface RequestBodySchemaViewProps {
  spec: OpenAPIV3.Document
  info: RequestBodySchemaInfo
}

export function RequestBodySchemaView(props: RequestBodySchemaViewProps) {
  return (
    <section class="mt-3 space-y-2 border-t border-zinc-300 pt-2 dark:border-zinc-700">
      <div class="flex items-center gap-2">
        <h4 class="text-xs font-bold tracking-wide text-zinc-900 uppercase dark:text-zinc-100">
          Request body
        </h4>
        <Show when={props.info.required}>
          <span class="text-[11px] text-rose-600 dark:text-rose-400">required</span>
        </Show>
      </div>
      <Show when={props.info.description}>
        <p class="text-xs text-zinc-600 dark:text-zinc-400">{props.info.description}</p>
      </Show>
      <For each={props.info.media}>
        {(media) => <SchemaSection spec={props.spec} title="Request body" media={media} />}
      </For>
    </section>
  )
}

interface ResponsesSchemaViewProps {
  spec: OpenAPIV3.Document
  responses: ResponseSchemaInfo[]
}

export function ResponsesSchemaView(props: ResponsesSchemaViewProps) {
  return (
    <Show when={props.responses.length > 0}>
      <section class="mt-3 space-y-2 border-t border-zinc-300 pt-2 dark:border-zinc-700">
        <h4 class="text-xs font-bold tracking-wide text-zinc-900 uppercase dark:text-zinc-100">
          Responses
        </h4>
        <For each={props.responses}>
          {(response) => (
            <div class="rounded border border-zinc-300 dark:border-zinc-700">
              <div class="flex items-center gap-2 border-b border-zinc-300 px-2 py-1 dark:border-zinc-700">
                <span
                  class={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                    response.status.startsWith('2')
                      ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400'
                      : response.status.startsWith('4') || response.status.startsWith('5')
                        ? 'bg-rose-600/15 text-rose-700 dark:text-rose-400'
                        : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {response.status}
                </span>
                <Show when={response.description}>
                  <span class="text-xs text-zinc-600 dark:text-zinc-400">{response.description}</span>
                </Show>
              </div>
              <div class="space-y-2 p-2">
                <Show
                  when={response.media.length > 0}
                  fallback={<p class="text-xs text-zinc-500">No content</p>}
                >
                  <For each={response.media}>
                    {(media) => (
                      <SchemaSection
                        spec={props.spec}
                        title={`Response ${response.status}`}
                        media={media}
                      />
                    )}
                  </For>
                </Show>
              </div>
            </div>
          )}
        </For>
      </section>
    </Show>
  )
}
