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

const getAllContentFromPage = async (url, checkLinks, checkImages, excludeHeaderFooter) => {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data, { normalizeWhitespace: true });
        const content = { links: [], images: [] };

        if (excludeHeaderFooter) {
            $('header, footer').remove();
        }

        const processElement = (element, location) => {
            if (checkLinks && element.is('a')) {
                let href = element.attr('href');
                const linkText = element.text().trim();
                const ariaLabel = element.attr('aria-label') || '';
                const target = element.attr('target') || '_self';
                const linkType = getLinkType(element);

                if (href) {
                    href = href.startsWith('http') ? href : new URL(href, url).href;
                    content.links.push({ href, linkText, ariaLabel, target, linkType, location });
                }
            }

            if (checkImages && element.is('img')) {
                let src = element.attr('src');
                const alt = element.attr('alt') || '';

                if (src) {
                    src = src.startsWith('http') ? src : new URL(src, url).href;
                    const imgName = src.split('/').pop();
                    content.images.push({ imgName, alt, location });
                }
            }

            element.children().each((_, child) => processElement($(child), location));
        };

        if (excludeHeaderFooter) {
            processElement($('body'), 'body');
        } else {
            processElement($('header'), 'header');
            processElement($('body'), 'body');
            processElement($('footer'), 'footer');
        }

        return content;
    } catch (error) {
        throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
};

const getLinkType = (element) => {
    if (element.is('button') || element.find('button').length > 0) return 'button';
    if (element.hasClass('cta') || element.parents('.cta').length > 0) return 'cta';
    return 'link';
};

const getFinalRedirectUrl = async (url) => {
    if (cache.has(url)) {
        return cache.get(url);
    }
    try {
        const response = await axios.get(url, {
            maxRedirects: 10,
            validateStatus: status => status >= 200 && status < 400,
        });
        const result = {
            finalUrl: response.request.res.responseUrl,
            statusCode: response.status
        };
        cache.set(url, result);
        return result;
    } catch (error) {
        let finalUrl = 'Error';
        let statusCode = 'N/A';

        if (error.response) {
            finalUrl = error.response.request.res.responseUrl || 'No final URL found';
            statusCode = error.response.status;
        }

        return { finalUrl, statusCode };
    }
};

app.get('/api/check-site-content', async (req, res) => {
    const { siteUrl, checkLinks, checkImages, excludeHeaderFooter } = req.query;
    if (!siteUrl) {
        return res.status(400).json({ error: 'Site URL is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const content = await getAllContentFromPage(siteUrl, checkLinks === 'true', checkImages === 'true', excludeHeaderFooter === 'true');
        
        if (checkLinks === 'true') {
            const linkTasks = content.links.map(({ href, linkText, ariaLabel, target, linkType, location }) =>
                queue.add(async () => {
                    try {
                        const finalUrlData = await getFinalRedirectUrl(href);
                        const result = {
                            type: 'link',
                            linkType,
                            linkText,
                            ariaLabel,
                            originalUrl: href,
                            finalUrl: finalUrlData.finalUrl,
                            statusCode: finalUrlData.statusCode,
                            target,
                            location
                        };
                        res.write(`data: ${JSON.stringify(result)}\n\n`);
                    } catch (error) {
                        const result = {
                            type: 'link',
                            linkType,
                            linkText,
                            ariaLabel,
                            originalUrl: href,
                            finalUrl: 'Error',
                            statusCode: 'N/A',
                            target,
                            location
                        };
                        res.write(`data: ${JSON.stringify(result)}\n\n`);
                    }
                })
            );
            await Promise.all(linkTasks);
        }

        if (checkImages === 'true') {
            content.images.forEach(({ imgName, alt, location }) => {
                const result = {
                    type: 'image',
                    imgName,
                    alt,
                    location
                };
                res.write(`data: ${JSON.stringify(result)}\n\n`);
            });
        }

        res.write('event: complete\ndata: {"status": "complete"}\n\n');
        res.end();
    } catch (error) {
        console.error('Error processing request:', error.message);
        res.status(500).json({ error: 'An error occurred', details: error.message });
    }
});

export default app;
