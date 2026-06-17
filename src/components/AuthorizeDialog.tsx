import {
  For,
  Show,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js'
import { Portal } from 'solid-js/web'
import { LoaderCircle, Lock, X } from '../icons'
import type { ClientCredentialsLocation } from '../lib/oauth-token'
import { useAuth } from '../lib/auth-context'
import type { SecuritySchemeInfo } from '../lib/auth-config'

interface AuthorizeDialogProps {
  open: boolean
  onClose: () => void
  onAuthorized?: () => void
}

interface SchemeAction {
  schemeId: string
  testId: string
  formId: string
  authorized: Accessor<boolean>
  loading: Accessor<boolean>
  onLogout: () => void
}

interface FooterRegistry {
  register: (action: SchemeAction) => void
  unregister: (schemeId: string) => void
}

const FooterRegistryContext = createContext<FooterRegistry>()

const fieldInputClass =
  'w-full rounded-md border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500'

const fieldLabelClass = 'text-sm font-medium text-zinc-800 dark:text-zinc-200'

const metaTextClass = 'text-[11px] leading-snug text-zinc-500 dark:text-zinc-500'

const sectionHeadingClass =
  'text-[11px] font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400'

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500'

const secondaryButtonClass =
  'rounded-md border border-zinc-400 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800'

const logoutButtonClass =
  'inline-flex items-center justify-center rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-transparent dark:text-rose-400 dark:hover:bg-rose-950/40'

function useSchemeFooterRegistration(action: () => SchemeAction | null) {
  const registry = useContext(FooterRegistryContext)
  if (!registry) return

  createEffect(() => {
    const current = action()
    if (!current) return

    registry.register(current)
    onCleanup(() => registry.unregister(current.schemeId))
  })
}

function FormSection(props: { title: string; divider?: boolean; children: JSX.Element }) {
  return (
    <div class="space-y-3">
      <Show when={props.divider}>
        <div class="border-t border-zinc-200 pt-4 dark:border-zinc-700" />
      </Show>
      <h4 class={sectionHeadingClass}>{props.title}</h4>
      <div class="space-y-3">{props.children}</div>
    </div>
  )
}

function FormField(props: { label: string; children: JSX.Element }) {
  return (
    <label class="block space-y-1.5">
      <span class={fieldLabelClass}>{props.label}</span>
      {props.children}
    </label>
  )
}

function SchemeCard(props: { children: JSX.Element }) {
  return (
    <div class="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
      {props.children}
    </div>
  )
}

function AuthorizedBadge() {
  return <p class="text-xs font-medium text-emerald-700 dark:text-emerald-400">Authorized</p>
}

function OAuthPasswordForm(props: {
  scheme: Extract<SecuritySchemeInfo, { kind: 'oauth2-password' }>
  onAuthorized?: () => void
}) {
  const auth = useAuth()
  const formId = () => `oauth-password-${props.scheme.id}`
  const [username, setUsername] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [clientId, setClientId] = createSignal(props.scheme.clientId)
  const [clientSecret, setClientSecret] = createSignal(props.scheme.clientSecret)
  const [credentialsLocation, setCredentialsLocation] =
    createSignal<ClientCredentialsLocation>('header')
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const authorized = () => auth.isAuthorized(props.scheme.id)

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      await auth.authorizeOAuthPassword({
        schemeId: props.scheme.id,
        username: username(),
        password: password(),
        clientId: clientId(),
        clientSecret: clientSecret(),
        clientCredentialsLocation: credentialsLocation(),
      })
      props.onAuthorized?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed')
    } finally {
      setLoading(false)
    }
  }

  useSchemeFooterRegistration(() => ({
    schemeId: props.scheme.id,
    testId: `${props.scheme.id}-authorize`,
    formId: formId(),
    authorized,
    loading,
    onLogout: () => auth.logout(props.scheme.id),
  }))

  return (
    <SchemeCard>
      <div class="space-y-1">
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {props.scheme.id} (OAuth2, password)
        </h3>
        <p class={metaTextClass}>
          Token URL: <span class="font-mono">{props.scheme.tokenUrl}</span>
        </p>
        <p class={metaTextClass}>Flow: password</p>
      </div>

      <Show when={authorized()}>
        <AuthorizedBadge />
      </Show>

      <Show when={!authorized()}>
        <form
          id={formId()}
          class="space-y-4"
          autocomplete="on"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <FormSection title="User Credentials">
            <FormField label="Username">
              <input
                type="text"
                name="username"
                autocomplete="username"
                value={username()}
                onInput={(event) => setUsername(event.currentTarget.value)}
                class={fieldInputClass}
              />
            </FormField>
            <FormField label="Password">
              <input
                type="password"
                name="password"
                autocomplete="current-password"
                value={password()}
                onInput={(event) => setPassword(event.currentTarget.value)}
                class={fieldInputClass}
              />
            </FormField>
          </FormSection>

          <FormSection title="Client Application" divider>
            <FormField label="Client ID">
              <input
                type="text"
                name="client_id"
                autocomplete="off"
                value={clientId()}
                onInput={(event) => setClientId(event.currentTarget.value)}
                class={`${fieldInputClass} font-mono`}
              />
            </FormField>
            <FormField label="Client secret">
              <input
                type="text"
                name="client_secret"
                autocomplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                value={clientSecret()}
                onInput={(event) => setClientSecret(event.currentTarget.value)}
                class={`${fieldInputClass} font-mono [-webkit-text-security:disc]`}
              />
            </FormField>
            <FormField label="Client credentials location">
              <select
                value={credentialsLocation()}
                onChange={(event) =>
                  setCredentialsLocation(event.currentTarget.value as ClientCredentialsLocation)
                }
                autocomplete="off"
                class={fieldInputClass}
              >
                <option value="body">Request body</option>
                <option value="header">Authorization header</option>
              </select>
            </FormField>
          </FormSection>

          <Show when={error()}>
            <p class="text-xs text-rose-600 dark:text-rose-400">{error()}</p>
          </Show>
        </form>
      </Show>
    </SchemeCard>
  )
}

