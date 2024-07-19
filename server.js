import express from 'express';
import cors from 'cors';
import axios from 'axios';
import cheerio from 'cheerio';
import PQueue from 'p-queue';

const app = express();
const port = process.env.PORT || 3000;

const queue = new PQueue({ concurrency: 10 });

app.use(cors());
app.use(express.json());

const cache = new Map();

const getAllUrlsFromPage = async (url) => {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data, { normalizeWhitespace: true });
        const urls = [];
        $('a').each((_, element) => {
            let href = $(element).attr('href');
            const linkText = $(element).text();
            const ariaLabel = $(element).attr('aria-label') || 'N/A';
            const target = $(element).attr('target') || '_self';

            if (href) {
                href = href.startsWith('http') ? href : new URL(href, url).href;
                urls.push({ href, linkText, ariaLabel, target });
            }
        });
        return urls;
    } catch (error) {
        throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
};

const retryRequest = async (url, retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await axios.get(url, {
                maxRedirects: 10,
                validateStatus: status => status >= 200 && status < 400,
            });
        } catch (error) {
            if (attempt === retries) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
};

const getFinalRedirectUrl = async (url) => {
    if (cache.has(url)) {
        return cache.get(url);
    }
    try {
        const response = await retryRequest(url);
        const result = {
            finalUrl: response.request.res.responseUrl,
            statusCode: response.status
        };
        cache.set(url, result);
        return result;
    } catch (error) {
        if (error.code === 'ECONNRESET') {
            return { finalUrl: 'Connection reset', statusCode: 'N/A' };
        } else if (error.response) {
            return {
                finalUrl: error.response.request.res.responseUrl || 'No final URL found',
                statusCode: error.response.status
            };
        } else {
            throw new Error(`Failed to fetch ${url}: ${error.message}`);
        }
    }
};

app.get('/check-site-urls-stream', async (req, res) => {
    const { siteUrl } = req.query;
    if (!siteUrl) {
        return res.status(400).json({ error: 'Site URL is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const urls = await getAllUrlsFromPage(siteUrl);
        const tasks = urls.map(({ href, linkText, ariaLabel, target }) =>
            queue.add(async () => {
                try {
                    const finalUrlData = await getFinalRedirectUrl(href);
                    const result = {
                        originalUrl: href,
                        linkText,
                        ariaLabel,
                        target,
                        statusCode: finalUrlData.statusCode,
                        finalUrl: finalUrlData.finalUrl
                    };
                    res.write(`data: ${JSON.stringify(result)}\n\n`);
                } catch (error) {
                    const result = {
                        originalUrl: href,
                        linkText,
                        ariaLabel,
                        target,
                        statusCode: 'N/A',
                        finalUrl: `Error: ${error.message}`
                    };
                    res.write(`data: ${JSON.stringify(result)}\n\n`);
                }
            })
        );

        await Promise.all(tasks);
        res.write('event: complete\ndata: {"status": "complete"}\n\n');
        res.end();
    } catch (error) {
        console.error('Error processing request:', error.message);
        res.status(500).json({ error: 'An error occurred', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
