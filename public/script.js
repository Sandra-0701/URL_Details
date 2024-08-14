document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('siteForm');
    const resultsTableBody = document.querySelector('#resultsTable tbody');
    const tableHeader = document.getElementById('tableHeader');
    const downloadBtn = document.getElementById('downloadExcel');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const siteUrl = document.getElementById('siteUrl').value;
        const checkLinks = document.getElementById('checkLinks').checked;
        const checkImages = document.getElementById('checkImages').checked;
        const excludeHeaderFooter = document.getElementById('excludeHeaderFooter').checked;

        // Clear previous results
        resultsTableBody.innerHTML = '';
        tableHeader.innerHTML = '';
        downloadBtn.style.display = 'none';

        // Set up table header based on selected options
        const headers = [];
        if (checkLinks) {
            headers.push('Type', 'Link Text', 'ARIA Label', 'Original URL', 'Final URL', 'Status Code', 'Link Behaviour', 'Location');
        }
        if (checkImages) {
            headers.push('Image Name', 'Alt Text', 'Location');
        }

        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            tableHeader.appendChild(th);
        });

        // Create EventSource to listen for updates from the server
        const eventSource = new EventSource(`/api/check-site-content?siteUrl=${encodeURIComponent(siteUrl)}&checkLinks=${checkLinks}&checkImages=${checkImages}&excludeHeaderFooter=${excludeHeaderFooter}`);

        eventSource.onmessage = function(event) {
            try {
                const result = JSON.parse(event.data);

                if (result) {
                    const row = document.createElement('tr');
                    if (result.type === 'link') {
                        row.innerHTML = `
                            <td>${result.linkType}</td>
                            <td>${result.linkText || ''}</td>
                            <td>${result.ariaLabel || ''}</td>
                            <td><a href="${result.originalUrl}" target="_blank">${result.originalUrl}</a></td>
                            <td>${result.finalUrl}</td>
                            <td>${result.statusCode}</td>
                            <td>${result.target}</td>
                            <td>${result.location}</td>
                        `;
                    } else if (result.type === 'image') {
                        row.innerHTML = `
                            <td>${result.imgName}</td>
                            <td>${result.alt}</td>
                            <td>${result.location}</td>
                        `;
                    } else {
                        row.innerHTML = `<td colspan="${tableHeader.children.length}">Unknown type: ${result.type}</td>`;
                    }
                    resultsTableBody.appendChild(row);
                }
            } catch (error) {
                console.error('Failed to parse event data:', error);
                const row = document.createElement('tr');
                row.innerHTML = `<td colspan="${tableHeader.children.length}">Error: Failed to parse event data</td>`;
                resultsTableBody.appendChild(row);
            }
        };

        eventSource.onerror = function(error) {
            console.error('EventSource failed:', error);
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="${tableHeader.children.length}">Error: ${error.message}</td>`;
            resultsTableBody.appendChild(row);
            eventSource.close();
        };

        eventSource.addEventListener('complete', () => {
            downloadBtn.style.display = 'block';
        });
    });

    document.getElementById('downloadExcel').addEventListener('click', () => {
        const ws = XLSX.utils.table_to_sheet(document.getElementById('resultsTable'));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Results');
        XLSX.writeFile(wb, 'Results.xlsx');
    });
});
