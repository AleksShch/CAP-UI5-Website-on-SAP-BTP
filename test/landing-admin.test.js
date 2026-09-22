'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cloneBlocksForPage,
  generatedImagePrompt,
  hasUsableBlockContent,
  sanitizeBlock,
  sanitizeSlug,
  sanitizeTheme,
  uniqueBlockTag,
  validateBlockHierarchy
} = require('../srv/landing-admin-service');

test('creates one usable image prompt for every generated block', () => {
  assert.equal(
    generatedImagePrompt({ imagePrompt: 'A fox in a forest' }, 0, 'Tierwelt'),
    'A fox in a forest'
  );
  assert.match(
    generatedImagePrompt({ textHtml: '<h2>Bedrohte Tierarten</h2><p>Gemeinsam schützen.</p>' }, 3, 'Tierwelt'),
    /Tierwelt.*section 4.*Bedrohte Tierarten.*Gemeinsam schützen/
  );
});

test('accepts text, image, generated image prompt, menu or button as block content', () => {
  assert.equal(hasUsableBlockContent({ textHtml: '<p>Karriere</p>' }), true);
  assert.equal(hasUsableBlockContent({ imageUrl: '/assets/team.png' }), true);
  assert.equal(hasUsableBlockContent({}, 'A recruiting team in a modern office'), true);
  assert.equal(hasUsableBlockContent({ menuItems: 'Jobs | #jobs' }), true);
  assert.equal(hasUsableBlockContent({ buttonText: 'Jetzt bewerben' }), true);
  assert.equal(hasUsableBlockContent({ textHtml: '<p><br></p><span>&nbsp;</span>' }), false);
});

test('sanitizes landing block HTML and unsafe URLs', () => {
  const block = sanitizeBlock({
    ID: 'not-a-uuid',
    imageUrl: 'javascript:alert(1)',
    imageWidth: 'calc(100% + 1px)',
    imageHeight: '480px',
    imagePosition: 'floating',
    blockHeight: 'calc(100vh - 2rem)',
    contentWidth: 'min(84rem, 100%)',
    paddingTop: 'calc(1rem + 2px)',
    paddingRight: 'invalid',
    paddingBottom: '-1px',
    paddingLeft: 'inherit',
    backgroundCrop: 'stretch',
    blockWidth: 'wide',
    parentBlockId: 'not-a-uuid',
    nestedX: 120,
    nestedY: -1,
    nestedWidth: 0,
    nestedHeight: 101,
    transparentBackground: 'yes',
    textHtml: '<h2 onclick="alert(1)">Hallo</h2><script>alert(1)</script><a href="javascript:alert(2)">Link</a>',
    menuItems: 'Unsicher | javascript:alert(1)\nTeam | #Team Bereich\nOhne Ziel\nКоманда',
    menuOrientation: 'diagonal',
    menuGap: 'calc(100% - 1rem)',
    menuFontSize: 'huge',
    menuTextColor: 'red',
    menuTextEffect: 'blink',
    buttonText: 'Kontakt',
    blockTag: ' Über uns ',
    buttonUrl: 'mailto:hr@example.com',
    buttonType: 'Unknown',
    buttonHeight: 'calc(100% - 1px)',
    buttonBorderRadius: 'calc(1rem + 1px)',
    buttonAlign: 'diagonal'
  }, 1);

  assert.match(block.ID, /^[0-9a-f-]{36}$/i);
  assert.equal(block.sortOrder, 20);
  assert.equal(block.imageUrl, '');
  assert.equal(block.imageWidth, '44%');
  assert.equal(block.imageHeight, '480px');
  assert.equal(block.imagePosition, 'left');
  assert.equal(block.blockHeight, '30rem');
  assert.equal(block.contentWidth, '84rem');
  assert.equal(block.paddingTop, 'auto');
  assert.equal(block.paddingRight, 'auto');
  assert.equal(block.paddingBottom, 'auto');
  assert.equal(block.paddingLeft, 'auto');
  assert.equal(block.backgroundCrop, 'auto');
  assert.equal(block.blockWidth, 'full');
  assert.equal(block.parentBlockId, null);
  assert.equal(block.nestedX, 25);
  assert.equal(block.nestedY, 25);
  assert.equal(block.nestedWidth, 50);
  assert.equal(block.nestedHeight, 50);
  assert.equal(block.transparentBackground, false);
  assert.equal(block.textHtml, '<h2>Hallo</h2><a target="_self" rel="noopener noreferrer">Link</a>');
  assert.equal(block.menuItems, 'Team | #team-bereich\nOhne Ziel | #ohne-ziel\nКоманда | #menu-item-4');
  assert.equal(block.menuOrientation, 'horizontal');
  assert.equal(block.menuGap, '1.5rem');
  assert.equal(block.menuFontSize, '1rem');
  assert.equal(block.menuTextColor, '');
  assert.equal(block.menuTextEffect, 'none');
  assert.equal(block.blockTag, '#uber-uns');
  assert.equal(block.buttonUrl, 'mailto:hr@example.com');
  assert.equal(block.buttonType, 'Emphasized');
  assert.equal(block.buttonHeight, '3.25rem');
  assert.equal(block.buttonBorderRadius, '0.25rem');
  assert.equal(block.buttonAlign, 'inherit');
});

