const https = require('https');
const http = require('http');

// Simple regex-based HTML text extractor
function extractTextConfig(html) {
    if (!html) return '';
    let text = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, ' ');
    text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, ' ');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text.substring(0, 15000); // 15kb per page max
}

// Find all internal links
function extractLinks(html, baseUrl) {
    const links = new Set();
    const regex = /href=["']([^"']+)["']/g;
    let match;
    const baseHostname = new URL(baseUrl).hostname;

    while ((match = regex.exec(html)) !== null) {
        try {
            let link = match[1];
            // Resolve relative links
            const absoluteUrl = new URL(link, baseUrl).href;
            const absoluteHostname = new URL(absoluteUrl).hostname;

            // Only internal links
            if (absoluteHostname === baseHostname) {
                // Filter out useless files
                if (!absoluteUrl.match(/\.(jpg|png|pdf|css|js|zip)$/i)) {
                    links.add(absoluteUrl);
                }
            }
        } catch (e) { }
    }
    return Array.from(links);
}

async function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            let data = '';
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchPage(res.headers.location).then(resolve).catch(reject);
            }
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

// Cralwer State
const MAX_PAGES = 50; // Increased limit to cover more extensions
const visited = new Set();
let aggregatedText = "";

async function crawlSite(startUrl) {
    aggregatedText = "";
    visited.clear();
    const queue = [startUrl];
    let count = 0;

    console.log(`[Crawler] Starting crawl of ${startUrl}`);

    while (queue.length > 0 && count < MAX_PAGES) {
        const url = queue.shift();
        if (visited.has(url)) continue;
        visited.add(url);

        try {
            console.log(`[Crawler] Visiting (${count + 1}/${MAX_PAGES}): ${url}`);
            const html = await fetchPage(url);
            const text = extractTextConfig(html);

            // Add to Context
            aggregatedText += `\n\n--- PAGE: ${url} ---\n${text}`;

            // Find new links (Depth 1 basically, since we add to queue)
            const links = extractLinks(html, startUrl);
            for (const link of links) {
                if (!visited.has(link)) {
                    queue.push(link);
                }
            }
            count++;
        } catch (e) {
            console.error(`[Crawler] Failed ${url}: ${e.message}`);
        }
    }
    console.log(`[Crawler] Finished. Total Pages: ${count}. Total Size: ${aggregatedText.length} chars.`);
    return aggregatedText;
}

async function scrapeSites(urlsStr) {
    const results = new Map();
    if (!urlsStr) return results;

    const urls = urlsStr.split(',').map(u => u.trim()).filter(u => u);

    for (const url of urls) {
        try {
            const domain = new URL(url).hostname.replace(/^www\./, '');
            // Run the Crawler
            const fullContent = await crawlSite(url);
            results.set(domain, fullContent);
        } catch (error) {
            console.error(`[Scraper] Failed to scrape ${url}:`, error.message);
        }
    }

    return results;
}

module.exports = { scrapeSites };
