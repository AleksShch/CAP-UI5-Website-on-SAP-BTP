'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const cds = require('@sap/cds');
const { unzip } = require('fflate');
const { analyzeResume } = require('./lib/resume-analyzer');
const { sendApplicationMail } = require('./lib/mailer');
const { CaptchaStore } = require('./lib/captcha');

const RESUME_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.odt', '.rtf']);
const ALLOWED_EXTENSIONS = new Set([...RESUME_EXTENSIONS, '.png', '.jpg', '.jpeg']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function envInt(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

const maxFileSizeMb = envInt('MAX_FILE_SIZE_MB', 10, 1, 25);
const maxAttachments = envInt('MAX_ATTACHMENTS', 5, 0, 10);
const captchaStore = new CaptchaStore();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
    files: maxAttachments + 1,
    fields: 3
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    callback(null, ALLOWED_EXTENSIONS.has(extension));
  }
});

function sanitizeFileName(value) {
  return path.basename(value || 'document')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .slice(0, 180);
}

async function hasSignature(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const bytes = file.buffer;
  if (extension === '.pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (extension === '.png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.jpg' || extension === '.jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === '.docx' || extension === '.odt') return hasZipDocumentSignature(bytes, extension);
  if (extension === '.doc') return bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (extension === '.rtf') {
    const offset = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? 3 : 0;
    return bytes.subarray(offset, offset + 5).toString('ascii').toLowerCase() === '{\\rtf';
  }
  return false;
}

function hasZipDocumentSignature(bytes, extension) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  const requiredEntries = extension === '.docx'
    ? new Set(['[Content_Types].xml', 'word/document.xml'])
    : new Set(['mimetype', 'content.xml']);

  return new Promise((resolve) => {
    let entryCount = 0;
    let invalid = false;
    unzip(bytes, {
      filter: (entry) => {
        entryCount += 1;
        if (entryCount > 512) invalid = true;
        return !invalid && requiredEntries.has(entry.name) && entry.originalSize <= 5 * 1024 * 1024;
      }
    }, (error, entries) => {
      if (error || invalid) return resolve(false);
      if (extension === '.docx') {
        const contentTypes = entries['[Content_Types].xml'];
        return resolve(Boolean(
          contentTypes
          && entries['word/document.xml']
          && Buffer.from(contentTypes).toString('utf8').includes(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
          )
        ));
      }
      resolve(Boolean(
        entries['content.xml']
        && entries.mimetype
        && Buffer.from(entries.mimetype).toString('utf8').trim() === 'application/vnd.oasis.opendocument.text'
      ));
    });
  });
}

async function validateFiles(resume, attachments = []) {
  if (!resume) throw new ApiError(400, 'Bitte laden Sie einen Lebenslauf hoch.');
  const resumeExtension = path.extname(resume.originalname || '').toLowerCase();
  if (!RESUME_EXTENSIONS.has(resumeExtension) || !await hasSignature(resume)) {
    throw new ApiError(400, 'Der Lebenslauf muss eine gültige PDF-, DOC-, DOCX-, ODT- oder RTF-Datei sein.');
  }
  if (attachments.length > maxAttachments) {
    throw new ApiError(400, `Es sind höchstens ${maxAttachments} zusätzliche Dateien erlaubt.`);
  }
  const attachmentSignatures = await Promise.all(attachments.map(hasSignature));
  if (attachmentSignatures.some((isValid) => !isValid)) {
    throw new ApiError(400, 'Mindestens eine zusätzliche Datei hat ein ungültiges oder nicht unterstütztes Format.');
  }
}

function parseFields(raw) {
  let fields;
  try {
    fields = JSON.parse(raw || '{}');
  } catch {
    throw new ApiError(400, 'Die Formulardaten sind kein gültiges JSON.');
  }

  const normalized = {};
  for (const key of [
    'company', 'jobTitle', 'firstName', 'lastName', 'email', 'phone', 'street',
    'postalCode', 'city', 'country', 'linkedIn', 'currentTitle', 'skills',
    'languages', 'coverLetter', 'recipientEmail'
  ]) {
    normalized[key] = String(fields[key] || '').trim();
  }
  normalized.consent = fields.consent === true;

  if (!normalized.firstName || !normalized.lastName || !normalized.email) {
    throw new ApiError(400, 'Vorname, Nachname und E-Mail sind Pflichtfelder.');
  }
  if (!EMAIL_PATTERN.test(normalized.email)) throw new ApiError(400, 'Bitte geben Sie eine gültige E-Mail-Adresse ein.');
  if (!EMAIL_PATTERN.test(normalized.recipientEmail)) {
    throw new ApiError(400, 'Bitte geben Sie eine gültige Empfänger-E-Mail-Adresse ein.');
  }
  if (!normalized.consent) throw new ApiError(400, 'Die Einwilligung zur Verarbeitung der Bewerbungsdaten ist erforderlich.');
  if (normalized.coverLetter.length > 10000) throw new ApiError(400, 'Das Anschreiben ist zu lang.');

  return normalized;
}

