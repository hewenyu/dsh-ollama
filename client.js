/**
 * Client half of the dsh-ollama bundle.
 *
 * One settings page, reached from the app sidebar as Settings → Ollama. It does three things:
 *
 *  - stores the Ollama API key in the Host credential store (no secret enters configuration),
 *  - writes the chosen `ollama-*` model routes into the mounted `llm-pi-ai` settings namespace
 *    (the same `settings.mutate` path the Models page uses), so the model selector lists them,
 *  - optionally pins `web.searchProvider` to the `ollama` search provider this bundle registers.
 *
 * The page renders its own controls with theme tokens; it imports no Harness Client package
 * except the React instance the browser module table already provides.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-ollama',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Settings namespace of the adapter that owns the model routes. */
    const LLM_NS = 'llm-pi-ai'
    /** Settings namespace of the web capability owner. */
    const WEB_NS = 'web'
    /** Search provider id the Host half registers. */
    const SEARCH_PROVIDER = 'ollama'
    /** Locale namespace for this bundle's UI copy. */
    const NS = 'ollama'
    /** Credential reference shared by every Ollama route. */
    const KEY_REF = 'OLLAMA_API_KEY'
    const DEFAULT_HOST = 'https://ollama.com'

    /** Protocol route table: settings-key suffix, wire protocol, and the endpoint shape it needs. */
    const ROUTES = [
      {
        route: 'ollama-anthropic',
        api: 'anthropic-messages',
        titleKey: 'protocolAnthropic',
        hintKey: 'protocolAnthropicHint',
        /** Anthropic SDK appends /v1/messages to this base. */
        baseFor: host => host,
      },
      {
        route: 'ollama-responses',
        api: 'openai-responses',
        titleKey: 'protocolResponses',
        hintKey: 'protocolResponsesHint',
        baseFor: host => `${host}/v1`,
      },
      {
        route: 'ollama',
        api: 'openai-completions',
        titleKey: 'protocolCompletions',
        hintKey: 'protocolCompletionsHint',
        baseFor: host => `${host}/v1`,
      },
    ]

    const DICT = {
      en: {
        nav: 'Ollama',
        title: 'Ollama channel',
        intro: 'Adds Ollama Cloud (or a local Ollama server) as a model channel, and can route web search through Ollama.',
        apiKey: 'Ollama API key',
        apiKeyHint: 'Create one at ollama.com/settings/keys. Stored in the Host credential store, never in configuration.',
        apiKeyStored: 'A key is stored for OLLAMA_API_KEY.',
        apiKeyMissing: 'No key is stored yet.',
        apiKeyKeep: 'Leave empty to keep the stored key',
        apiKeyClear: 'Remove stored key',
        endpoint: 'Endpoint',
        endpointHint: 'Use https://ollama.com for Ollama Cloud, or http://127.0.0.1:11434 for a local server.',
        protocols: 'Protocols',
        protocolsHint: 'Each selected protocol becomes its own model channel, so you can switch in the model selector.',
        protocolAnthropic: 'Anthropic Messages',
        protocolAnthropicHint: 'Bearer token plus anthropic-version; /v1/messages',
        protocolResponses: 'OpenAI Responses',
        protocolResponsesHint: 'Stateless /v1/responses',
        protocolCompletions: 'OpenAI Chat Completions',
        protocolCompletionsHint: 'Widest compatibility; /v1/chat/completions',
        models: 'Models',
        modelsHint: 'Fetched from the endpoint and written into each selected channel.',
        refreshModels: 'Fetch models',
        fetching: 'Fetching models…',
        modelsCount: '{count} models available',
        search: 'Use Ollama for web search',
        searchHint: 'Applies to every chat route: DSH has no per-route search selection.',
        searchOn: 'Web search will use the Ollama provider.',
        searchOff: 'Web search keeps its current provider.',
        searchNeedsKey: 'Save an API key before making Ollama the search provider.',
        searchAmbiguity: 'A key is stored, so Ollama counts as a usable search provider. If another provider is also usable and none is pinned, search reports a conflict until you pick one under Settings > Built-in plugins > Web search and fetch.',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved. The channels appear in the model selector.',
        saveFailed: 'Save failed: ',
        loadFailed: 'Could not read the current configuration: ',
        badEndpoint: 'Enter an http:// or https:// URL.',
        noModels: 'The endpoint returned no models; keep an existing channel or check the API key.',
        noAdapter: 'The model adapter (llm-pi-ai) is not mounted in this profile.',
        none: 'Not configured yet.',
      },
      zh: {
        nav: 'Ollama',
        title: 'Ollama 渠道',
        intro: '把 Ollama Cloud（或本地 Ollama 服务）添加为模型渠道，并可以让网页搜索走 Ollama。',
        apiKey: 'Ollama API key',
        apiKeyHint: '在 ollama.com/settings/keys 创建。保存在 Host 凭据库，不会写进配置文件。',
        apiKeyStored: '已为 OLLAMA_API_KEY 保存密钥。',
        apiKeyMissing: '尚未保存密钥。',
        apiKeyKeep: '留空表示保留已保存的密钥',
        apiKeyClear: '删除已保存的密钥',
        endpoint: '服务地址',
        endpointHint: 'Ollama Cloud 用 https://ollama.com；本地服务用 http://127.0.0.1:11434。',
        protocols: '协议',
        protocolsHint: '每个勾选的协议会成为一个独立模型渠道，可在模型选择器里切换。',
        protocolAnthropic: 'Anthropic Messages',
        protocolAnthropicHint: 'Bearer 令牌 + anthropic-version；/v1/messages',
        protocolResponses: 'OpenAI Responses',
        protocolResponsesHint: '无状态的 /v1/responses',
        protocolCompletions: 'OpenAI Chat Completions',
        protocolCompletionsHint: '兼容性最广；/v1/chat/completions',
        models: '模型',
        modelsHint: '从服务地址拉取，写入每个已勾选的渠道。',
        refreshModels: '拉取模型',
        fetching: '正在拉取模型…',
        modelsCount: '{count} 个可用模型',
        search: '网页搜索使用 Ollama',
        searchHint: '对全部对话渠道生效：DSH 目前不支持按渠道选择搜索提供方。',
        searchOn: '网页搜索将使用 Ollama 提供方。',
        searchOff: '网页搜索保持现有提供方。',
        searchNeedsKey: '请先保存 API key，再把 Ollama 设为搜索提供方。',
        searchAmbiguity: '已保存密钥，因此 Ollama 被视为可用的搜索提供方。若另一个提供方也可用且未固定其一，搜索会报冲突，需在 设置 > 内置插件 > 网页搜索与抓取 中选定一个。',
        save: '保存',
        saving: '保存中…',
        saved: '已保存。渠道已出现在模型选择器中。',
        saveFailed: '保存失败：',
        loadFailed: '读取当前配置失败：',
        badEndpoint: '请填写 http:// 或 https:// 开头的地址。',
        noModels: '服务地址没有返回模型；可保留已有渠道，或检查 API key。',
        noAdapter: '当前 profile 未挂载模型适配器（llm-pi-ai）。',
        none: '尚未配置。',
      },
    }

    const styles = {
      page: { display: 'grid', gap: '20px', color: 'var(--dsw-alias-label-primary)', fontSize: '13px' },
      title: { fontSize: '16px', fontWeight: 600, margin: 0 },
      intro: { margin: 0, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 },
      field: { display: 'grid', gap: '6px' },
      label: { fontSize: '12px', fontWeight: 500, color: 'var(--dsw-alias-label-secondary)' },
      hint: { margin: 0, fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.45 },
      input: {
        width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: '13px',
        color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', outline: 'none',
      },
      row: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
      choice: {
        display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-1)', cursor: 'pointer',
      },
      choiceText: { display: 'grid', gap: '2px' },
      choiceTitle: { fontSize: '13px', fontWeight: 500 },
      button: {
        padding: '8px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
        color: 'var(--dsw-alias-bg-base)', background: 'var(--dsw-alias-brand-primary)',
        border: '1px solid var(--dsw-alias-brand-primary)', borderRadius: '8px',
      },
      buttonQuiet: {
        padding: '8px 14px', fontSize: '13px', cursor: 'pointer',
        color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px',
      },
      buttonDisabled: { opacity: 0.55, cursor: 'default' },
      status: { margin: 0, fontSize: '12px', lineHeight: 1.45 },
      statusError: { color: 'var(--dsw-alias-state-error-primary)' },
      statusOk: { color: 'var(--dsw-alias-state-success-primary)' },
      divider: { height: '1px', background: 'var(--dsw-alias-border-l1)', margin: 0 },
      empty: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' },
    }

    /** Normalise a pasted endpoint: drop trailing slashes and a trailing `/v1`, which routes add themselves. */
    function normalizeHost(value) {
      return String(value).trim().replace(/\/+$/, '').replace(/\/v1$/, '')
    }

    /** Read one namespace view out of `settings/describe`. */
    function namespaceOf(description, ns) {
      const namespaces = description?.namespaces
      if (!Array.isArray(namespaces)) return undefined
      return namespaces.find(entry => entry !== null && typeof entry === 'object' && entry.ns === ns)
    }

    /** Build the ordered settings ops for the selected protocols. */
    function routeOps({ host, selected, models }) {
      const ops = []
      for (const route of ROUTES) {
        const path = ['providers', route.route]
        if (!selected.includes(route.api)) {
          ops.push({ op: 'unset', path })
          continue
        }
        ops.push({
          op: 'set',
          path,
          value: {
            displayName: `Ollama · ${route.api === 'anthropic-messages' ? 'Anthropic' : route.api === 'openai-responses' ? 'Responses' : 'Chat'}`,
            api: route.api,
            baseURL: route.baseFor(host),
            apiKeyEnv: KEY_REF,
            models,
          },
        })
      }
      return ops
    }

    /** Map one discovered model into a `llm-pi-ai` model profile. */
    function modelProfile(discovered) {
      const profile = { id: discovered.id }
      if (typeof discovered.name === 'string' && discovered.name.length > 0) profile.name = discovered.name
      if (Number.isFinite(discovered.contextWindow)) profile.contextWindow = discovered.contextWindow
      if (Number.isFinite(discovered.maxTokens)) profile.maxTokens = discovered.maxTokens
      const modalities = Array.isArray(discovered.inputModalities)
        ? discovered.inputModalities
        : Array.isArray(discovered.input) ? discovered.input : []
      if (modalities.length > 0) profile.input = modalities
      return profile
    }

    const OllamaSection = props => {
      const { t, api } = props
      const [loadState, setLoadState] = React.useState({ status: 'loading' })
      const [host, setHost] = React.useState(DEFAULT_HOST)
      const [keyDraft, setKeyDraft] = React.useState('')
      const [keyStored, setKeyStored] = React.useState(false)
      const [selected, setSelected] = React.useState([])
      const [models, setModels] = React.useState([])
      const [writtenRoutes, setWrittenRoutes] = React.useState([])
      const [searchOn, setSearchOn] = React.useState(false)
      const [searchPinned, setSearchPinned] = React.useState(false)
      const [webMounted, setWebMounted] = React.useState(true)
      const [writable, setWritable] = React.useState(true)
      const [revisions, setRevisions] = React.useState({})
      const [busy, setBusy] = React.useState(false)
      const [fetching, setFetching] = React.useState(false)
      const [message, setMessage] = React.useState({ kind: 'idle' })

      const refresh = React.useCallback(async () => {
        const described = await api.describe()
        if (!described.ok) {
          setLoadState({ status: 'error', message: described.error.message })
          return
        }
        setWritable(described.value.writable !== false)
        const llm = namespaceOf(described.value, LLM_NS)
        const web = namespaceOf(described.value, WEB_NS)
        if (llm === undefined) {
          setLoadState({ status: 'error', message: t('noAdapter') })
          return
        }
        const providers = (llm.value && llm.value.providers) || {}
        const present = ROUTES.filter(route => providers[route.route] !== undefined)
        setSelected(present.map(route => route.api))
        setWrittenRoutes(present.map(route => route.route))
        const firstConfigured = present[0]
        setHost(firstConfigured === undefined
          ? DEFAULT_HOST
          : normalizeHost(providers[firstConfigured.route].baseURL || DEFAULT_HOST))
        const knownModels = firstConfigured === undefined ? [] : (providers[firstConfigured.route].models || [])
        setModels(knownModels)
        const pinnedByUs = web !== undefined && web.value?.searchProvider === SEARCH_PROVIDER
        setSearchOn(pinnedByUs)
        setSearchPinned(pinnedByUs)
        setRevisions({ llm: llm.revision, web: web === undefined ? undefined : web.revision })
        setWebMounted(web !== undefined)
        setKeyStored(await api.keyConfigured())
        setLoadState({ status: 'ready' })
      }, [t, api])

      /** Re-read only the namespace revisions, keeping whatever the user has typed. */
      const refreshRevisions = async () => {
        try {
          const described = await api.describe()
          if (!described.ok) return
          const llm = namespaceOf(described.value, LLM_NS)
          const web = namespaceOf(described.value, WEB_NS)
          setRevisions({ llm: llm?.revision, web: web?.revision })
          if (web !== undefined) {
            const pinnedByUs = web.value?.searchProvider === SEARCH_PROVIDER
            setSearchPinned(pinnedByUs)
          }
        } catch {
          // A failed revision read leaves the previous revision in place; the next write reports a conflict.
        }
      }

      React.useEffect(() => { void refresh() }, [refresh])

      const toggleProtocol = protocol => {
        setSelected(current => current.includes(protocol)
          ? current.filter(entry => entry !== protocol)
          : [...current, protocol])
      }

      // Discovery may reuse the credential of a route that is actually written; a typed key wins over it.
      const configuredRoute = writtenRoutes[0]

      /** Discover models for `endpointHost`, sending an explicitly typed key when the form has one. */
      const discoverWith = async (endpointHost, apiKey) => {
        setFetching(true)
        try {
          const answer = await api.discover(`${endpointHost}/v1`, apiKey, configuredRoute)
          if (answer.kind === 'refused') {
            setMessage({ kind: 'error', message: answer.message })
            return []
          }
          const found = answer.models || []
          if (found.length === 0) {
            setMessage({ kind: 'error', message: t('noModels') })
            return []
          }
          const profiles = found.map(modelProfile)
          setModels(profiles)
          return profiles
        } finally {
          setFetching(false)
        }
      }

      /** Validate the endpoint, then fetch its models; reports the outcome in the status line. */
      const runDiscover = async () => {
        setMessage({ kind: 'idle' })
        const trimmed = normalizeHost(host)
        if (!/^https?:\/\//.test(trimmed)) {
          setMessage({ kind: 'error', message: t('badEndpoint') })
          return []
        }
        const profiles = await discoverWith(trimmed, keyDraft)
        if (profiles.length > 0) setMessage({ kind: 'ok', text: t('modelsCount', { count: profiles.length }) })
        return profiles
      }

      const save = async () => {
        setBusy(true)
        setMessage({ kind: 'idle' })
        try {
          const trimmed = normalizeHost(host)
          if (!/^https?:\/\//.test(trimmed)) {
            setMessage({ kind: 'error', message: t('badEndpoint') })
            return
          }
          const typedKey = keyDraft
          if (typedKey.length > 0) {
            const stored = await api.setKey(typedKey)
            if (!stored.ok) {
              setMessage({ kind: 'error', message: t('saveFailed') + stored.message })
              return
            }
            setKeyStored(true)
            setKeyDraft('')
          }
          let usable = models
          if (selected.length > 0 && usable.length === 0) usable = await discoverWith(trimmed, typedKey)
          if (selected.length > 0 && usable.length === 0) return
          if (searchOn && !keyStored && typedKey.length === 0) {
            setMessage({ kind: 'error', message: t('searchNeedsKey') })
            return
          }
          const written = await api.writeRoutes(routeOps({ host: trimmed, selected, models: usable }), revisions.llm)
          if (!written.ok) {
            setMessage({ kind: 'error', message: t('saveFailed') + written.message })
            return
          }
          if (webMounted && searchOn !== searchPinned) {
            const search = await api.writeSearch(searchOn, revisions.web)
            if (!search.ok) {
              setMessage({ kind: 'error', message: t('saveFailed') + search.message })
              return
            }
          }
          await refresh()
          setMessage({ kind: 'ok', text: t('saved') })
        } finally {
          setBusy(false)
          await refreshRevisions()
        }
      }

      const clearKey = async () => {
        setBusy(true)
        try {
          const cleared = await api.clearKey()
          if (!cleared.ok) {
            setMessage({ kind: 'error', message: t('saveFailed') + cleared.message })
            return
          }
          setKeyStored(false)
          setMessage({ kind: 'ok', text: t('apiKeyMissing') })
        } finally {
          setBusy(false)
        }
      }

      if (loadState.status === 'loading') {
        return h('section', { style: styles.page }, h('p', { style: styles.empty }, '…'))
      }
      if (loadState.status === 'error') {
        return h('section', { style: styles.page },
          h('h2', { style: styles.title }, t('title')),
          h('p', { style: { ...styles.status, ...styles.statusError } }, t('loadFailed') + loadState.message))
      }

      const disabled = busy || fetching || !writable
      return h('section', { style: styles.page, 'aria-labelledby': 'ollama-channel-title' },
        h('div', { style: styles.field },
          h('h2', { id: 'ollama-channel-title', style: styles.title }, t('title')),
          h('p', { style: styles.intro }, t('intro'))),

        h('div', { style: styles.field },
          h('label', { style: styles.label, htmlFor: 'ollama-key' }, t('apiKey')),
          h('input', {
            id: 'ollama-key', type: 'password', style: styles.input, value: keyDraft, disabled,
            placeholder: t('apiKeyKeep'), autoComplete: 'new-password', spellCheck: false,
            onChange: event => setKeyDraft(event.currentTarget.value),
          }),
          h('div', { style: styles.row },
            h('p', { style: styles.hint }, keyStored ? t('apiKeyStored') : t('apiKeyMissing')),
            keyStored ? h('button', {
              type: 'button', style: disabled ? { ...styles.buttonQuiet, ...styles.buttonDisabled } : styles.buttonQuiet,
              disabled, onClick: clearKey,
            }, t('apiKeyClear')) : null),
          h('p', { style: styles.hint }, t('apiKeyHint'))),

        h('div', { style: styles.field },
          h('label', { style: styles.label, htmlFor: 'ollama-host' }, t('endpoint')),
          h('input', {
            id: 'ollama-host', type: 'url', style: styles.input, value: host, spellCheck: false, disabled,
            onChange: event => setHost(event.currentTarget.value),
          }),
          h('p', { style: styles.hint }, t('endpointHint'))),

        h('div', { style: styles.divider }),

        h('div', { style: styles.field },
          h('span', { style: styles.label }, t('protocols')),
          h('p', { style: styles.hint }, t('protocolsHint')),
          h('div', { style: { display: 'grid', gap: '8px' } },
            ROUTES.map(route => h('label', { key: route.api, style: styles.choice },
              h('input', {
                type: 'checkbox', checked: selected.includes(route.api), disabled,
                onChange: () => toggleProtocol(route.api),
              }),
              h('span', { style: styles.choiceText },
                h('span', { style: styles.choiceTitle }, t(route.titleKey)),
                h('span', { style: styles.hint }, t(route.hintKey))))))),

        h('div', { style: styles.field },
          h('span', { style: styles.label }, t('models')),
          h('div', { style: styles.row },
            h('button', {
              type: 'button', disabled: busy || fetching,
              style: busy || fetching ? { ...styles.buttonQuiet, ...styles.buttonDisabled } : styles.buttonQuiet,
              onClick: () => { void runDiscover() },
            }, fetching ? t('fetching') : t('refreshModels')),
            h('p', { style: styles.hint }, models.length === 0 ? t('none') : t('modelsCount', { count: models.length }))),
          h('p', { style: styles.hint }, t('modelsHint'))),

        webMounted ? h('div', { style: styles.field },
          h('label', { style: styles.choice },
            h('input', {
              type: 'checkbox', checked: searchOn, disabled,
              onChange: () => setSearchOn(current => !current),
            }),
            h('span', { style: styles.choiceText },
              h('span', { style: styles.choiceTitle }, t('search')),
              h('span', { style: styles.hint }, t('searchHint')))),
          h('p', { style: styles.hint }, searchOn ? t('searchOn') : t('searchOff')),
          keyStored && !searchOn
            ? h('p', { style: { ...styles.hint, color: 'var(--dsw-alias-state-warn-primary)' } }, t('searchAmbiguity'))
            : null) : null,

        h('div', { style: styles.row },
          h('button', {
            type: 'button', disabled, onClick: () => { void save() },
            style: disabled ? { ...styles.button, ...styles.buttonDisabled } : styles.button,
          }, busy ? t('saving') : t('save'))),

        h('p', {
          role: 'status', 'aria-live': 'polite',
          style: {
            ...styles.status,
            ...(message.kind === 'error' ? styles.statusError : {}),
            ...(message.kind === 'ok' ? styles.statusOk : {}),
          },
        }, message.kind === 'ok' ? message.text : message.kind === 'error' ? message.message : ''))
    }

    return {
      inject: ['slots', 'locale', 'configForms', 'remote', 'remote.settings', 'remote.credentials', 'remote.llm'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'ollama: dictionaries')
        const t = ctx.locale.bind(NS)
        const api = {
          async describe() {
            const response = await ctx.remote.settings.describe()
            return response.ok ? { ok: true, value: response.value } : { ok: false, error: response.error }
          },
          async keyConfigured() {
            try {
              const response = await ctx.remote.credentials.describe([KEY_REF])
              if (!response.ok) return false
              const info = response.value?.[KEY_REF]
              return info?.configured === true
            } catch {
              return false
            }
          },
          async setKey(value) {
            const response = await ctx.remote.credentials.set(KEY_REF, value)
            return response.ok ? { ok: true } : { ok: false, message: response.error.message }
          },
          async clearKey() {
            const response = await ctx.remote.credentials.unset(KEY_REF)
            return response.ok ? { ok: true } : { ok: false, message: response.error.message }
          },
          async discover(baseURL, apiKey, provider) {
            const response = await ctx.remote.llm.discoverModels(LLM_NS, {
              baseURL,
              api: 'openai-completions',
              ...(typeof apiKey === 'string' && apiKey.length > 0 ? { apiKey } : {}),
              ...(typeof provider === 'string' && provider.length > 0 ? { provider } : {}),
            })
            return response.ok
              ? { kind: 'found', models: response.value }
              : { kind: 'refused', message: response.error.message }
          },
          async writeRoutes(ops, revision) {
            const response = await ctx.remote.settings.mutate(LLM_NS, ops, revision)
            return response.ok ? { ok: true } : { ok: false, message: response.error.message }
          },
          async writeSearch(enabled, revision) {
            if (!enabled) {
              // Re-read before clearing: another surface may have pinned a different provider since load.
              try {
                const described = await api.describe()
                if (described.ok) {
                  const web = namespaceOf(described.value, WEB_NS)
                  if (web !== undefined && web.value?.searchProvider !== SEARCH_PROVIDER) return { ok: true }
                }
              } catch {
                return { ok: false, message: 'web search settings are not readable' }
              }
            }
            const ops = enabled
              ? [{ op: 'set', path: ['searchProvider'], value: SEARCH_PROVIDER }]
              : [{ op: 'unset', path: ['searchProvider'] }]
            const response = await ctx.remote.settings.mutate(WEB_NS, ops, revision)
            return response.ok ? { ok: true } : { ok: false, message: response.error.message }
          },
        }
        ctx.effect(() => ctx.configForms.whileServed([LLM_NS], () => ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'ollama',
          order: 25,
          label: () => t('nav'),
          locale: NS,
          inject: () => ({ t, api }),
        }, OllamaSection))), 'ollama: settings section')
      },
    }
  },
})
