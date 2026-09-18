document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const saleForm = document.getElementById("sale-form");
  const inventoryForm = document.getElementById("inventory-form");
  const expenseForm = document.getElementById("expense-form");
  const totalSalesEl = document.getElementById("total-sales");
  const totalExpensesEl = document.getElementById("total-expenses");
  const netProfitEl = document.getElementById("net-profit");
  const receiptOutput = document.getElementById("receipt-output");
  const currencySelect = document.getElementById("currency-select");
  const currencySymbols = document.querySelectorAll(".currency-symbol");
  const exportCsvBtn = document.getElementById("export-csv-btn");
  const exportJsonBtn = document.getElementById("export-json-btn");
  const importJsonTriggerBtn = document.getElementById("import-json-trigger-btn");
  const importJsonFile = document.getElementById("import-json-file");
  const nativeShareBtn = document.getElementById("native-share-btn");
  const receiptTools = document.getElementById("receipt-tools");
  const voiceInputBtn = document.getElementById("voice-input-btn");
  const cameraScanBtn = document.getElementById("camera-scan-btn");
  const checkoutBtn = document.getElementById("checkout-modal-btn");
  const inventoryTableBody = document.getElementById("inventory-table-body");
  const expenseTableBody = document.getElementById("expense-table-body");
  const lowStockBadge = document.getElementById("low-stock-badge");
  const inventorySearchInput = document.getElementById("inventory-search-input");
  const saleCustomerSelect = document.getElementById("sale-customer-select");

  // Shift Reconciliation Inputs
  const cashCountedInput = document.getElementById("cash-counted");
  const openingFloatInput = document.getElementById("opening-float");
  const eodDateBadge = document.getElementById("eod-date-badge");

  if (eodDateBadge) {
    eodDateBadge.textContent = new Date().toLocaleDateString();
  }
  
  // 1. Function to Load and Render All Saved Receipts into the Table
