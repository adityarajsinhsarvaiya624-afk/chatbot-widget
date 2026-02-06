const http = require('http');
const { Server } = require('socket.io');
const config = require('./config/env');
const app = require('./app');
const chatController = require('./controllers/chatController');
const ragService = require('./services/ragService');
const logger = require('./utils/logger');

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: config.ALLOWED_ORIGINS.length > 0 ? config.ALLOWED_ORIGINS : "*",
        methods: ["GET", "POST"]
    }
});

// Setup Socket.IO
io.on('connection', (socket) => chatController.handleConnection(socket, io));

// Start Scraper on Launch
if (config.SCRAPE_URLS) {
    ragService.scrapeSites(config.SCRAPE_URLS).then(async data => {
        // Build the search index
        const flatData = [];
        for (const [domain, chunks] of data) {
            flatData.push(...chunks);
        }
        await ragService.knowledgeIndex.addSiteData(flatData);
        logger.info('[Scraper] Initial scraping and indexing complete.');
    });
}

// Start Server
server.listen(config.PORT, () => {
    logger.info(`Chat Server running on port ${config.PORT}`);
    logger.info(`Environment: ${config.NODE_ENV}`);
});
