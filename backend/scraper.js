const axios = require('axios');
const cheerio = require('cheerio');

// Configuration
const MAX_PAGES = 150; // Limit pages to avoid long wait times
const TIMEOUT_MS = 10000;

// Helper: Sleep
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Extract text and links using Cheerio
 */
function processHtml(html, baseUrl) {
    const $ = cheerio.load(html);

    // Remove clutter
    $('script, style, noscript, iframe, svg, header, footer, nav').remove();

    // Extract Text
    let text = $('body').text();
    text = text.replace(/\s+/g, ' ').trim(); // Normalize whitespace

    // Extract Links
    const links = new Set();
    const baseHostname = new URL(baseUrl).hostname;

    $('a').each((i, el) => {
        try {
            const href = $(el).attr('href');
            if (!href) return;

            const absoluteUrl = new URL(href, baseUrl).href;
            const linkHostname = new URL(absoluteUrl).hostname;

            // Internal links only, ignore files
            if (linkHostname === baseHostname && !absoluteUrl.match(/\.(jpg|jpeg|png|gif|pdf|zip|css|js)$/i)) {
                // Remove anchors/hashes
                const cleanUrl = absoluteUrl.split('#')[0];
                links.add(cleanUrl);
            }
        } catch (e) { }
    });

    return { text: text.substring(0, 20000), links: Array.from(links) };
}

/**
 * Fetch with Axios (Fast Mode)
 */
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

        // Basic check if it's likely a SPA/Empty page
        if (response.data.length < 500 || response.data.includes('You need to enable JavaScript')) {
            throw new Error('Likely Dynamic Content');
        }

        return { html: response.data, method: 'axios' };
    } catch (e) {
        throw e;
    }
}

/**
 * Main Crawl Function
 */
async function crawlSite(startUrl) {
    const chunks = [];
    const visited = new Set();
    const queue = [startUrl];
    let count = 0;

    console.log(`[Crawler] Starting lightweight crawl of ${startUrl}`);

    while (queue.length > 0 && count < MAX_PAGES) {
        const url = queue.shift();

        const normalizedUrl = url.replace(/\/$/, "");
        if (visited.has(normalizedUrl)) continue;
        visited.add(normalizedUrl);

        count++;
        console.log(`[Crawler] Visiting (${count}/${MAX_PAGES}): ${url}`);

        let html = "";
        let method = "";

        try {
            const res = await fetchWithAxios(url);
            html = res.html;
            method = res.method;
        } catch (axiosErr) {
            console.error(`[Crawler] Failed to fetch ${url}: ${axiosErr.message}`);
        }

        if (html) {
            const { text, links } = processHtml(html, startUrl);

            // Add as a chunk
            if (text.length > 50) {
                // Optimization: reduced from 30k to 1.5k chars to save tokens per chunk
                chunks.push({ url, text: text.substring(0, 1500), method });
            }

            // Add new links to queue
            for (const link of links) {
                const normLink = link.replace(/\/$/, "");
                if (!visited.has(normLink)) {
                    queue.push(link);
                }
            }
        }
    }

    console.log(`[Crawler] Finished. Visited: ${count}. Total chunks: ${chunks.length}`);
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
            console.error(`[Scraper] Fatal error scraping ${url}:`, error.message);
        }
    }
    return results;
}

module.exports = { scrapeSites };
