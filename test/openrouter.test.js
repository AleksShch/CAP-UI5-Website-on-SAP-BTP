'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BLOCK_PARAMETER_GUIDE,
  createBlockSchema,
  fetchFailureMessage,
  generateLandingImage,
  generateLandingBlocks,
  getOpenRouterBalance,
  isAllowedImageModelId,
  isAllowedTextModelId,
  isChatCompletionModelId,
  listOpenRouterModels,
  parseResponseContent
} = require('../srv/lib/openrouter');

const GENERATED_BLOCK_FIELDS = [
  'blockTag', 'textHtml', 'textAlign', 'theme', 'blockHeight', 'contentWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'blockWidth', 'parentBlockTag',
  'nestedX', 'nestedY', 'nestedWidth', 'nestedHeight', 'transparentBackground',
  'imageUrl', 'imageAlt', 'imageWidth', 'imageHeight', 'imagePosition', 'imageFit', 'backgroundCrop', 'imagePrompt',
  'menuItems', 'menuOrientation', 'menuGap', 'menuFontSize', 'menuTextColor', 'menuTextEffect',
  'buttonText', 'buttonUrl', 'buttonType', 'buttonWidth', 'buttonHeight', 'buttonBorderRadius', 'buttonAlign'
];

test('rejects generation when the OpenRouter API key is missing', async () => {
  await assert.rejects(
    generateLandingBlocks({ blockCount: 1 }, { env: {}, fetch: async () => null }),
    /OPENROUTER_API_KEY/
  );
});

test('sends a strict landing block schema and parses the generated blocks', async () => {
  let request;
  const blocks = [{ blockTag: '#team', textHtml: '<h2>Team</h2>' }];
  const fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ blocks }) } }]
      })
    };
  };

  const result = await generateLandingBlocks({
    prompt: 'Create a recruiting hero block',
    outputLanguage: 'Deutsch',
    blockCount: 1,
    model: 'google/gemini-3.1-pro-preview',
    imageModel: 'selected/image-model',
    pageTitle: 'Karriere',
    themes: [{ key: 'light', name: 'Hell' }]
  }, {
    env: { OPENROUTER_API_KEY: 'test-key', OPENROUTER_MODEL: 'test/model' },
    fetch
  });

  assert.deepEqual(result, blocks);
  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.body.model, 'google/gemini-3.1-pro-preview');
  assert.equal(request.body.response_format.type, 'json_schema');
  assert.equal(request.body.response_format.json_schema.strict, true);
  assert.equal(request.body.response_format.json_schema.schema.properties.blocks.minItems, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(request.body.provider, 'data_collection'), false);
  assert.deepEqual(request.body.messages[1].content.includes('blockParameterGuide'), true);
});

test('loads and separates text and image models from OpenRouter', async () => {
  const requestedUrls = [];
  const fetch = async (url) => {
    requestedUrls.push(url);
    if (url.endsWith('/credits')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { total_credits: 25, total_usage: 7.5 } })
      };
    }
    const data = url.endsWith('/images/models')
      ? [
          { id: 'meta/muse-image', name: 'Meta: Muse Image', architecture: { output_modalities: ['image'] }, supported_parameters: {} },
          { id: 'image/generator', name: 'Other Image Generator', architecture: { output_modalities: ['image'] }, supported_parameters: {} },
          { id: 'image/reference-only', name: 'Reference only', architecture: { output_modalities: ['image'] }, supported_parameters: { input_references: { min: 1 } } }
        ]
      : [
          {
            id: 'google/gemini-3.1-pro-preview',
            name: 'Google: Gemini 3.1 Pro Preview',
            architecture: { output_modalities: ['text'] },
            supported_parameters: ['response_format', 'structured_outputs']
          },
          {
            id: 'openai/gpt-4.1-mini',
            name: 'Other Text Model',
            architecture: { output_modalities: ['text'] },
            supported_parameters: ['response_format', 'structured_outputs']
          },
          {
            id: 'text/json-only',
            name: 'JSON only',
            architecture: { output_modalities: ['text'] },
            supported_parameters: ['response_format']
          },
          {
            id: 'text/model:batch',
            name: 'Batch Model',
            architecture: { output_modalities: ['text'] },
            supported_parameters: ['response_format', 'structured_outputs']
          }
        ];
    return { ok: true, status: 200, text: async () => JSON.stringify({ data }) };
  };

  const catalog = await listOpenRouterModels({
    env: { OPENROUTER_API_KEY: 'test-key', OPENROUTER_MODEL: 'openai/gpt-4.1-mini' },
    fetch
  });

  assert.equal(requestedUrls.length, 3);
  assert.match(requestedUrls[0], /\/models\/user\?output_modalities=text/);
  assert.deepEqual(catalog.textModels.map((model) => model.id), ['google/gemini-3.1-pro-preview']);
  assert.equal(catalog.textModels.some((model) => model.id === 'text/json-only'), false);
  assert.equal(catalog.textModels.some((model) => model.id === 'text/model:batch'), false);
  assert.deepEqual(catalog.imageModels.map((model) => model.id), ['meta/muse-image']);
  assert.equal(catalog.imageModels.some((model) => model.id === 'image/reference-only'), false);
  assert.equal(catalog.defaultTextModel, 'google/gemini-3.1-pro-preview');
  assert.equal(catalog.openRouterBalanceAvailable, true);
  assert.equal(catalog.openRouterBalance, 17.5);
  assert.equal(catalog.openRouterBalanceSource, 'credits');
});

