document.addEventListener('DOMContentLoaded', () => {
    const checkSiteContentForm = document.getElementById('checkSiteContentForm');
    const resultContainer = document.getElementById('resultContainer');
    const statusContainer = document.getElementById('statusContainer');

    checkSiteContentForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Clear previous results
        resultContainer.innerHTML = '';
        statusContainer.innerHTML = '';

        const siteUrl = document.getElementById('siteUrl').value;
        const checkLinks = document.getElementById('checkLinks').checked;
        const checkImages = document.getElementById('checkImages').checked;
        const excludeHeaderFooter = document.getElementById('excludeHeaderFooter').checked;

        const response = await fetch(`/api/check-site-content?siteUrl=${encodeURIComponent(siteUrl)}&checkLinks=${checkLinks}&checkImages=${checkImages}&excludeHeaderFooter=${excludeHeaderFooter}`, {
            method: 'GET',
        });

        if (!response.ok) {
            statusContainer.innerHTML = `<p>Error: ${response.statusText}</p>`;
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const dataChunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            dataChunks.push(decoder.decode(value, { stream: true }));
        }

        const data = dataChunks.join('');
        const events = data.split('\n\n');

        events.forEach(event => {
            if (event.startsWith('event: complete')) {
                statusContainer.innerHTML = '<p>Processing complete!</p>';
                return;
            }

            try {
                const result = JSON.parse(event.replace(/^data: /, ''));
                
                if (result.type === 'link') {
                    const linkElement = document.createElement('div');
                    linkElement.innerHTML = `
                        <p><strong>Link Text:</strong> ${result.linkText}</p>
                        <p><strong>Link Type:</strong> ${result.linkType}</p>
                        <p><strong>Original URL:</strong> ${result.originalUrl}</p>
                        <p><strong>Final URL:</strong> ${result.finalUrl}</p>
                        <p><strong>Status Code:</strong> ${result.statusCode}</p>
                        <p><strong>Aria Label:</strong> ${result.ariaLabel}</p>
                        <p><strong>Target:</strong> ${result.target}</p>
                        <p><strong>Location:</strong> ${result.location}</p>
                        <hr>
                    `;
                    resultContainer.appendChild(linkElement);
                } else if (result.type === 'image') {
                    const imgElement = document.createElement('div');
                    imgElement.innerHTML = `
                        <p><strong>Image Name:</strong> ${result.imgName}</p>
                        <p><strong>Alt Text:</strong> ${result.alt}</p>
                        <p><strong>Location:</strong> ${result.location}</p>
                        <hr>
                    `;
                    resultContainer.appendChild(imgElement);
                }
            } catch (e) {
                console.error('Error parsing result:', e);
            }
        });
    });
});
