const memoryService = require('../services/memoryService');
const aiService = require('../services/aiService');
const ragService = require('../services/ragService');
const logger = require('../utils/logger');

const handleConnection = (socket, io) => {
    logger.info('New client connected:', socket.id);

    const lastMessageTime = new Map(); // Rate limiting map

    socket.on('join_conversation', ({ visitorId }) => {
        // Security: Input Validation
        if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 100) {
            logger.error('Invalid visitorId received');
            return;
        }

        try {
            let conversation = memoryService.getConversation(visitorId);

            if (!conversation) {
                conversation = memoryService.createConversation(visitorId);
            } else {
                memoryService.updateLastActive(conversation);
            }

            socket.join(conversation._id);
            socket.emit('conversation_joined', { conversationId: conversation._id });

            // Send history directly from memory
            const messages = memoryService.getMessages(conversation._id);
            socket.emit('chat_history', messages);

        } catch (err) {
            logger.error('ERROR in join_conversation:', err);
        }
    });

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
        if (!content || typeof content !== 'string') return;
        if (content.length > 2000) {
            socket.emit('error', { message: 'Message too long (max 2000 characters).' });
            return;
        }

        logger.info(`send_message from ${visitorId}: ${content.substring(0, 50)}...`);

        try {
            const conversation = memoryService.getConversation(visitorId);
            if (!conversation) {
                logger.error(`ERROR: Conversation not found for visitorId: ${visitorId}`);
                return;
            }

            memoryService.updateLastActive(conversation);

            const userMessage = {
                _id: memoryService.generateId(),
                conversationId: conversation._id,
                sender: 'user',
                content: content,
                timestamp: new Date()
            };

            memoryService.addMessage(conversation._id, userMessage);
            logger.info(`User message saved: ${userMessage._id}`);
            io.to(conversation._id).emit('receive_message', userMessage);

            // --- AI LOGIC ---
            const conversationMsgs = memoryService.getMessages(conversation._id);
            const recentMessages = conversationMsgs.slice(-4).map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.content
            }));

            let scrapedContext = "";
            let currentUrl = "";
            let contextObj = {};

            try {
                contextObj = typeof siteContext === 'string' ? JSON.parse(siteContext) : siteContext;
                if (contextObj.pageContent && contextObj.pageContent.url) {
                    currentUrl = contextObj.pageContent.url;
                    logger.debug(`[RAG] Searching internal knowledge for: "${content}"`);
                    const relevantChunks = await ragService.knowledgeIndex.search(content, 2);
                    scrapedContext = ragService.knowledgeIndex.formatContext(relevantChunks);
                }
            } catch (e) {
                logger.error('Error parsing siteContext:', e);
            }

            const responseId = memoryService.generateId();
            let fullContent = "";

            await aiService.streamResponse(recentMessages, scrapedContext, contextObj,
                (chunkContent) => {
                    fullContent += chunkContent;
                    io.to(conversation._id).emit('chat_chunk', {
                        _id: responseId,
                        conversationId: conversation._id,
                        content: chunkContent,
                        sender: 'bot'
                    });
                },
                (error) => {
                    const errorMessage = {
                        _id: memoryService.generateId(),
                        conversationId: conversation._id,
                        sender: 'bot',
                        content: "I'm experiencing high traffic right now. Please try again later.",
                        timestamp: new Date()
                    };
                    memoryService.addMessage(conversation._id, errorMessage);
                    io.to(conversation._id).emit('receive_message', errorMessage);
                }
            );

            // Save bot message if stream completed (checking if fullContent is populated)
            // Note: streamResponse awaits the stream, so here we are done
            if (fullContent) {
                const botMessage = {
                    _id: responseId,
                    conversationId: conversation._id,
                    sender: 'bot',
                    content: fullContent,
                    timestamp: new Date()
                };
                memoryService.addMessage(conversation._id, botMessage);
                logger.info(`AI streaming completed: ${botMessage._id}`);
            }

        } catch (err) {
            logger.error('ERROR in send_message:', err);
        }
    });

    socket.on('disconnect', () => {
        // logger.info('Client disconnected'); 
        // Optional log, can be noisy
    });
};

module.exports = { handleConnection };