function OAuthClientCredentialsForm(props: {
  scheme: Extract<SecuritySchemeInfo, { kind: 'oauth2-client-credentials' }>
  onAuthorized?: () => void
}) {
  const auth = useAuth()
  const formId = () => `oauth-client-${props.scheme.id}`
  const [clientId, setClientId] = createSignal(props.scheme.clientId)
  const [clientSecret, setClientSecret] = createSignal(props.scheme.clientSecret)
  const [credentialsLocation, setCredentialsLocation] =
    createSignal<ClientCredentialsLocation>('header')
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const authorized = () => auth.isAuthorized(props.scheme.id)

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      await auth.authorizeOAuthClientCredentials({
        schemeId: props.scheme.id,
        clientId: clientId(),
        clientSecret: clientSecret(),
        clientCredentialsLocation: credentialsLocation(),
      })
      props.onAuthorized?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed')
    } finally {
      setLoading(false)
    }
  }

  useSchemeFooterRegistration(() => ({
    schemeId: props.scheme.id,
    testId: `${props.scheme.id}-authorize`,
    formId: formId(),
    authorized,
    loading,
    onLogout: () => auth.logout(props.scheme.id),
  }))

  return (
    <SchemeCard>
      <div class="space-y-1">
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {props.scheme.id} (OAuth2, client credentials)
        </h3>
        <p class={metaTextClass}>
          Token URL: <span class="font-mono">{props.scheme.tokenUrl}</span>
        </p>
      </div>

      <Show when={authorized()}>
        <AuthorizedBadge />
      </Show>

      <Show when={!authorized()}>
        <form
          id={formId()}
          class="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <FormSection title="Client Application">
            <FormField label="Client ID">
              <input
                type="text"
                value={clientId()}
                onInput={(event) => setClientId(event.currentTarget.value)}
                class={`${fieldInputClass} font-mono`}
              />
            </FormField>
            <FormField label="Client secret">
              <input
                type="text"
                name="client_secret"
                autocomplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                value={clientSecret()}
                onInput={(event) => setClientSecret(event.currentTarget.value)}
                class={`${fieldInputClass} font-mono [-webkit-text-security:disc]`}
              />
            </FormField>
            <FormField label="Client credentials location">
              <select
                value={credentialsLocation()}
                onChange={(event) =>
                  setCredentialsLocation(event.currentTarget.value as ClientCredentialsLocation)
                }
                class={fieldInputClass}
              >
                <option value="body">Request body</option>
                <option value="header">Authorization header</option>
              </select>
            </FormField>
          </FormSection>

          <Show when={error()}>
            <p class="text-xs text-rose-600 dark:text-rose-400">{error()}</p>
          </Show>
        </form>
      </Show>
    </SchemeCard>
  )
}

