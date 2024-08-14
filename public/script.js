document.getElementById('siteForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const siteUrl = document.getElementById('siteUrl').value;
    const checkLinks = document.getElementById('checkLinks').checked;
    const checkImages = document.getElementById('checkImages').checked;
    const excludeHeaderFooter = document.getElementById('excludeHeaderFooter').checked;
    const resultsTableBody = document.querySelector('#resultsTable tbody');
    const tableHeader = document.getElementById('tableHeader');
    const downloadBtn = document.getElementById('downloadExcel');

    resultsTableBody.innerHTML = '';
    tableHeader.innerHTML = '';
    downloadBtn.style.display = 'none';

    // Set up table header based on selected options
    if (checkLinks) {
        ['Type', 'Link Text', 'ARIA Label', 'Original URL', 'Final URL', 'Status Code', 'Link Behaviour', 'Location'].forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            tableHeader.appendChild(th);
        });
    }
    if (checkImages) {
        if (checkLinks) tableHeader.innerHTML = ''; // Clear if both are selected
        ['Image Name', 'Alt Text', 'Location'].forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            tableHeader.appendChild(th);
        });
    }

    const eventSource = new EventSource(`http://localhost:3000/check-site-content?siteUrl=${encodeURIComponent(siteUrl)}&checkLinks=${checkLinks}&checkImages=${checkImages}&excludeHeaderFooter=${excludeHeaderFooter}`);
    const rows = [];

    eventSource.onmessage = function(event) {
        const result = JSON.parse(event.data);
        if (result) {
            rows.push(result);
            const row = document.createElement('tr');
            if (result.type === 'link') {
                row.innerHTML = `
                    <td>${result.linkType}</td>
                    <td>${result.linkText || ''}</td>
                    <td>${result.ariaLabel || ''}</td>
                    <td>${result.originalUrl}</td>
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
            }
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