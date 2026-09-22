'use strict';

const tls = require('node:tls');

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'google/gemini-3.1-pro-preview';
const MAX_ERROR_LENGTH = 500;
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_EXTENSION_BY_MIME_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const IMAGE_OPTIONS = [
  '',
  '/job-application/webapp/assets/career-hero.svg',
  '/job-application/webapp/assets/career-team.svg',
  '/job-application/webapp/assets/career-growth.svg'
];
const BLOCK_PARAMETER_GUIDE = {
  blockTag: 'Unique anchor beginning with #. Use lowercase Latin letters, digits and hyphens, for example #arbeiten-bei-uns.',
  textHtml: 'Formatted block content. Allowed tags: h1, h2, h3, h4, p, br, strong, b, em, i, u, s, ul, ol, li, a and span. Supported span classes: landingEyebrow, landingLead and landingHighlight. Never add scripts, styles, iframes or forms.',
  textAlign: 'Horizontal alignment of text and content: left, center or right.',
  theme: 'Theme key from availableThemes. It controls the block, text, heading, accent, link, border, overlay and button colors.',
  blockHeight: 'Overall block height. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh. Prefer at least 1rem and allow enough room for the content.',
  contentWidth: 'Maximum width of the inner content area. Use auto, 0 or a CSS length such as 84rem, 1200px or 100%.',
  paddingTop: 'Inner spacing at the top. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh.',
  paddingRight: 'Inner spacing at the right. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh.',
  paddingBottom: 'Inner spacing at the bottom. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh.',
  paddingLeft: 'Inner spacing at the left. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh.',
  blockWidth: 'Width in the landing-page grid: full is 12 columns, half is 6, third is 4 and quarter is 3.',
  parentBlockTag: 'Tag of another generated block that contains this block. Use an empty string for a top-level block. Never create circular relationships.',
  nestedX: 'Nested block left coordinate as an integer percentage from 0 to 99 of the parent width.',
  nestedY: 'Nested block top coordinate as an integer percentage from 0 to 99 of the parent height.',
  nestedWidth: 'Nested block width as an integer percentage from 1 to 100 of the parent; nestedX plus nestedWidth must not exceed 100.',
  nestedHeight: 'Nested block height as an integer percentage from 1 to 100 of the parent; nestedY plus nestedHeight must not exceed 100.',
  transparentBackground: 'When true, the block theme background is transparent. This is especially useful for nested overlay blocks.',
  imageUrl: 'Exact URL from availableImages, or an empty string for no image. Never invent an image URL.',
  imageAlt: 'Short accessible description of the existing or generated image in the output language. Empty only when both imageUrl and imagePrompt are empty.',
  imageWidth: 'Displayed image width. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh, for example 44% or 640px.',
  imageHeight: 'Displayed image height. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh, for example 28rem or 480px.',
  imagePosition: 'Image placement: left, right, top or background. Background fills the block behind its content.',
  imageFit: 'Image scaling: cover fills and may crop; contain shows the complete image and may leave free space.',
  backgroundCrop: 'Additional background-image crop mode: auto follows imageFit, cropHeight crops primarily to block height, cropWidth crops primarily to block width.',
  imagePrompt: 'AI-only prompt for a newly generated image. When an image model is selected, every generated block must have its own detailed visual prompt and imageUrl must be empty. Otherwise use an empty string. This field is not saved as a block property.',
  menuItems: 'Optional menu as newline-separated "Label | target" entries. Target can be another generated #block-tag, /search or an HTTPS, mailto or tel URL. Use an empty string for no menu.',
  menuOrientation: 'Menu layout: horizontal or vertical.',
  menuGap: 'Distance between menu items. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh, for example 1.5rem.',
  menuFontSize: 'Menu text size. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh, for example 1rem or 18px.',
  menuTextColor: 'Optional menu text color as #RRGGBB. Use an empty string to inherit the link color from the selected theme.',
  menuTextEffect: 'Menu text effect: none, shadow, outline or glow.',
  buttonText: 'Visible call-to-action label in the output language. Use an empty string to hide the button.',
  buttonUrl: 'Button destination: another generated #block-tag, an internal path such as /search, or an HTTPS, mailto or tel URL. Empty when the button is hidden.',
  buttonType: 'Fiori button style: Emphasized, Default, Transparent, Attention, Success, Negative, Critical, Neutral, Accept or Reject.',
  buttonWidth: 'Button width. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh, for example 13rem or 100%.',
  buttonHeight: 'Button height. Use auto, 0 or a CSS length in px, rem, em, %, vw or vh, for example 3.25rem or 52px.',
  buttonBorderRadius: 'Button corner radius. Use 0 or a CSS length in px, rem, em, %, vw or vh, for example 0.25rem, 8px or 50%.',
  buttonAlign: 'Button alignment independent of text: inherit, left, center or right.'
};
let systemCertificatesEnabled = false;