function ApiKeyForm(props: {
  scheme: Extract<SecuritySchemeInfo, { kind: 'apiKey' }>
  onAuthorized?: () => void
}) {
  const auth = useAuth()
  const formId = () => `api-key-${props.scheme.id}`
  const [value, setValue] = createSignal('')
  const authorized = () => auth.isAuthorized(props.scheme.id)

  useSchemeFooterRegistration(() => ({
    schemeId: props.scheme.id,
    testId: `${props.scheme.id}-authorize`,
    formId: formId(),
    authorized,
    loading: () => false,
    onLogout: () => auth.logout(props.scheme.id),
  }))

  return (
    <SchemeCard>
      <div class="space-y-1">
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {props.scheme.id} (apiKey, {props.scheme.in}: {props.scheme.name})
        </h3>
      </div>

      <Show when={authorized()}>
        <AuthorizedBadge />
      </Show>

      <Show when={!authorized()}>
        <form
          id={formId()}
          onSubmit={(event) => {
            event.preventDefault()
            auth.authorizeApiKey(props.scheme.id, value())
            props.onAuthorized?.()
          }}
        >
          <FormField label={props.scheme.name}>
            <input
              type="text"
              value={value()}
              onInput={(event) => setValue(event.currentTarget.value)}
              placeholder={props.scheme.name}
              class={fieldInputClass}
            />
          </FormField>
        </form>
      </Show>
    </SchemeCard>
  )
}

function BearerForm(props: {
  scheme: Extract<SecuritySchemeInfo, { kind: 'http-bearer' }>
  onAuthorized?: () => void
}) {
  const auth = useAuth()
  const formId = () => `bearer-${props.scheme.id}`
  const [token, setToken] = createSignal('')
  const authorized = () => auth.isAuthorized(props.scheme.id)

  useSchemeFooterRegistration(() => ({
    schemeId: props.scheme.id,
    testId: `${props.scheme.id}-authorize`,
    formId: formId(),
    authorized,
    loading: () => false,
    onLogout: () => auth.logout(props.scheme.id),
  }))

  return (
    <SchemeCard>
      <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {props.scheme.id} (HTTP Bearer)
      </h3>

      <Show when={authorized()}>
        <AuthorizedBadge />
      </Show>

      <Show when={!authorized()}>
        <form
          id={formId()}
          onSubmit={(event) => {
            event.preventDefault()
            auth.authorizeBearer(props.scheme.id, token())
            props.onAuthorized?.()
          }}
        >
          <FormField label="Bearer token">
            <input
              type="text"
              value={token()}
              onInput={(event) => setToken(event.currentTarget.value)}
              placeholder="Bearer token"
              class={fieldInputClass}
            />
          </FormField>
        </form>
      </Show>
    </SchemeCard>
  )
}

function SchemeForm(props: { scheme: SecuritySchemeInfo; onAuthorized?: () => void }) {
  if (props.scheme.kind === 'oauth2-password') {
    return <OAuthPasswordForm scheme={props.scheme} onAuthorized={props.onAuthorized} />
  }
  if (props.scheme.kind === 'oauth2-client-credentials') {
    return <OAuthClientCredentialsForm scheme={props.scheme} onAuthorized={props.onAuthorized} />
  }
  if (props.scheme.kind === 'apiKey') {
    return <ApiKeyForm scheme={props.scheme} onAuthorized={props.onAuthorized} />
  }
  if (props.scheme.kind === 'http-bearer') {
    return <BearerForm scheme={props.scheme} onAuthorized={props.onAuthorized} />
  }
  return null
}

