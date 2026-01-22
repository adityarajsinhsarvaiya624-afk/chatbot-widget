require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto'); // For generating IDs

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
            let systemPrompt = `You are an intelligent, website-aware chatbot. Your goal is to be helpful, concise, and professional. 

STRICT BEHAVIOR RULES:
1. **Ambiguity Detection**: If the user's question is too vague (e.g., "Tell me more", "What are the prices?", "How to start?"), do NOT give a generic answer. Instead:
   - Look at the "RELEVANT WEBSITE KNOWLEDGE" provided below.
   - Identify 2-3 specific topics or products found in that context.
   - Politely ask the user which one they are interested in.
   - *Example*: "I see we have several services including [Topic A] and [Topic B]. Which one can I help you with today?"

2. **Accurate Answering**: If the question is specific and the information is in the website content:
   - Answer ONLY using the provided website content.
   - Keep it warm and professional.
   - Use **bold text** for key terms and **bullet points** for lists.
   - Use short paragraphs.

3. **Missing Information**: If the information is NOT in the website content:
   - State politely that the information isn't on the site.
   - ONLY then provide a brief, helpful answer using limited general knowledge, but maintain the focus on the website's likely domain.

4. **Style**:
   - Do NOT mention you are an AI.
   - Do NOT hallucinate links or prices not found in the context.
   - If the user asks about something functional (e.g., "How do I login?"), look at the "WEBSITE VISIBLE CONTENT" for UI elements.

Your response format:
- Acknowledge specifically (don't just say "I understand").
- Provide the answer or the clarifying question formatted with markdown.`;

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
                            const relevantChunks = await knowledgeIndex.search(content, 5);
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