test('uses the current API-key limit when account credits are unavailable', async () => {
  const fetch = async (url) => {
    if (url.endsWith('/credits')) {
      return {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => JSON.stringify({ error: { message: 'Management key required' } })
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { limit_remaining: 12.75 } })
    };
  };

  const balance = await getOpenRouterBalance({ env: { OPENROUTER_API_KEY: 'test-key' }, fetch });

  assert.deepEqual(balance, { available: true, amount: 12.75, source: 'key_limit' });
});

test('recognizes models supported by the chat completions endpoint', () => {
  assert.equal(isChatCompletionModelId('openai/gpt-4.1-mini'), true);
  assert.equal(isChatCompletionModelId('deepseek/deepseek-v4-pro-0813:batch'), false);
  assert.equal(isChatCompletionModelId('invalid-model'), false);
});

test('allows only Google Gemini 3.1 Pro Preview for text generation', () => {
  assert.equal(isAllowedTextModelId('google/gemini-3.1-pro-preview'), true);
  assert.equal(isAllowedTextModelId('openai/gpt-4.1-mini'), false);
  assert.equal(isAllowedTextModelId('google/gemini-3.1-pro-preview:batch'), false);
});

test('allows only Meta Muse Image for image generation', () => {
  assert.equal(isAllowedImageModelId('meta/muse-image'), true);
  assert.equal(isAllowedImageModelId('openai/gpt-image-1'), false);
  assert.equal(isAllowedImageModelId(''), false);
});

test('retries provider routing failures with JSON object mode', async () => {
  const requests = [];
  const fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => JSON.stringify({ error: { message: 'No endpoints found that can handle the requested parameters.' } })
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ blocks: [{ textHtml: '<h2>Team</h2>' }] }) } }]
      })
    };
  };

  const result = await generateLandingBlocks({
    prompt: 'Create a recruiting team block',
    outputLanguage: 'Deutsch',
    blockCount: 1,
    model: 'google/gemini-3.1-pro-preview',
    themes: [{ key: 'light', name: 'Hell' }]
  }, { env: { OPENROUTER_API_KEY: 'test-key' }, fetch });

  assert.equal(result.length, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].response_format.type, 'json_schema');
  assert.equal(requests[1].response_format.type, 'json_object');
  assert.ok(JSON.parse(requests[1].messages[1].content).requiredResponseSchema);
});

test('generates and decodes an image through the dedicated OpenRouter image API', async () => {
  let request;
  const fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [{ b64_json: Buffer.from('image bytes').toString('base64'), media_type: 'image/png' }]
      })
    };
  };

  const image = await generateLandingImage({ model: 'meta/muse-image', prompt: 'A recruiting team' }, {
    env: { OPENROUTER_API_KEY: 'test-key' },
    fetch
  });

  assert.equal(request.url, 'https://openrouter.ai/api/v1/images');
  assert.equal(request.body.model, 'meta/muse-image');
  assert.equal(image.mimeType, 'image/png');
  assert.equal(image.extension, 'png');
  assert.equal(image.content.toString(), 'image bytes');
});

test('describes every editable block parameter in the strict schema and prompt guide', () => {
  const schema = createBlockSchema(['light'], 2);
  const item = schema.properties.blocks.items;

  assert.deepEqual(item.required, GENERATED_BLOCK_FIELDS);
  for (const field of GENERATED_BLOCK_FIELDS) {
    assert.ok(item.properties[field], `schema property missing: ${field}`);
    assert.ok(item.properties[field].description, `schema description missing: ${field}`);
    assert.ok(BLOCK_PARAMETER_GUIDE[field], `prompt guide missing: ${field}`);
  }
});

test('rejects malformed OpenRouter response content', () => {
  assert.throws(
    () => parseResponseContent({ choices: [{ message: { content: 'not json' } }] }),
    /gültiges JSON/
  );
});

test('includes the underlying TLS cause in connection errors', () => {
  const error = new TypeError('fetch failed', {
    cause: Object.assign(new Error('self-signed certificate in certificate chain'), {
      code: 'SELF_SIGNED_CERT_IN_CHAIN'
    })
  });

  assert.equal(
    fetchFailureMessage(error),
    'SELF_SIGNED_CERT_IN_CHAIN: self-signed certificate in certificate chain'
  );
});

test('reports a timeout while reading the OpenRouter response', async () => {
  const timeoutError = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  const fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => { throw timeoutError; }
  });

  await assert.rejects(
    generateLandingBlocks({
      prompt: 'Create a recruiting hero block',
      blockCount: 1,
      model: 'google/gemini-3.1-pro-preview'
    }, {
      env: { OPENROUTER_API_KEY: 'test-key', OPENROUTER_TIMEOUT_MS: '5000' },
      fetch
    }),
    /OpenRouter-Zeitüberschreitung \(Textmodell google\/gemini-3\.1-pro-preview\).*5 Sekunden/
  );
});
