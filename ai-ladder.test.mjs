// Run with: node --test ai-ladder.test.mjs
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './ai-ladder.js';

const { AiClient, LADDER, PROVIDERS, block, blockedUntil, clearBlocks, forgetModels, fromGeminiBody, ladder, ladderState, nextPacificMidnight, noteSwap, onLadder, readLimit, refreshModels, routeId, whenText } = globalThis.AiLadder;

beforeEach(() => { clearBlocks(); forgetModels(); });

const keys = { gemini: 'g-key-111111', mistral: 'm-key-222222', groq: 'q-key-333333' };
const client = (overrides = {}) => new AiClient({ provider: 'gemini', model: 'gemini-3.8-flash', keys, minGapMs: 0, ...overrides });
const answer = (content) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const dayLimit = () => new Response(JSON.stringify([{ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { retryDelay: '41s' }] } }]), { status: 429 });
const serve = (handle) => {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url: String(url), model: body.model, body, auth: init.headers.Authorization });
    return handle(body.model, seen.length);
  };
  return seen;
};

test('the ladder holds no lite model and no low thinking', () => {
  assert.ok(!LADDER.some((rung) => /lite|nano|-mini/.test(rung.model)));
  assert.ok(LADDER.every((rung) => rung.effort === undefined || rung.effort === 'high'));
});

test('when a rung runs out, the next smartest free model takes over', async () => {
  const seen = serve((model) => (model === 'gemini-3.8-flash' ? dayLimit() : answer('ok')));
  assert.equal(await client().chat([]), 'ok');
  assert.deepEqual(seen.map((call) => call.model), ['gemini-3.8-flash', 'gemini-3.6-flash']);
});

test('the chain crosses providers, each with its own address and key', async () => {
  const seen = serve((model) => (model.startsWith('gemini') ? dayLimit() : answer('ok')));
  await client().chat([]);
  assert.equal(seen.at(-1).model, 'mistral-large-latest');
  assert.match(seen.at(-1).url, /api\.mistral\.ai/);
  assert.equal(seen.at(-1).auth, `Bearer ${keys.mistral}`);
});

test('a provider with no key is skipped without a call', async () => {
  const seen = serve((model) => (model.startsWith('gemini') ? dayLimit() : answer('ok')));
  await client({ keys: { gemini: keys.gemini, groq: keys.groq } }).chat([]);
  assert.ok(!seen.some((call) => call.model.startsWith('mistral')));
});

test('a model known to be out is never called again, even by a new client', async () => {
  serve((model) => (model === 'gemini-3.8-flash' ? dayLimit() : answer('ok')));
  await client().chat([]);
  const second = serve(() => answer('ok'));
  await client().chat([]);
  assert.deepEqual(second.map((call) => call.model), ['gemini-3.6-flash']);
});

test('with everything out, nothing is spent and the time is known', async () => {
  const c = client();
  const until = Date.now() + 3_600_000;
  for (const route of c.routes()) block(route.id, { until, scope: 'day' });
  const seen = serve(() => answer('ok'));
  assert.equal(c.closedUntil(), until);
  await assert.rejects(c.chat([]), /out for now/);
  assert.equal(seen.length, 0);
});

test('blocks follow the key, so a new key starts fresh', () => {
  block(routeId('gemini', 'gemini-3.8-flash', keys.gemini), { until: Date.now() + 60_000, scope: 'day' });
  const fresh = client({ keys: { gemini: 'another-key-999999' } }).routes()[0];
  assert.equal(blockedUntil(fresh.id), null);
});

test('a short per-minute limit is waited out on the same model', async () => {
  const seen = serve((model, count) => (count === 1 ? new Response('{}', { status: 429, headers: { 'retry-after': '0.01' } }) : answer('ok')));
  await client().chat([]);
  assert.deepEqual(seen.map((call) => call.model), ['gemini-3.8-flash', 'gemini-3.8-flash']);
});

test('a bad backup key is skipped, not fatal', async () => {
  const seen = serve((model) => {
    if (model.startsWith('gemini')) return dayLimit();
    return model.startsWith('mistral') ? new Response('{"message":"Unauthorized"}', { status: 401 }) : answer('ok');
  });
  assert.equal(await client().chat([]), 'ok');
  assert.equal(seen.at(-1).model, 'qwen/qwen3.8-27b');
});

