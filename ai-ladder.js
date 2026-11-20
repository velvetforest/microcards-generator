// AI ladder: free models, smartest first, across providers. When one runs out the next
// takes over, and being out is remembered with the time it ends. No dependencies, and no
// build step: load it with a plain script tag and use window.AiLadder.
(function (root) {
  'use strict';

  const MINUTE = 60_000;
  const SHORT_WAIT = 20;
  const IDLE_LIMIT = 60_000;
  const MAX_RESENDS = 3;
  const LONG_BACKOFF = 6 * 60 * MINUTE;
  const DAILY = /per[\s-]?day|\bRPD\b|\bTPD\b|\bdaily\b/i;
  const THINKING = 'high';

  const options = {
    prefix: 'ai-ladder',
    locale: undefined,
    texts: {
      closed: 'All free models are out for now. The first one returns at {time}.',
      noRoute: 'No model can take this request. Add a key or shorten the source.',
      moving: '{from} is paused until {time}, moving to {to}',
      waiting: 'Waiting {s} s for the per-minute limit of {model}',
      resend: 'The connection dropped while you were away, sending again',
      empty: 'The model returned nothing.',
      noKey: 'No key yet',
      ready: 'Ready',
      paused: 'Paused until {time}',
      heading: 'When quota runs out, the app moves down this list',
      backup: 'Backup key for {name}',
      getKey: 'Get a key',
      retry: 'Retry from the top',
    },
  };
  const t = (key, vars = {}) => options.texts[key].replace(/\{(\w+)\}/g, (_, name) => vars[name]);

  // Limits are per provider. Groq allows about 8000 tokens a minute and an image costs 2048.
  const PROVIDERS = {
    gemini: { short: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey', images: 5, chars: 24000, gap: 1500, thinking: true },
    mistral: { short: 'Mistral', base: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys', images: 3, chars: 24000, gap: 1500 },
    groq: { short: 'Groq', base: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', images: 1, chars: 3500, gap: 4000, maxOut: 3500 },
  };

  // Free models that read images, smartest first, by the Artificial Analysis Intelligence
  // Index of 2026-11: 3.8 Flash 31, Mistral Large 26, Qwen 3.8 27B 20. The other Gemini
  // models had no score and sit by family. Lite models are left out on purpose: a weaker
  // answer is worse than a clear stop. Thinking stays high: 3.8 Flash falls to 22 at low.
  const LADDER = [
    { provider: 'gemini', model: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', effort: THINKING },
    { provider: 'gemini', model: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', effort: THINKING },
    { provider: 'gemini', model: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', effort: THINKING },
    { provider: 'mistral', model: 'mistral-large-latest', label: 'Mistral Large' },
    { provider: 'gemini', model: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', effort: THINKING },
    { provider: 'groq', model: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B', effort: THINKING },
  ];

  const onLadder = (provider, model) => LADDER.some((rung) => rung.provider === provider && rung.model === model);

  /* ---------- quota memory ---------- */

  const storeKey = () => `${options.prefix}.quota`;
  let blocks = null;

  function loadBlocks() {
    try {
      return JSON.parse(localStorage.getItem(storeKey())) ?? {};
    } catch {
      return {};
    }
  }

  function saveBlocks(value) {
    try {
      localStorage.setItem(storeKey(), JSON.stringify(value));
    } catch { /* still remembered until the page closes */ }
  }

  const state = () => {
    blocks ??= loadBlocks();
    return blocks;
  };

  const routeId = (provider, model, key = '') => `${provider}/${model}/${key.slice(-6)}`;

  function blockedUntil(id, now = Date.now()) {
    const entry = state()[id];
    return entry && entry.until > now ? entry : null;
  }

  function block(id, entry, now = Date.now()) {
    const all = state();
    for (const [key, old] of Object.entries(all)) if (old.until <= now) delete all[key];
    all[id] = entry;
    saveBlocks(all);
  }

  function clearBlocks() {
    blocks = {};
    saveBlocks(blocks);
  }

  // Google's daily quota ends at midnight Pacific time, whatever the reader's clock says.
  function nextPacificMidnight(now = Date.now()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(now).map(({ type, value }) => [type, Number(value)]));
    return now + 24 * 60 * MINUTE - (parts.hour * 3600 + parts.minute * 60 + parts.second) * 1000 + MINUTE;
  }

  function statedSeconds(headers, body, now) {
    const after = Number(headers.get('retry-after'));
    if (after > 0) return after;
    const delay = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(body) ?? /retry in ([\d.]+)\s*s/i.exec(body);
    if (delay) return Number(delay[1]);
    const clock = /try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(body);
    if (clock && clock[0].length > 'try again in '.length) return Number(clock[1] ?? 0) * 3600 + Number(clock[2] ?? 0) * 60 + Number(clock[3] ?? 0);
    const reset = Number(headers.get('x-ratelimit-reset'));
    return reset > now ? (reset - now) / 1000 : 0;
  }

  // Reads a 429 for how long the model is out. A provider that gives no time is tried again
  // after a minute, then at longer and longer gaps, so it is never hammered.
  function readLimit(provider, headers, body, id, now = Date.now()) {
    const seconds = statedSeconds(headers, body, now);
    if (DAILY.test(body)) {
      const until = provider === 'gemini' ? nextPacificMidnight(now) : now + (seconds * 1000 || LONG_BACKOFF);
      return { until, scope: 'day', seconds };
    }
    if (seconds) return { until: now + seconds * 1000, scope: 'minute', seconds };
    const hits = (state()[id]?.hits ?? 0) + 1;
    return { until: now + Math.min(MINUTE * 2 ** (hits - 1), LONG_BACKOFF), scope: 'minute', seconds: 0, hits };
  }

  function whenText(until, now = Date.now()) {
    const date = new Date(until);
    const time = date.toLocaleTimeString(options.locale, { hour: '2-digit', minute: '2-digit' });
    return date.toDateString() === new Date(now).toDateString() ? time : `${time} ${date.toLocaleDateString(options.locale, { day: 'numeric', month: 'numeric' })}`;
  }

  /* ---------- leaving and returning to the page ---------- */

  const cancelled = () => Object.assign(new Error('cancelled'), { name: 'AbortError' });

  const wait = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const stop = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });

  // iOS freezes a page in the background and cuts its connections, so an answer lost that
  // way is not a failure: it is asked for again once the reader is back.
  let hiddenAt = 0;
  let watching = false;
  function watchVisibility() {
    if (watching || !root.document) return;
    watching = true;
    root.document.addEventListener('visibilitychange', () => { if (root.document.hidden) hiddenAt = Date.now(); });
  }

  const wasHidden = (since) => Boolean(root.document?.hidden) || hiddenAt >= since;

  const whenVisible = (signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const page = root.document;
    if (!page?.hidden) return resolve();
    const done = () => {
      if (page.hidden) return;
      page.removeEventListener('visibilitychange', done);
      signal?.removeEventListener('abort', stop);
      resolve();
    };
    const stop = () => {
      page.removeEventListener('visibilitychange', done);
      reject(cancelled());
    };
    page.addEventListener('visibilitychange', done);
    signal?.addEventListener('abort', stop, { once: true });
  });

  /* ---------- requests ---------- */

  async function readStream(res, onText, onSign) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        // Comments and reasoning carry no answer, but they prove the model is still working.
        if (line.trim()) onSign?.();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        // Once a stream has begun its status stays 200, so failures arrive as an event.
        if (event.error) throw Object.assign(new Error(event.error.message ?? 'stream failed'), { upstream: true });
        const piece = event.choices?.[0]?.delta?.content;
        if (piece) {
          text += piece;
          onText(text.length);
        }
      }
    }
    return text;
  }

  async function describeError(res) {
    const body = await res.text().catch(() => '');
    let message = body.slice(0, 200);
    try {
      const parsed = JSON.parse(body);
      message = parsed.error?.message || parsed[0]?.error?.message || parsed.message || message;
    } catch { /* keep the raw text */ }
    return `${res.status}: ${message}`;
  }

  const parts = (messages, type) => messages.flatMap((message) => (Array.isArray(message.content) ? message.content.filter((part) => part.type === type) : []));
  const textSize = (messages) => messages.reduce((sum, message) => sum + (typeof message.content === 'string' ? message.content.length : parts([message], 'text').reduce((n, part) => n + part.text.length, 0)), 0);

  // Cut a request down to what one provider accepts, keeping the start of the text.
  function fit(messages, route) {
    return messages.map((message) => {
      if (!Array.isArray(message.content)) return message;
      const words = parts([message], 'text').map((part) => ({ ...part, text: part.text.slice(0, route.chars) }));
      return { ...message, content: [...words, ...parts([message], 'image_url').slice(0, route.images)] };
    });
  }

  // Turns a native Gemini body into chat messages. Files that are not pictures, and link
  // tools, only work on Gemini's own API, so the caller is told when that is the case.
  function fromGeminiBody(body) {
    const content = [];
    let geminiOnly = Boolean(body.tools?.length);
    for (const part of body.contents.flatMap((turn) => turn.parts)) {
      if (part.text !== undefined) content.push({ type: 'text', text: part.text });
      else if (part.inline_data?.mime_type?.startsWith('image/')) content.push({ type: 'image_url', image_url: { url: `data:${part.inline_data.mime_type};base64,${part.inline_data.data}` } });
      else geminiOnly = true;
    }
    const system = body.system_instruction?.parts?.map((part) => part.text).join('\n');
    return { geminiOnly, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }] };
  }

  class AiClient {
    // settings: { provider, model, keys: { gemini, mistral, groq }, base?, json?, temperature?,
    // maxOut?, minGapMs?, only?: ['mistral', 'groq'] to keep to some providers,
    // complete?: (text) => true once an answer is whole, to catch a stream cut in the background }
    constructor(settings) {
      this.settings = settings;
      this.slots = {};
    }

    route(provider, model, rung = {}) {
      const preset = PROVIDERS[provider] ?? {};
      const { keys = {}, base, minGapMs, maxOut } = this.settings;
      const key = keys[provider] ?? '';
      return {
        id: routeId(provider, model, key), provider, model, key, label: rung.label ?? model, base: (provider === this.settings.provider && base) || preset.base,
        effort: rung.effort ?? (preset.thinking ? THINKING : undefined), images: preset.images ?? 3, chars: preset.chars ?? 12000,
        maxOut: preset.maxOut ?? maxOut, gap: minGapMs ?? preset.gap ?? 4000,
      };
    }

    // The ladder runs only from a model on it. A model picked by hand is never swapped.
    routes() {
      const { provider, model, only } = this.settings;
      const rung = LADDER.find((item) => item.provider === provider && item.model === model);
      const own = this.route(provider, model, rung);
      if (!rung) return [own];
      const rest = LADDER.filter((item) => item !== rung).map((item) => this.route(item.provider, item.model, item));
      const chain = [own, ...rest].filter((route) => route.key);
      return only ? chain.filter((route) => only.includes(route.provider)) : chain;
    }

    // When the whole chain is out, the moment the first of it returns. Check this before
    // doing any work, so no request is spent on a model known to be out.
    closedUntil() {
      const routes = this.routes();
      if (!routes.length || routes.some((route) => !blockedUntil(route.id))) return null;
      return Math.min(...routes.map((route) => blockedUntil(route.id).until));
    }

    // strict: skip any model that could not take the whole request, instead of cutting it.
    // Use it wherever the source must not lose a word.
    async chat(messages, { signal, onStatus, onText, onRoute, strict = false } = {}) {
      const all = this.routes();
      const routes = strict ? all.filter((route) => textSize(messages) <= route.chars && parts(messages, 'image_url').length <= route.images) : all;
      if (!routes.length) throw new Error(t('noRoute'));
      const refused = { stream: new Set(), effort: new Set() };
      const waits = new Map();
      let resends = 0;
      watchVisibility();
      const open = () => routes.find((route) => !blockedUntil(route.id));
      const closed = () => t('closed', { time: whenText(Math.min(...routes.map((route) => blockedUntil(route.id)?.until ?? Date.now()))) });
      const sendAgain = async (route) => {
        resends++;
        onStatus?.(t('resend'));
        await whenVisible(signal);
        this.slots[route.provider] = 0;
      };
      // Moves on from a model that cannot answer, and remembers for how long.
      const leave = (route, entry) => {
        block(route.id, entry);
        const next = open();
        if (next) onStatus?.(t('moving', { from: route.label, time: whenText(entry.until), to: next.label }));
      };
      for (let attempt = 0; attempt < routes.length * 3 + 6; attempt++) {
        if (signal?.aborted) throw cancelled();
        const route = open();
        if (!route) throw new Error(closed());
        // Calls made together each book their own slot, so they stay spaced.
        const now = Date.now();
        const slot = Math.max(now, (this.slots[route.provider] ?? 0) + route.gap);
        this.slots[route.provider] = slot;
        if (slot > now) await wait(slot - now, signal);
        const sentAt = Date.now();
        const stream = !refused.stream.has(route.id);
        const reasoning = refused.effort.has(route.id) ? null : route.effort;
        // A stalled model is abandoned, not waited on: silence counts, slow output does not.
        const guard = new AbortController();
        const stop = () => guard.abort();
        signal?.addEventListener('abort', stop);
        let idle = setTimeout(stop, IDLE_LIMIT);
        const renew = () => {
          clearTimeout(idle);
          idle = setTimeout(stop, IDLE_LIMIT);
        };
        const alive = (length) => {
          renew();
          onText?.(length);
        };
        let res;
        let streamed = null;
        try {
          res = await fetch(`${route.base}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(route.key ? { Authorization: `Bearer ${route.key}` } : {}) },
            signal: guard.signal,
            body: JSON.stringify({
              model: route.model, messages: fit(messages, route), temperature: this.settings.temperature ?? 0.1, stream,
              ...(this.settings.json ? { response_format: { type: 'json_object' } } : {}),
              ...(reasoning ? { reasoning_effort: reasoning } : {}),
              ...(route.maxOut ? { max_tokens: route.maxOut } : {}),
            }),
          });
          if (res.ok && res.headers.get('content-type')?.includes('event-stream')) streamed = await readStream(res, alive, renew);
        } catch (err) {
          if (signal?.aborted) throw cancelled();
          if (wasHidden(sentAt) && resends < MAX_RESENDS) {
            await sendAgain(route);
            attempt--;
            continue;
          }
          if (!err.upstream && !guard.signal.aborted) throw err;
          res = { status: 503, headers: new Headers() };
        } finally {
          clearTimeout(idle);
          signal?.removeEventListener('abort', stop);
        }
        if (streamed !== null) {
          // A cut stream can also just end, leaving half an answer.
          if (wasHidden(sentAt) && !(this.settings.complete?.(streamed) ?? true) && resends < MAX_RESENDS) {
            await sendAgain(route);
            attempt--;
            continue;
          }
          if (streamed) {
            onRoute?.(route);
            return streamed;
          }
          res = { status: 503, headers: new Headers() };
        }
        if (res.status === 400 && reasoning) {
          refused.effort.add(route.id);
          continue;
        }
        // Some servers refuse streaming.
        if (res.status === 400 && stream) {
          refused.stream.add(route.id);
          continue;
        }
        if (res.status === 429) {
          const limit = readLimit(route.provider, res.headers, await res.clone().text().catch(() => ''), route.id);
          const tries = waits.get(route.id) ?? 0;
          // A short per-minute pause is worth waiting out rather than dropping to a weaker model.
          if (limit.scope === 'minute' && limit.seconds && limit.seconds <= SHORT_WAIT && tries < 2) {
            waits.set(route.id, tries + 1);
            onStatus?.(t('waiting', { s: Math.ceil(limit.seconds), model: route.label }));
            await wait(limit.seconds * 1000, signal);
            continue;
          }
          leave(route, limit);
          continue;
        }
        if (res.status === 503) {
          leave(route, { until: Date.now() + MINUTE, scope: 'busy' });
          continue;
        }
        const others = routes.some((other) => other !== route && !blockedUntil(other.id));
        // A model the provider has taken away is skipped for a day, even when it
        // is the last one left: its 404 would only puzzle the reader.
        if (res.status === 404) {
          const gone = /no longer available|not found|is not supported/i.test(await res.clone().text().catch(() => ''));
          leave(route, { until: Date.now() + (gone ? 24 * 60 : 10) * MINUTE, scope: 'down' });
          continue;
        }
        if ([413, 502].includes(res.status) && others) {
          leave(route, { until: Date.now() + 10 * MINUTE, scope: 'down' });
          continue;
        }
        if ([401, 403].includes(res.status) && others) {
          leave(route, { until: Date.now() + 60 * MINUTE, scope: 'key' });
          continue;
        }
        if (!res.ok) throw new Error(await describeError(res));
        const body = await res.json();
        const text = body.choices?.[0]?.message?.content;
        if (text) {
          onRoute?.(route);
          return text;
        }
        if (!others) throw new Error(body.error?.message ?? t('empty'));
        leave(route, { until: Date.now() + MINUTE, scope: 'busy' });
      }
      throw new Error(closed());
    }
  }

  /* ---------- settings panel ---------- */

  function ladderState(settings) {
    const client = new AiClient(settings);
    return LADDER.map((rung) => {
      const route = client.route(rung.provider, rung.model, rung);
      return { ...rung, hasKey: Boolean(route.key), out: blockedUntil(route.id) };
    });
  }

  function node(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'onclick') el.onclick = value;
      else if (name === 'value') el.value = value;
      else el.setAttribute(name, value);
    }
    el.append(...kids);
    return el;
  }

  // Draws the ladder, each rung's state and the keys for the other providers. Text goes in
  // as text nodes, and class names can follow the app: { input, button, note }.
  function renderPanel(box, settings, classes = {}) {
    const provider = settings.provider;
    const others = [...new Set(LADDER.map((rung) => rung.provider))].filter((name) => name !== provider);
    const typed = panelKeys(box);
    const keys = { ...settings.keys, ...typed };
    const stateOf = (rung) => {
      if (!rung.hasKey) return ['off', t('noKey')];
      return rung.out ? ['out', t('paused', { time: whenText(rung.out.until) })] : ['ready', t('ready')];
    };
    box.replaceChildren(
      node('p', { class: 'ladder-title' }, t('heading')),
      node('ol', { class: 'ladder-list' }, ...ladderState({ ...settings, keys }).map((rung) => {
        const [kind, text] = stateOf(rung);
        return node('li', {}, node('span', {}, rung.label), node('small', { class: `ladder-state ladder-state--${kind}` }, text));
      })),
      ...others.map((name) => node('label', { class: 'ladder-key' },
        node('span', {}, t('backup', { name: PROVIDERS[name].short }), ' ', node('a', { href: PROVIDERS[name].keyUrl, target: '_blank', rel: 'noopener' }, t('getKey'))),
        node('input', { class: `backup-key ${classes.input ?? ''}`, type: 'password', autocomplete: 'off', 'data-provider': name, value: keys[name] ?? '' }))),
      node('button', { class: classes.button ?? '', type: 'button', onclick: () => { clearBlocks(); renderPanel(box, settings, classes); } }, t('retry')));
  }

  function panelKeys(box) {
    return Object.fromEntries([...box.querySelectorAll('.backup-key')].map((input) => [input.dataset.provider, input.value.trim()]));
  }

  function configure(changes = {}) {
    if (changes.texts) Object.assign(options.texts, changes.texts);
    if (changes.prefix) {
      options.prefix = changes.prefix;
      blocks = null;
    }
    if (changes.locale) options.locale = changes.locale;
  }

  root.AiLadder = {
    AiClient, LADDER, PROVIDERS, block, blockedUntil, clearBlocks, configure, fromGeminiBody, ladderState, nextPacificMidnight,
    onLadder, panelKeys, readLimit, renderPanel, routeId, whenText,
  };
})(globalThis);
