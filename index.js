/**
 * Host half of the dsh-ollama bundle.
 *
 * Two jobs, both of them seams the shipped packages leave open:
 *
 *  1. Register an Ollama-backed `ctx.web` search provider, so the model-facing `web_search`
 *     tool can retrieve results through `POST {baseURL}/api/web_search` with the user's
 *     Ollama API key.
 *  2. Patch the `llm-pi-ai/request-headers` waterfall so an Ollama model route authenticates
 *     the way Ollama Cloud requires. pi-ai's Anthropic transport sends a plain API key as
 *     `x-api-key`, while Ollama only accepts `Authorization: Bearer`.
 *
 * This file deliberately imports nothing: a profile-installed bundle resolves its own
 * dependencies from the profile, not from the DSH installation, so host packages are reached
 * through the context (`ctx.web`, `ctx.get('credentials')`) and plain globals instead.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'ollama'

/** The web seam this bundle registers a search provider into. */
export const inject = ['web']

const DEFAULT_BASE_URL = 'https://ollama.com'
const DEFAULT_SEARCH_PATH = '/api/web_search'
const DEFAULT_API_KEY_ENV = 'OLLAMA_API_KEY'
const DEFAULT_ROUTE_PREFIX = 'ollama'
const DEFAULT_MAX_RESULTS = 5
/** Ollama caps `max_results` at 10. */
const MAX_RESULTS_CAP = 10
const SUMMARY_LIMIT = 4000
const SNIPPET_LIMIT = 320
const ERROR_BODY_LIMIT = 600

/** One WebError-shaped failure: a plain Error carrying the seam's machine-routable `code`. */
function webError(message, code, cause) {
  const error = cause === undefined ? new Error(message) : new Error(message, { cause })
  error.code = code
  return error
}

function readOption(config, key, fallback) {
  const value = config?.[key]
  return value === undefined || value === '' ? fallback : value
}

function trimTrailingSlash(value) {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value
}

function clampResults(requested, fallback) {
  const value = Number.isFinite(requested) ? Math.trunc(requested) : fallback
  return Math.min(MAX_RESULTS_CAP, Math.max(1, value))
}

function trimTo(text, limit) {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

/** Resolve the API key: credential store first (authoritative when mounted), then the process environment. */
async function resolveApiKey(ctx, ref) {
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const hit = await credentials.resolve(ref)
    return hit === undefined || hit.value.length === 0 ? undefined : hit.value
  }
  const ambient = process.env[ref]
  return ambient === undefined || ambient.length === 0 ? undefined : ambient
}

/** Presence-only check, safe to await on every model step. */
async function apiKeyConfigured(ctx, ref) {
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) return (await credentials.describe(ref)).configured
  return (process.env[ref]?.length ?? 0) > 0
}

/**
 * Register the Ollama search provider.
 * @param ctx - plugin context.
 * @param options - live option readers.
 * @param hasKey - synchronous credential-presence getter.
 * @returns nothing; the registration is bound to this plugin's fiber.
 */