test('rejects network-path-like local URLs', () => {
  const block = sanitizeBlock({
    imageUrl: '/\\example.com/image.png',
    buttonUrl: '/\\example.com/jobs'
  }, 0);

  assert.equal(block.imageUrl, '');
  assert.equal(block.buttonUrl, '');
});

test('keeps block tags as button targets', () => {
  const block = sanitizeBlock({ buttonUrl: '#Kontakt Bereich' }, 0);

  assert.equal(block.buttonUrl, '#kontakt-bereich');
  assert.equal(block.blockTag, '#block-1');
});

test('keeps supported local and HTTPS landing resources', () => {
  const block = sanitizeBlock({
    ID: '7D07390F-6534-4EC0-9205-C58E908A3F32',
    imageUrl: '/job-application/webapp/assets/career-team.svg',
    textHtml: '<span class="landingEyebrow unknown">Team</span>',
    blockTag: '#kontakt',
    buttonUrl: 'https://example.com/jobs',
    imagePosition: 'right',
    imageFit: 'contain',
    blockHeight: '70vh',
    contentWidth: '1200px',
    paddingTop: '2rem',
    paddingRight: '5%',
    paddingBottom: '32px',
    paddingLeft: '0',
    backgroundCrop: 'cropWidth',
    blockWidth: 'third',
    parentBlockId: '10000000-0000-4000-8000-000000000001',
    nestedX: 20,
    nestedY: 30,
    nestedWidth: 70,
    nestedHeight: 60,
    transparentBackground: true,
    textAlign: 'center',
    menuItems: 'Jobs | https://example.com/jobs',
    menuOrientation: 'vertical',
    menuGap: '24px',
    menuFontSize: '1.25rem',
    menuTextColor: '#aabbcc',
    menuTextEffect: 'outline',
    theme: 'accent',
    buttonHeight: '64px',
    buttonBorderRadius: '50%',
    buttonAlign: 'right'
  }, 0);

  assert.equal(block.imageUrl, '/job-application/webapp/assets/career-team.svg');
  assert.equal(block.ID, '7d07390f-6534-4ec0-9205-c58e908a3f32');
  assert.equal(block.blockTag, '#kontakt');
  assert.equal(block.buttonUrl, 'https://example.com/jobs');
  assert.equal(block.imagePosition, 'right');
  assert.equal(block.imageFit, 'contain');
  assert.equal(block.blockHeight, '70vh');
  assert.equal(block.contentWidth, '1200px');
  assert.equal(block.paddingTop, '2rem');
  assert.equal(block.paddingRight, '5%');
  assert.equal(block.paddingBottom, '32px');
  assert.equal(block.paddingLeft, '0');
  assert.equal(block.backgroundCrop, 'cropWidth');
  assert.equal(block.blockWidth, 'third');
  assert.equal(block.parentBlockId, '10000000-0000-4000-8000-000000000001');
  assert.equal(block.nestedX, 20);
  assert.equal(block.nestedY, 30);
  assert.equal(block.nestedWidth, 70);
  assert.equal(block.nestedHeight, 60);
  assert.equal(block.transparentBackground, true);
  assert.equal(block.textAlign, 'center');
  assert.equal(block.menuItems, 'Jobs | https://example.com/jobs');
  assert.equal(block.menuOrientation, 'vertical');
  assert.equal(block.menuGap, '24px');
  assert.equal(block.menuFontSize, '1.25rem');
  assert.equal(block.menuTextColor, '#AABBCC');
  assert.equal(block.menuTextEffect, 'outline');
  assert.equal(block.theme, 'accent');
  assert.equal(block.buttonHeight, '64px');
  assert.equal(block.buttonBorderRadius, '50%');
  assert.equal(block.buttonAlign, 'right');
  assert.equal(block.textHtml, '<span class="landingEyebrow">Team</span>');
});

