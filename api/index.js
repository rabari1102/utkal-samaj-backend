const serverless = require('serverless-http');
const app = require('../server'); // ✅ Reuse the exported app

module.exports.handler = serverless(app);
