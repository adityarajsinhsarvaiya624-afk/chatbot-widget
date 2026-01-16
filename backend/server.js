require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto'); // For generating IDs

const scraper = require('./scraper');

// Scraped Knowledge Store
let siteKnowledgeStore = new Map();

// Initialize Groq
const Groq = require('groq-sdk');
// Handle the variable name the user actually used (GEMINI_API_KEY) or standard AI_API_KEY or GROQ_API_KEY
const apiKey = process.env.GEMINI_API_KEY_CHATBOT || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: apiKey });
console.log('AI Initialized with key length:', apiKey ? apiKey.length : 0);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow connection from any website embedding the widget
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
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
    scraper.scrapeSites(scrapeUrls).then(data => {
        siteKnowledgeStore = data;
        console.log('[Scraper] Knowledge base ready for domains:', [...siteKnowledgeStore.keys()]);
    });
}

// --- IN-MEMORY STORAGE ---
// NOTE: This data is lost when the server restarts.
const conversationsStore = new Map(); // Key: visitorId, Value: { _id, visitorId, createdAt }
const messagesStore = new Map();      // Key: conversationId, Value: Array of Message Objects

// Helper to generate simple IDs
const generateId = () => crypto.randomUUID();

// Socket.io Logic
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join_conversation', ({ visitorId }) => {
        console.log(`INFO: join_conversation request for visitorId: ${visitorId}`);
        try {
            let conversation = conversationsStore.get(visitorId);

            if (!conversation) {
                console.log(`INFO: Creating new conversation for visitorId: ${visitorId}`);
                conversation = {
                    _id: generateId(),
                    visitorId: visitorId,
                    createdAt: new Date()
                };
                conversationsStore.set(visitorId, conversation);
                messagesStore.set(conversation._id, []); // Initialize empty message list
            } else {
                console.log(`INFO: Found existing conversation: ${conversation._id}`);
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

    socket.on('send_message', async ({ visitorId, content, siteContext }) => {
        console.log(`INFO: send_message from ${visitorId}: ${content}`);
        try {
            const conversation = conversationsStore.get(visitorId);
            if (!conversation) {
                console.error(`ERROR: Conversation not found for visitorId: ${visitorId}`);
                return;
            }

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
            // Get last 10 messages for context
            const recentMessages = conversationMsgs.slice(-10);

            const history = recentMessages.map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.content
            }));

            // Prepare System Prompt with optional Site Context
            // Strict Behavior Rules for the Chatbot
            let systemPrompt = `You are an intelligent website-aware chatbot. Your behavior rules are STRICT and must be followed in order:

1. Analyze the website content carefully to see if it directly answers the user's question.
2. IF the website content contains relevant information:
   - Answer ONLY using the website content.
   - **Tone**: Be warm, professional, and helpful. 
   - **Formatting**:
     - Use short paragraphs for readability.
     - Use **bullet points** for lists or steps.
     - Use **bold text** for key terms or prices.
   - Do NOT add external knowledge.
   - Do NOT assume or guess.
   - Do NOT mention that you are an AI.
3. IF the website content does NOT contain relevant information:
   - politely apologize and state that the information is not currently available on the website.
   - Then answer the question using general/global knowledge if helpful.
   - Make sure the global answer is strictly accurate and helpful.
4. When analyzing website content:
   - Use "pageContent.uiMap" to understand the functionality (buttons, inputs, actions).
   - Use "pageContent.contentSnippet" for general text/information.
   - Use "manualContext" for specific business rules or non-visible logic.
5. NEVER hallucinate website-specific details.
6. NEVER fabricate contests, offers, events, or prices.
7. If the question is unclear, ask for clarification politely.

Your response format:
- Website-based answer completely formatted with markdown (bullets, bolding, paragraphs) OR
- Website not found message + global answer (also formatted nicely).`;

            let scrapedContext = "";
            let currentUrl = "";

            if (siteContext) {
                try {
                    const contextObj = typeof siteContext === 'string' ? JSON.parse(siteContext) : siteContext;

                    // Extract URL to find matching scraped data
                    if (contextObj.pageContent && contextObj.pageContent.url) {
                        try {
                            currentUrl = contextObj.pageContent.url;
                            let domain = new URL(currentUrl).hostname;
                            domain = domain.replace(/^www\./, '');

                            // Check our Knowledge Store
                            if (siteKnowledgeStore.has(domain)) {
                                scrapedContext = siteKnowledgeStore.get(domain);
                                console.log(`[AI] Using scraped context for domain: ${domain}`);
                            }
                        } catch (e) {
                            // URL parse error
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

            // ADD SCRAPED KNOWLEDGE BASE
            if (scrapedContext) {
                systemPrompt += `\n\nWEBSITE KNOWLEDGE BASE (General Info for ${currentUrl}):\n` + scrapedContext;
            } else {
                systemPrompt += "\n\nWEBSITE KNOWLEDGE BASE: (No scraped data found for this domain)";
            }

            try {
                const completion = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...history
                    ],
                    model: 'llama-3.3-70b-versatile',
                });

                const aiContent = completion.choices[0]?.message?.content || "I'm sorry, I couldn't understand that.";

                const botMessage = {
                    _id: generateId(),
                    conversationId: conversation._id,
                    sender: 'bot',
                    content: aiContent,
                    timestamp: new Date()
                };

                // Add bot message to store
                conversationMsgs.push(botMessage);

                io.to(conversation._id).emit('receive_message', botMessage);
                console.log(`INFO: AI reply sent: ${botMessage._id}`);

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
