const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');

const app = express();

// Security: Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Middleware
app.use(cors({
    origin: config.ALLOWED_ORIGINS.length > 0 ? config.ALLOWED_ORIGINS : "*"
}));
app.use(express.json());

// Serve the widget file statically
// Note: Adjusted path relative to `backend/src/app.js` -> `../../widget`
app.use('/widget', express.static(path.join(__dirname, '../../widget')));

// Serve the demo page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../demo.html'));
});

module.exports = app;
