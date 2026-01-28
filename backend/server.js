require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto'); // For generating IDs
const rateLimit = require('express-rate-limit'); // Security: Rate Limiting

const scraper = require('./scraper');
const knowledgeIndex = require('./embeddings');

// Scraped Knowledge Store (Mapping of domain -> siteData array)
let siteKnowledgeStore = new Map();

// Initialize Groq
const Groq = require('groq-sdk');
// Handle the variable name the user actually used (GEMINI_API_KEY) or standard AI_API_KEY or GROQ_API_KEY
const apiKey = process.env.GEMINI_API_KEY_CHATBOT || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: apiKey });
console.log('AI Initialized with key length:', apiKey ? apiKey.length : 0);

const app = express();
const server = http.createServer(app);

// Security: Rate Limiting (1000 requests per 15 minutes)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Helper to safely parse allowed origins
const getAllowedOrigins = () => {
    const envOrigins = process.env.ALLOWED_ORIGINS;
    if (!envOrigins || envOrigins.trim() === '') {
        return "*"; // Allow all if not set or empty
    }
    return envOrigins.split(',').map(o => o.trim()).filter(o => o.length > 0);
};

const io = new Server(server, {
    cors: {
        origin: getAllowedOrigins(),
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors({
    origin: getAllowedOrigins()
}));
app.use(express.json());

// Serve the widget file statically
app.use('/widget', express.static(path.join(__dirname, '../widget')));

// Serve the demo page for easy access
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../demo.html'));
});

// Start Scraper on Launch
const scrapeUrls = process.env.SCRAPE_URLS || process.env.SCRAPE_URL;
if (scrapeUrls) {
    scraper.scrapeSites(scrapeUrls).then(async data => {
        siteKnowledgeStore = data;
        console.log('[Scraper] Raw data ready for domains:', [...siteKnowledgeStore.keys()]);

        // Build the search index for all scraped data
        for (const [domain, chunks] of siteKnowledgeStore) {
            await knowledgeIndex.addSiteData(chunks);
        }
    });
}

// --- IN-MEMORY STORAGE ---
// NOTE: This data is lost when the server restarts.
const conversationsStore = new Map(); // Key: visitorId, Value: { _id, visitorId, createdAt, lastActiveAt }
const messagesStore = new Map();      // Key: conversationId, Value: Array of Message Objects

// Security: Memory Management (Pruning)
// Remove conversations inactive for more than 24 hours to prevent memory leaks
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // Run every hour
const INACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

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
        console.log(`[Memory] Pruned ${prunedCount} inactive conversations.`);
    }
}, PRUNE_INTERVAL_MS);


// Helper to generate simple IDs
const generateId = () => crypto.randomUUID();

