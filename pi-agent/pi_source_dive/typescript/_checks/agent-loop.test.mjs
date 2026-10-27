// PI_STUDY_PACKAGES=<isolated-package-directory> node --test agent-loop.test.mjs
// Tests the published v1.4.0 implementation, never a reimplementation of the loop.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

assert(process.env.PI_STUDY_PACKAGES, 'Set PI_STUDY_PACKAGES to the isolated v1.4.0 package directory');
const packageRoot = resolve(process.env.PI_STUDY_PACKAGES);
const packageInfo = (name) => JSON.parse(readFileSync(join(packageRoot, 'node_modules', name, 'package.json'), 'utf8'));
const packageEntry = (name) => pathToFileURL(join(packageRoot, 'node_modules', name, packageInfo(name).exports['.'].import));
for (const name of ['pi-ai', 'pi-agent-core']) {
  assert.equal(JSON.parse(readFileSync(join(packageRoot, 'node_modules/@earendil-works', name, 'package.json'), 'utf8')).version, '1.4.0');
}
const { Agent, runAgentLoop } = await import(packageEntry('@earendil-works/pi-agent-core'));
const {
  AssistantMessageEventStream,
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  getCurrentTools,
} = await import(packageEntry('@earendil-works/pi-ai'));
const anthropicEntry = packageInfo('@earendil-works/pi-ai').exports['./providers/*'].import.replace('*', 'anthropic');
const { anthropicProvider } = await import(pathToFileURL(join(packageRoot, 'node_modules/@earendil-works/pi-ai', anthropicEntry)));
const { Type } = await import(packageEntry('typebox'));

const model = {
  id: 'offline-study',
  name: 'Offline study fixture',
  provider: 'offline-study',
  api: 'offline-study',
  baseUrl: '',
  reasoning: false,
  input: ['text'],
  contextWindow: 32768,
  maxTokens: 4096,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const user = (content) => ({ role: 'user', content, timestamp: Date.now() });
const call = (id, name = 'read_fixture', args = {}) => ({ type: 'toolCall', id, name, arguments: args });
const answer = (content = [], stopReason = 'stop') => ({
  role: 'assistant',
  content,
  stopReason,
  api: model.api,
  provider: model.provider,
  model: model.id,
  timestamp: Date.now(),
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
});
const text = (value = 'done') => answer([{ type: 'text', text: value }]);
const result = (terminate) => ({
  content: [{ type: 'text', text: 'fixture result' }],
  details: {},
  ...(terminate ? { terminate: true } : {}),
});
const tool = (execute = async () => result(), name = 'read_fixture') => ({
  name,
  label: name,
  description: 'Offline fixture; no file or network access',
  parameters: Type.Object({}),
  execute,
});

function responder(responses, requests, timeline = []) {
  return (_model, context) => {
    const next = responses[requests.length];
    assert(next, 'Unexpected additional model request');
    requests.push(structuredClone(context));
    timeline.push('request');
    const stream = new AssistantMessageEventStream();
    stream.push({ type: 'start', partial: { ...next, content: [] } });
    if (next.stopReason === 'error' || next.stopReason === 'aborted') {
      stream.push({ type: 'error', reason: next.stopReason, error: next });
    } else {
      stream.push({ type: 'done', reason: next.stopReason, message: next });
    }
    stream.end();
    return stream;
  };
}

async function run(responses, overrides = {}, tools = [tool()]) {
  const events = [];
  const requests = [];
  const context = {
    messages: [{ role: 'system', content: 'Offline learning fixture', timestamp: Date.now() }],
    tools,
  };
  const config = { model, convertToLlm: (messages) => messages, ...overrides };
  const messages = await runAgentLoop(
    [user('study')],
    context,
    config,
    (event) => { events.push(event); },
    undefined,
    responder(responses, requests),
  );
  return { events, requests, messages, originalContext: context };
}

test('chapter 1: provider collection can find the documented model without credentials or requests', () => {
  const models = createModels();
  models.setProvider(anthropicProvider());
  assert.equal(models.getModel('anthropic', 'claude-sonnet-4-6')?.api, 'anthropic-messages');
});

test('chapter 1/2: bound Models.streamSimple drives Agent through the real provider collection', async () => {
  const models = createModels();
  const faux = fauxProvider();
  models.setProvider(faux.provider);
  faux.setResponses([fauxAssistantMessage('offline answer')]);
  const agent = new Agent({
    initialState: { model: faux.getModel(), systemPrompt: 'study', tools: [] },
    streamFn: models.streamSimple.bind(models),
  });
  await agent.prompt('study');
  const message = agent.state.messages.at(-1);
  assert.equal(message.stopReason, 'stop');
  assert.equal(message.content[0].text, 'offline answer');
  assert.equal(agent.state.errorMessage, undefined);
});

test('plain answer is one turn and preserves system messages', async () => {
  const { events, requests } = await run([text()]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].messages[0].role, 'system');
  assert.equal(events.filter((event) => event.type === 'turn_start').length, 1);
  assert.equal(events.at(-1).type, 'agent_end');
});

test('a normal tool response is followed by another model turn with its result', async () => {
  let executions = 0;
  const { requests } = await run(
    [answer([call('one')], 'toolUse'), text()],
    {},
    [tool(async () => {
      executions++;
      return result();
    })],
  );
  assert.equal(executions, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].messages.at(-1).toolCallId, 'one');
});