async function loadReceiptsTable() {
    const tableBody = document.getElementById('receipts-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #71717a;">Loading receipts...</td></tr>';

    try {
        // Fetch all sales/receipts from your IndexedDB vault
        const receipts = await getAllSalesFromVault(); // Ensure this matches your DB helper function name

        if (!receipts || receipts.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #71717a;">No recent receipts found.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        
        // Sort newest first if you have a date property
        receipts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        receipts.forEach(receipt => {
            const row = document.createElement('tr');
            
            // Format items summary or count
            const itemCount = receipt.items ? receipt.items.length : '1+';
            const formattedDate = receipt.date ? new Date(receipt.date).toLocaleString() : 'N/A';
            const totalAmount = typeof receipt.total === 'number' ? receipt.total.toFixed(2) : '0.00';

            row.innerHTML = `
                <td><strong>#${receipt.id}</strong></td>
                <td>${formattedDate}</td>
                <td>${itemCount} item(s)</td>
                <td>E${totalAmount}</td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn-sm btn-secondary" onclick="printSavedReceipt('${receipt.id}')" title="Print Receipt">🖨️</button>
                        <button class="btn-sm btn-secondary" onclick="shareReceiptWhatsApp('${receipt.id}', '${totalAmount}')" title="Share on WhatsApp">💬</button>
                        <button class="btn-sm btn-danger" onclick="deleteSavedReceipt('${receipt.id}')" title="Delete Receipt">🗑️</button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading receipts:', error);
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ef4444;">Failed to load receipts.</td></tr>';
    }
}

// 2. Search Filter for the Receipts Table
const receiptSearchInput = document.getElementById('receipt-search-input');
if (receiptSearchInput) {
    receiptSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#receipts-table-body tr');

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });
}

// 3. Action Handlers
function printSavedReceipt(receiptId) {
    // Triggers standard print or opens formatted print layout
    window.print();
}

function shareReceiptWhatsApp(receiptId, total) {
    const text = encodeURIComponent(`Hello! Here is your receipt summary from PocketVentures (Receipt #${receiptId}). Total: E${total}. Thank you for your support!`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

async function deleteSavedReceipt(receiptId) {
    if (confirm(`Are you sure you want to delete receipt #${receiptId}?`)) {
        try {
            await deleteSaleFromVault(receiptId); // Ensure this matches your DB helper delete function
            loadReceiptsTable(); // Refresh table
        } catch (error) {
            console.error('Error deleting receipt:', error);
            alert('Could not delete receipt.');
        }
    }
}

// Call loadReceiptsTable() whenever the navbar "Receipts" view is opened/toggled visible.


  // Universal Collapsible Helper Function
  function setupCollapsible(toggleId, contentId, arrowId, gridLayout = false) {
    const toggle = document.getElementById(toggleId);
    const content = document.getElementById(contentId);
    const arrow = document.getElementById(arrowId);

    if (toggle && content && arrow) {
      toggle.addEventListener("click", () => {
        const isHidden = content.style.display === "none";
        content.style.display = isHidden ? (gridLayout ? "grid" : "block") : "none";
        arrow.textContent = isHidden ? "▼" : "►";
      });
    }
  }

  // Bind Collapse Handlers
  setupCollapsible("toggle-financials", "financials-content", "financials-arrow", true);
  setupCollapsible("toggle-expenses", "expenses-content", "expenses-arrow");
  setupCollapsible("toggle-inventory", "inventory-content", "inventory-arrow");
  setupCollapsible("toggle-sales", "sales-content", "sales-arrow");
  setupCollapsible("toggle-receipt", "receipt-content", "receipt-arrow");
  setupCollapsible("toggle-reconciliation", "reconciliation-content", "reconciliation-arrow");

  let db = null;
  let currentCurrency = localStorage.getItem("pv_currency") || "E";
  let lastLoggedSale = null;

  if (currencySelect) {
    currencySelect.value = currentCurrency;
  }
  updateCurrencyDisplay(currentCurrency);

  // Self-Healing IndexedDB Initialization (v6)
  const DB_NAME = "PocketVenturesDB";
  const DB_VERSION = 6;

  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = (e) => {
    db = e.target.result;
    const stores = ["sales", "inventory", "expenses", "customers", "customer_orders"];
    
    stores.forEach((storeName) => {
      if (!db.objectStoreNames.contains(storeName)) {
        if (storeName === "sales") {
          db.createObjectStore(storeName, { keyPath: "id" });
        } else {
          db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
        }
      }
    });
  };

  request.onsuccess = (e) => {
    db = e.target.result;
    refreshFinancials();
    renderInventory();
    calculateReconciliation();
    populateSaleCustomers();
  };

  request.onerror = (e) => {
    console.error("Database open error:", e.target.error);
  };

  function updateCurrencyDisplay(symbol) {
    currencySymbols.forEach((el) => (el.textContent = symbol));
  }

  // Populate Customer Dropdown
  function populateSaleCustomers() {
    if (!saleCustomerSelect || !db) return;
    try {
      const tx = db.transaction("customers", "readonly");
      const getAll = tx.objectStore("customers").getAll();

      getAll.onsuccess = () => {
        const customers = getAll.result || [];
        saleCustomerSelect.innerHTML = '<option value="Walk-in Guest">Walk-in Guest</option>';
        customers.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.name;
          opt.textContent = `${c.name} (${c.phone})`;
          saleCustomerSelect.appendChild(opt);
        });
      };
    } catch (err) {
      console.error("Error populating customers:", err);
    }
  }

  // Refresh Financial Analytics & Render Expenses List
  function refreshFinancials() {
    if (!db) return;

    try {
      const salesTx = db.transaction("sales", "readonly");
      const getSales = salesTx.objectStore("sales").getAll();

      getSales.onsuccess = () => {
        const sales = getSales.result || [];
        const totalRevenue = sales.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

        const expTx = db.transaction("expenses", "readonly");
        const getExpenses = expTx.objectStore("expenses").getAll();

        getExpenses.onsuccess = () => {
          const expenses = getExpenses.result || [];
          const totalExpenses = expenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
          const netProfit = totalRevenue - totalExpenses;

          if (totalSalesEl) totalSalesEl.textContent = totalRevenue.toFixed(2);
          if (totalExpensesEl) totalExpensesEl.textContent = totalExpenses.toFixed(2);
          if (netProfitEl) {
            netProfitEl.textContent = netProfit.toFixed(2);
            netProfitEl.style.color = netProfit < 0 ? "#ef4444" : "#4ade80";
          }

          if (expenseTableBody) {
            expenseTableBody.innerHTML = "";

            if (expenses.length === 0) {
              expenseTableBody.innerHTML = `<tr><td colspan="4" class="muted">No expenses logged yet.</td></tr>`;
            } else {
              expenses.forEach((exp) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                  <td><small>${exp.date || "N/A"}</small></td>
                  <td><strong>${exp.note}</strong></td>
                  <td style="color: #ef4444;">-${currentCurrency}${parseFloat(exp.amount).toFixed(2)}</td>
                  <td>
                    <button type="button" class="btn-small-danger" onclick="deleteExpenseItem(${exp.id})">Delete</button>
                  </td>
                `;
                expenseTableBody.appendChild(tr);
              });
            }
          }
        };
      };
    } catch (err) {
      console.error("Financials calculation error:", err);
    }
  }

  window.deleteExpenseItem = (id) => {
    if (!db) return;
    const tx = db.transaction("expenses", "readwrite");
    tx.objectStore("expenses").delete(id);
    tx.oncomplete = () => {
      refreshFinancials();
      calculateReconciliation();
    };
  };

  // LOG BUSINESS EXPENSE FORM HANDLER
  if (expenseForm) {
    expenseForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!db) {
        alert("Database is initializing. Please wait a second and try again.");
        return;
      }

      try {
        const nameEl = document.getElementById("expense-name");
        const categoryEl = document.getElementById("expense-category");
        const amountEl = document.getElementById("expense-amount");

        if (!nameEl || !amountEl) {
          console.error("Missing required expense input fields in HTML.");
          return;
        }

        const note = nameEl.value.trim();
        const category = categoryEl ? categoryEl.value : "General";
        const amount = parseFloat(amountEl.value);

        if (!note || isNaN(amount) || amount <= 0) {
          alert("Please fill in a valid expense description and amount.");
          return;
        }

        const tx = db.transaction("expenses", "readwrite");
        const store = tx.objectStore("expenses");

        store.add({
          note,
          category,
          amount,
          date: new Date().toLocaleDateString()
        });

        tx.oncomplete = () => {
          expenseForm.reset();
          refreshFinancials();
          calculateReconciliation();
        };

        tx.onerror = (err) => {
          console.error("Expense Save Transaction Error:", err.target.error);
        };
      } catch (err) {
        console.error("Runtime Expense Submit Error:", err);
      }
    });
  }

// 1. Define renderInventory FIRST so it is available in memory
function renderInventory() {
  if (!db || !inventoryTableBody) return;
  try {
    const tx = db.transaction("inventory", "readonly");
    const getAll = tx.objectStore("inventory").getAll();

    getAll.onsuccess = () => {
      let items = getAll.result || [];
      const searchQuery = inventorySearchInput ? inventorySearchInput.value.toLowerCase().trim() : "";

      if (searchQuery) {
        items = items.filter((i) => i.name.toLowerCase().includes(searchQuery));
      }

      inventoryTableBody.innerHTML = "";
      let hasLowStock = false;

      if (items.length === 0) {
        inventoryTableBody.innerHTML = `<tr><td colspan="4" class="muted">${searchQuery ? 'No matching products.' : 'No products added to inventory yet.'}</td></tr>`;
        if (lowStockBadge) lowStockBadge.style.display = "none";
        return;
      }

      items.forEach((item) => {
        if (item.qty <= 3) hasLowStock = true;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${item.name}</strong></td>
          <td>${currentCurrency}${parseFloat(item.price || 0).toFixed(2)}</td>
          <td><span class="${item.qty <= 3 ? 'text-danger' : ''}">${item.qty} units</span></td>
          <td>
            <button type="button" class="btn-small-danger" onclick="deleteStockItem(${item.id})">Delete</button>
          </td>
        `;
        inventoryTableBody.appendChild(tr);
      });

      if (lowStockBadge) lowStockBadge.style.display = hasLowStock ? "inline-block" : "none";
    };
  } catch (err) {
    console.error("Render inventory error:", err);
  }
}

// 4. Add Inventory
  if (inventoryForm) {
    inventoryForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("stock-name").value.trim();
      const price = parseFloat(document.getElementById("stock-price").value);
      const qty = parseInt(document.getElementById("stock-qty").value);

      if (!name || isNaN(price) || isNaN(qty)) return;

      const item = { name, price, qty, updatedAt: new Date().toLocaleDateString() };

      const tx = db.transaction("inventory", "readwrite");
      tx.objectStore("inventory").add(item);

      tx.oncomplete = () => {
        inventoryForm.reset();
        renderInventory();
      };
    });
  }

  // 5. Render Inventory
  function renderInventory() {
    if (!db) return;
    const tx = db.transaction("inventory", "readonly");
    const getAll = tx.objectStore("inventory").getAll();

    getAll.onsuccess = () => {
      const items = getAll.result || [];
      inventoryTableBody.innerHTML = "";
      let hasLowStock = false;

      if (items.length === 0) {
        inventoryTableBody.innerHTML = `<tr><td colspan="4" class="muted">No products added to inventory yet.</td></tr>`;
        if (lowStockBadge) lowStockBadge.style.display = "none";
        return;
      }

      items.forEach((item) => {
        if (item.qty <= 3) hasLowStock = true;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${item.name}</strong></td>
          <td>${currentCurrency}${item.price.toFixed(2)}</td>
          <td><span class="${item.qty <= 3 ? 'text-danger' : ''}">${item.qty} units</span></td>
          <td>
            <button class="btn-small-danger" onclick="deleteStockItem(${item.id})">Delete</button>
          </td>
        `;
        inventoryTableBody.appendChild(tr);
      });

      if (lowStockBadge) lowStockBadge.style.display = hasLowStock ? "inline-block" : "none";
    };
  }

  window.deleteStockItem = (id) => {
    const tx = db.transaction("inventory", "readwrite");
    tx.objectStore("inventory").delete(id);
    tx.oncomplete = () => renderInventory();
  };
 

  // ISSUE RECEIPT & LOG TRANSACTION FORM HANDLER
  if (saleForm) {
    saleForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!db) {
        alert("Database is initializing. Please wait a second and try again.");
        return;
      }

      try {
        const itemEl = document.getElementById("item-name");
        const qtyEl = document.getElementById("item-qty");
        const priceEl = document.getElementById("item-price");
        const payEl = document.getElementById("payment-method");

        if (!itemEl || !qtyEl || !priceEl) {
          console.error("Missing sale input elements in HTML!");
          return;
        }

        const customer = saleCustomerSelect ? saleCustomerSelect.value : "Walk-in Guest";
        const name = itemEl.value.trim();
        const qtySold = parseInt(qtyEl.value) || 1;
        const price = parseFloat(priceEl.value);
        const paymentMethod = payEl ? payEl.value : "Cash";

        if (!name || isNaN(price) || price <= 0) {
          alert("Please enter a valid item name and price.");
          return;
        }

        const saleItem = {
          id: Date.now(),
          date: new Date().toLocaleDateString(),
          customer: customer,
          name: `${qtySold}x ${name}`,
          price: price,
          paymentMethod: paymentMethod,
          currency: currentCurrency
        };

        const tx = db.transaction(["sales", "inventory"], "readwrite");
        const salesStore = tx.objectStore("sales");
        const invStore = tx.objectStore("inventory");

        salesStore.add(saleItem);

        const getAllInv = invStore.getAll();
        getAllInv.onsuccess = () => {
          const items = getAllInv.result || [];
          const match = items.find((i) => name.toLowerCase().includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(name.toLowerCase()));
          if (match) {
            match.qty = Math.max(0, match.qty - qtySold);
            invStore.put(match);
          }
        };

        tx.oncomplete = () => {
          saleForm.reset();
          if (document.getElementById("item-qty")) {
            document.getElementById("item-qty").value = "1";
          }

          lastLoggedSale = saleItem;
          renderReceipt(saleItem);
          if (receiptTools) receiptTools.style.display = "flex";

          renderInventory();
          refreshFinancials();
          calculateReconciliation();
        };

        tx.onerror = (err) => {
          console.error("Sale Transaction Error:", err.target.error);
        };
      } catch (err) {
        console.error("Runtime Sale Submit Error:", err);
      }
    });
  }

  function renderReceipt(item) {
    if (!receiptOutput) return;
    receiptOutput.innerHTML = `
      <div><strong>=== RECEIPT ===</strong></div>
      <div>Date: ${item.date}</div>
      <div>Customer: ${item.customer || "Walk-in Guest"}</div>
      <div>Item: ${item.name}</div>
      <div>Method: ${item.paymentMethod || "Cash"}</div>
      <div>Amount: ${item.currency}${item.price.toFixed(2)}</div>
      <div>-----------------------------------</div>
      <div>Status: PAID (OFFLINE VAULT)</div>
    `;
  }

  // Shift Reconciliation Calculation
  function calculateReconciliation() {
    if (!db) return;

    try {
      const todayStr = new Date().toLocaleDateString();
      const cashCounted = parseFloat(cashCountedInput?.value) || 0;
      const openingFloat = parseFloat(openingFloatInput?.value) || 0;

      const storeNames = Array.from(db.objectStoreNames);
      const activeStores = ["sales", "expenses"];
      if (storeNames.includes("customer_orders")) {
        activeStores.push("customer_orders");
      }

      const tx = db.transaction(activeStores, "readonly");
      const getSales = tx.objectStore("sales").getAll();
      const getExpenses = tx.objectStore("expenses").getAll();
      const getOrders = storeNames.includes("customer_orders") ? tx.objectStore("customer_orders").getAll() : null;

      Promise.all([
        new Promise((res) => (getSales.onsuccess = () => res(getSales.result || []))),
        new Promise((res) => (getExpenses.onsuccess = () => res(getExpenses.result || []))),
        getOrders ? new Promise((res) => (getOrders.onsuccess = () => res(getOrders.result || []))) : Promise.resolve([])
      ]).then(([sales, expenses, orders]) => {
        const todaysSales = sales.filter((s) => s.date === todayStr);
        const todaysExpenses = expenses.filter((e) => e.date === todayStr);
        const todaysOrders = orders.filter((o) => o.date === todayStr);

        const posTotal = todaysSales.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
        const expensesTotal = todaysExpenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        const depositsTotal = todaysOrders.reduce((sum, item) => sum + (parseFloat(item.paidAmount) || 0), 0);

        const expectedCash = openingFloat + posTotal + depositsTotal - expensesTotal;
        const variance = cashCounted - expectedCash;

        const posEl = document.getElementById("eod-pos-total");
        const depEl = document.getElementById("eod-deposits-total");
        const expEl = document.getElementById("eod-expenses-total");
        const expCashEl = document.getElementById("eod-expected-cash");
        const varianceEl = document.getElementById("eod-variance");

        if (posEl) posEl.textContent = posTotal.toFixed(2);
        if (depEl) depEl.textContent = depositsTotal.toFixed(2);
        if (expEl) expEl.textContent = expensesTotal.toFixed(2);
        if (expCashEl) expCashEl.textContent = expectedCash.toFixed(2);

        if (varianceEl) {
          if (variance < 0) {
            varianceEl.style.color = "#ef4444";
            varianceEl.textContent = `${currentCurrency}${variance.toFixed(2)} (Short)`;
          } else if (variance > 0) {
            varianceEl.style.color = "#4ade80";
            varianceEl.textContent = `+${currentCurrency}${variance.toFixed(2)} (Over)`;
          } else {
            varianceEl.style.color = "var(--text-main)";
            varianceEl.textContent = `${currentCurrency}0.00 (Balanced)`;
          }
        }
      }).catch(err => console.error("Reconciliation execution error:", err));
    } catch (err) {
      console.error("Reconciliation error:", err);
    }
  }

  if (cashCountedInput) cashCountedInput.addEventListener("input", calculateReconciliation);
  if (openingFloatInput) openingFloatInput.addEventListener("input", calculateReconciliation);

  // Currency Switcher
  if (currencySelect) {
    currencySelect.addEventListener("change", (e) => {
      currentCurrency = e.target.value;
      localStorage.setItem("pv_currency", currentCurrency);
      updateCurrencyDisplay(currentCurrency);
      renderInventory();
      refreshFinancials();
      calculateReconciliation();
    });
  }

  // Export CSV
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
      if (!db) return;
      const tx = db.transaction("sales", "readonly");
      const getAll = tx.objectStore("sales").getAll();

      getAll.onsuccess = () => {
        const records = getAll.result || [];
        if (records.length === 0) {
          alert("No sales logged to export!");
          return;
        }

        let csvContent = "data:text/csv;charset=utf-8,ID,Date,Customer,Item Description,Payment Method,Price,Currency\n";
        records.forEach((row) => {
          csvContent += `${row.id},"${row.date}","${row.customer || "Walk-in Guest"}","${row.name}","${row.paymentMethod || "Cash"}",${row.price},${row.currency}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `sales_vault_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };
    });
  }

  // Backup JSON Database
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", () => {
      if (!db) return;
      const storeNames = Array.from(db.objectStoreNames);
      const backupData = {};
      const tx = db.transaction(storeNames, "readonly");

      const promises = storeNames.map((store) => {
        return new Promise((res) => {
          const req = tx.objectStore(store).getAll();
          req.onsuccess = () => {
            backupData[store] = req.result;
            res();
          };
        });
      });

      Promise.all(promises).then(() => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
        const dlAnchor = document.createElement("a");
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", `PocketVentures_Backup_${Date.now()}.json`);
        document.body.appendChild(dlAnchor);
        dlAnchor.click();
        dlAnchor.remove();
      });
    });
  }

  // Restore JSON Database
  if (importJsonTriggerBtn && importJsonFile) {
    importJsonTriggerBtn.addEventListener("click", () => importJsonFile.click());

    importJsonFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          const storesToRestore = Object.keys(importedData);

          const tx = db.transaction(storesToRestore, "readwrite");
          storesToRestore.forEach((store) => {
            const objectStore = tx.objectStore(store);
            objectStore.clear();
            importedData[store].forEach((item) => objectStore.put(item));
          });

          tx.oncomplete = () => {
            alert("Database successfully restored!");
            refreshFinancials();
            renderInventory();
            calculateReconciliation();
            populateSaleCustomers();
          };
        } catch (err) {
          alert("Invalid JSON backup file!");
        }
      };
      reader.readAsText(file);
    });
  }

  // Native Share API
  if (nativeShareBtn) {
    nativeShareBtn.addEventListener("click", async () => {
      if (!lastLoggedSale) return;
      const text =
        `*RECEIPT*\n` +
        `Date: ${lastLoggedSale.date}\n` +
        `Customer: ${lastLoggedSale.customer || "Walk-in Guest"}\n` +
        `Item: ${lastLoggedSale.name}\n` +
        `Payment Method: ${lastLoggedSale.paymentMethod || "Cash"}\n` +
        `Total: ${lastLoggedSale.currency}${lastLoggedSale.price.toFixed(2)}\n\n` +
        `Thank you for your business!`;

      if (navigator.share) {
        try {
          await navigator.share({ title: "Receipt", text: text });
        } catch (err) {
          console.log("Share cancelled", err);
        }
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
      }
    });
  }

  // Pro Checkout Direct Link
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", () => {
      alert("This button links directly to your digital store purchase link!");
    });
  }

  // Camera Barcode / QR Scanner
  let html5QrcodeScanner = null;
  if (cameraScanBtn) {
    cameraScanBtn.addEventListener("click", () => {
      const qrDiv = document.getElementById("qr-reader");
      if (!qrDiv) return;

      if (qrDiv.style.display === "none" || qrDiv.style.display === "") {
        qrDiv.style.display = "block";
        html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 250 });
        html5QrcodeScanner.render((decodedText) => {
          document.getElementById("item-name").value = decodedText;
          html5QrcodeScanner.clear();
          qrDiv.style.display = "none";
        });
      } else {
        if (html5QrcodeScanner) html5QrcodeScanner.clear();
        qrDiv.style.display = "none";
      }
    });
  }

  // Voice Dictation
  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    if (voiceInputBtn) {
      voiceInputBtn.addEventListener("click", () => {
        try {
          voiceInputBtn.textContent = "🎙️ Listening...";
          voiceInputBtn.style.background = "#ef4444";
          document.getElementById("item-name").placeholder = "Listening to voice...";
          recognition.start();
        } catch (err) {
          console.log("Mic active or busy:", err);
          resetVoiceBtn();
        }
      });
    }

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");

      document.getElementById("item-name").value = transcript;

      const numbers = transcript.match(/\d+(\.\d+)?/g);
      if (numbers) {
        const price = parseFloat(numbers[numbers.length - 1]);
        const description = transcript.replace(numbers[numbers.length - 1], "").trim();
        document.getElementById("item-price").value = price;
        document.getElementById("item-name").value = description || "Voice Order";
      }
    };

    recognition.onerror = () => resetVoiceBtn();
    recognition.onend = () => resetVoiceBtn();

    function resetVoiceBtn() {
      if (voiceInputBtn) {
        voiceInputBtn.textContent = "🎤 Dictate";
        voiceInputBtn.style.background = "#334155";
      }
      document.getElementById("item-name").placeholder = "e.g., Custom Satin Bonnet";
    }
  }

  // Register Service Worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.log("SW registration failed: ", err);
    });
  }
});

// Calculate Gross Profit, COGS, and Sales Performance
function generateSalesReport() {
  if (!db) return;

  const tx = db.transaction(["sales", "inventory"], "readonly");
  const getSales = tx.objectStore("sales").getAll();
  const getInventory = tx.objectStore("inventory").getAll();

  Promise.all([
    new Promise((res) => (getSales.onsuccess = () => res(getSales.result || []))),
    new Promise((res) => (getInventory.onsuccess = () => res(getInventory.result || [])))
  ]).then(([sales, inventory]) => {
    
    // Map cost prices from inventory items
    const costMap = {};
    inventory.forEach(item => {
      costMap[item.name] = parseFloat(item.costPrice || item.cost || 0);
    });

    let totalRevenue = 0;
    let totalCOGS = 0;
    const productStats = {};

    sales.forEach(sale => {
      const price = parseFloat(sale.price || sale.total || 0);
      const name = sale.name || sale.product || "Uncategorized";
      const qty = parseInt(sale.qty || 1);
      const unitCost = costMap[name] || 0;
      const cogs = unitCost * qty;

      totalRevenue += price;
      totalCOGS += cogs;

      if (!productStats[name]) {
        productStats[name] = { revenue: 0, cogs: 0, unitsSold: 0 };
      }
      productStats[name].revenue += price;
      productStats[name].cogs += cogs;
      productStats[name].unitsSold += qty;
    });

    const totalGrossProfit = totalRevenue - totalCOGS;
    const grossMargin = totalRevenue > 0 ? ((totalGrossProfit / totalRevenue) * 100).toFixed(1) : 0;

    // Update UI Stats
    document.getElementById("stat-revenue").textContent = `${currentCurrency}${totalRevenue.toFixed(2)}`;
    document.getElementById("stat-cogs").textContent = `${currentCurrency}${totalCOGS.toFixed(2)}`;
    document.getElementById("stat-profit").textContent = `${currentCurrency}${totalGrossProfit.toFixed(2)}`;
    document.getElementById("stat-margin").textContent = `${grossMargin}%`;

    renderReportTable(productStats);
  });
}

function renderReportTable(productStats) {
  const tableBody = document.getElementById("reports-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  Object.keys(productStats).forEach(productName => {
    const p = productStats[productName];
    const grossProfit = p.revenue - p.cogs;
    const margin = p.revenue > 0 ? ((grossProfit / p.revenue) * 100).toFixed(1) : 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${productName}</strong></td>
      <td>${p.unitsSold}</td>
      <td>${currentCurrency}${p.revenue.toFixed(2)}</td>
      <td>${currentCurrency}${p.cogs.toFixed(2)}</td>
      <td style="color: ${grossProfit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: bold;">
        ${currentCurrency}${grossProfit.toFixed(2)}
      </td>
      <td><strong>${margin}%</strong></td>
    `;
    tableBody.appendChild(tr);
  });
}

let salesChartInstance = null;

function renderSalesChart(dailySalesData) {
  const ctx = document.getElementById("salesChart")?.getContext("2d");
  if (!ctx) return;

  if (salesChartInstance) {
    salesChartInstance.destroy();
  }

  salesChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: dailySalesData.map(d => d.date),
      datasets: [{
        label: "Sales Revenue",
        data: dailySalesData.map(d => d.amount),
        borderColor: "#84cc16",
        backgroundColor: "rgba(132, 204, 22, 0.1)",
        borderWidth: 3,
        fill: true,
        tension: 0.3,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "#e5e7eb" }, beginAtZero: true }
      }
    }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".nav-links .nav-item");
  const viewSections = document.querySelectorAll(".view-section");

  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();

      // 1. Remove active state from all items and sections
      navItems.forEach(nav => nav.classList.remove("active"));
      viewSections.forEach(section => section.classList.remove("active"));

      // 2. Set clicked item to active
      item.classList.add("active");

      // 3. Reveal the target section view
      const targetId = item.getAttribute("data-target");
      const targetSection = document.getElementById(targetId);
      
      if (targetSection) {
        targetSection.classList.add("active");

        // 4. Trigger data refresh based on which tab was opened
        if (targetId === "dashboard-view") {
          // refreshDashboardStats();
        } else if (targetId === "inventory-view") {
          // loadInventoryTable();
        } else if (targetId === "analytics-view") {
          // generateSalesReport();
        } else if (targetId === "receipts-view") {
          // loadReceiptsHistory();
        }
      }
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".sidebar .nav-item");
  const viewSections = document.querySelectorAll(".main-content .view-section");

  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();

      // 1. Remove active state from all nav links and sections
      navItems.forEach(nav => nav.classList.remove("active"));
      viewSections.forEach(section => section.classList.remove("active"));

      // 2. Highlight the clicked tab
      item.classList.add("active");

      // 3. Find and display the corresponding section view
      const targetId = item.getAttribute("data-target");
      const targetSection = document.getElementById(targetId);
      
      if (targetSection) {
        targetSection.classList.add("active");
      }
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const closeButtons = document.querySelectorAll(".close-view-btn");
  const navItems = document.querySelectorAll(".sidebar .nav-item");
  const viewSections = document.querySelectorAll(".main-content .view-section");

  closeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      // 1. Hide all main content sections
      viewSections.forEach(section => section.classList.remove("active"));

      // 2. Reveal the dashboard view by default
      const dashboardView = document.getElementById("dashboard-view");
      if (dashboardView) {
        dashboardView.classList.add("active");
      }

      // 3. Reset the sidebar active highlight back to the dashboard tab
      navItems.forEach(nav => {
        nav.classList.remove("active");
        if (nav.getAttribute("data-target") === "dashboard-view") {
          nav.classList.add("active");
        }
      });
    });
  });
});

