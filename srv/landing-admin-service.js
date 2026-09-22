'use strict';

const cds = require('@sap/cds');
const sanitizeHtml = require('sanitize-html');
const {
  generateLandingBlocks,
  generateLandingImage,
  isAllowedImageModelId,
  isAllowedTextModelId,
  isChatCompletionModelId,
  listOpenRouterModels
} = require('./lib/openrouter');

const MAX_BLOCKS = 50;
const MAX_PAGES = 30;
const CSS_LENGTH = /^(?:auto|0|\d{1,4}(?:\.\d{1,2})?(?:px|rem|em|%|vw|vh))$/;
const CSS_RADIUS = /^(?:0|\d{1,4}(?:\.\d{1,2})?(?:px|rem|em|%|vw|vh))$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_POSITIONS = new Set(['background', 'left', 'right', 'top']);
const IMAGE_FITS = new Set(['cover', 'contain']);
const BACKGROUND_CROPS = new Set(['auto', 'cropHeight', 'cropWidth']);
const BLOCK_WIDTHS = new Set(['full', 'half', 'third', 'quarter']);
const TEXT_ALIGNS = new Set(['left', 'center', 'right']);
const MENU_ORIENTATIONS = new Set(['horizontal', 'vertical']);
const MENU_TEXT_EFFECTS = new Set(['none', 'shadow', 'outline', 'glow']);
const BUTTON_TYPES = new Set([
  'Emphasized', 'Default', 'Transparent', 'Attention', 'Success', 'Negative',
  'Critical', 'Neutral', 'Accept', 'Reject'
]);
const BUTTON_ALIGNS = new Set(['inherit', 'left', 'center', 'right']);
const THEMES = new Set(['light', 'dark', 'accent']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const THEME_COLOR_FIELDS = [
  'backgroundColor', 'textColor', 'headingColor', 'accentColor', 'linkColor',
  'buttonBackgroundColor', 'buttonTextColor', 'buttonBorderColor', 'borderColor', 'overlayColor'
];
const LANDING_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_LANDING_IMAGE_BYTES = 5 * 1024 * 1024;
const RESERVED_SLUGS = new Set(['admin', 'api', 'job-application', 'odata', 'resources', 'search', 'test-resources']);

function text(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function enumValue(value, allowed, fallback) {
  const normalized = text(value, 40);
  return allowed.has(normalized) ? normalized : fallback;
}

function cssLength(value, fallback) {
  const normalized = text(value, 32);
  return CSS_LENGTH.test(normalized) ? normalized : fallback;
}

function cssRadius(value, fallback) {
  const normalized = text(value, 32);
  return CSS_RADIUS.test(normalized) ? normalized : fallback;
}

function color(value, fallback) {
  const normalized = text(value, 7);
  return HEX_COLOR.test(normalized) ? normalized.toUpperCase() : fallback;
}

function optionalColor(value) {
  const normalized = text(value, 7);
  return HEX_COLOR.test(normalized) ? normalized.toUpperCase() : '';
}

function themeValue(value) {
  const normalized = text(value, 80).toLowerCase();
  return THEMES.has(normalized) || UUID_PATTERN.test(normalized) ? normalized : 'light';
}

function buttonType(value) {
  const normalized = text(value, 30);
  return enumValue(normalized === 'Positive' ? 'Success' : normalized, BUTTON_TYPES, 'Emphasized');
}

function percentage(value, fallback, minimum = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= 100 ? number : fallback;
}

function safeUrl(value, allowedProtocols, fallback = '') {
  const normalized = text(value, 2048);
  if (!normalized) return fallback;
  if (normalized.startsWith('#')) return normalizeBlockTag(normalized);
  if (normalized.startsWith('/') && !normalized.startsWith('//') && !normalized.includes('\\')) return normalized;
  try {
    const parsed = new URL(normalized);
    return allowedProtocols.includes(parsed.protocol) ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

function normalizeBlockTag(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .replace(/^#+/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80);
  return normalized ? `#${normalized}` : fallback;
}

function uniqueBlockTag(preferredTag, existingTags) {
  const used = new Set((existingTags || []).map((tag) => normalizeBlockTag(tag)).filter(Boolean));
  const base = normalizeBlockTag(preferredTag, '#block');
  if (!used.has(base)) return base;

  const stem = base.slice(1).replace(/-+$/, '') || 'block';
  let number = 1;
  while (true) {
    const suffix = number === 1 ? '-copy' : `-copy-${number}`;
    const candidate = `#${stem.slice(0, 80 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
    number += 1;
  }
}

function cleanMenuItems(value) {
  return String(value || '')
    .split(/\r?\n/)
    .slice(0, 30)
    .map((line, index) => {
      const [rawLabel, ...targetParts] = line.split('|');
      const label = text(rawLabel, 120);
      if (!label) return '';
      const submittedTarget = targetParts.join('|').trim();
      const target = submittedTarget
        ? safeUrl(submittedTarget, ['https:', 'mailto:', 'tel:'])
        : normalizeBlockTag(label, `#menu-item-${index + 1}`);
      return target ? `${label} | ${target}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function cleanRichText(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'span'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      span: ['class']
    },
    allowedClasses: {
      span: ['landingEyebrow', 'landingLead', 'landingHighlight']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href'],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: attribs.target === '_blank' ? '_blank' : '_self',
          rel: 'noopener noreferrer'
        }
      })
    }
  });
}

function hasUsableBlockContent(block, imagePrompt = '') {
  const visibleText = sanitizeHtml(String(block?.textHtml || ''), {
    allowedTags: [],
    allowedAttributes: {}
  }).replace(/\u00a0/g, ' ').trim();
  return Boolean(
    visibleText ||
    block?.imageUrl ||
    imagePrompt ||
    block?.menuItems ||
    block?.buttonText
  );
}

function generatedImagePrompt(block, index, pageTitle) {
  const submitted = text(block?.imagePrompt, 4000);
  if (submitted) return submitted;
  const visibleText = sanitizeHtml(String(block?.textHtml || ''), {
    allowedTags: [],
    allowedAttributes: {}
  }).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const subject = visibleText || text(block?.imageAlt, 255) || text(block?.blockTag, 81) || `Block ${index + 1}`;
  return text(`Illustration for "${pageTitle || 'Landingpage'}", section ${index + 1}: ${subject}`, 4000);
}

function sanitizeSlug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function defaultBlock(pageId, title) {
  const safeTitle = sanitizeHtml(title, { allowedTags: [], allowedAttributes: {} });
  return {
    ID: cds.utils.uuid(),
    page_ID: pageId,
    sortOrder: 10,
    blockTag: '#block-1',
    imageUrl: '',
    imageAlt: '',
    imageWidth: '44%',
    imageHeight: '24rem',
    imagePosition: 'left',
    imageFit: 'cover',
    blockHeight: '30rem',
    contentWidth: '84rem',
    paddingTop: 'auto',
    paddingRight: 'auto',
    paddingBottom: 'auto',
    paddingLeft: 'auto',
    backgroundCrop: 'auto',
    blockWidth: 'full',
    parentBlockId: null,
    nestedX: 25,
    nestedY: 25,
    nestedWidth: 50,
    nestedHeight: 50,
    transparentBackground: false,
    textHtml: `<h1>${safeTitle}</h1><p>Beschreiben Sie hier diese Seite.</p>`,
    textAlign: 'left',
    menuItems: '',
    menuOrientation: 'horizontal',
    menuGap: '1.5rem',
    menuFontSize: '1rem',
    menuTextColor: '',
    menuTextEffect: 'none',
    buttonText: 'Jetzt bewerben',
    buttonUrl: '/search',
    buttonType: 'Emphasized',
    buttonWidth: '13rem',
    buttonHeight: '3.25rem',
    buttonBorderRadius: '0.25rem',
    buttonAlign: 'inherit',
    theme: 'light'
  };
}

function sanitizeBlock(block, index) {
  const submittedId = String(block?.ID || '').toLowerCase();
  const submittedParentId = String(block?.parentBlockId || '').toLowerCase();
  const nestedX = Math.min(99, percentage(block?.nestedX, 25));
  const nestedY = Math.min(99, percentage(block?.nestedY, 25));
  const nestedWidth = Math.min(percentage(block?.nestedWidth, 50, 1), 100 - nestedX);
  const nestedHeight = Math.min(percentage(block?.nestedHeight, 50, 1), 100 - nestedY);
  return {
    ID: UUID_PATTERN.test(submittedId) ? submittedId : cds.utils.uuid(),
    sortOrder: (index + 1) * 10,
    blockTag: normalizeBlockTag(block?.blockTag, `#block-${index + 1}`),
    imageUrl: safeUrl(block?.imageUrl, ['https:']),
    imageAlt: text(block?.imageAlt, 255),
    imageWidth: cssLength(block?.imageWidth, '44%'),
    imageHeight: cssLength(block?.imageHeight, '28rem'),
    imagePosition: enumValue(block?.imagePosition, IMAGE_POSITIONS, 'left'),
    imageFit: enumValue(block?.imageFit, IMAGE_FITS, 'cover'),
    blockHeight: cssLength(block?.blockHeight, '30rem'),
    contentWidth: cssLength(block?.contentWidth, '84rem'),
    paddingTop: cssLength(block?.paddingTop, 'auto'),
    paddingRight: cssLength(block?.paddingRight, 'auto'),
    paddingBottom: cssLength(block?.paddingBottom, 'auto'),
    paddingLeft: cssLength(block?.paddingLeft, 'auto'),
    backgroundCrop: enumValue(block?.backgroundCrop, BACKGROUND_CROPS, 'auto'),
    blockWidth: enumValue(block?.blockWidth, BLOCK_WIDTHS, 'full'),
    parentBlockId: UUID_PATTERN.test(submittedParentId) ? submittedParentId : null,
    nestedX,
    nestedY,
    nestedWidth: Math.max(1, nestedWidth),
    nestedHeight: Math.max(1, nestedHeight),
    transparentBackground: block?.transparentBackground === true || block?.transparentBackground === 'true',
    textHtml: cleanRichText(block?.textHtml),
    textAlign: enumValue(block?.textAlign, TEXT_ALIGNS, 'left'),
    menuItems: cleanMenuItems(block?.menuItems),
    menuOrientation: enumValue(block?.menuOrientation, MENU_ORIENTATIONS, 'horizontal'),
    menuGap: cssLength(block?.menuGap, '1.5rem'),
    menuFontSize: cssLength(block?.menuFontSize, '1rem'),
    menuTextColor: optionalColor(block?.menuTextColor),
    menuTextEffect: enumValue(block?.menuTextEffect, MENU_TEXT_EFFECTS, 'none'),
    buttonText: text(block?.buttonText, 120),
    buttonUrl: safeUrl(block?.buttonUrl, ['https:', 'mailto:', 'tel:']),
    buttonType: buttonType(block?.buttonType),
    buttonWidth: cssLength(block?.buttonWidth, 'auto'),
    buttonHeight: cssLength(block?.buttonHeight, '3.25rem'),
    buttonBorderRadius: cssRadius(block?.buttonBorderRadius, '0.25rem'),
    buttonAlign: enumValue(block?.buttonAlign, BUTTON_ALIGNS, 'inherit'),
    theme: themeValue(block?.theme)
  };
}

function cloneBlocksForPage(sourceBlocks, pageId) {
  const ordered = [...(sourceBlocks || [])].sort((left, right) => left.sortOrder - right.sortOrder);
  const idMap = new Map(ordered.map((block) => [String(block.ID), cds.utils.uuid()]));
  return ordered.map((block, index) => {
    const copy = sanitizeBlock({
      ...block,
      ID: idMap.get(String(block.ID)),
      parentBlockId: block.parentBlockId ? idMap.get(String(block.parentBlockId)) || null : null
    }, index);
    copy.page_ID = pageId;
    return copy;
  });
}

function sanitizeTheme(theme) {
  return {
    name: text(theme?.name, 80),
    backgroundColor: color(theme?.backgroundColor, '#FFFFFF'),
    textColor: color(theme?.textColor, '#102A43'),
    headingColor: color(theme?.headingColor, '#102A43'),
    accentColor: color(theme?.accentColor, '#1B9C8F'),
    linkColor: color(theme?.linkColor, '#0A6ED1'),
    buttonBackgroundColor: color(theme?.buttonBackgroundColor, '#0A6ED1'),
    buttonTextColor: color(theme?.buttonTextColor, '#FFFFFF'),
    buttonBorderColor: color(theme?.buttonBorderColor, '#0A6ED1'),
    borderColor: color(theme?.borderColor, '#D5E2EC'),
    overlayColor: color(theme?.overlayColor, '#04121F'),
    overlayOpacity: Math.min(100, Math.max(0, Number.isInteger(Number(theme?.overlayOpacity)) ? Number(theme.overlayOpacity) : 45))
  };
}

function validateBlockHierarchy(blocks) {
  const byId = new Map(blocks.map((block) => [block.ID, block]));

  for (const block of blocks) {
    if (!block.parentBlockId) continue;
    if (block.parentBlockId === block.ID) return 'Ein Block kann nicht sein eigener ParentBlock sein.';
    if (!byId.has(block.parentBlockId)) return 'Der ausgewählte ParentBlock gehört nicht zu dieser Seite.';

    const visited = new Set([block.ID]);
    let current = block;
    while (current.parentBlockId) {
      if (visited.has(current.parentBlockId)) return 'ParentBlock-Verknüpfungen dürfen keinen Kreis bilden.';
      visited.add(current.parentBlockId);
      current = byId.get(current.parentBlockId);
      if (!current) break;
    }
  }

  return '';
}

module.exports = cds.service.impl(async function () {
  const { LandingPages, LandingBlocks, LandingThemes, LandingImages } = cds.entities('job.application');
  const db = await cds.connect.to('db');
  const homePage = await db.run(SELECT.one.from(LandingPages).columns('ID').where({ isHome: true }));
  if (homePage) {
    await db.run(UPDATE(LandingBlocks).set({ page_ID: homePage.ID }).where({ page_ID: null }));
  }

  this.before(['CREATE', 'UPDATE'], 'Images', (req) => {
    if (Object.prototype.hasOwnProperty.call(req.data, 'fileName')) {
      req.data.fileName = text(req.data.fileName, 255);
      if (!req.data.fileName) return req.reject(400, 'Der Dateiname ist erforderlich.');
    }
    if (Object.prototype.hasOwnProperty.call(req.data, 'mimeType')) {
      req.data.mimeType = text(req.data.mimeType, 120).toLowerCase();
      if (!LANDING_IMAGE_MIME_TYPES.has(req.data.mimeType)) {
        return req.reject(400, 'Erlaubt sind PNG-, JPG- und WebP-Bilder.');
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.data, 'sizeBytes')) {
      const sizeBytes = Number(req.data.sizeBytes);
      if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_LANDING_IMAGE_BYTES) {
        return req.reject(400, 'Das Bild darf maximal 5 MB groß sein.');
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.data, 'content')) {
      const requestMimeType = text(req.headers['content-type']?.split(';')[0], 120).toLowerCase();
      if (!LANDING_IMAGE_MIME_TYPES.has(requestMimeType)) {
        return req.reject(400, 'Erlaubt sind PNG-, JPG- und WebP-Bilder.');
      }
      const contentLength = Number(req.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > MAX_LANDING_IMAGE_BYTES) {
        return req.reject(400, 'Das Bild darf maximal 5 MB groß sein.');
      }
    }
  });

  this.on('createPage', async (req) => {
    const title = text(req.data.title, 120);
    const slug = sanitizeSlug(req.data.slug);
    if (!title) return req.reject(400, 'Der Seitenname ist erforderlich.');
    if (!slug) return req.reject(400, 'Die Seitenadresse ist erforderlich.');
    if (RESERVED_SLUGS.has(slug)) return req.reject(400, 'Diese Seitenadresse ist reserviert.');

    const tx = cds.tx(req);
    const lockedHome = await tx.run(SELECT.one.from(LandingPages).columns('ID').where({ isHome: true }).forUpdate());
    if (!lockedHome) return req.reject(409, 'Die Startseite ist nicht konfiguriert.');
    const pages = await tx.run(SELECT.from(LandingPages).columns('ID', 'slug', 'sortOrder'));
    if (pages.length >= MAX_PAGES) return req.reject(400, `Maximal ${MAX_PAGES} Seiten sind erlaubt.`);
    if (pages.some((page) => page.slug === slug)) return req.reject(409, 'Diese Seitenadresse wird bereits verwendet.');

    let sourceBlocks = null;
    if (req.data.copySourcePageId) {
      const sourcePage = pages.find((item) => String(item.ID) === String(req.data.copySourcePageId));
      if (!sourcePage) return req.reject(404, 'Die zu kopierende Seite wurde nicht gefunden.');
      sourceBlocks = await tx.run(
        SELECT.from(LandingBlocks).where({ page_ID: sourcePage.ID }).orderBy('sortOrder')
      );
    }

    const page = {
      ID: cds.utils.uuid(),
      title,
      slug,
      sortOrder: Math.max(0, ...pages.map((item) => item.sortOrder || 0)) + 10,
      isHome: false,
      revision: 1
    };
    try {
      await tx.run(INSERT.into(LandingPages).entries(page));
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || ''))) {
        return req.reject(409, 'Diese Seitenadresse wird bereits verwendet.');
      }
      throw error;
    }
    const blocks = sourceBlocks?.length
      ? cloneBlocksForPage(sourceBlocks, page.ID)
      : [defaultBlock(page.ID, title)];
    await tx.run(INSERT.into(LandingBlocks).entries(blocks));
    return tx.run(SELECT.one.from(LandingPages).where({ ID: page.ID }));
  });

  this.on('deletePage', async (req) => {
    const tx = cds.tx(req);
    const page = await tx.run(SELECT.one.from(LandingPages).where({ ID: req.data.pageId }).forUpdate());
    if (!page) return req.reject(404, 'Die Seite wurde nicht gefunden.');
    if (page.isHome) return req.reject(400, 'Die Startseite kann nicht gelöscht werden.');
    await tx.run(DELETE.from(LandingPages).where({ ID: page.ID }));
    return true;
  });

  this.on('setHomePage', async (req) => {
    const tx = cds.tx(req);
    const currentHome = await tx.run(
      SELECT.one.from(LandingPages).columns('ID').where({ isHome: true }).forUpdate()
    );
    const page = await tx.run(SELECT.one.from(LandingPages).where({ ID: req.data.pageId }).forUpdate());
    if (!page) return req.reject(404, 'Die Seite wurde nicht gefunden.');

    if (String(currentHome?.ID || '') !== String(page.ID)) {
      await tx.run(UPDATE(LandingPages).set({ isHome: false }).where({ isHome: true }));
      await tx.run(UPDATE(LandingPages).set({ isHome: true }).where({ ID: page.ID }));
    }
    return tx.run(SELECT.one.from(LandingPages).where({ ID: page.ID }));
  });

  this.on('getAiModels', async (req) => {
    try {
      return await listOpenRouterModels();
    } catch (error) {
      return req.reject(502, String(error?.message || 'Die OpenRouter-Modellliste konnte nicht geladen werden.'));
    }
  });

  this.on('generateBlocks', async (req) => {
    const prompt = text(req.data.prompt, 6000);
    const outputLanguage = text(req.data.outputLanguage, 80) || 'Deutsch';
    const blockCount = Number(req.data.blockCount);
    const placement = req.data.placement === 'append' ? 'append' : 'replace';
    const textModel = text(req.data.textModel, 255);
    const imageModel = text(req.data.imageModel, 255);
    if (prompt.length < 10) return req.reject(400, 'Bitte beschreiben Sie die gewünschte Seite ausführlicher.');
    if (!Number.isInteger(blockCount) || blockCount < 1 || blockCount > 8) {
      return req.reject(400, 'Es können zwischen 1 und 8 Blöcke generiert werden.');
    }
    if (/:batch$/i.test(textModel)) {
      return req.reject(400, 'Batch-Modelle (:batch) können nicht für die Seitengenerierung verwendet werden. Bitte wählen Sie ein Chat-Modell.');
    }
    if (!isChatCompletionModelId(textModel) || !isAllowedTextModelId(textModel)) {
      return req.reject(400, 'Bitte wählen Sie Google: Gemini 3.1 Pro Preview als Textmodell aus.');
    }
    if (imageModel && !isAllowedImageModelId(imageModel)) {
      return req.reject(400, 'Bitte wählen Sie Meta: Muse Image oder Keine KI aus.');
    }

    const tx = cds.tx(req);
    const page = await tx.run(SELECT.one.from(LandingPages).columns('ID', 'title').where({ ID: req.data.pageId }));
    if (!page) return req.reject(404, 'Die Seite wurde nicht gefunden.');
    const customThemes = await tx.run(SELECT.from(LandingThemes).columns('ID', 'name').orderBy('name'));
    const currentBlocks = await tx.run(
      SELECT.from(LandingBlocks).columns('ID', 'blockTag').where({ page_ID: page.ID }).orderBy('sortOrder')
    );
    const availableImages = await tx.run(
      SELECT.from(LandingImages).columns('ID', 'fileName').orderBy('modifiedAt desc').limit(100)
    );
    if (placement === 'append' && currentBlocks.length + blockCount > MAX_BLOCKS) {
      return req.reject(400, `Maximal ${MAX_BLOCKS} Landing-Blöcke sind erlaubt.`);
    }
    const themes = [
      { key: 'light', name: 'Hell' },
      { key: 'dark', name: 'Dunkel' },
      { key: 'accent', name: 'Akzent' },
      ...customThemes.map((theme) => ({ key: theme.ID, name: theme.name }))
    ];

    let generated;
    try {
      generated = await generateLandingBlocks({
        prompt,
        model: textModel,
        imageModel,
        outputLanguage,
        blockCount,
        pageTitle: page.title,
        themes,
        images: availableImages.map((image) => ({
          url: `/odata/v4/landing/Images(${image.ID})/content`,
          description: image.fileName
        })),
        existingTags: placement === 'append'
          ? currentBlocks.map((block) => block.blockTag).filter(Boolean)
          : []
      });
    } catch (error) {
      return req.reject(502, String(error?.message || 'Die KI-Blöcke konnten nicht generiert werden.'));
    }

    const usedTags = placement === 'append'
      ? currentBlocks.map((block) => block.blockTag).filter(Boolean)
      : [];
    const generatedTags = new Map();
    const parentTags = [];
    const imagePrompts = [];
    const entries = generated.map((block, index) => {
      const requestedTag = normalizeBlockTag(block.blockTag, `#block-${index + 1}`);
      const entry = sanitizeBlock({
        ...block,
        ID: cds.utils.uuid(),
        parentBlockId: null
      }, index);
      entry.blockTag = uniqueBlockTag(entry.blockTag, usedTags);
      usedTags.push(entry.blockTag);
      if (!generatedTags.has(requestedTag)) generatedTags.set(requestedTag, entry.ID);
      parentTags.push(normalizeBlockTag(block.parentBlockTag));
      imagePrompts.push(imageModel ? generatedImagePrompt(block, index, page.title) : '');
      return entry;
    });
    const existingTags = new Map(
      placement === 'append'
        ? currentBlocks.map((block) => [normalizeBlockTag(block.blockTag), block.ID]).filter(([tag]) => tag)
        : []
    );
    entries.forEach((entry, index) => {
      const parentTag = parentTags[index];
      if (!parentTag) return;
      entry.parentBlockId = generatedTags.get(parentTag) || existingTags.get(parentTag) || null;
    });
    if (parentTags.some((tag, index) => tag && !entries[index].parentBlockId)) {
      return req.reject(502, 'OpenRouter hat einen unbekannten ParentBlock-Tag verwendet.');
    }
    const hierarchyError = validateBlockHierarchy([
      ...(placement === 'append' ? currentBlocks.map((block) => ({ ...block, parentBlockId: null })) : []),
      ...entries
    ]);
    if (hierarchyError) return req.reject(502, hierarchyError);
    const imageIndexes = imageModel
      ? imagePrompts
          .map((imagePrompt, index) => ({ imagePrompt, index }))
      : [];
    const generatedImageBlockIndexes = new Set(imageIndexes.map((item) => item.index));
    const emptyBlockIndex = entries.findIndex((entry, index) => hasUsableBlockContent(
      entry,
      generatedImageBlockIndexes.has(index) ? imagePrompts[index] : ''
    ) === false);
    if (emptyBlockIndex >= 0) {
      return req.reject(502, `OpenRouter hat für Block ${emptyBlockIndex + 1} keinen Text, kein Bild, kein Menü und keine Schaltfläche geliefert.`);
    }

    if (imageModel) {
      try {
        const generatedImages = await Promise.all(imageIndexes.map((item) => generateLandingImage({
          model: imageModel,
          prompt: `${item.imagePrompt}\nCreate a professional recruiting-website image without visible text, logos or trademarks.`
        })));
        for (let position = 0; position < generatedImages.length; position += 1) {
          const blockIndex = imageIndexes[position].index;
          const image = generatedImages[position];
          const imageId = cds.utils.uuid();
          const tag = entries[blockIndex].blockTag.slice(1) || `block-${blockIndex + 1}`;
          await tx.run(INSERT.into(LandingImages).entries({
            ID: imageId,
            fileName: `ai-${tag}.${image.extension}`.slice(0, 255),
            mimeType: image.mimeType,
            sizeBytes: image.content.length,
            content: image.content
          }));
          entries[blockIndex].imageUrl = `/odata/v4/landing/Images(${imageId})/content`;
          if (!entries[blockIndex].imageAlt) entries[blockIndex].imageAlt = tag.replace(/-/g, ' ');
        }
      } catch (error) {
        return req.reject(502, String(error?.message || 'Die KI-Bilder konnten nicht generiert werden.'));
      }
    }
    return entries;
  });

  this.on('createTheme', async (req) => {
    if (THEME_COLOR_FIELDS.some((field) => !HEX_COLOR.test(text(req.data.theme?.[field], 7)))) {
      return req.reject(400, 'Alle Themenfarben müssen vollständige Hex-Werte sein, zum Beispiel #0A6ED1.');
    }
    const entry = sanitizeTheme(req.data.theme);
    if (!entry.name) return req.reject(400, 'Der Name des Farbschemas ist erforderlich.');

    const tx = cds.tx(req);
    const existing = await tx.run(SELECT.one.from(LandingThemes).columns('ID').where({ name: entry.name }));
    if (existing) return req.reject(409, 'Ein Farbschema mit diesem Namen existiert bereits.');

    entry.ID = cds.utils.uuid();
    await tx.run(INSERT.into(LandingThemes).entries(entry));
    return tx.run(SELECT.one.from(LandingThemes).where({ ID: entry.ID }));
  });

  this.on('deleteTheme', async (req) => {
    const tx = cds.tx(req);
    const theme = await tx.run(SELECT.one.from(LandingThemes).columns('ID').where({ ID: req.data.themeId }).forUpdate());
    if (!theme) return req.reject(404, 'Das Farbschema wurde nicht gefunden.');

    const usage = await tx.run(SELECT.one.from(LandingBlocks).columns('ID').where({ theme: theme.ID }));
    if (usage) {
      return req.reject(409, 'Das Farbschema kann nicht gelöscht werden, weil es mindestens einem Block zugewiesen ist.');
    }

    await tx.run(DELETE.from(LandingThemes).where({ ID: theme.ID }));
    return true;
  });

  this.on('saveBlocks', async (req) => {
    if (!Object.prototype.hasOwnProperty.call(req.data, 'blocks') || !Array.isArray(req.data.blocks)) {
      return req.reject(400, 'Das Feld blocks muss ein Array sein.');
    }

    const submitted = req.data.blocks;
    if (!submitted.length) return req.reject(400, 'Die Landingpage muss mindestens einen Block enthalten.');
    if (submitted.length > MAX_BLOCKS) return req.reject(400, `Maximal ${MAX_BLOCKS} Landing-Blöcke sind erlaubt.`);
    if (submitted.some((block) => String(block?.textHtml || '').length > 50_000)) {
      return req.reject(400, 'Der formatierte Text eines Blocks ist zu lang.');
    }

    const entries = submitted.map(sanitizeBlock);
    const ids = entries.map((entry) => entry.ID);
    if (new Set(ids).size !== ids.length) return req.reject(400, 'Block-IDs müssen eindeutig sein.');
    const blockTags = entries.map((entry) => entry.blockTag);
    if (new Set(blockTags).size !== blockTags.length) {
      return req.reject(400, 'Block-Tags müssen innerhalb einer Seite eindeutig sein.');
    }
    const hierarchyError = validateBlockHierarchy(entries);
    if (hierarchyError) return req.reject(400, hierarchyError);

    const tx = cds.tx(req);
    const page = await tx.run(SELECT.one.from(LandingPages).where({ ID: req.data.pageId }).forUpdate());
    if (!page) return req.reject(404, 'Die Seite wurde nicht gefunden.');
    const currentRevision = page.revision || 0;
    const expectedRevision = Number(req.data.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
      return req.reject(409, 'Die Landingpage wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu.');
    }

    const knownBlocks = ids.length
      ? await tx.run(SELECT.from(LandingBlocks).columns('ID', 'page_ID').where({ ID: { in: ids } }))
      : [];
    if (knownBlocks.some((block) => block.page_ID !== page.ID)) {
      return req.reject(400, 'Eine Block-ID gehört bereits zu einer anderen Seite.');
    }

    const customThemeIds = [...new Set(entries.map((entry) => entry.theme).filter((theme) => !THEMES.has(theme)))];
    if (customThemeIds.length) {
      const knownThemes = await tx.run(SELECT.from(LandingThemes).columns('ID').where({ ID: { in: customThemeIds } }));
      if (knownThemes.length !== customThemeIds.length) {
        return req.reject(400, 'Ein ausgewähltes Farbschema existiert nicht mehr.');
      }
    }

    entries.forEach((entry) => { entry.page_ID = page.ID; });
    await tx.run(DELETE.from(LandingBlocks).where({ page_ID: page.ID }));
    if (entries.length) await tx.run(INSERT.into(LandingBlocks).entries(entries));
    await tx.run(UPDATE(LandingPages).set({ revision: currentRevision + 1 }).where({ ID: page.ID }));
    return tx.run(SELECT.from(LandingBlocks).where({ page_ID: page.ID }).orderBy('sortOrder'));
  });

  this.on('copyBlock', async (req) => {
    if (!req.data.block || typeof req.data.block !== 'object') {
      return req.reject(400, 'Der zu kopierende Block fehlt.');
    }
    if (String(req.data.sourcePageId) === String(req.data.targetPageId)) {
      return req.reject(400, 'Quelle und Ziel müssen unterschiedliche Seiten sein.');
    }
    if (String(req.data.block.textHtml || '').length > 50_000) {
      return req.reject(400, 'Der formatierte Text des Blocks ist zu lang.');
    }

    const tx = cds.tx(req);
    const sourcePage = await tx.run(SELECT.one.from(LandingPages).columns('ID').where({ ID: req.data.sourcePageId }));
    if (!sourcePage) return req.reject(404, 'Die Quellseite wurde nicht gefunden.');
    const page = await tx.run(SELECT.one.from(LandingPages).where({ ID: req.data.targetPageId }).forUpdate());
    if (!page) return req.reject(404, 'Die Zielseite wurde nicht gefunden.');

    const existing = await tx.run(
      SELECT.from(LandingBlocks).columns('blockTag', 'sortOrder').where({ page_ID: page.ID })
    );
    if (existing.length >= MAX_BLOCKS) {
      return req.reject(400, `Maximal ${MAX_BLOCKS} Landing-Blöcke sind erlaubt.`);
    }

    const copied = sanitizeBlock({ ...req.data.block, ID: '', parentBlockId: null }, existing.length);
    copied.ID = cds.utils.uuid();
    copied.page_ID = page.ID;
    copied.parentBlockId = null;
    copied.sortOrder = Math.max(0, ...existing.map((block) => block.sortOrder || 0)) + 10;
    copied.blockTag = uniqueBlockTag(copied.blockTag, existing.map((block) => block.blockTag));

    if (!THEMES.has(copied.theme)) {
      const theme = await tx.run(SELECT.one.from(LandingThemes).columns('ID').where({ ID: copied.theme }));
      if (!theme) return req.reject(400, 'Das ausgewählte Farbschema existiert nicht mehr.');
    }

    await tx.run(INSERT.into(LandingBlocks).entries(copied));
    await tx.run(UPDATE(LandingPages).set({ revision: (page.revision || 0) + 1 }).where({ ID: page.ID }));
    return tx.run(SELECT.one.from(LandingBlocks).where({ ID: copied.ID }));
  });
});

module.exports.sanitizeBlock = sanitizeBlock;
module.exports.sanitizeSlug = sanitizeSlug;
module.exports.validateBlockHierarchy = validateBlockHierarchy;
module.exports.sanitizeTheme = sanitizeTheme;
module.exports.uniqueBlockTag = uniqueBlockTag;
module.exports.cloneBlocksForPage = cloneBlocksForPage;
module.exports.hasUsableBlockContent = hasUsableBlockContent;
module.exports.generatedImagePrompt = generatedImagePrompt;
