/**
 * Offline tests for the Host half. Run with:
 *   node test/host.test.mjs
 * or, inside the packaged app:
 *   ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" test/host.test.mjs
 *
 * The suite loads `../index.js` with a stubbed Cordis context and points it at a local mock of
 * Ollama's web-search API, so it needs no network, no API key, and no running Ollama server.
 */
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { apply } from '../index.js'

const requests = []
let reply = { status: 200, json: { results: [] } }

const server = createServer((request, response) => {
  let body = ''
  request.on('data', chunk => { body += chunk })
  request.on('end', () => {
    requests.push({ url: request.url, method: request.method, headers: request.headers, body: JSON.parse(body || '{}') })
    response.writeHead(reply.status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(reply.json))
  })
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

/** Minimal Cordis context: registration capture, effect/on bookkeeping, service lookup. */
function makeContext({ key = 'test-key', withCredentials = true } = {}) {
  const registered = []
  const effects = []
  const listeners = []
  const ctx = {
    web: {
      registerSearchProvider(provider) {
        if (registered.some(entry => entry.id === provider.id)) throw new Error('duplicate provider')
        registered.push(provider)
        return () => { registered.splice(registered.indexOf(provider), 1) }
      },
    },
    get(service) {
      if (service !== 'credentials') return undefined
      if (!withCredentials) return undefined
      return {
        async resolve(ref) {
          return ref === 'OLLAMA_API_KEY' && typeof key === 'string' ? { value: key, source: 'test' } : undefined
        },
        async describe(ref) {
          return { configured: ref === 'OLLAMA_API_KEY' && typeof key === 'string', source: 'test', writable: true }
        },
      }
    },
    effect(factory) { effects.push(factory) },
    on(event, listener) { listeners.push({ event, listener }) },
    listenerFor(event) { return listeners.filter(entry => entry.event === event).map(entry => entry.listener) },
    disposeAll() { for (const factory of effects) factory() },
  }
  return { ctx, registered, listeners }
}

const tests = []
const test = (name, run) => tests.push({ name, run })

test('registers one search provider with localized metadata', async () => {
  const { ctx, registered } = makeContext()
  apply(ctx, { baseURL: origin })
  assert.equal(registered.length, 1)
  const provider = registered[0]
  assert.equal(provider.id, 'ollama')
  assert.equal(provider.title, 'Ollama')
  assert.equal(typeof provider.description.en, 'string')
  assert.equal(typeof provider.description.zh, 'string')
})

test('stays unavailable without a key so it cannot make other providers ambiguous', async () => {
  const { ctx, registered } = makeContext({ key: null })
  delete process.env.OLLAMA_API_KEY
  apply(ctx, { baseURL: origin })
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(registered[0].available(), false)

  const configured = makeContext({ key: 'sk-test' })
  apply(configured.ctx, { baseURL: origin })
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(configured.registered[0].available(), true)
})

test('becomes available from the process environment alone', async () => {
  const { ctx, registered } = makeContext({ withCredentials: false })
  process.env.OLLAMA_API_KEY = 'env-key'
  try {
    apply(ctx, { baseURL: origin })
    assert.equal(registered[0].available(), true)
  } finally {
    delete process.env.OLLAMA_API_KEY
  }
})

test('posts query and clamped max_results with a bearer token', async () => {
  requests.length = 0
  reply = { status: 200, json: { results: [{ title: 'Ollama', url: 'https://ollama.com/', content: 'Cloud models are now available.' }] } }
  const { ctx, registered } = makeContext({ key: 'sk-test' })
  apply(ctx, { baseURL: `${origin}/`, maxResults: 4 })
  const result = await registered[0].search({ query: 'what is ollama', maxResults: 50 })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].url, '/api/web_search')
  assert.equal(requests[0].headers.authorization, 'Bearer sk-test')
  assert.deepEqual(requests[0].body, { query: 'what is ollama', max_results: 10 })
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0].url, 'https://ollama.com/')
  assert.equal(result.sources[0].title, 'Ollama')
  assert.match(result.sources[0].summary, /Cloud models/)
  assert.equal(result.truncated, false)
})

test('honours maxResults when the caller supplies none and deduplicates urls', async () => {
  requests.length = 0
  reply = {
    status: 200,
    json: {
      results: [
        { title: 'A', url: 'https://a.example', content: 'first' },
        { title: 'A again', url: 'https://a.example', content: 'duplicate' },
        { title: 'B', url: 'https://b.example', content: 'second' },
      ],
    },
  }
  const { ctx, registered } = makeContext()
  apply(ctx, { baseURL: origin, maxResults: 3 })
  const result = await registered[0].search({ query: 'q' })
  assert.equal(requests[0].body.max_results, 3)
  assert.deepEqual(result.sources.map(source => source.url), ['https://a.example', 'https://b.example'])
  assert.equal(result.truncated, true)
})

