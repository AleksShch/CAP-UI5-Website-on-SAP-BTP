'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { PDFParse } = require('pdf-parse');
const officeParser = require('officeparser');
const WordExtractor = require('word-extractor');

const wordExtractor = new WordExtractor();
const SUPPORTED_RESUME_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.odt', '.rtf']);
const MAX_EXTRACTED_TEXT_LENGTH = 2_000_000;
const ANALYSIS_TIMEOUT_MS = 20_000;
const MAX_OFFICE_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_OFFICE_ZIP_ENTRIES = 512;
const FORMAT_LABELS = {
  '.pdf': 'PDF',
  '.doc': 'DOC',
  '.docx': 'DOCX',
  '.odt': 'ODT',
  '.rtf': 'RTF'
};

const SKILL_DICTIONARY = [
  'ABAP', 'SAPUI5', 'UI5', 'Fiori', 'CAP', 'BTP', 'RAP', 'OData', 'CDS',
  'JavaScript', 'TypeScript', 'Node.js', 'Java', 'C#', '.NET', 'React', 'Vue.js',
  'Rust', 'Python', 'SQL', 'PostgreSQL', 'HANA', 'Docker', 'Kubernetes', 'Git',
  'CI/CD', 'Azure', 'AWS', 'Scrum'
];

const LANGUAGE_DICTIONARY = [
  ['Deutsch', /\b(?:deutsch|german)\b/i],
  ['Englisch', /\b(?:englisch|english)\b/i],
  ['Russisch', /\b(?:russisch|russian)\b/i],
  ['Französisch', /\b(?:französisch|french)\b/i],
  ['Spanisch', /\b(?:spanisch|spanish)\b/i],
  ['Italienisch', /\b(?:italienisch|italian)\b/i],
  ['Ukrainisch', /\b(?:ukrainisch|ukrainian)\b/i]
];

const HEADING_PATTERN = /^(lebenslauf|curriculum vitae|cv|profil|profile|kontakt|contact|berufserfahrung|experience|skills?|kenntnisse|ausbildung|education|sprachen|languages?)$/i;

