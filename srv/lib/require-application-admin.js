'use strict';

const cds = require('@sap/cds');

module.exports = function requireApplicationAdmin(req, res, next) {
  const user = cds.context?.user || req.user;

  if (user?.is?.('ApplicationAdmin')) {
    return next();
  }

  if (!user || user._is_anonymous) {
    if (req._login) {
      return req._login();
    }
    return res.sendStatus(401);
  }

  return res.sendStatus(403);
};