// Switch views helper function (if you already have one, ensure it handles active classes)
function switchView(viewId) {
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');
}

// Handle Profile Setup / Registration
document.getElementById('profile-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const userData = {
    name: document.getElementById('setup-name').value,
    username: document.getElementById('setup-username').value,
    contact: document.getElementById('setup-contact').value,
    password: document.getElementById('setup-password').value
  };

  localStorage.setItem('pv_user_profile', JSON.stringify(userData));
  alert('Profile registered successfully! Please log in.');
  switchView('login-view');
});

// Handle Login Authentication
document.getElementById('login-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;

  const savedUser = JSON.parse(localStorage.getItem('pv_user_profile'));

  if (!savedUser) {
    alert('No profile found. Please complete Profile Setup first.');
    return;
  }

  const matchesIdentifier = (identifier === savedUser.username || identifier === savedUser.contact);
  
  if (matchesIdentifier && password === savedUser.password) {
    localStorage.setItem('pv_logged_in', 'true');
    updateUIAfterLogin(savedUser);
    switchView('dashboard-view');
  } else {
    alert('Invalid username/contact or password.');
  }
});

// Forgot Password Feature
function handleForgotPassword(e) {
  e.preventDefault();
  const savedUser = JSON.parse(localStorage.getItem('pv_user_profile'));
  if (!savedUser) {
    alert('No registered account found.');
    return;
  }
  // Simple offline recovery simulation using hint/alert
  alert(`Password recovery hint: Your password is associated with ${savedUser.contact}. (In a live deployment, an reset link would be dispatched).`);
}