test('a failure inside a stream passes to the next model', async () => {
  const seen = serve((model, count) => (count === 1
    ? new Response('data: {"error":{"code":502,"message":"down"}}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
    : answer('ok')));
  await client().chat([]);
  assert.equal(seen.length, 2);
});

test('requests are cut to what each provider accepts', async () => {
  const seen = serve((model) => (model === 'qwen/qwen3.8-27b' ? answer('ok') : dayLimit()));
  const content = [{ type: 'text', text: 'x'.repeat(30000) }, { type: 'image_url', image_url: { url: 'data:a' } }, { type: 'image_url', image_url: { url: 'data:b' } }];
  await client({ keys: { gemini: keys.gemini, groq: keys.groq } }).chat([{ role: 'user', content }]);
  const sent = seen.at(-1).body.messages[0].content;
  assert.equal(sent.filter((part) => part.type === 'image_url').length, 1);
  assert.equal(sent[0].text.length, PROVIDERS.groq.chars);
});

test('strict skips a model rather than losing a word', async () => {
  const seen = serve((model) => (model.startsWith('gemini') ? dayLimit() : answer('ok')));
  const long = [{ role: 'user', content: [{ type: 'text', text: 'x'.repeat(10000) }] }];
  await client({ keys: { gemini: keys.gemini, groq: keys.groq, mistral: keys.mistral } }).chat(long, { strict: true });
  assert.ok(!seen.some((call) => call.model.startsWith('qwen')));
  assert.equal(seen.at(-1).body.messages[0].content[0].text.length, 10000);
  clearBlocks();
  await assert.rejects(client({ model: 'qwen/qwen3.8-27b', provider: 'groq', only: ['groq'] }).chat(long, { strict: true }), /No model can take/);
});

test('plain text output stays plain unless json is asked for', async () => {
  const seen = serve(() => answer('ok'));
  await client().chat([]);
  await client({ json: true }).chat([]);
  assert.equal(seen[0].body.response_format, undefined);
  assert.deepEqual(seen[1].body.response_format, { type: 'json_object' });
});

test('only keeps a call to some providers', async () => {
  const c = client({ only: ['mistral', 'groq'] });
  assert.deepEqual(c.routes().map((route) => route.provider), ['mistral', 'groq']);
});

test('a model picked by hand never moves down the ladder', async () => {
  const seen = serve(() => dayLimit());
  await assert.rejects(new AiClient({ provider: 'gemini', model: 'my-own-model', keys, minGapMs: 0 }).chat([]));
  assert.deepEqual(seen.map((call) => call.model), ['my-own-model']);
});

test('a native Gemini body converts, and says when it needs Gemini', () => {
  const body = { system_instruction: { parts: [{ text: 'rules' }] }, contents: [{ role: 'user', parts: [{ text: 'hello' }, { inline_data: { mime_type: 'image/png', data: 'AAA' } }] }] };
  const plain = fromGeminiBody(body);
  assert.equal(plain.geminiOnly, false);
  assert.equal(plain.messages[0].content, 'rules');
  assert.equal(plain.messages[1].content[1].image_url.url, 'data:image/png;base64,AAA');
  assert.equal(fromGeminiBody({ ...body, tools: [{ url_context: {} }] }).geminiOnly, true);
  const pdf = { contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'application/pdf', data: 'AAA' } }] }] };
  assert.equal(fromGeminiBody(pdf).geminiOnly, true);
});

test('the panel can see where each rung stands', () => {
  const settings = { provider: 'gemini', model: 'gemini-3.8-flash', keys: { gemini: keys.gemini } };
  assert.equal(ladderState(settings).find((rung) => rung.provider === 'groq').hasKey, false);
  block(routeId('gemini', 'gemini-3.8-flash', keys.gemini), { until: Date.now() + 60_000, scope: 'day' });
  assert.ok(ladderState(settings)[0].out);
});

const headers = (values = {}) => new Headers(values);

test('Gemini daily quota lasts until midnight Pacific, whatever the hint says', () => {
  const now = Date.UTC(2026, 10, 2, 12, 0, 0);
  const limit = readLimit('gemini', headers(), '{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","retryDelay":"41s"}', 'id', now);
  assert.equal(limit.until, Date.UTC(2026, 10, 3, 8, 1, 0));
});

test('midnight Pacific lands after now and within a day', () => {
  for (const now of [Date.UTC(2026, 0, 15, 7, 59), Date.UTC(2026, 6, 15, 8, 1)]) {
    assert.ok(nextPacificMidnight(now) > now && nextPacificMidnight(now) - now <= 86_460_000);
  }
});

test('per-minute hints and Groq messages are read', () => {
  assert.equal(readLimit('gemini', headers(), '{"retryDelay":"41s"}', 'id', 1000).seconds, 41);
  assert.equal(readLimit('groq', headers(), 'requests per day (RPD): Please try again in 7m12.5s', 'id', 0).until, 432500);
  assert.equal(readLimit('groq', headers({ 'retry-after': '7' }), 'tokens per minute', 'id', 0).seconds, 7);
});

test('no stated time backs off further each time', () => {
  const first = readLimit('mistral', headers(), '{}', 'same', 0);
  assert.equal(first.until, 60_000);
  block('same', first, 0);
  assert.equal(readLimit('mistral', headers(), '{}', 'same', 0).until, 120_000);
});

