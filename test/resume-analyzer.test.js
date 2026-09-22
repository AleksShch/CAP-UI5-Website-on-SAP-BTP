'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { analyzeResume, extractResumeText, parseResumeText } = require('../srv/lib/resume-analyzer');
const { hasSignature } = require('../srv/routes');

const RESUME_LINES = [
  'Maria Musterfrau',
  'Senior Software Entwicklerin',
  'Hauptstrasse 7',
  '10115 Berlin',
  'maria@example.com | +49 151 12345678',
  'Kenntnisse: JavaScript, Node.js, Docker',
  'Sprachen: Deutsch, Englisch'
];

const xmlEscape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function createDocx(headerText = '') {
  const paragraphs = RESUME_LINES.map((line) => `<w:p><w:r><w:t>${xmlEscape(line)}</w:t></w:r></w:p>`).join('');
  const headerReference = headerText ? '<w:headerReference w:type="default" r:id="rIdHeader"/>' : '';
  const headerOverride = headerText ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '';
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${headerOverride}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${paragraphs}<w:sectPr>${headerReference}</w:sectPr></w:body></w:document>`)
  };
  if (headerText) {
    files['word/_rels/document.xml.rels'] = strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>');
    files['word/header1.xml'] = strToU8(`<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${xmlEscape(headerText)}</w:t></w:r></w:p></w:hdr>`);
  }
  return Buffer.from(zipSync(files));
}

function createOdt() {
  const paragraphs = RESUME_LINES.map((line) => `<text:p>${xmlEscape(line)}</text:p>`).join('');
  return Buffer.from(zipSync({
    mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
    'META-INF/manifest.xml': strToU8('<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>'),
    'content.xml': strToU8(`<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>${paragraphs}</office:text></office:body></office:document-content>`)
  }));
}

test('extracts common fields from a German resume', () => {
  const fields = parseResumeText(`
    Alexander Beispiel
    SAP ABAP und Fiori Entwickler
    Musterstraße 12
    31608 Marklohe
    alexander@example.com | +49 151 12345678
    linkedin.com/in/alexander-beispiel

    Kenntnisse
    ABAP, SAPUI5, CAP, BTP, OData, Docker, PostgreSQL

    Sprachen
    Deutsch B2, Englisch B2, Russisch Muttersprache
  `);

  assert.equal(fields.firstName, 'Alexander');
  assert.equal(fields.lastName, 'Beispiel');
  assert.equal(fields.email, 'alexander@example.com');
  assert.equal(fields.postalCode, '31608');
  assert.equal(fields.city, 'Marklohe');
  assert.equal(fields.street, 'Musterstraße 12');
  assert.match(fields.skills, /ABAP/);
  assert.match(fields.skills, /SAPUI5/);
  assert.match(fields.languages, /Deutsch/);
  assert.match(fields.languages, /Russisch/);
});

test('extracts and analyzes an RTF resume', async () => {
  const rtf = Buffer.from(String.raw`{\rtf1\ansi\deff0
    Maria Musterfrau\par
    Senior Software Entwicklerin\par
    Hauptstrasse 7\par
    10115 Berlin\par
    maria@example.com | +49 151 12345678\par
    Kenntnisse: JavaScript, Node.js, Docker\par
    Sprachen: Deutsch, Englisch\par
  }`, 'utf8');

  const result = await analyzeResume(rtf, 'lebenslauf.rtf');

  assert.equal(result.meta.format, 'RTF');
  assert.equal(result.fields.firstName, 'Maria');
  assert.equal(result.fields.lastName, 'Musterfrau');
  assert.equal(result.fields.email, 'maria@example.com');
  assert.match(result.fields.skills, /JavaScript/);
  assert.match(result.fields.languages, /Deutsch/);
});

test('extracts and analyzes DOCX and ODT resumes', async () => {
  for (const [fileName, buffer] of [['lebenslauf.docx', createDocx()], ['lebenslauf.odt', createOdt()]]) {
    const result = await analyzeResume(buffer, fileName);
    assert.equal(result.fields.firstName, 'Maria');
    assert.equal(result.fields.lastName, 'Musterfrau');
    assert.equal(result.fields.email, 'maria@example.com');
  }
});

test('includes DOCX header text once', async () => {
  const headerText = 'Portfolio: example.test/maria';
  const parsed = await extractResumeText(createDocx(headerText), 'lebenslauf.docx');
  assert.equal(parsed.text.split(headerText).length - 1, 1);
});

test('validates DOCX and ODT container contents instead of accepting any ZIP', async () => {
  const docx = createDocx();
  const odt = createOdt();
  const arbitraryZip = Buffer.from(zipSync({ 'notes.txt': strToU8('not an office document') }));

  assert.equal(await hasSignature({ originalname: 'resume.docx', buffer: docx }), true);
  assert.equal(await hasSignature({ originalname: 'resume.odt', buffer: odt }), true);
  assert.equal(await hasSignature({ originalname: 'resume.odt', buffer: docx }), false);
  assert.equal(await hasSignature({ originalname: 'resume.docx', buffer: arbitraryZip }), false);
});

test('rejects Office archives with too many entries', async () => {
  const files = {
    '[Content_Types].xml': strToU8('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'),
    'word/document.xml': strToU8('<document/>')
  };
  for (let index = 0; index < 511; index += 1) files[`extra/${index}.xml`] = strToU8('');

  const oversizedDirectory = Buffer.from(zipSync(files));
  assert.equal(await hasSignature({ originalname: 'resume.docx', buffer: oversizedDirectory }), false);
});
