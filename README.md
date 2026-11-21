# Ollama channels for DeepSeek Harness

A DSH bundle that adds Ollama as a model provider — with a real choice of wire protocol — and as a
web-search provider, configured from one Settings page.

## What it gives you

| Capability | Where it comes from |
|---|---|
| `Ollama · Anthropic` channel (`api: anthropic-messages`) | `https://ollama.com` + `Authorization: Bearer` via the `llm-pi-ai` adapter |
| `Ollama · Responses` channel (`api: openai-responses`) | `https://ollama.com/v1` (pi-ai always sends `store: false`) |
| `Ollama · Chat` channel (`api: openai-completions`) | `https://ollama.com/v1`, or a local server at `http://127.0.0.1:11434` |
| Ollama web search | `POST https://ollama.com/api/web_search` |
| API key storage | Host credential store under `OLLAMA_API_KEY` |

## Install

1. **Plugins → Add plugin** → choose this directory (or run the bundle install from the CLI).
2. Open **Settings → Ollama**.
3. Paste an API key from <https://ollama.com/settings/keys>, keep the endpoint at
   `https://ollama.com` (use `http://127.0.0.1:11434` for a local server), tick the protocols you
   want, press **Fetch models**, then **Save**.
4. Pick a channel in the model selector.

A page added by a newly installed bundle appears after the app window reloads; refresh DSH once
after **Add plugin** if **Settings → Ollama** is not in the sidebar yet.

The three channels share one credential reference, so a single key serves all of them.

## Web search

Tick **Use Ollama for web search** on the same page. `web_search` then answers through
`POST /api/web_search`, which returns plain links and excerpts (no extra model turn).

> **Limitation:** DSH's web seam selects a search provider by name, not by chat route — it maps only
> the two DeepSeek model routes to the two DeepSeek providers and offers no provider hook for any
> other route. So this is a global pin, not "only when an Ollama channel is selected".
>
> Two consequences worth knowing:
>
> - The page refuses to pin Ollama while no key is stored, because a pinned-but-unavailable provider
>   fails every search with a configuration error instead of falling back.
> - After a key is stored, the Ollama provider becomes *usable*. If another provider is also usable
>   and none is pinned, `ctx.web` answers `WEB_PROVIDER_AMBIGUOUS` for routes it has no preference
>   for. The page shows a warning in that state; pin one provider under **Settings → Web search**
>   (or turn the checkbox on here) to settle it.

## Local Ollama

Point the endpoint at `http://127.0.0.1:11434`. The route names `OLLAMA_API_KEY` as its credential
reference, and DSH fails a request whose reference resolves to nothing before any I/O, so store any
non-empty placeholder (for example `ollama`) through the same form; the local server ignores its
value. The local server's web search (`/api/experimental/web_search`) is credit-gated upstream and
is not used by this bundle.

## Limitations

- **No `tool_choice`, prompt caching, `count_tokens`, or stateful Responses** — Ollama Cloud does not
  implement them. DSH never sends `tool_choice`, so the visible effect is only that reasoning and
  prompt caching stay at Ollama's defaults.
- **Anthropic wire auth is patched.** pi-ai's Anthropic transport sends a plain key as `x-api-key`,
  which Ollama Cloud does not accept on its own; the Host half adds `Authorization: Bearer` for
  routes whose id starts with `ollama` through the `llm-pi-ai/request-headers` waterfall. The
  waterfall cannot remove the header the SDK adds from the route credential, so the request carries
  both; Bearer is what authenticates. Override the matched prefixes with the row config
  `routePrefixes: ['ollama']`.
- **Search readiness is presence-only.** A wrong key still shows `web_search`; the call then fails
  with a structured error naming `OLLAMA_API_KEY`.
- **Model discovery needs the key.** Pressing **Fetch models** sends the typed key for that one
  interrogation, and otherwise reuses the credential of an already-written Ollama channel; an
  `OLLAMA_API_KEY` exported in the launching environment is visible to it as well once such a
  channel exists.
- **Search is pinned globally**, per the limitation above.

## Configuration

The patch row accepts optional overrides:

```yaml
- id: ollama
  name: '@local/dsh-ollama'
  config:
    baseURL: https://ollama.com      # search endpoint origin
    searchPath: /api/web_search      # path appended to baseURL
    apiKeyEnv: OLLAMA_API_KEY        # credential reference
    maxResults: 5                    # clamped to Ollama's maximum of 10
    routePrefixes: ['ollama']        # model-route prefixes that receive the bearer header
```

## Development

```sh
node test/host.test.mjs          # Host half: search provider + header waterfall, no network
```

Design decisions and the seam research behind them are in [docs/DESIGN.md](docs/DESIGN.md).