test('a time today shows the clock, and another day adds the date', () => {
  const now = new Date(2026, 10, 2, 9, 0).getTime();
  assert.ok(!whenText(new Date(2026, 10, 2, 14, 30).getTime(), now).includes('/'));
  assert.ok(whenText(new Date(2026, 10, 3, 14, 30).getTime(), now).includes('/'));
});

// ---------- live model lists ----------

const listsServe = (lists) => {
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push(String(url));
    if (String(url).includes('generativelanguage')) return Response.json({ models: lists.gemini.map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ['generateContent'] })) });
    if (String(url).includes('mistral')) return Response.json({ data: lists.mistral.map((id) => ({ id })) });
    return Response.json({ data: lists.groq.map((id) => ({ id, active: true })) });
  };
  return asked;
};
const today = { gemini: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-flash-lite', 'text-embedding-004'], mistral: ['mistral-large-latest'], groq: ['qwen/qwen3.8-27b'] };

test('with no list yet, the ladder is the written one', () => {
  assert.deepEqual(ladder().map((rung) => rung.model), LADDER.map((rung) => rung.model));
});

test('a rung its provider no longer lists is dropped', async () => {
  listsServe({ ...today, gemini: today.gemini.filter((id) => id !== 'gemini-3.6-flash') });
  await refreshModels(keys);
  assert.ok(!ladder().some((rung) => rung.model === 'gemini-3.6-flash'));
  assert.ok(ladder().some((rung) => rung.model === 'gemini-3.8-flash'));
});

test('a newer Flash and a newer Pro join above their kind, lite models stay out', async () => {
  listsServe({ ...today, gemini: [...today.gemini, 'gemini-4-flash-preview', 'gemini-4-flash-preview-11-2026', 'gemini-4.2-pro', 'gemini-4.5-flash-lite'] });
  await refreshModels(keys);
  const models = ladder().map((rung) => rung.model);
  assert.equal(models[0], 'gemini-4-flash-preview');
  assert.equal(ladder()[0].label, 'Gemini 4 Flash');
  assert.ok(models.indexOf('gemini-4.2-pro') === models.indexOf('gemini-3.1-pro-preview') - 1);
  assert.ok(!models.some((id) => /lite|dated|11-2026/.test(id)));
  const seen = serve(() => answer('ok'));
  await client().chat([]);
  assert.equal(seen[0].model, 'gemini-4-flash-preview');
});

test('a rung picked below the top still leads', async () => {
  listsServe({ ...today, gemini: [...today.gemini, 'gemini-4-flash'] });
  await refreshModels(keys);
  const seen = serve(() => answer('ok'));
  await client({ model: 'gemini-3-flash-preview' }).chat([]);
  assert.equal(seen[0].model, 'gemini-3-flash-preview');
});

test('a saved model that left the ladder still runs it, from the top', async () => {
  listsServe({ ...today, gemini: ['gemini-4-flash', 'gemini-3.1-pro-preview'] });
  await refreshModels(keys);
  assert.ok(onLadder('gemini', 'gemini-3.8-flash'));
  const seen = serve(() => answer('ok'));
  await client().chat([]);
  assert.equal(seen[0].model, 'gemini-4-flash');
});

test('lists are fetched once a day per key, and a failed fetch keeps the ladder', async () => {
  const asked = listsServe(today);
  await refreshModels(keys);
  await refreshModels(keys);
  assert.equal(asked.length, 3);
  globalThis.fetch = async () => { throw new Error('offline'); };
  await refreshModels({ ...keys, gemini: 'another-key-999999' });
  assert.ok(ladder().some((rung) => rung.model === 'gemini-3.8-flash'));
});

test('a 404 that names a replacement moves to it at once, and remembers', async () => {
  const gone = () => new Response(JSON.stringify({ error: { code: 404, message: 'This model models/gemini-3.8-flash is no longer available to new users. Please update your code to use models/gemini-3.9-flash for the latest features.' } }), { status: 404 });
  const seen = serve((model) => (model === 'gemini-3.8-flash' ? gone() : answer('ok')));
  assert.equal(await client().chat([]), 'ok');
  assert.deepEqual(seen.map((call) => call.model), ['gemini-3.8-flash', 'gemini-3.9-flash']);
  assert.equal(ladder()[0].model, 'gemini-3.9-flash');
  assert.equal(ladder()[0].label, 'Gemini 3.9 Flash');
});

test('a replacement is read only from its own words', () => {
  assert.equal(noteSwap('gemini', 'gemini-2.5-pro', 'This model is no longer available to new users.'), null);
  assert.equal(noteSwap('gemini', 'gemini-2.5-pro', 'Please use models/gemini-3.1-pro-preview instead.'), 'gemini-3.1-pro-preview');
  assert.equal(noteSwap('gemini', 'gemini-2.5-pro', 'Please use the Interactions API.'), null);
});