function DialogFooter(props: { onClose: () => void; actions: SchemeAction[] }) {
  return (
    <div class="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
      <button type="button" onClick={props.onClose} class={secondaryButtonClass}>
        Close
      </button>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <For each={props.actions}>
          {(action) => (
            <Show
              when={action.authorized()}
              fallback={
                <button
                  type="submit"
                  form={action.formId}
                  data-testid={action.testId}
                  disabled={action.loading()}
                  class={primaryButtonClass}
                >
                  {action.loading() ? (
                    <>
                      <LoaderCircle size={14} class="animate-spin" />
                      Authorizing…
                    </>
                  ) : (
                    'Authorize'
                  )}
                </button>
              }
            >
              <button
                type="button"
                data-testid={`${action.testId}-logout`}
                onClick={action.onLogout}
                class={logoutButtonClass}
              >
                Logout
              </button>
            </Show>
          )}
        </For>
      </div>
    </div>
  )
}

export function AuthorizeDialog(props: AuthorizeDialogProps) {
  const auth = useAuth()
  const [actions, setActions] = createSignal<SchemeAction[]>([])

  const registry: FooterRegistry = {
    register(action) {
      setActions((current) => {
        const next = current.filter((item) => item.schemeId !== action.schemeId)
        return [...next, action]
      })
    },
    unregister(schemeId) {
      setActions((current) => current.filter((item) => item.schemeId !== schemeId))
    },
  }

  const handleAuthorized = () => {
    props.onAuthorized?.()
    props.onClose()
  }

  createEffect(() => {
    if (!props.open) {
      setActions([])
    }
  })

  return (
    <Show when={props.open}>
      <Portal mount={document.body}>
        <div class="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 p-4 pt-16">
          <FooterRegistryContext.Provider value={registry}>
            <div
              role="dialog"
              aria-modal="true"
              data-testid="authorize-dialog"
              class="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <h2 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Available authorizations
                </h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={props.onClose}
                  class="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <X size={18} />
                </button>
              </div>

              <div class="space-y-4 overflow-auto p-4">
                <For each={auth.schemes()}>
                  {(scheme) => <SchemeForm scheme={scheme} onAuthorized={handleAuthorized} />}
                </For>
              </div>

              <DialogFooter onClose={props.onClose} actions={actions()} />
            </div>
          </FooterRegistryContext.Provider>
        </div>
      </Portal>
    </Show>
  )
}

export function AuthorizeButton(props: { compact?: boolean }) {
  const auth = useAuth()
  const [open, setOpen] = createSignal(false)
  const authorizedCount = () => auth.entries().size
  const label = () => (authorizedCount() > 0 ? 'Authorized' : 'Authorize')

  return (
    <Show when={auth.hasAnyScheme()}>
      <button
        type="button"
        data-testid="authorize-button"
        onClick={() => setOpen(true)}
        title={label()}
        class={`inline-flex shrink-0 items-center rounded-md border font-medium transition ${
          props.compact ? 'gap-1 px-2 py-1.5 text-xs' : 'gap-2 rounded-lg px-3 py-2 text-sm'
        } ${
          authorizedCount() > 0
            ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
            : 'border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200'
        }`}
      >
        <Lock size={props.compact ? 14 : 16} />
        <span class={props.compact ? 'hidden md:inline' : ''}>{label()}</span>
        <Show when={authorizedCount() > 0}>
          <span class="rounded-full bg-emerald-600/15 px-1 text-[10px] leading-none md:text-xs">
            {authorizedCount()}
          </span>
        </Show>
      </button>
      <AuthorizeDialog open={open()} onClose={() => setOpen(false)} />
    </Show>
  )
}