function documentEntry(applicationId, file, category) {
  return {
    ID: cds.utils.uuid(),
    application_ID: applicationId,
    category,
    fileName: sanitizeFileName(file.originalname),
    mimeType: file.mimetype || 'application/octet-stream',
    sizeBytes: file.size,
    sha256: crypto.createHash('sha256').update(file.buffer).digest('hex')
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function verifyCaptcha(req, _res, next) {
  const isValid = captchaStore.verify(
    req.get('x-captcha-id'),
    req.get('x-captcha-answer')
  );
  if (!isValid) {
    return next(new ApiError(400, 'Der Sicherheitscode ist falsch oder abgelaufen. Bitte versuchen Sie es erneut.'));
  }
  next();
}

function createRoutes() {
  const router = express.Router();

  router.get('/health', (_req, res) => res.json({ status: 'ok' }));

  router.get('/captcha', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const challenge = captchaStore.create();
    res.json({
      id: challenge.id,
      expiresInSeconds: challenge.expiresInSeconds,
      image: `data:image/png;base64,${challenge.image.toString('base64')}`
    });
  });

  router.post('/resume/analyze', upload.single('resume'), asyncRoute(async (req, res) => {
    await validateFiles(req.file);
    const result = await analyzeResume(req.file.buffer, req.file.originalname);
    res.json(result);
  }));

  router.post('/applications/submit', verifyCaptcha, upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'attachments', maxCount: maxAttachments }
  ]), asyncRoute(async (req, res) => {
    const resume = req.files?.resume?.[0];
    const attachments = req.files?.attachments || [];
    await validateFiles(resume, attachments);
    const fields = parseFields(req.body.fields);

    const targetEmail = fields.recipientEmail;
    const applicationFields = { ...fields };
    delete applicationFields.recipientEmail;

    const applicationId = cds.utils.uuid();
    const now = new Date().toISOString();
    const application = {
      ID: applicationId,
      status: 'PROCESSING',
      targetEmail,
      ...applicationFields,
      createdAt: now,
      createdBy: 'public-form',
      modifiedAt: now,
      modifiedBy: 'public-form'
    };

    const documents = [
      documentEntry(applicationId, resume, 'RESUME'),
      ...attachments.map((file) => documentEntry(applicationId, file, 'ATTACHMENT'))
    ];

    await cds.db.run(INSERT.into('job.application.Applications').entries(application));
    await cds.db.run(INSERT.into('job.application.Documents').entries(documents));

    try {
      const mail = await sendApplicationMail({
        targetEmail,
        fields: applicationFields,
        files: [resume, ...attachments].map((file) => ({
          filename: sanitizeFileName(file.originalname),
          content: file.buffer,
          contentType: file.mimetype || 'application/octet-stream'
        }))
      });
      await cds.db.run(UPDATE('job.application.Applications', applicationId).with({
        status: 'SENT',
        mailMessageId: mail.messageId || null,
        modifiedAt: new Date().toISOString()
      }));
      res.status(201).json({ applicationId, status: 'SENT' });
    } catch (error) {
      await cds.db.run(UPDATE('job.application.Applications', applicationId).with({
        status: 'FAILED',
        errorMessage: String(error.message || error).slice(0, 2000),
        modifiedAt: new Date().toISOString()
      }));
      throw new ApiError(502, 'Die Bewerbung wurde gespeichert, aber die E-Mail konnte nicht gesendet werden.');
    }
  }));

  router.use((error, _req, res, _next) => {
    const log = cds.log('job-application');
    const status = error.status || (error instanceof multer.MulterError ? 400 : 500);
    if (status >= 500) log.error(error);
    const message = error instanceof multer.MulterError
      ? `Dateiupload fehlgeschlagen: ${error.message}`
      : (error instanceof ApiError || status < 500 ? error.message : 'Interner Serverfehler.');
    res.status(status).json({ error: { message } });
  });

  return router;
}

module.exports = createRoutes;
module.exports.hasSignature = hasSignature;
module.exports.parseFields = parseFields;
