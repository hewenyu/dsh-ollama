# dsh-ollama — design notes

Internal design record for the bundle in this repository. User-facing behaviour lives in
`README.md` and the bundle's Plugin Manager description.

## Why this shape

DSH already ships a multi-provider adapter, `@deepseek-ai/dsh-llm-pi-ai`, that speaks the three
wire protocols Ollama serves (`anthropic-messages`, `openai-responses`, `openai-completions`).
Ollama Cloud is reachable with a bearer API key at:

| Protocol | Base URL | Notes |
|---|---|---|
| `anthropic-messages` | `https://ollama.com` | `/v1/messages`; requires `anthropic-version: 2023-06-01`; only `Authorization: Bearer` is accepted, `x-api-key` alone is not |
| `openai-responses` | `https://ollama.com/v1` | non-stateful; pi-ai already sends `store: false` |
| `openai-completions` | `https://ollama.com/v1` | the widest-compatibility fallback |

Two facts force the architecture:

1. **`llm-pi-ai` cannot be mounted twice.** Its `apply` unconditionally declares every provider in
   the installed pi-ai catalog through `ctx.llm.registerConfigurableProviders`, and the LLM
   registry rejects a second declaration with `DUPLICATE_DIRECTORY`. A second instance fails to
   load and contributes no routes at all — even with disjoint route names.
2. **A bundle patch cannot add routes to the existing `llm-pi-ai` row.** A patch replaces a row's
   whole `config`, and the user's profile patch (which already configures `llm-pi-ai`) is applied
   last, so a bundle-provided `providers` dictionary is discarded.

So the bundle does **not** own model routes. It adds the two capabilities the seam leaves open:

- **Host half** (`index.js`)
  - `ctx.web` search provider `ollama` → `POST {baseURL}/api/web_search` with the user's Ollama key.
  - `llm-pi-ai/request-headers` waterfall listener that adds `Authorization: Bearer <key>` for
    routes whose id matches the configured prefixes, because pi-ai's Anthropic transport sends a
    plain API key as `x-api-key`, which Ollama Cloud does not accept on its own. The waterfall
    cannot suppress the header the SDK derives from the route credential, so both travel; Bearer is
    what authenticates. The provider's `available()` answers false until a key exists, so an
    unconfigured install never becomes a second usable provider and cannot turn `ctx.web` selection
    into `WEB_PROVIDER_AMBIGUOUS`.
- **Client half** (`client.js`)
  - A settings surface that stores the Ollama key in the credential store and writes the
    `ollama-*` routes into the existing `llm-pi-ai` settings namespace (the same
    `settings.mutate` path the Models page uses), plus an optional pin of `web.searchProvider`.

## Route names written by the setup surface

| Route | `api` | `baseURL` |
|---|---|---|
| `ollama-anthropic` | `anthropic-messages` | `https://ollama.com` |
| `ollama-responses` | `openai-responses` | `https://ollama.com/v1` |
| `ollama` | `openai-completions` | `https://ollama.com/v1` |

All three share one credential reference (`OLLAMA_API_KEY` by default).

## Known limits

- **Search selection is not route-aware.** `dsh-web` maps two hard-coded DeepSeek route names to two
  hard-coded provider ids and offers no provider hook for "serve route X". The Ollama provider is
  therefore chosen by pinning `web.searchProvider`, not by the chat route. The README states this.
- **`ready()` is presence-only.** It cannot validate the key; a wrong key fails at call time with a
  structured error.
- **Ollama Cloud refuses `tool_choice`, prompt caching, `count_tokens`, and stateful Responses.**
  DSH sends no `tool_choice`, so the first three do not surface; `store: false` satisfies the last.