test('sanitizes custom landing theme values', () => {
  const theme = sanitizeTheme({
    name: '  Unternehmensblau  ',
    backgroundColor: '#aabbcc',
    textColor: 'invalid',
    overlayOpacity: 120
  });

  assert.equal(theme.name, 'Unternehmensblau');
  assert.equal(theme.backgroundColor, '#AABBCC');
  assert.equal(theme.textColor, '#102A43');
  assert.equal(theme.overlayOpacity, 100);
});

test('normalizes page slugs for public URLs', () => {
  assert.equal(sanitizeSlug('  Über Uns & Team  '), 'uber-uns-team');
  assert.equal(sanitizeSlug('Jobs---Berlin'), 'jobs-berlin');
  assert.equal(sanitizeSlug('../admin'), 'admin');
});

test('maps the legacy Positive button type to the UI5 Success type', () => {
  assert.equal(sanitizeBlock({ buttonType: 'Positive' }, 0).buttonType, 'Success');
  assert.equal(sanitizeBlock({ buttonType: 'Success' }, 0).buttonType, 'Success');
});

test('creates a unique tag for a copied block', () => {
  assert.equal(uniqueBlockTag('#team', ['#hero']), '#team');
  assert.equal(uniqueBlockTag('#team', ['#team']), '#team-copy');
  assert.equal(uniqueBlockTag('#team', ['#team', '#team-copy']), '#team-copy-2');
});

test('clones a page hierarchy with new block IDs', () => {
  const parentId = '10000000-0000-4000-8000-000000000001';
  const childId = '10000000-0000-4000-8000-000000000002';
  const pageId = '20000000-0000-4000-8000-000000000001';
  const copies = cloneBlocksForPage([
    { ID: childId, sortOrder: 20, blockTag: '#child', parentBlockId: parentId },
    { ID: parentId, sortOrder: 10, blockTag: '#parent', parentBlockId: null }
  ], pageId);

  assert.equal(copies.length, 2);
  assert.equal(copies[0].blockTag, '#parent');
  assert.equal(copies[1].blockTag, '#child');
  assert.notEqual(copies[0].ID, parentId);
  assert.notEqual(copies[1].ID, childId);
  assert.equal(copies[1].parentBlockId, copies[0].ID);
  assert.ok(copies.every((block) => block.page_ID === pageId));
});

test('validates ParentBlock references and rejects cycles', () => {
  const first = { ID: '10000000-0000-4000-8000-000000000001', parentBlockId: null };
  const second = { ID: '10000000-0000-4000-8000-000000000002', parentBlockId: first.ID };
  const third = { ID: '10000000-0000-4000-8000-000000000003', parentBlockId: second.ID };

  assert.equal(validateBlockHierarchy([first, second, third]), '');
  assert.match(validateBlockHierarchy([{ ...first, parentBlockId: first.ID }]), /eigener ParentBlock/);
  assert.match(validateBlockHierarchy([{ ...first, parentBlockId: second.ID }]), /gehört nicht/);
  assert.match(validateBlockHierarchy([
    { ...first, parentBlockId: third.ID },
    second,
    third
  ]), /keinen Kreis/);
});
