const dotenv = require('dotenv');
const path = require('path');

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

module.exports = {
    PORT: process.env.PORT || 9889,
    AI_API_KEY: process.env.GEMINI_API_KEY_CHATBOT || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || process.env.GROQ_API_KEY,
    AI_MODEL: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(o => o.length > 0),
    SCRAPE_URLS: process.env.SCRAPE_URLS || process.env.SCRAPE_URL,
    NODE_ENV: process.env.NODE_ENV || 'development'
};
