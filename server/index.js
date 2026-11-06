'use strict';
const path = require('path');
const { open } = require('./db');
const { createApp } = require('./app');

const db = open(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'saveher.db'));
const app = createApp(db, { uploadDir: process.env.UPLOAD_DIR });
app.cleanup(); setInterval(app.cleanup, 60 * 60 * 1000).unref();
const port = Number(process.env.PORT) || 8000;
app.listen(port, '0.0.0.0', () => console.log(`SaveHer running on http://localhost:${port}`));
