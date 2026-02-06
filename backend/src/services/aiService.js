const Groq = require('groq-sdk');
const config = require('../config/env');
const logger = require('../utils/logger');

const groq = new Groq({ apiKey: config.AI_API_KEY });

// System Prompt Template
const BASE_SYSTEM_PROMPT = `Role: Helpful website chatbot.
RULES:
1. Ambiguity: If vague, ask clarifying questions using provided knowledge.
2. Accuracy: Answer specific Qs using ONLY site data. Bold key terms.
3. Missing Info:
   - General Qs (e.g., "What is AI?"): Answer directly with general knowledge.
   - Specific Qs: State politely if info is missing.
4. Style: concise, professional, no "I am AI".`;

async function streamResponse(messages, scrapedContext, siteContextObj, onChunk, onError) {
    let systemPrompt = BASE_SYSTEM_PROMPT;

    if (siteContextObj && Object.keys(siteContextObj).length > 0) {
        systemPrompt += "\n\nWEBSITE VISIBLE CONTENT (Current Page):\n" + JSON.stringify(siteContextObj, null, 2);
    }

    if (scrapedContext) {
        systemPrompt += `\n\nINTERNAL WEBSITE KNOWLEDGE:\n` + scrapedContext;
    } else {
        systemPrompt += "\n\nKNOWLEDGE BASE: (No relevant data found)";
    }

    try {
        const stream = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            model: config.AI_MODEL,
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                onChunk(content);
            }
        }
    } catch (aiError) {
        logger.error('Groq API Error:', aiError);
        if (onError) onError(aiError);
    }
}

module.exports = {
    streamResponse
};
