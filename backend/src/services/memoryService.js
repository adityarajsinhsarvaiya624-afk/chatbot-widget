const crypto = require('crypto');
const logger = require('../utils/logger');

// --- IN-MEMORY STORAGE ---
// NOTE: This data is lost when the server restarts.
const conversationsStore = new Map(); // Key: visitorId, Value: { _id, visitorId, createdAt, lastActiveAt }
const messagesStore = new Map();      // Key: conversationId, Value: Array of Message Objects

// Helper to generate simple IDs
const generateId = () => crypto.randomUUID();

// Security: Memory Management (Pruning)
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // Run every hour
const INACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

const startPruningInterval = () => {
    setInterval(() => {
        const now = Date.now();
        let prunedCount = 0;

        for (const [visitorId, conversation] of conversationsStore.entries()) {
            const lastActive = conversation.lastActiveAt || conversation.createdAt;
            if (now - new Date(lastActive).getTime() > INACTIVE_THRESHOLD_MS) {
                // Delete messages first
                messagesStore.delete(conversation._id);
                // Delete conversation
                conversationsStore.delete(visitorId);
                prunedCount++;
            }
        }
        if (prunedCount > 0) {
            logger.info(`[Memory] Pruned ${prunedCount} inactive conversations.`);
        }
    }, PRUNE_INTERVAL_MS);
};

// Start the interval
startPruningInterval();

// Memory Monitor
setInterval(() => {
    const memory = process.memoryUsage();
    // logger.debug(`[Status] RAM: ${Math.round(memory.rss / 1024 / 1024)}MB | Heap: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`);
    // Keeping console.log for consistent monitoring as per original
    console.log(`[Status] RAM: ${Math.round(memory.rss / 1024 / 1024)}MB | Heap: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`);
}, 5 * 60 * 1000);

module.exports = {
    getConversation: (visitorId) => conversationsStore.get(visitorId),
    createConversation: (visitorId) => {
        const conversation = {
            _id: generateId(),
            visitorId: visitorId,
            createdAt: new Date(),
            lastActiveAt: new Date()
        };
        conversationsStore.set(visitorId, conversation);
        messagesStore.set(conversation._id, []);
        return conversation;
    },
    updateLastActive: (conversation) => {
        conversation.lastActiveAt = new Date();
    },
    getMessages: (conversationId) => messagesStore.get(conversationId) || [],
    addMessage: (conversationId, message) => {
        const msgs = messagesStore.get(conversationId);
        if (msgs) {
            msgs.push(message);
        }
    },
    generateId
};