function integer(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function createBlockSchema(themeKeys, blockCount, imageUrls = IMAGE_OPTIONS) {
  const themes = [...new Set((themeKeys || []).filter(Boolean))];
  if (!themes.length) themes.push('light', 'dark', 'accent');
  const images = [...new Set(['', ...(imageUrls || []).filter(Boolean)])];

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      blocks: {
        type: 'array',
        minItems: blockCount,
        maxItems: blockCount,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            blockTag: { type: 'string', description: BLOCK_PARAMETER_GUIDE.blockTag },
            textHtml: { type: 'string', description: BLOCK_PARAMETER_GUIDE.textHtml },
            textAlign: { type: 'string', enum: ['left', 'center', 'right'], description: BLOCK_PARAMETER_GUIDE.textAlign },
            theme: { type: 'string', enum: themes, description: BLOCK_PARAMETER_GUIDE.theme },
            blockHeight: { type: 'string', description: BLOCK_PARAMETER_GUIDE.blockHeight },
            contentWidth: { type: 'string', description: BLOCK_PARAMETER_GUIDE.contentWidth },
            paddingTop: { type: 'string', description: BLOCK_PARAMETER_GUIDE.paddingTop },
            paddingRight: { type: 'string', description: BLOCK_PARAMETER_GUIDE.paddingRight },
            paddingBottom: { type: 'string', description: BLOCK_PARAMETER_GUIDE.paddingBottom },
            paddingLeft: { type: 'string', description: BLOCK_PARAMETER_GUIDE.paddingLeft },
            blockWidth: { type: 'string', enum: ['full', 'half', 'third', 'quarter'], description: BLOCK_PARAMETER_GUIDE.blockWidth },
            parentBlockTag: { type: 'string', description: BLOCK_PARAMETER_GUIDE.parentBlockTag },
            nestedX: { type: 'integer', minimum: 0, maximum: 99, description: BLOCK_PARAMETER_GUIDE.nestedX },
            nestedY: { type: 'integer', minimum: 0, maximum: 99, description: BLOCK_PARAMETER_GUIDE.nestedY },
            nestedWidth: { type: 'integer', minimum: 1, maximum: 100, description: BLOCK_PARAMETER_GUIDE.nestedWidth },
            nestedHeight: { type: 'integer', minimum: 1, maximum: 100, description: BLOCK_PARAMETER_GUIDE.nestedHeight },
            transparentBackground: { type: 'boolean', description: BLOCK_PARAMETER_GUIDE.transparentBackground },
            imageUrl: { type: 'string', enum: images, description: BLOCK_PARAMETER_GUIDE.imageUrl },
            imageAlt: { type: 'string', description: BLOCK_PARAMETER_GUIDE.imageAlt },
            imageWidth: { type: 'string', description: BLOCK_PARAMETER_GUIDE.imageWidth },
            imageHeight: { type: 'string', description: BLOCK_PARAMETER_GUIDE.imageHeight },
            imagePosition: { type: 'string', enum: ['background', 'left', 'right', 'top'], description: BLOCK_PARAMETER_GUIDE.imagePosition },
            imageFit: { type: 'string', enum: ['cover', 'contain'], description: BLOCK_PARAMETER_GUIDE.imageFit },
            backgroundCrop: { type: 'string', enum: ['auto', 'cropHeight', 'cropWidth'], description: BLOCK_PARAMETER_GUIDE.backgroundCrop },
            imagePrompt: { type: 'string', description: BLOCK_PARAMETER_GUIDE.imagePrompt },
            menuItems: { type: 'string', description: BLOCK_PARAMETER_GUIDE.menuItems },
            menuOrientation: { type: 'string', enum: ['horizontal', 'vertical'], description: BLOCK_PARAMETER_GUIDE.menuOrientation },
            menuGap: { type: 'string', description: BLOCK_PARAMETER_GUIDE.menuGap },
            menuFontSize: { type: 'string', description: BLOCK_PARAMETER_GUIDE.menuFontSize },
            menuTextColor: { type: 'string', description: BLOCK_PARAMETER_GUIDE.menuTextColor },
            menuTextEffect: { type: 'string', enum: ['none', 'shadow', 'outline', 'glow'], description: BLOCK_PARAMETER_GUIDE.menuTextEffect },
            buttonText: { type: 'string', description: BLOCK_PARAMETER_GUIDE.buttonText },
            buttonUrl: { type: 'string', description: BLOCK_PARAMETER_GUIDE.buttonUrl },
            buttonType: {
              type: 'string',
              enum: ['Emphasized', 'Default', 'Transparent', 'Attention', 'Success', 'Negative', 'Critical', 'Neutral', 'Accept', 'Reject'],
              description: BLOCK_PARAMETER_GUIDE.buttonType
            },
            buttonWidth: { type: 'string', description: BLOCK_PARAMETER_GUIDE.buttonWidth },
            buttonHeight: { type: 'string', description: BLOCK_PARAMETER_GUIDE.buttonHeight },
            buttonBorderRadius: { type: 'string', description: BLOCK_PARAMETER_GUIDE.buttonBorderRadius },
            buttonAlign: { type: 'string', enum: ['inherit', 'left', 'center', 'right'], description: BLOCK_PARAMETER_GUIDE.buttonAlign }
          },
          required: [
            'blockTag', 'textHtml', 'textAlign', 'theme', 'blockHeight', 'contentWidth',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'blockWidth', 'parentBlockTag',
            'nestedX', 'nestedY', 'nestedWidth', 'nestedHeight', 'transparentBackground',
            'imageUrl', 'imageAlt', 'imageWidth', 'imageHeight', 'imagePosition', 'imageFit', 'backgroundCrop', 'imagePrompt',
            'menuItems', 'menuOrientation', 'menuGap', 'menuFontSize', 'menuTextColor', 'menuTextEffect',
            'buttonText', 'buttonUrl', 'buttonType', 'buttonWidth', 'buttonHeight', 'buttonBorderRadius', 'buttonAlign'
          ]
        }
      }
    },
    required: ['blocks']
  };
}

function parseResponseContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  const value = Array.isArray(content)
    ? content.map((part) => part?.text || '').join('')
    : content;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('OpenRouter hat keine verwendbare Antwort geliefert.');
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error('Die Antwort von OpenRouter enthält kein gültiges JSON.');
  }
}

function enableSystemCertificates(env) {
  if (String(env.OPENROUTER_USE_SYSTEM_CA || '').toLowerCase() !== 'true' || systemCertificatesEnabled) return;
  if (typeof tls.getCACertificates !== 'function' || typeof tls.setDefaultCACertificates !== 'function') {
    throw new Error(
      'OPENROUTER_USE_SYSTEM_CA benötigt Node.js 22.19 oder neuer. Alternativ kann NODE_EXTRA_CA_CERTS verwendet werden.'
    );
  }

  const certificates = [
    ...tls.getCACertificates('default'),
    ...tls.getCACertificates('system')
  ];
  tls.setDefaultCACertificates([...new Set(certificates)]);
  systemCertificatesEnabled = true;
}

function fetchFailureMessage(error) {
  const cause = error?.cause;
  const details = [cause?.code, cause?.message || error?.message || error]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(': ');
  return String(details || 'Unbekannter Netzwerkfehler').slice(0, MAX_ERROR_LENGTH);
}

