const axios = require('axios');
const cheerio = require('cheerio');
const { Index } = require('flexsearch');
const logger = require('../utils/logger');

// --- SCRAPER LOGIC ---

const MAX_PAGES = 350;
const TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function processHtml(html, baseUrl) {
    const $ = cheerio.load(html);
    $('script, style, noscript, iframe, svg, header, footer, nav').remove();

    let text = $('body').text();
    text = text.replace(/\s+/g, ' ').trim();

    const links = new Set();
    const baseHostname = new URL(baseUrl).hostname;

    $('a').each((i, el) => {
        try {
            const href = $(el).attr('href');
            if (!href) return;

            const absoluteUrl = new URL(href, baseUrl).href;
            const linkHostname = new URL(absoluteUrl).hostname;

            if (linkHostname === baseHostname && !absoluteUrl.match(/\.(jpg|jpeg|png|gif|pdf|zip|css|js)$/i)) {
                const cleanUrl = absoluteUrl.split('#')[0];
                links.add(cleanUrl);
            }
        } catch (e) { }
    });

    return { text: text.substring(0, 20000), links: Array.from(links) };
}

async function fetchWithAxios(url) {
    try {
        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0'
            }
        });

        if (response.data.length < 500 || response.data.includes('You need to enable JavaScript')) {
            throw new Error('Likely Dynamic Content');
        }

        return { html: response.data, method: 'axios' };
    } catch (e) {
        throw e;
    }
}

async function crawlSite(startUrl) {
    const chunks = [];
    const visited = new Set();
    const queue = [startUrl];
    let count = 0;

    logger.info(`[Crawler] Starting lightweight crawl of ${startUrl}`);

    while (queue.length > 0 && count < MAX_PAGES) {
        const url = queue.shift();
        const normalizedUrl = url.replace(/\/$/, "");
        if (visited.has(normalizedUrl)) continue;
        visited.add(normalizedUrl);

        count++;
        // logger.debug(`[Crawler] Visiting (${count}/${MAX_PAGES}): ${url}`);
        console.log(`[Crawler] Visiting (${count}/${MAX_PAGES}): ${url}`);


        let html = "";
        let method = "";

        try {
            const res = await fetchWithAxios(url);
            html = res.html;
            method = res.method;
        } catch (axiosErr) {
            logger.error(`[Crawler] Failed to fetch ${url}: ${axiosErr.message}`);
        }

        if (html) {
            const { text, links } = processHtml(html, startUrl);
            if (text.length > 50) {
                chunks.push({ url, text: text.substring(0, 5000), method });
            }
            for (const link of links) {
                const normLink = link.replace(/\/$/, "");
                if (!visited.has(normLink)) {
                    queue.push(link);
                }
            }
        }
    }

    logger.info(`[Crawler] Finished. Visited: ${count}. Total chunks: ${chunks.length}`);
    return chunks;
}

async function scrapeSites(urlsStr) {
    const results = new Map();
    if (!urlsStr) return results;

    const urls = urlsStr.split(',').map(u => u.trim()).filter(u => u);

    for (const url of urls) {
        try {
            const domain = new URL(url).hostname.replace(/^www\./, '');
            const content = await crawlSite(url);
            results.set(domain, content);
        } catch (error) {
            logger.error(`[Scraper] Fatal error scraping ${url}:`, error.message);
        }
    }
    return results;
}

// --- INDEXING LOGIC ---

class KnowledgeIndex {
    constructor() {
        this.index = new Index({
            preset: 'score',
            tokenize: 'forward',
            cache: true
        });
        this.chunks = [];
    }

    splitText(text, size, overlap) {
        const chunks = [];
        let start = 0;
        while (start < text.length) {
            chunks.push(text.substring(start, start + size));
            start += (size - overlap);
        }
        return chunks;
    }

    async addSiteData(siteData) {
        logger.info(`[RAG] Indexing ${siteData.length} site pages...`);
        for (const page of siteData) {
            const textChunks = this.splitText(page.text, 1000, 200);
            for (const text of textChunks) {
                const id = this.chunks.length;
                this.chunks.push({ url: page.url, text: text.trim() });
                await this.index.addAsync(id, text.trim());
            }
        }
        logger.info(`[RAG] Knowledge base ready. Total indexed segments: ${this.chunks.length}`);
    }

    async search(query, limit = 5) {
        const results = await this.index.searchAsync(query, { limit: limit * 2 });
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

    formatContext(relevantChunks) {
        if (!relevantChunks || relevantChunks.length === 0) return "(No relevant data found in search)";
        return relevantChunks.map(c => `[SOURCE: ${c.url}]\n${c.text}`).join('\n\n---\n\n');
    }
}

const knowledgeIndex = new KnowledgeIndex();

module.exports = {
    scrapeSites,
    knowledgeIndex
};
