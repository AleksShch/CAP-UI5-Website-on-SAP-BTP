'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const CAPTCHA_FONT = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100']
};

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function renderCaptchaPng(code) {
  if (!Number.isInteger(code) || code < 1000 || code > 9999) {
    throw new TypeError('Captcha code must be a four-digit integer.');
  }

  const width = 300;
  const height = 96;
  const pixels = Buffer.alloc(width * height * 4);
  const palette = [
    [255, 224, 130],
    [128, 203, 196],
    [144, 202, 249],
    [206, 147, 216]
  ];
  const ink = [23, 43, 77];

  const setPixel = (x, y, color) => {
    const offset = (y * width + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const position = (x / (width - 1)) * (palette.length - 1);
      const start = Math.min(Math.floor(position), palette.length - 2);
      const mix = position - start;
      const background = palette[start].map((channel, index) => (
        Math.round(channel + (palette[start + 1][index] - channel) * mix)
      ));
      const hasLine = (y % 10) < 4 || (x % 10) < 4;
      const color = hasLine ? ink : background;
      setPixel(x, y, color);
    }
  }

  const expression = String(code);
  const scale = 8;
  const advance = 60;
  const textWidth = expression.length * advance - scale;
  const startX = Math.floor((width - textWidth) / 2);
  const startY = Math.floor((height - 7 * scale) / 2);

  for (let characterIndex = 0; characterIndex < expression.length; characterIndex += 1) {
    const glyph = CAPTCHA_FONT[expression[characterIndex]];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== '1') continue;
        for (let offsetY = 0; offsetY < scale; offsetY += 1) {
          for (let offsetX = 0; offsetX < scale; offsetX += 1) {
            setPixel(
              startX + characterIndex * advance + column * scale + offsetX,
              startY + row * scale + offsetY,
              ink
            );
          }
        }
      }
    }
  }

  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines)),
    pngChunk('IEND')
  ]);
}

class CaptchaStore {
  constructor(options = {}) {
    this._ttlMs = options.ttlMs || 10 * 60 * 1000;
    this._maxEntries = options.maxEntries || 10000;
    this._now = options.now || Date.now;
    this._randomInt = options.randomInt || crypto.randomInt;
    this._randomBytes = options.randomBytes || crypto.randomBytes;
    this._challenges = new Map();
  }

  create() {
    this._prune();
    if (this._challenges.size >= this._maxEntries) {
      this._challenges.delete(this._challenges.keys().next().value);
    }

    const code = this._randomInt(1000, 10000);
    const id = this._randomBytes(18).toString('base64url');
    this._challenges.set(id, {
      answer: code,
      expiresAt: this._now() + this._ttlMs
    });

    return {
      id,
      image: renderCaptchaPng(code),
      expiresInSeconds: Math.floor(this._ttlMs / 1000)
    };
  }

  verify(id, answer) {
    const challengeId = String(id || '');
    const challenge = this._challenges.get(challengeId);
    this._challenges.delete(challengeId);

    if (!challenge || challenge.expiresAt <= this._now()) return false;

    const normalizedAnswer = String(answer ?? '').trim();
    return /^\d{4}$/.test(normalizedAnswer)
      && Number.parseInt(normalizedAnswer, 10) === challenge.answer;
  }

  _prune() {
    const now = this._now();
    for (const [id, challenge] of this._challenges) {
      if (challenge.expiresAt <= now) this._challenges.delete(id);
    }
  }
}

module.exports = { CaptchaStore, renderCaptchaPng };
