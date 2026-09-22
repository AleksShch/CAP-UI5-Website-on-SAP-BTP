'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { analyzeResumeInProcess } = require('./resume-analyzer');

analyzeResumeInProcess(Buffer.from(workerData.buffer), workerData.fileName)
  .then((result) => parentPort.postMessage({ ok: true, result }))
  .catch((error) => parentPort.postMessage({
    ok: false,
    error: {
      message: String(error.message || error),
      status: error.status || 422
    }
  }));