// Socket.io Logic
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join_conversation', ({ visitorId }) => {
        // Security: Input Validation
        if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 100) {
            console.error('Invalid visitorId received');
            return;
        }

        console.log(`INFO: join_conversation request for visitorId: ${visitorId}`);
        try {
            let conversation = conversationsStore.get(visitorId);

            if (!conversation) {
                console.log(`INFO: Creating new conversation for visitorId: ${visitorId}`);
                conversation = {
                    _id: generateId(),
                    visitorId: visitorId,
                    createdAt: new Date(),
                    lastActiveAt: new Date()
                };
                conversationsStore.set(visitorId, conversation);
                messagesStore.set(conversation._id, []); // Initialize empty message list
            } else {
                console.log(`INFO: Found existing conversation: ${conversation._id}`);
                // Update last active
                conversation.lastActiveAt = new Date();
            }

            socket.join(conversation._id);
            socket.emit('conversation_joined', { conversationId: conversation._id });

            // Send history directly from memory
            const messages = messagesStore.get(conversation._id) || [];
            socket.emit('chat_history', messages);

        } catch (err) {
            console.error('ERROR in join_conversation:', err);
        }
    });

    const lastMessageTime = new Map(); // Rate limiting map

    socket.on('send_message', async ({ visitorId, content, siteContext }) => {
        // Security: Rate Limiting (1 message per second)
        const now = Date.now();
        const lastTime = lastMessageTime.get(visitorId) || 0;
        if (now - lastTime < 1000) {
            socket.emit('error', { message: 'You are sending messages too fast.' });
            return;
        }
        lastMessageTime.set(visitorId, now);

        // Security: Input Validation
        if (!content || typeof content !== 'string') {
            return; // Ignore empty or invalid content
        }
        if (content.length > 2000) {
            socket.emit('error', { message: 'Message too long (max 2000 characters).' });
            return;
        }

        console.log(`INFO: send_message from ${visitorId}: ${content.substring(0, 50)}...`);
        try {
            const conversation = conversationsStore.get(visitorId);
            if (!conversation) {
                console.error(`ERROR: Conversation not found for visitorId: ${visitorId}`);
                return;
            }

            // Update last active
            conversation.lastActiveAt = new Date();

            // Save user message
            const userMessage = {
                _id: generateId(),
                conversationId: conversation._id,
                sender: 'user',
                content: content,
                timestamp: new Date()
            };

            // Add to in-memory store
            const conversationMsgs = messagesStore.get(conversation._id);
            conversationMsgs.push(userMessage);
            console.log(`INFO: User message saved: ${userMessage._id}`);

            // Broadcast to room
            io.to(conversation._id).emit('receive_message', userMessage);

            // --- GROQ AI LOGIC ---
            // Get last 4 messages for context (Reduced from 6 to save tokens)
            const recentMessages = conversationMsgs.slice(-4);

            const history = recentMessages.map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.content
            }));

            // ... (Lines 215-241 are the already optimized system prompt)

            let scrapedContext = "";
            let currentUrl = "";

            if (siteContext) {
                try {
                    const contextObj = typeof siteContext === 'string' ? JSON.parse(siteContext) : siteContext;

                    // Extract URL to find matching scraped data
                    if (contextObj.pageContent && contextObj.pageContent.url) {
                        try {
                            currentUrl = contextObj.pageContent.url;

                            // SEARCH LOGIC: Instead of full domain context, we search for query-relevant chunks
                            console.log(`[RAG] Searching knowledge base for: "${content}"`);
                            // Optimization: Fetch only top 2 chunks to save tokens
                            const relevantChunks = await knowledgeIndex.search(content, 2);
                            scrapedContext = knowledgeIndex.formatContext(relevantChunks);

                        } catch (e) {
                            console.error('[RAG] Search error:', e);
                        }
                    }

                    if (Object.keys(contextObj).length > 0) {
                        systemPrompt += "\n\nWEBSITE VISIBLE CONTENT (Current Page):\n" + JSON.stringify(contextObj, null, 2);
                    } else {
                        systemPrompt += "\n\nWEBSITE VISIBLE CONTENT: (Empty)";
                    }
                } catch (e) {
                    console.error('Error parsing siteContext in server:', e);
                    systemPrompt += "\n\nWEBSITE VISIBLE CONTENT: (Error parsing content)";
                }
            } else {
                systemPrompt += "\n\nWEBSITE VISIBLE CONTENT: (None provided)";
            }

            // ADD SEARCHED KNOWLEDGE BASE
            if (scrapedContext) {
                systemPrompt += `\n\nRELEVANT WEBSITE KNOWLEDGE (Found via search):\n` + scrapedContext;
            } else {
                systemPrompt += "\n\nRELEVANT WEBSITE KNOWLEDGE: (No relevant data found for this specific query)";
            }

            try {
                const stream = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...history
                    ],
                    model: 'llama-3.3-70b-versatile',
                    stream: true,
                });

                let fullContent = "";
                const responseId = generateId();

                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content || "";
                    if (content) {
                        fullContent += content;
                        io.to(conversation._id).emit('chat_chunk', {
                            _id: responseId,
                            conversationId: conversation._id,
                            content: content,
                            sender: 'bot'
                        });
                    }
                }

                const botMessage = {
                    _id: responseId,
                    conversationId: conversation._id,
                    sender: 'bot',
                    content: fullContent,
                    timestamp: new Date()
                };

                // Add complete bot message to store
                conversationMsgs.push(botMessage);
                console.log(`INFO: AI streaming completed: ${botMessage._id}`);

            } catch (aiError) {
                console.error('Groq API Error:', aiError);
                const errorMessage = {
                    _id: generateId(),
                    conversationId: conversation._id,
                    sender: 'bot',
                    content: "I'm experiencing high traffic right now. Please try again later.",
                    timestamp: new Date()
                };
                conversationMsgs.push(errorMessage);
                io.to(conversation._id).emit('receive_message', errorMessage);
            }
            // -------------------------------------------

        } catch (err) {
            console.error('ERROR in send_message:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`In-Memory Chat Server running on port ${PORT}`));
