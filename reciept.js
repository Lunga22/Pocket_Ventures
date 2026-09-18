// Inside your successful checkout / log item function:
async function completeSaleAndSaveReceipt(saleData) {
    const receiptBoxHtml = document.getElementById('receipt-output').innerHTML;
    
    const receiptRecord = {
        id: 'REC-' + Date.now(),
        date: new Date().toISOString(),
        total: saleData.total,
        htmlContent: receiptBoxHtml // <--- Saves the exact live receipt markup
    };

    // Save to your IndexedDB vault
    await saveSaleToVault(receiptRecord);
    
    // Refresh the navbar receipts list immediately if it's open
    if (typeof loadNavbarReceipts === 'function') {
        loadNavbarReceipts();
    }
}// Load and display all archived receipts in the navbar section
async function loadNavbarReceipts() {
    // Target the container inside your receipts navbar section
    const container = document.getElementById('receipts-table-body') || document.getElementById('saved-receipts-container');
    if (!container) return;

    container.innerHTML = '<p style="text-align: center; color: #71717a; padding: 20px;">Loading receipts...</p>';

    try {
        const receipts = await getAllSalesFromVault(); // Fetch all from IndexedDB

        if (!receipts || receipts.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #71717a; padding: 20px;">No recent receipts found.</p>';
            return;
        }

        container.innerHTML = '';
        
        // Sort newest transactions first
        receipts.sort((a, b) => new Date(b.date) - new Date(a.date));

        receipts.forEach(receipt => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = 'margin-bottom: 15px; border: 1px solid #334155; padding: 15px; background: rgba(15, 23, 42, 0.6); border-radius: 8px;';

            // Clones your exact Live Digital Receipt style layout
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.85rem; color: #94a3b8;">
                    <span>Receipt ID: <strong>#${receipt.id}</strong></span>
                    <span>${new Date(receipt.date).toLocaleString()}</span>
                </div>
                
                <div class="receipt-box" style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; font-family: monospace; max-height: 200px; overflow-y: auto;">
                    ${receipt.htmlContent}
                </div>

                <div class="receipt-actions" style="margin-top: 12px; display: flex; gap: 10px; align-items: center;">
                    <button class="btn-secondary" onclick="shareArchivedReceiptWhatsApp('${receipt.id}', '${receipt.total || 0}')">📱 Share Receipt</button>
                    <button class="btn-secondary" onclick="printArchivedReceipt()">🖨️ Thermal Print</button>
                    <button class="btn-danger" onclick="deleteArchivedReceipt('${receipt.id}')" style="margin-left: auto; background-color: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">🗑️ Delete</button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading navbar receipts:', error);
        container.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 20px;">Failed to load saved receipts.</p>';
    }
}

// Action Handlers
function shareArchivedReceiptWhatsApp(receiptId, total) {
    const text = encodeURIComponent(`Hello! Here is your receipt summary from PocketVentures (Receipt #${receiptId}). Total: E${Number(total).toFixed(2)}. Thank you for your support!`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function printArchivedReceipt() {
    window.print();
}

async function deleteArchivedReceipt(receiptId) {
    if (confirm(`Are you sure you want to delete receipt #${receiptId}?`)) {
        try {
            await deleteSaleFromVault(receiptId); // Deletes from IndexedDB
            loadNavbarReceipts(); // Refreshes the navbar view instantly
        } catch (error) {
            console.error('Error deleting receipt:', error);
            alert('Could not delete receipt from vault.');
        }
    }
}

// Example Navbar Trigger Link
document.getElementById('nav-receipts-link')?.addEventListener('click', () => {
    // Your existing code to show the receipts section view goes here...
    
    // Call the function to populate it automatically
    loadNavbarReceipts();
});