test('length: even valid-looking tool arguments are not executed, and complete calls can be reissued', async () => {
  let executions = 0;
  const { requests, messages } = await run([
    answer([call('cut-a'), call('cut-b')], 'length'), answer([call('complete')], 'toolUse'), text(),
  ], {}, [tool(async () => {
    executions++;
    return result();
  })]);
  assert.equal(executions, 1);
  assert.equal(requests.length, 3);
  const failed = messages.filter((message) => message.role === 'toolResult' && message.isError);
  assert.deepEqual(failed.map((message) => message.toolCallId), ['cut-a', 'cut-b']);
  assert(failed.every((message) => message.content[0].text.includes('output token limit')));
});

test('finishTurn end takes priority over queues and natural tool continuation', async () => {
  let steeringPolls = 0;
  let followUpPolls = 0;
  const { requests, events } = await run([answer([call('one')], 'toolUse')], {
    finishTurn: () => ({ action: 'end' }),
    getSteeringMessages: async () => {
      steeringPolls++;
      return [];
    },
    getFollowUpMessages: async () => {
      followUpPolls++;
      return [user('later')];
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(steeringPolls, 1); // Initial poll only, no post-turn drain.
  assert.equal(followUpPolls, 0);
  assert.equal(events.at(-2).type, 'turn_end');
});

test('finishTurn continue can request one context-only turn after a plain answer', async () => {
  let turns = 0;
  const { requests } = await run([text('first'), text('second')], {
    finishTurn: () => ++turns === 1 ? { action: 'continue' } : undefined,
  });
  assert.equal(requests.length, 2);
});

test('continue plus a natural tool continuation does not add a redundant turn', async () => {
  let turns = 0;
  const { requests } = await run([answer([call('one')], 'toolUse'), text()], {
    finishTurn: () => ++turns === 1 ? { action: 'continue' } : undefined,
  });
  assert.equal(requests.length, 2);
});

for (const reason of ['error', 'aborted']) {
  test(`${reason} is a hard exit even when finishTurn requests continue`, async () => {
    let finishes = 0;
    let followUps = 0;
    let executions = 0;
    const { requests } = await run([answer([call('never')], reason)], {
      finishTurn: () => {
        finishes++;
        return { action: 'continue' };
      },
      getFollowUpMessages: async () => {
        followUps++;
        return [user('later')];
      },
    }, [tool(async () => {
      executions++;
      return result();
    })]);
    assert.equal(requests.length, 1);
    assert.equal(finishes, 1);
    assert.equal(followUps, 0);
    assert.equal(executions, 0);
  });
}

test('one terminate result cannot terminate a mixed tool batch', async () => {
  const { requests } = await run(
    [answer([call('a', 'stopper'), call('b')], 'toolUse'), text()],
    {},
    [tool(async () => result(true), 'stopper'), tool()],
  );
  assert.equal(requests.length, 2);
});

test('all terminate results cancel tool-driven continuation', async () => {
  const { requests } = await run([answer([call('a'), call('b')], 'toolUse')], {}, [tool(async () => result(true))]);
  assert.equal(requests.length, 1);
});

test('follow-up can still continue after all tools terminate', async () => {
  let polls = 0;
  const { requests } = await run([answer([call('a')], 'toolUse'), text()], {
    getFollowUpMessages: async () => ++polls === 1 ? [user('follow up')] : [],
  }, [tool(async () => result(true))]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].messages.at(-1).content, 'follow up');
});

test('hook order: prepareRequest includes first request; next-turn preparation precedes its turn_start', async () => {
  const timeline = [];
  const requests = [];
  await runAgentLoop(
    [user('study')],
    { messages: [], tools: [tool()] },
    {
      model,
      convertToLlm: (messages) => messages,
      prepareRequest: () => { timeline.push('prepareRequest'); },
      prepareNextTurn: () => { timeline.push('prepareNextTurn'); },
      finishTurn: () => { timeline.push('finishTurn'); },
    },
    (event) => {
      if (['turn_start', 'turn_end'].includes(event.type)) timeline.push(event.type);
    },
    undefined,
    responder([answer([call('a')], 'toolUse'), text()], requests, timeline),
  );
  assert.deepEqual(timeline, [
    'turn_start', 'prepareRequest', 'request', 'finishTurn', 'turn_end',
    'prepareNextTurn', 'turn_start', 'prepareRequest', 'request', 'finishTurn', 'turn_end',
  ]);
});

test('tool loadout changes are declared through transcript system messages', async () => {
  const { requests, originalContext } = await run([text()]);
  assert.deepEqual(getCurrentTools(requests[0].messages).map((item) => item.name), ['read_fixture']);
  assert.equal(originalContext.messages.length, 1); // Low-level run works on its own top-level array.
});

test('Agent remains busy until awaited agent_end listeners finish', async () => {
  let release;
  let arrived;
  const blocked = new Promise((resolve) => { release = resolve; });
  const endReached = new Promise((resolve) => { arrived = resolve; });
  const requests = [];
  const agent = new Agent({
    initialState: { model, systemPrompt: 'study', tools: [] },
    streamFn: responder([text()], requests),
  });
  agent.subscribe(async (event) => {
    if (event.type === 'agent_end') {
      arrived();
      await blocked;
    }
  });
  const running = agent.prompt('study');
  await endReached;
  assert.equal(agent.state.isStreaming, true);
  release();
  await running;
  assert.equal(agent.state.isStreaming, false);
  assert.deepEqual(agent.state.messages.map((message) => message.role), ['system', 'user', 'assistant']);
});
