'use strict';

const cds = require('@sap/cds');
const path = require('node:path');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const createRoutes = require('./srv/routes');
const requireApplicationAdmin = require('./srv/lib/require-application-admin');

cds.on('bootstrap', (app) => {
  app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://ui5.sap.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://ui5.sap.com'],
        fontSrc: ["'self'", 'https://ui5.sap.com', 'data:'],
        imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://ui5.sap.com']
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }));

  app.use('/api', createRoutes());

  const uiEntryPoint = path.join(__dirname, 'app', 'job-application', 'webapp', 'index.html');
  const sendUiEntryPoint = (_req, res) => res.sendFile(uiEntryPoint);
  app.get(['/', '/search', '/search/'], sendUiEntryPoint);
  app.get(
    ['/admin', '/admin/'],
    cds.middlewares.context(),
    cds.middlewares.auth(),
    requireApplicationAdmin,
    sendUiEntryPoint
  );
  app.get(/^\/[a-z0-9][a-z0-9-]{0,79}\/?$/, (_req, res) => res.sendFile(uiEntryPoint));
});

module.exports = cds.server;