function cleanLines(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function firstMatch(text, pattern) {
  return text.match(pattern)?.[0]?.trim() || '';
}

function inferName(lines) {
  const candidate = lines.slice(0, 15).find((line) => {
    if (HEADING_PATTERN.test(line) || /[@\d:/|]/.test(line)) return false;
    const parts = line.split(/\s+/);
    return parts.length >= 2 && parts.length <= 4 && parts.every((part) => /^[\p{L}'’-]+$/u.test(part));
  });
  if (!candidate) return { firstName: '', lastName: '' };
  const parts = candidate.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function inferAddress(lines) {
  const index = lines.findIndex((line) => /\b\d{5}\s+[\p{L}][\p{L}\s.'’-]+/u.test(line));
  if (index < 0) return { street: '', postalCode: '', city: '', country: '' };
  const cityMatch = lines[index].match(/\b(\d{5})\s+([\p{L}][\p{L}\s.'’-]+)/u);
  const previous = lines[index - 1] || '';
  const street = /\d/.test(previous) && !/@|\+|www\./i.test(previous) ? previous : '';
  return {
    street,
    postalCode: cityMatch?.[1] || '',
    city: cityMatch?.[2]?.trim() || '',
    country: ''
  };
}

function inferCurrentTitle(lines, name) {
  const nameLine = `${name.firstName} ${name.lastName}`.trim().toLowerCase();
  return lines.slice(0, 18).find((line) => {
    const lowered = line.toLowerCase();
    if (lowered === nameLine || HEADING_PATTERN.test(line)) return false;
    if (/[@\d:/|]|linkedin|xing|telefon|phone|mail/i.test(line)) return false;
    const words = line.split(/\s+/);
    return words.length >= 2 && words.length <= 9 && line.length <= 100;
  }) || '';
}

function parseResumeText(text) {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim();
  const lines = cleanLines(text);
  const name = inferName(lines);
  const address = inferAddress(lines);
  const email = firstMatch(normalizedText, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i).toLowerCase();
  const phone = firstMatch(normalizedText, /(?:\+|00)?\d[\d\s()./-]{7,}\d/);
  const linkedIn = firstMatch(normalizedText, /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9._%-]+\/?/i);
  const skills = SKILL_DICTIONARY.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(normalizedText);
  });
  const languages = LANGUAGE_DICTIONARY.filter(([, pattern]) => pattern.test(normalizedText)).map(([label]) => label);

  return {
    firstName: name.firstName,
    lastName: name.lastName,
    email,
    phone,
    ...address,
    linkedIn,
    currentTitle: inferCurrentTitle(lines, name),
    skills: skills.join(', '),
    languages: languages.join(', ')
  };
}

async function extractPdfText(buffer) {
  let parsed;
  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    parsed = await parser.getText();
  } finally {
    if (parser) await parser.destroy();
  }

  return { text: String(parsed.text || ''), pages: parsed.total || null };
}

async function extractLegacyDocText(buffer) {
  const document = await wordExtractor.extract(buffer);
  return { text: document.getBody(), pages: null };
}

async function extractOfficeText(buffer, extension) {
  const abortSignal = AbortSignal.timeout(15000);
  const ast = await officeParser.parseOffice(buffer, {
    fileType: extension.slice(1),
    ignoreNotes: true,
    ignoreComments: true,
    ignoreHeadersAndFooters: false,
    extractAttachments: false,
    decompressionLimits: {
      maxUncompressedBytes: MAX_OFFICE_UNCOMPRESSED_BYTES,
      maxZipEntries: MAX_OFFICE_ZIP_ENTRIES,
      maxTableCells: 100_000
    },
    abortSignal
  });
  const result = await ast.to('text', {
    includeImages: false,
    textConfig: {
      preserveLayout: false,
      renderNotes: false
    },
    abortSignal
  });
  const auxiliaryNodes = [
    ...(ast.auxiliary?.headers || []),
    ...(ast.auxiliary?.footers || [])
  ];
  const auxiliaryText = collectNodeText(auxiliaryNodes);
  return {
    text: [String(result.value || ''), auxiliaryText].filter(Boolean).join('\n'),
    pages: null,
    parserWarnings: [...(ast.warnings || []), ...(result.messages || [])]
  };
}

function collectNodeText(nodes) {
  return (nodes || []).map((node) => {
    if (node.children?.length) return collectNodeText(node.children);
    return node.text || '';
  }).filter(Boolean).join('\n');
}

async function extractResumeText(buffer, fileName) {
  const extension = path.extname(fileName || '').toLowerCase();
  if (!SUPPORTED_RESUME_EXTENSIONS.has(extension)) {
    const error = new Error('Unterstützte Lebenslauf-Formate: PDF, DOC, DOCX, ODT und RTF.');
    error.status = 415;
    throw error;
  }

  try {
    if (extension === '.pdf') return { ...(await extractPdfText(buffer)), extension };
    if (extension === '.doc') return { ...(await extractLegacyDocText(buffer)), extension };
    return { ...(await extractOfficeText(buffer, extension)), extension };
  } catch (cause) {
    if (cause.status) throw cause;
    const error = new Error(`Der ${FORMAT_LABELS[extension]}-Inhalt konnte nicht gelesen werden.`);
    error.status = 422;
    error.cause = cause;
    throw error;
  }
}

async function analyzeResumeInProcess(buffer, fileName = 'resume.pdf') {
  const parsed = await extractResumeText(buffer, fileName);

  const extractedText = String(parsed.text || '');
  if (extractedText.length > MAX_EXTRACTED_TEXT_LENGTH) {
    const error = new Error('Das Dokument enthält zu viel Text und kann nicht sicher verarbeitet werden.');
    error.status = 422;
    throw error;
  }
  const text = extractedText.trim();
  if (text.length < 30) {
    const error = new Error(`Die ${FORMAT_LABELS[parsed.extension]}-Datei enthält keinen ausreichend lesbaren Text. Für gescannte Dokumente ist OCR erforderlich.`);
    error.status = 422;
    throw error;
  }

  const fields = parseResumeText(text);
  const warnings = [];
  if (!fields.email) warnings.push('Keine E-Mail-Adresse erkannt.');
  if (!fields.firstName || !fields.lastName) warnings.push('Der Name konnte nicht sicher erkannt werden.');

  return {
    fields,
    meta: {
      format: FORMAT_LABELS[parsed.extension],
      pages: parsed.pages,
      textLength: text.length,
      warnings,
      parserWarnings: (parsed.parserWarnings || []).map((warning) => String(warning.message || warning)).slice(0, 10)
    }
  };
}

function analyzeResume(buffer, fileName = 'resume.pdf') {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'resume-worker.js'), {
      workerData: { buffer, fileName }
    });
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      void worker.terminate();
      const error = new Error('Die Analyse des Lebenslaufs hat das Zeitlimit überschritten.');
      error.status = 422;
      finish(reject, error);
    }, ANALYSIS_TIMEOUT_MS);

    worker.once('message', (message) => {
      if (message.ok) {
        finish(resolve, message.result);
        return;
      }
      const error = new Error(message.error?.message || 'Der Lebenslauf konnte nicht gelesen werden.');
      error.status = message.error?.status || 422;
      finish(reject, error);
    });
    worker.once('error', (cause) => {
      const error = new Error('Der Lebenslauf konnte nicht gelesen werden.');
      error.status = 422;
      error.cause = cause;
      finish(reject, error);
    });
    worker.once('exit', (code) => {
      if (!settled) {
        const error = new Error('Der Lebenslauf konnte nicht gelesen werden.');
        error.status = 422;
        error.cause = new Error(`Analyse-Worker wurde mit Code ${code} beendet.`);
        finish(reject, error);
      }
    });
  });
}

module.exports = {
  analyzeResume,
  analyzeResumeInProcess,
  extractResumeText,
  parseResumeText,
  SUPPORTED_RESUME_EXTENSIONS
};
