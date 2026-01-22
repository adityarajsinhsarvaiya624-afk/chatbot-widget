const { Index } = require('flexsearch');

/**
 * KnowledgeBase Manager
 * Handles indexing and searching of website content
 */
class KnowledgeIndex {
    constructor() {
        // Create an index optimized for documents
        this.index = new Index({
            preset: 'score',
            tokenize: 'forward', // Allow partial matches
            cache: true
        });
        this.chunks = []; // Store raw chunks
    }

    /**
     * Clear the index
     */
    clear() {
        this.index = new Index({
            preset: 'score',
            tokenize: 'forward',
            cache: true
        });
        this.chunks = [];
    }

    /**
     * Add website data (array of {url, text})
     */
    async addSiteData(siteData) {
        console.log(`[RAG] Indexing ${siteData.length} site pages...`);

        for (const page of siteData) {
            // Further chunk long pages into smaller pieces (~1000 chars) for better precision
            const textChunks = this.splitText(page.text, 1000, 200);

            for (const text of textChunks) {
                const id = this.chunks.length;
                const chunk = { id, url: page.url, text: text.trim() };
                this.chunks.push(chunk);
                // Index the text with its ID
                await this.index.addAsync(id, chunk.text);
            }
        }

        console.log(`[RAG] Knowledge base ready. Total indexed segments: ${this.chunks.length}`);
    }

    /**
     * Split text into overlapping chunks
     */
    splitText(text, size, overlap) {
        const chunks = [];
        let start = 0;

        while (start < text.length) {
            chunks.push(text.substring(start, start + size));
            start += (size - overlap);
        }

        return chunks;
    }

    /**
     * Search for relevant chunks
     */
    async search(query, limit = 5) {
        // Search the index
        const results = await this.index.searchAsync(query, { limit: limit * 2 });

        // Return unique chunks found
        const uniqueChunks = new Set();
        const output = [];

        for (const id of results) {
            const chunk = this.chunks[id];
            if (chunk && !uniqueChunks.has(chunk.text.substring(0, 50))) {
                uniqueChunks.add(chunk.text.substring(0, 50));
                output.push(chunk);
            }
            if (output.length >= limit) break;
        }

        return output;
    }

    /**
     * Format chunks for prompt context
     */
    formatContext(relevantChunks) {
        if (!relevantChunks || relevantChunks.length === 0) return "(No relevant data found in search)";

        return relevantChunks.map(c => `[SOURCE: ${c.url}]\n${c.text}`).join('\n\n---\n\n');
    }
}

module.exports = new KnowledgeIndex();