test('reports a missing credential before dispatch', async () => {
  requests.length = 0
  const { ctx, registered } = makeContext({ key: null })
  apply(ctx, { baseURL: origin })
  await assert.rejects(
    () => registered[0].search({ query: 'q' }),
    error => error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' && /OLLAMA_API_KEY/.test(error.message),
  )
  assert.equal(requests.length, 0)
  assert.equal(await registered[0].ready(), false)
})

test('maps a rejected key to the credential-missing code', async () => {
  reply = { status: 401, json: { error: 'Unauthorized' } }
  const { ctx, registered } = makeContext()
  apply(ctx, { baseURL: origin })
  await assert.rejects(
    () => registered[0].search({ query: 'q' }),
    error => error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' && /401/.test(error.message),
  )
})

test('maps other HTTP failures to WEB_PROVIDER_ERROR', async () => {
  reply = { status: 500, json: { error: 'boom' } }
  const { ctx, registered } = makeContext()
  apply(ctx, { baseURL: origin })
  await assert.rejects(
    () => registered[0].search({ query: 'q' }),
    error => error.code === 'WEB_PROVIDER_ERROR' && /HTTP 500/.test(error.message),
  )
})

test('reports cancellation as WEB_ABORTED without dispatching', async () => {
  requests.length = 0
  const { ctx, registered } = makeContext()
  apply(ctx, { baseURL: origin })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () => registered[0].search({ query: 'q' }, controller.signal),
    error => error.code === 'WEB_ABORTED',
  )
  assert.equal(requests.length, 0)
})

test('falls back to the process environment when no credential service is mounted', async () => {
  const { ctx, registered } = makeContext({ withCredentials: false })
  process.env.OLLAMA_API_KEY = 'env-key'
  try {
    apply(ctx, { baseURL: origin })
    assert.equal(await registered[0].ready(), true)
  } finally {
    delete process.env.OLLAMA_API_KEY
  }
})

test('adds Authorization and drops x-api-key for matching model routes only', async () => {
  const { ctx } = makeContext({ key: 'sk-test' })
  apply(ctx, { baseURL: origin, apiKeyEnv: 'OLLAMA_API_KEY' })
  const [listener] = ctx.listenerFor('llm-pi-ai/request-headers')
  assert.equal(typeof listener, 'function')

  // The key is cached asynchronously at apply time.
  await new Promise(resolve => setTimeout(resolve, 10))

  const ollamaHeaders = new Headers({ 'x-api-key': 'sk-test', 'anthropic-version': '2023-06-01' })
  let continued = 0
  const returned = listener(
    { provider: 'ollama-anthropic', model: 'kimi-k2.6', baseURL: 'https://ollama.com' },
    ollamaHeaders,
    () => { continued += 1; return ollamaHeaders },
  )
  assert.equal(continued, 1)
  assert.equal(returned.get('authorization'), 'Bearer sk-test')
  assert.equal(returned.get('x-api-key'), null)
  assert.equal(returned.get('anthropic-version'), '2023-06-01')

  const otherHeaders = new Headers({ authorization: 'Bearer other' })
  continueCount: {
    let count = 0
    listener(
      { provider: 'magpie-anthropic', model: 'x', baseURL: 'http://127.0.0.1:3425' },
      otherHeaders,
      () => { count += 1; return otherHeaders },
    )
    assert.equal(count, 1)
  }
  assert.equal(otherHeaders.get('authorization'), 'Bearer other')
  assert.equal(otherHeaders.get('x-api-key'), null)
})

test('leaves matching headers untouched when no key is available', async () => {
  const { ctx } = makeContext({ key: null })
  delete process.env.OLLAMA_API_KEY
  apply(ctx, { baseURL: origin })
  await new Promise(resolve => setTimeout(resolve, 10))
  const [listener] = ctx.listenerFor('llm-pi-ai/request-headers')
  const headers = new Headers({ 'x-api-key': 'placeholder' })
  listener({ provider: 'ollama', model: 'm', baseURL: origin }, headers, () => headers)
  assert.equal(headers.get('authorization'), null)
  assert.equal(headers.get('x-api-key'), 'placeholder')
})

let failed = 0
for (const { name: title, run } of tests) {
  try {
    await run()
    console.log(`ok   ${title}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL ${title}\n     ${error.message}`)
  }
}
server.close()
console.log(failed === 0 ? `\n${tests.length}/${tests.length} passed` : `\n${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
