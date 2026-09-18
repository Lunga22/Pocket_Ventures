let db = null;
let currentCurrency = localStorage.getItem("pv_currency") || "E";

// 1. Initialize Shared IndexedDB Storage (Synced to v6)
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
  updateCurrencyDisplay();
  renderCustomers();
  populateCustomerSelect();
};

request.onerror = (e) => {
  console.error("IndexedDB error:", e.target.error);
};

function updateCurrencyDisplay() {
  document.querySelectorAll(".currency-symbol").forEach((el) => (el.textContent = currentCurrency));
}

// 2. Add New Customer Contact
const customerForm = document.getElementById("customer-form");
if (customerForm) {
  customerForm.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!db) {
      alert("Database is initializing. Please wait a second and try again.");
      return;
    }

    const name = document.getElementById("cust-name").value.trim();
    const phone = document.getElementById("cust-phone").value.trim();
    const notes = document.getElementById("cust-notes").value.trim();

    if (!name || !phone) return;

    const newCustomer = {
      name,
      phone,
      notes: notes || "No specific notes",
      createdAt: new Date().toLocaleDateString()
    };

    try {
      const tx = db.transaction("customers", "readwrite");
      tx.objectStore("customers").add(newCustomer);

      tx.oncomplete = () => {
        customerForm.reset();
        renderCustomers();
        populateCustomerSelect();
      };

      tx.onerror = (err) => {
        console.error("Error adding customer:", err.target.error);
      };
    } catch (err) {
      console.error("Runtime error saving customer:", err);
    }
  });
}

// 3. Populate Customer Selection Dropdown
function populateCustomerSelect() {
  const select = document.getElementById("order-cust-select");
  if (!select || !db) return;

  try {
    const tx = db.transaction("customers", "readonly");
    const getAll = tx.objectStore("customers").getAll();

    getAll.onsuccess = () => {
      const customers = getAll.result || [];
      select.innerHTML = '<option value="">Select Customer...</option>';
      customers.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.name;
        opt.dataset.phone = c.phone;
        opt.textContent = `${c.name} (${c.phone})`;
        select.appendChild(opt);
      });
    };
  } catch (err) {
    console.error("Error populating customer select:", err);
  }
}

// 4. Record Customer Order, Deposit, or Return
const orderTrackerForm = document.getElementById("order-tracker-form");
if (orderTrackerForm) {
  orderTrackerForm.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!db) {
      alert("Database is initializing. Please wait a second and try again.");
      return;
    }

    const customerName = document.getElementById("order-cust-select").value;
    const itemDesc = document.getElementById("order-desc").value.trim();
    const totalAmount = parseFloat(document.getElementById("order-total").value) || 0;
    const paidAmount = parseFloat(document.getElementById("order-deposit").value) || 0;
    const status = document.getElementById("order-status").value;

    if (!customerName || !itemDesc) return;

    const balanceDue = Math.max(0, totalAmount - paidAmount);

    const orderEntry = {
      customerName,
      itemDesc,
      totalAmount,
      paidAmount,
      balanceDue,
      status,
      currency: currentCurrency,
      date: new Date().toLocaleDateString()
    };

    try {
      const tx = db.transaction("customer_orders", "readwrite");
      tx.objectStore("customer_orders").add(orderEntry);

      tx.oncomplete = () => {
        orderTrackerForm.reset();
        alert(`Order recorded for ${customerName}! Balance due: ${currentCurrency}${balanceDue.toFixed(2)}`);
        viewHistory(customerName);
      };
    } catch (err) {
      console.error("Runtime error recording order:", err);
    }
  });
}