// Update UI elements dynamically with the logged-in user's name/username
function updateUIAfterLogin(user) {
  // Update sidebar operator name elements if they exist
  const userNameDisplay = document.querySelector('.user-name');
  if (userNameDisplay && user) {
    userNameDisplay.textContent = user.username; // Displays username as requested
  }
}

// Run on page load to check active session
window.addEventListener('DOMContentLoaded', () => {
  const savedUser = JSON.parse(localStorage.getItem('pv_user_profile'));
  const isLoggedIn = localStorage.getItem('pv_logged_in') === 'true';
  
  if (savedUser && isLoggedIn) {
    updateUIAfterLogin(savedUser);
  } else if (savedUser) {
    // Populate profile form fields automatically if they want to update details
    document.getElementById('setup-name').value = savedUser.name || '';
    document.getElementById('setup-username').value = savedUser.username || '';
    document.getElementById('setup-contact').value = savedUser.contact || '';
    document.getElementById('setup-password').value = savedUser.password || '';
  }
});

// Function to load and render saved receipts matching the exact Live Digital Receipt style
async function loadSavedReceiptCards() {
    const container = document.getElementById('saved-receipts-container');
    if (!container) return;

    container.innerHTML = '<p style="text-align: center; color: #71717a;">Loading receipts...</p>';

    try {
        // Fetch all sales/receipts from your IndexedDB vault
        const receipts = await getAllSalesFromVault(); // Ensure this matches your DB helper function

        if (!receipts || receipts.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #71717a;">No recent receipts found.</p>';
            return;
        }

        container.innerHTML = '';
        
        // Sort newest first
        receipts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        receipts.forEach(receipt => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.border = '1px solid #334155';
            card.style.padding = '15px';

            // Reconstruct the exact inner HTML layout of your Live Digital Receipt box
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <strong>Receipt #${receipt.id}</strong>
                    <span style="font-size: 0.85rem; color: #94a3b8;">${receipt.date ? new Date(receipt.date).toLocaleString() : ''}</span>
                </div>
                
                <div class="receipt-box" style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; font-family: monospace;">
                    ${receipt.htmlContent || generateFallbackReceiptHTML(receipt)}
                </div>

                <div class="receipt-actions" style="margin-top: 12px; display: flex; gap: 10px;">
                    <button class="btn-secondary" onclick="shareSavedReceiptWhatsApp('${receipt.id}')">📱 Share Receipt</button>
                    <button class="btn-secondary" onclick="printSpecificReceipt('${receipt.id}')">🖨️ Thermal Print</button>
                    <button class="btn-danger" onclick="deleteSavedReceiptCard('${receipt.id}')" style="margin-left: auto;">🗑️ Delete</button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading receipt cards:', error);
        container.innerHTML = '<p style="text-align: center; color: #ef4444;">Failed to load receipts.</p>';
    }
}

// Fallback HTML generator if the raw HTML content wasn't stored directly
function generateFallbackReceiptHTML(receipt) {
    let itemsHtml = '';
    if (receipt.items && Array.isArray(receipt.items)) {
        itemsHtml = receipt.items.map(i => `<div>${i.name} x${i.qty} - E${(i.price * i.qty).toFixed(2)}</div>`).join('');
    } else {
        itemsHtml = `<p>Total Amount: E${Number(receipt.total || 0).toFixed(2)}</p>`;
    }
    return itemsHtml;
}

// Action Handlers for the saved receipt cards
function shareSavedReceiptWhatsApp(receiptId) {
    const text = encodeURIComponent(`Hello! Here is your receipt summary from PocketVentures (Receipt #${receiptId}). Thank you for your support!`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function printSpecificReceipt(receiptId) {
    // Triggers print for the whole window or a dedicated print routine
    window.print();
	
	// Example of how you trigger it after a successful calculation or item add:
const myReceiptHtml = `
    <p><strong>PocketVentures Sale</strong></p>
    <p>Item: Sample Product x1 - E50.00</p>
    <hr style="border: 0; border-top: 1px dashed #64748b; margin: 8px 0;">
    <p><strong>Total: E50.00</strong></p>
`;

// This will now update BOTH the main page and the navbar receipt box at the same time!
updateLiveReceipt(myReceiptHtml);
}

async function deleteSavedReceiptCard(receiptId) {
    if (confirm(`Are you sure you want to delete receipt #${receiptId}?`)) {
        try {
            await deleteSaleFromVault(receiptId); // Ensure this matches your DB delete function
            loadSavedReceiptCards(); // Refresh list
        } catch (error) {
            console.error('Error deleting receipt:', error);
            alert('Could not delete receipt.');
        }
    }
}

function updateLiveReceipt(receiptHtmlString) {
    // 1. Update main page receipt box
    const mainOutput = document.getElementById('receipt-output');
    if (mainOutput) {
        mainOutput.innerHTML = receiptHtmlString;
    }

    // 2. Update navbar receipt box as well
    const navOutput = document.getElementById('nav-receipt-output');
    if (navOutput) {
        navOutput.innerHTML = receiptHtmlString;
    }

    // Show action buttons on both sides if hidden
    const mainTools = document.getElementById('receipt-tools');
    if (mainTools) mainTools.style.display = 'flex';

    const navTools = document.getElementById('nav-receipt-tools');
    if (navTools) navTools.style.display = 'flex';
}