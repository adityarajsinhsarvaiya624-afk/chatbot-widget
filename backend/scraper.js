const https = require('https');
const http = require('http');

// Simple regex-based HTML text extractor to avoid heavy dependencies
function extractTextConfig(html) {
    if (!html) return '';

    // Remove scripts and styles
    let text = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, ' ');
    text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, ' ');

    // Remove tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Unescape common entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');

    // Compress whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text.substring(0, 8000); // Limit context size per page
}

async function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;

        client.get(url, (res) => {
            let data = '';

            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchPage(res.headers.location).then(resolve).catch(reject);
            }

            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

async function scrapeSites(urlsStr) {
    const results = new Map();
    if (!urlsStr) return results;

    const urls = urlsStr.split(',').map(u => u.trim()).filter(u => u);

    console.log(`[Scraper] Starting to scrape ${urls.length} sites...`);

    for (const url of urls) {
        try {
            console.log(`[Scraper] Fetching ${url}...`);
            const html = await fetchPage(url);
            const text = extractTextConfig(html);

            // Clean domain key (e.g., https://www.milople.com/ -> milople.com)
            let domain = new URL(url).hostname;
            domain = domain.replace(/^www\./, '');

            results.set(domain, text);
            console.log(`[Scraper] Successfully scraped ${domain} (${text.length} chars)`);
        } catch (error) {
            console.error(`[Scraper] Failed to scrape ${url}:`, error.message);
        }
    }

    return results;
}

module.exports = { scrapeSites };