// 5. Render Customer Contacts List
function renderCustomers() {
  if (!db) return;
  const customerTableBody = document.getElementById("customer-table-body");
  const customerCountBadge = document.getElementById("customer-count-badge");

  try {
    const tx = db.transaction("customers", "readonly");
    const getAll = tx.objectStore("customers").getAll();

    getAll.onsuccess = () => {
      const customers = getAll.result || [];
      if (!customerTableBody) return;

      customerTableBody.innerHTML = "";

      if (customerCountBadge) {
        customerCountBadge.textContent = `${customers.length} Contacts`;
      }

      if (customers.length === 0) {
        customerTableBody.innerHTML = `<tr><td colspan="4" class="muted">No customer contacts saved yet.</td></tr>`;
        return;
      }

      customers.forEach((c) => {
        const cleanPhone = c.phone.replace(/[^0-9+]/g, "");

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${c.name}</strong></td>
          <td>
            <a href="tel:${cleanPhone}" class="contact-link">📞 ${c.phone}</a>
          </td>
          <td><small class="muted">${c.notes}</small></td>
          <td>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-small-success" style="text-decoration: none;">💬 WA</a>
              <button class="btn-small" onclick="viewHistory('${c.name}')">📋 Ledger</button>
              <button class="btn-small-danger" onclick="deleteCustomer(${c.id})">Delete</button>
            </div>
          </td>
        `;
        customerTableBody.appendChild(tr);
      });
    };
  } catch (err) {
    console.error("Error rendering customers:", err);
  }
}

// 6. View Complete Customer Ledger
window.viewHistory = (customerName) => {
  if (!db) return;
  const historyCard = document.getElementById("history-card");
  const historyTitle = document.getElementById("history-customer-name");
  const historyList = document.getElementById("customer-history-list");

  if (!historyCard || !historyList) return;

  historyCard.style.display = "block";
  historyTitle.textContent = `${customerName}'s Account Ledger`;
  historyList.innerHTML = "<p class='muted'>Loading orders & payments...</p>";

  try {
    const tx = db.transaction(["sales", "customer_orders", "customers"], "readonly");
    const getSales = tx.objectStore("sales").getAll();
    const getOrders = tx.objectStore("customer_orders").getAll();
    const getCustomers = tx.objectStore("customers").getAll();

    Promise.all([
      new Promise((res) => (getSales.onsuccess = () => res(getSales.result || []))),
      new Promise((res) => (getOrders.onsuccess = () => res(getOrders.result || []))),
      new Promise((res) => (getCustomers.onsuccess = () => res(getCustomers.result || [])))
    ]).then(([sales, orders, customers]) => {
      const customer = customers.find((c) => c.name === customerName);
      const cleanPhone = customer ? customer.phone.replace(/[^0-9+]/g, "") : "";

      const custSales = sales.filter((s) => s.customer === customerName);
      const custOrders = orders.filter((o) => o.customerName === customerName);

      if (custSales.length === 0 && custOrders.length === 0) {
        historyList.innerHTML = `<p class="muted">No orders or transaction history found for ${customerName}.</p>`;
        return;
      }

      let totalBalanceDue = 0;
      let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';

      if (custOrders.length > 0) {
        html += "<strong>Custom Orders & Pre-Orders</strong>";
        custOrders.forEach((o) => {
          totalBalanceDue += o.balanceDue;
          const statusColor = o.status === "Returned/Refunded" ? "var(--danger)" : "#f59e0b";
          const sym = o.currency || currentCurrency;

          html += `
            <div style="border-bottom: 1px solid var(--border); padding-bottom: 8px;">
              <div style="display: flex; justify-content: space-between;">
                <strong>${o.itemDesc} (${o.date})</strong>
                <span style="color: ${statusColor}; font-size: 0.8rem; font-weight: bold;">${o.status}</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
                Total: ${sym}${o.totalAmount.toFixed(2)} | Paid: ${sym}${o.paidAmount.toFixed(2)} | 
                <strong style="color: ${o.balanceDue > 0 ? 'var(--danger)' : 'var(--success)'}">
                  Balance Due: ${sym}${o.balanceDue.toFixed(2)}
                </strong>
              </div>
            </div>
          `;
        });
      }

      if (custSales.length > 0) {
        html += '<strong style="margin-top: 8px;">Completed POS Transactions</strong>';
        custSales.forEach((s) => {
          const sym = s.currency || currentCurrency;
          html += `
            <div style="border-bottom: 1px solid var(--border); padding-bottom: 8px;">
              <div style="display: flex; justify-content: space-between;">
                <span>${s.date || "POS Sale"} (${s.paymentMethod || "Cash"})</span>
                <span style="color: var(--success); font-weight: bold;">${sym}${s.price ? s.price.toFixed(2) : "0.00"}</span>
              </div>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">
                Items: ${s.name || "Direct Purchase"}
              </p>
            </div>
          `;
        });
      }

      if (cleanPhone && totalBalanceDue > 0) {
        const msg = encodeURIComponent(
          `Hi ${customerName}, here is a reminder regarding your order. Your remaining balance due is ${currentCurrency}${totalBalanceDue.toFixed(2)}. Thank you!`
        );
        html += `
          <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <strong style="color: var(--danger);">Total Outstanding Balance: ${currentCurrency}${totalBalanceDue.toFixed(2)}</strong>
            <a href="https://wa.me/${cleanPhone}?text=${msg}" target="_blank" class="btn-small-success" style="text-decoration: none;">
              💬 Send WhatsApp Reminder
            </a>
          </div>
        `;
      }

      html += "</div>";
      historyList.innerHTML = html;
    });
  } catch (err) {
    console.error("Error viewing history:", err);
  }
};

window.closeHistory = () => {
  const historyCard = document.getElementById("history-card");
  if (historyCard) historyCard.style.display = "none";
};

// 7. Delete Customer Contact
window.deleteCustomer = (id) => {
  if (!db) return;
  if (!confirm("Are you sure you want to delete this contact?")) return;
  
  try {
    const tx = db.transaction("customers", "readwrite");
    tx.objectStore("customers").delete(id);
    tx.oncomplete = () => {
      renderCustomers();
      populateCustomerSelect();
    };
  } catch (err) {
    console.error("Error deleting customer:", err);
  }
};