function registerSearchProvider(ctx, options, hasKey) {
  const provider = {
    id: 'ollama',
    title: 'Ollama',
    description: {
      en: 'Searches through Ollama\'s web search API with your Ollama API key. Needs an Ollama account;'
        + ' results are plain links and excerpts with no per-search model turn.',
      zh: '使用你的 Ollama API key 通过 Ollama 的网页搜索接口检索。需要 Ollama 账号；返回纯链接与摘要，'
        + '不会为每次搜索消耗一次模型调用。',
    },
    /**
     * Synchronous, network-free usability check.
     *
     * A provider that answered `true` without a key would take part in `ctx.web`'s selection and,
     * whenever another provider is also usable, turn every search into `WEB_PROVIDER_AMBIGUOUS`.
     * Key presence keeps the registration inert until the user actually configures Ollama.
     */
    available() {
      if (hasKey()) {
        try {
          new URL(options.baseURL())
          return true
        } catch {
          return false
        }
      }
      return false
    },
    /** Whether a search for a model request on `llmProvider` has a credential to send. */
    async ready() {
      try {
        return await apiKeyConfigured(ctx, options.apiKeyEnv())
      } catch {
        return false
      }
    },
    async search(request, signal) {
      if (signal?.aborted === true) {
        throw webError('Ollama search aborted', 'WEB_ABORTED', signal.reason)
      }
      const ref = options.apiKeyEnv()
      const key = await resolveApiKey(ctx, ref)
      if (key === undefined) {
        throw webError(
          `Ollama web search has no API key for "${ref}"; store it in the ollama setup page`
          + ' (Settings) or set the environment variable before launching DSH.',
          'WEB_PROVIDER_CREDENTIAL_MISSING',
        )
      }
      const endpoint = `${trimTrailingSlash(options.baseURL())}${options.searchPath()}`
      const body = {
        query: request.query,
        max_results: clampResults(request.maxResults, options.maxResults()),
      }
      let response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(body),
          signal,
        })
      } catch (error) {
        if (signal?.aborted === true) {
          throw webError('Ollama search aborted', 'WEB_ABORTED', signal.reason)
        }
        throw webError(
          `Ollama search could not reach ${endpoint}: ${error?.message ?? String(error)}`,
          'WEB_PROVIDER_ERROR',
          error,
        )
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        const trimmed = detail.length > ERROR_BODY_LIMIT ? `${detail.slice(0, ERROR_BODY_LIMIT)}…` : detail
        if (response.status === 401 || response.status === 403) {
          throw webError(
            `Ollama search at ${endpoint} rejected the API key (HTTP ${response.status}); check the key`
            + ` stored for "${ref}". ${trimmed}`.trim(),
            'WEB_PROVIDER_CREDENTIAL_MISSING',
          )
        }
        throw webError(
          `Ollama search at ${endpoint} failed with HTTP ${response.status}. ${trimmed}`.trim(),
          'WEB_PROVIDER_ERROR',
        )
      }
      let payload
      try {
        payload = await response.json()
      } catch (error) {
        throw webError(`Ollama search at ${endpoint} returned a response that is not JSON`, 'WEB_PROVIDER_ERROR', error)
      }
      const results = Array.isArray(payload?.results) ? payload.results : []
      const seen = new Set()
      const sources = []
      for (const result of results) {
        const url = typeof result?.url === 'string' ? result.url : undefined
        if (url === undefined || seen.has(url)) continue
        seen.add(url)
        const content = typeof result?.content === 'string' ? result.content.trim() : ''
        const title = typeof result?.title === 'string' && result.title.length > 0 ? result.title : undefined
        const source = { url }
        if (title !== undefined) source.title = title
        if (content.length > 0) {
          source.snippet = trimTo(content, SNIPPET_LIMIT)
          source.summary = trimTo(content, SUMMARY_LIMIT)
        }
        sources.push(source)
      }
      // `truncated` is the seam's own flag for sources it dropped; keep the provider's own cut honest.
      return { sources, truncated: sources.length < results.length }
    },
  }
  const dispose = ctx.web.registerSearchProvider(provider)
  // `dsh-web` binds the registration to its own fiber, so unload this plugin's provider explicitly.
  ctx.effect(() => dispose, 'ollama search provider')
}

/**
 * Keep one bearer token in memory for the synchronous request-headers waterfall and for the
 * search provider's `available()` check. A mounted credential store is authoritative.
 * @param ctx - plugin context.
 * @param refReader - current credential reference.
 * @returns a synchronous getter for the last resolved key.
 */
function trackApiKey(ctx, refReader) {
  let cached
  const refresh = async () => {
    try {
      cached = await resolveApiKey(ctx, refReader())
    } catch {
      cached = undefined
    }
  }
  void refresh()
  ctx.on('credentials/reference-updated', (ref) => {
    if (ref === refReader()) void refresh()
  })
  return () => cached ?? (process.env[refReader()] || undefined)
}

/**
 * Add `Authorization: Bearer` for Ollama model routes.
 * @param ctx - plugin context.
 * @param options - live option readers.
 * @param cachedKey - synchronous key getter.
 */
function patchModelHeaders(ctx, options, cachedKey) {
  ctx.on('llm-pi-ai/request-headers', (request, headers, next) => {
    const provider = typeof request?.provider === 'string' ? request.provider : ''
    const matched = options.routePrefixes().some(prefix => prefix.length > 0 && provider.startsWith(prefix))
    if (!matched) return next()
    const key = cachedKey() ?? process.env[options.apiKeyEnv()]
    if (key === undefined || key.length === 0) return next()
    // Ollama authenticates with the bearer form. Deleting x-api-key covers a profile that sets it
    // through `headers`; pi-ai's Anthropic transport still adds its own x-api-key from the route
    // credential afterwards, so a request may carry both. Bearer is what Ollama authenticates.
    headers.delete('x-api-key')
    headers.set('authorization', `Bearer ${key}`)
    return next()
  })
}

/**
 * Host half entry point.
 * @param ctx - plugin context.
 * @param config - row config from the profile patch.
 */
export function apply(ctx, config = {}) {
  const options = {
    baseURL: () => trimTrailingSlash(String(readOption(config, 'baseURL', DEFAULT_BASE_URL))),
    searchPath: () => String(readOption(config, 'searchPath', DEFAULT_SEARCH_PATH)),
    apiKeyEnv: () => String(readOption(config, 'apiKeyEnv', DEFAULT_API_KEY_ENV)),
    maxResults: () => Number(readOption(config, 'maxResults', DEFAULT_MAX_RESULTS)),
    routePrefixes: () => {
      const configured = config.routePrefixes
      return Array.isArray(configured) && configured.length > 0
        ? configured.map(entry => String(entry))
        : [DEFAULT_ROUTE_PREFIX]
    },
  }
  const cachedKey = trackApiKey(ctx, options.apiKeyEnv)
  registerSearchProvider(ctx, options, cachedKey)
  patchModelHeaders(ctx, options, cachedKey)
}