function openRouterConfiguration(dependencies = {}) {
  const env = dependencies.env || process.env;
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  const apiKey = String(env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY ist nicht konfiguriert.');
  if (typeof fetchImpl !== 'function') throw new Error('Die HTTP-Schnittstelle für OpenRouter ist nicht verfügbar.');
  enableSystemCertificates(env);

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = String(env.OPENROUTER_SITE_URL).trim();
  if (env.OPENROUTER_APP_NAME) headers['X-OpenRouter-Title'] = String(env.OPENROUTER_APP_NAME).trim();
  return {
    env,
    fetchImpl,
    headers,
    baseUrl: String(env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, ''),
    timeoutMs: integer(env.OPENROUTER_TIMEOUT_MS, 180_000, 5_000, 600_000)
  };
}

async function openRouterRequest(path, requestOptions, dependencies = {}) {
  const configuration = openRouterConfiguration(dependencies);
  const { timeoutMs = configuration.timeoutMs, errorContext = '', ...fetchOptions } = requestOptions;
  let response;
  let responseText;
  try {
    response = await configuration.fetchImpl(`${configuration.baseUrl}${path}`, {
      ...fetchOptions,
      headers: { ...configuration.headers, ...(requestOptions.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs)
    });
    responseText = await response.text();
  } catch (error) {
    const timedOut = ['TimeoutError', 'AbortError'].includes(error?.name)
      || ['TimeoutError', 'AbortError'].includes(error?.cause?.name)
      || /aborted due to timeout|timed out/i.test(String(error?.message || ''));
    if (timedOut) {
      const context = errorContext ? ` (${errorContext})` : '';
      throw new Error(`OpenRouter-Zeitüberschreitung${context}: keine vollständige Antwort innerhalb von ${Math.ceil(timeoutMs / 1000)} Sekunden.`);
    }
    throw new Error(`OpenRouter konnte nicht erreicht werden: ${fetchFailureMessage(error)}`);
  }

  let payload;
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const metadata = payload?.error?.metadata || {};
    let providerMessage = '';
    if (typeof metadata.raw === 'string') {
      try {
        const rawPayload = JSON.parse(metadata.raw);
        providerMessage = rawPayload?.error?.message || rawPayload?.message || '';
      } catch {
        providerMessage = metadata.raw;
      }
    }
    const messageParts = [
      payload?.error?.message || response.statusText || `HTTP ${response.status}`,
      metadata.provider_name ? `Provider: ${metadata.provider_name}` : '',
      providerMessage
    ].map((value) => String(value || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const upstreamMessage = [...new Set(messageParts)].join(' — ').slice(0, MAX_ERROR_LENGTH);
    const error = new Error(`OpenRouter-Fehler${errorContext ? ` (${errorContext})` : ''}: ${upstreamMessage}`);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload;
}

function modelOption(model) {
  const id = String(model?.id || '').trim().slice(0, 255);
  const name = String(model?.name || id).trim().slice(0, 255);
  return id ? { id, name, label: name === id ? id : `${name} — ${id}` } : null;
}

function isChatCompletionModelId(value) {
  const id = String(value || '').trim();
  return /^~?[a-z0-9][a-z0-9._:-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id) && !/:batch$/i.test(id);
}

function isAllowedTextModelId(value) {
  return String(value || '').trim() === DEFAULT_MODEL;
}

function isAllowedImageModelId(value) {
  return String(value || '').trim() === 'meta/muse-image';
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getOpenRouterBalance(dependencies = {}) {
  const configuration = openRouterConfiguration(dependencies);
  const managementKey = String(configuration.env.OPENROUTER_MANAGEMENT_KEY || '').trim();
  try {
    const credits = await openRouterRequest('/credits', {
      method: 'GET',
      errorContext: 'Guthaben',
      ...(managementKey ? { headers: { Authorization: `Bearer ${managementKey}` } } : {})
    }, dependencies);
    const totalCredits = numericValue(credits?.data?.total_credits);
    const totalUsage = numericValue(credits?.data?.total_usage);
    if (totalCredits !== null && totalUsage !== null) {
      return {
        available: true,
        amount: Math.round((totalCredits - totalUsage) * 1_000_000) / 1_000_000,
        source: 'credits'
      };
    }
  } catch {
    // A regular inference key may not access /credits; use its remaining spending limit instead.
  }

  try {
    const keyDetails = await openRouterRequest('/key', {
      method: 'GET',
      errorContext: 'API-Key-Limit'
    }, dependencies);
    const limitRemaining = numericValue(keyDetails?.data?.limit_remaining);
    if (limitRemaining !== null) {
      return { available: true, amount: limitRemaining, source: 'key_limit' };
    }
  } catch {
    // The model catalog remains usable even when account information cannot be read.
  }

  return { available: false, amount: null, source: 'unavailable' };
}

async function listOpenRouterModels(dependencies = {}) {
  const configuration = openRouterConfiguration(dependencies);
  const [textPayload, imagePayload, balance] = await Promise.all([
    openRouterRequest('/models/user?output_modalities=text&limit=1000', { method: 'GET' }, dependencies),
    openRouterRequest('/images/models', { method: 'GET' }, dependencies),
    getOpenRouterBalance(dependencies)
  ]);

  const textModels = (Array.isArray(textPayload.data) ? textPayload.data : [])
    .filter((model) => isAllowedTextModelId(model?.id))
    .filter((model) => model?.architecture?.output_modalities?.includes('text'))
    .filter((model) => model?.supported_parameters?.includes('response_format'))
    .filter((model) => model?.supported_parameters?.includes('structured_outputs'))
    .filter((model) => isChatCompletionModelId(model?.id))
    .map(modelOption)
    .filter(Boolean)
    .sort((left, right) => left.label.localeCompare(right.label));
  const imageModels = (Array.isArray(imagePayload.data) ? imagePayload.data : [])
    .filter((model) => isAllowedImageModelId(model?.id))
    .filter((model) => model?.architecture?.output_modalities?.includes('image'))
    .filter((model) => Number(model?.supported_parameters?.input_references?.min || 0) === 0)
    .filter((model) => {
      const formats = model?.supported_parameters?.output_format?.values;
      return !Array.isArray(formats) || formats.some((format) => ['png', 'jpeg', 'webp'].includes(format));
    })
    .map(modelOption)
    .filter(Boolean)
    .sort((left, right) => left.label.localeCompare(right.label));
  const defaultTextModel = DEFAULT_MODEL;
  const defaultImageModel = String(configuration.env.OPENROUTER_IMAGE_MODEL || '').trim().slice(0, 255);
  return {
    textModels,
    imageModels,
    defaultTextModel,
    defaultImageModel,
    openRouterBalance: balance.amount,
    openRouterBalanceAvailable: balance.available,
    openRouterBalanceSource: balance.source
  };
}

async function generateLandingImage(options, dependencies = {}) {
  const configuration = openRouterConfiguration(dependencies);
  const model = String(options.model || '').trim().slice(0, 255);
  const prompt = String(options.prompt || '').trim().slice(0, 4000);
  if (!model) throw new Error('Für die Bildgenerierung wurde kein OpenRouter-Modell ausgewählt.');
  if (!isAllowedImageModelId(model)) throw new Error('Für die Bildgenerierung ist nur Meta: Muse Image zugelassen.');
  if (!prompt) throw new Error('Für die Bildgenerierung fehlt eine Beschreibung.');

  const payload = await openRouterRequest('/images', {
    method: 'POST',
    timeoutMs: integer(configuration.env.OPENROUTER_IMAGE_TIMEOUT_MS, 300_000, 10_000, 900_000),
    errorContext: `Bildmodell ${model}`,
    body: JSON.stringify({ model, prompt, n: 1 })
  }, dependencies);
  const image = payload?.data?.[0];
  const mimeType = String(image?.media_type || 'image/png').toLowerCase();
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType) || typeof image?.b64_json !== 'string') {
    throw new Error('OpenRouter hat kein unterstütztes PNG-, JPEG- oder WebP-Bild geliefert.');
  }
  const content = Buffer.from(image.b64_json, 'base64');
  if (!content.length || content.length > 5 * 1024 * 1024) {
    throw new Error('Das von OpenRouter erzeugte Bild ist leer oder größer als 5 MB.');
  }
  return { content, mimeType, extension: IMAGE_EXTENSION_BY_MIME_TYPE[mimeType] };
}

async function generateLandingBlocks(options, dependencies = {}) {
  const configuration = openRouterConfiguration(dependencies);
  const env = configuration.env;
  const model = String(options.model || env.OPENROUTER_MODEL || DEFAULT_MODEL).trim().slice(0, 255);
  if (!isAllowedTextModelId(model)) {
    throw new Error('Für die Textgenerierung ist nur Google: Gemini 3.1 Pro Preview zugelassen.');
  }
  const blockCount = integer(options.blockCount, 4, 1, 8);
  const themes = options.themes || [];
  const themeKeys = themes.map((theme) => theme.key);
  const availableImages = [
    { url: '', description: 'No image' },
    { url: IMAGE_OPTIONS[1], description: 'People and career hero illustration' },
    { url: IMAGE_OPTIONS[2], description: 'Team illustration' },
    { url: IMAGE_OPTIONS[3], description: 'Professional growth illustration' },
    ...(options.images || [])
  ].filter((image, index, all) => all.findIndex((candidate) => candidate.url === image.url) === index);
  const responseSchema = createBlockSchema(themeKeys, blockCount, availableImages.map((image) => image.url));
  const provider = { require_parameters: true };
  const dataCollection = String(env.OPENROUTER_DATA_COLLECTION || '').trim().toLowerCase();
  if (dataCollection === 'allow' || dataCollection === 'deny') provider.data_collection = dataCollection;
  if (String(env.OPENROUTER_ZDR || '').toLowerCase() === 'true') provider.zdr = true;

  const requestContext = {
    pageTitle: options.pageTitle,
    outputLanguage: options.outputLanguage,
    numberOfBlocks: blockCount,
    existingBlockTags: options.existingTags || [],
    availableThemes: themes,
    availableImages,
    blockParameterGuide: BLOCK_PARAMETER_GUIDE,
    applicationAssignedFields: {
      ID: 'Generated by the server and must not be supplied.',
      sortOrder: 'Determined by the order of blocks in the response array.',
      parentBlockId: 'Resolved by the server from parentBlockTag.'
    },
    administratorRequest: options.prompt
  };

  const createRequestBody = (strictSchema) => ({
        model,
        provider,
        messages: [
          {
            role: 'system',
            content: [
              'You create concise, accessible recruiting landing-page blocks.',
              'Follow the requested output language, even when the request is written in another language.',
              'Return only data matching the supplied JSON schema.',
              'Do not create scripts, styles, iframes, forms, tracking code, or unsupported HTML.',
              'Use available theme keys and existing image URLs exactly as supplied.',
              options.imageModel
                ? `For every one of the ${blockCount} generated blocks, leave imageUrl empty and provide a different detailed imagePrompt without visible text, logos or trademarks.`
                : 'No image generation model is selected. Always leave imagePrompt empty.',
              'Every block must render at least one meaningful content element: visible textHtml, imageUrl or imagePrompt, menuItems, or buttonText.',
              'Use every block parameter when it improves the requested layout, and return a sensible value for every required property.',
              'For nested blocks, reference an earlier generated block through parentBlockTag and keep the child inside its parent coordinates.',
              'Build a coherent sequence with useful headings, short paragraphs and clear calls to action.',
              'Use /search for an application call to action.'
            ].join(' ')
          },
          {
            role: 'user',
            content: JSON.stringify(strictSchema
              ? requestContext
              : { ...requestContext, requiredResponseSchema: responseSchema })
          }
        ],
        response_format: strictSchema
          ? {
              type: 'json_schema',
              json_schema: {
                name: 'landing_blocks',
                strict: true,
                schema: responseSchema
              }
            }
          : { type: 'json_object' }
      });

  let payload;
  try {
    payload = await openRouterRequest('/chat/completions', {
      method: 'POST',
      errorContext: `Textmodell ${model}`,
      body: JSON.stringify(createRequestBody(true))
    }, dependencies);
  } catch (error) {
    if (!/No endpoints found|Provider returned error/i.test(String(error?.message || ''))) throw error;
    try {
      payload = await openRouterRequest('/chat/completions', {
        method: 'POST',
        errorContext: `Textmodell ${model}, JSON-Fallback`,
        body: JSON.stringify(createRequestBody(false))
      }, dependencies);
    } catch (fallbackError) {
      throw new Error(`${error.message} Fallback fehlgeschlagen: ${fallbackError.message}`);
    }
  }

  const parsed = parseResponseContent(payload);
  if (!Array.isArray(parsed.blocks) || parsed.blocks.length !== blockCount) {
    throw new Error(`OpenRouter muss genau ${blockCount} Blöcke liefern.`);
  }
  return parsed.blocks;
}

module.exports = {
  BLOCK_PARAMETER_GUIDE,
  createBlockSchema,
  enableSystemCertificates,
  fetchFailureMessage,
  generateLandingImage,
  generateLandingBlocks,
  getOpenRouterBalance,
  isAllowedImageModelId,
  isAllowedTextModelId,
  isChatCompletionModelId,
  listOpenRouterModels,
  parseResponseContent
};
