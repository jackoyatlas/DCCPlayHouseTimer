import { db, auth } from "./firebase.js";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

let customerId = 0;
const customers = {};
let searchTerm = '';
const START_TIME = 60 * 60;

// Format seconds to hh:mm:ss or Unlimited
const formatTime = sec => {
  if (sec === -1) return "Unlimited";
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
};

// Helper to get customer element
const getCustomerElement = id => document.getElementById(`customer-${id}`);

// Helper to get customer data from DOM
const getCustomerData = id => {
    const el = getCustomerElement(id);
    if (!el) return null;
    return {
        name: el.querySelector("h3.customer-name").textContent,
        desc: el.querySelector("textarea").value,
        seconds: customers[id].seconds
    };
};

// Helper to create customer HTML
const createCustomerHTML = (id, name = `Customer ${id}`, desc = "", receiptNumber = "", time = "60:00") => `
    <h3 class="customer-name">${name}</h3>
    ${receiptNumber ? `<div class="receipt-label">${receiptNumber}</div>` : ''}
    <textarea placeholder="Description...">${desc}</textarea>
    <div class="time" id="display-${id}">${time}</div>
    <div class="timer-buttons-container">
        <button class="start timer-button" onclick="startCustomer(${id})">Start</button>
        <button class="pause timer-button" onclick="pauseCustomer(${id})">Pause</button>
        <button class="reset timer-button" onclick="resetCustomer(${id})">Reset</button>
        <button class="end-timer timer-button" id="end-timer-${id}" onclick="endTimer(${id})">End Time</button>
        <button class="change-time timer-button" onclick="changeTime(${id})">Change Time</button>
    </div>
`;

// Helper to create and append customer to DOM
const createCustomerElement = (id, name, desc, receiptNumber, time) => {
    const div = document.createElement("div");
    div.className = "timer";
    div.id = `customer-${id}`;
    div.innerHTML = createCustomerHTML(id, name, desc, receiptNumber, time);
    document.getElementById("timers").appendChild(div);
};

// Add new customer
window.addCustomer = async () => {
    const modal = document.getElementById('customer-name-modal');
    const nameInput = document.getElementById('customer-name-input');
    const receiptInput = document.getElementById('receipt-number-input');
    const confirmBtn = document.getElementById('customer-name-confirm');
    const cancelBtn = document.getElementById('customer-name-cancel');

    nameInput.value = '';
    receiptInput.value = '';
    modal.style.display = 'flex';

    return new Promise((resolve) => {
        const handleConfirm = async () => {
            const name = nameInput.value.trim();
            const receiptNumber = receiptInput.value.trim();
            if (name) {
                customerId++;
                const timerId = `timer_${Date.now()}_${customerId}`; // Unique timerId
                const created = new Date().toISOString();
                customers[customerId] = { seconds: START_TIME, interval: null, created, name, receiptNumber, timerId, paused: false, alarmTriggered: false, endTime: null };
                createCustomerElement(customerId, name, receiptNumber);
                updateEndTimerButton(customerId);
                await saveCustomer(customerId, created);
            }
            modal.style.display = 'none';
            cleanup();
            resolve();
        };

        const handleCancel = () => {
            modal.style.display = 'none';
            cleanup();
            resolve();
        };

        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                handleConfirm();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        };

        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleKeydown);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleKeydown);
    });
};

// Start timer
window.startCustomer = async id => {
    const customer = customers[id];
    if (!customer || customer.interval || (customer.seconds <= 0 && customer.seconds !== -1)) return;

    // Check if description is provided
    const descElement = document.querySelector(`#customer-${id} textarea`);
    if (!descElement || descElement.value.trim() === "") {
        showNotification("Please enter a description before starting the timer.");
        return;
    }

    // Set start time
    customer.startTime = new Date().toISOString();
    customer.paused = false;
    // Set end time for timed timers to enable real-time calculation
    if (customer.seconds !== -1 && !customer.endTime) {
        customer.endTime = new Date(Date.now() + customer.seconds * 1000);
    }
    // Save description before starting the timer
    await saveCustomer(id);
    // Disable description editing after starting
    descElement.disabled = true;
    // Show notification when starting
    showNotification(`Timer started for ${customer.name}`);
    customer.interval = setInterval(() => {
        if (customer.endTime) {
            const remaining = Math.floor((new Date(customer.endTime) - new Date()) / 1000);
            customer.seconds = Math.max(0, remaining);
        }
        const display = document.getElementById(`display-${id}`);
        display.textContent = formatTime(customer.seconds);
        // Check for 3 minutes left alarm (only for timed timers)
        if (customer.seconds <= 180 && customer.seconds !== -1 && !customer.alarmTriggered) {
            customer.alarmTriggered = true;
            playBeep();
            showNotification(`3 minutes left for ${customer.name}!`);
        }
        if (customer.seconds <= 0 && customer.seconds !== -1) {
            clearInterval(customer.interval);
            customer.interval = null;
            display.classList.add("expired");
            // Play sound when timer reaches zero
            playBeep();
            showNotification("Time's up for " + customer.name + "!");
            // Hide the customer element instead of removing it
            const customerElement = getCustomerElement(id);
            if (customerElement) {
                customerElement.style.display = 'none';
            }
            // Keep the customer data in the object (do not delete)
        }
    }, 1000);
};

// Pause timer
window.pauseCustomer = async id => {
    if (!confirm("Are you sure you want to pause the timer?")) return;
    const customer = customers[id];
    if (!customer) return;
    clearInterval(customer.interval);
    customer.interval = null;
    customer.paused = true;
    await saveCustomer(id);
    // Log pause action
    try {
        await addDoc(collection(db, "timer_actions"), {
            timerId: customer.timerId,
            action: "pause",
            timestamp: new Date()
        });
    } catch (e) {
        console.error("Error logging pause action:", e.message);
    }
};

// Reset timer
window.resetCustomer = async id => {
    if (!confirm("Are you sure you want to reset the timer?")) return;
    await pauseCustomer(id);
    const wasUnlimited = customers[id].seconds === -1;
    customers[id].seconds = wasUnlimited ? -1 : START_TIME;
    customers[id].elapsedTime = 0;
    customers[id].startTime = null;
    customers[id].paused = false;
    customers[id].alarmTriggered = false;
    const display = document.getElementById(`display-${id}`);
    display.textContent = formatTime(customers[id].seconds);
    display.classList.remove("expired");
    // Re-enable textarea
    const el = getCustomerElement(id);
    el.querySelector("textarea").disabled = false;
    await saveCustomer(id);
    // Log reset action
    try {
        await addDoc(collection(db, "timer_actions"), {
            timerId: customers[id].timerId,
            action: "reset",
            timestamp: new Date()
        });
    } catch (e) {
        console.error("Error logging reset action:", e.message);
    }
};

// Change timer time
window.changeTime = async id => {
    const customer = customers[id];
    if (!customer) return;
    if (customer.startTime) {
        showNotification("Cannot change time once the timer has started.");
        return;
    }
    // Store the current customer id for the modal
    window.currentChangeTimeId = id;
    const modal = document.getElementById('change-time-modal');
    modal.style.display = 'flex';
};



// Set timer time
window.setTime = async (id, newSeconds, save = true) => {
    // Hide the modal immediately
    document.getElementById('change-time-modal').style.display = 'none';
    const customer = customers[id];
    if (!customer) return;
    // If timer is running, pause it first
    const wasRunning = customer.interval !== null;
    if (wasRunning) {
        clearInterval(customer.interval);
        customer.interval = null;
        customer.paused = true;
    }
    customer.seconds = newSeconds;
    customer.endTime = null; // Reset end time
    customer.startTime = null; // Reset start time since time changed
    customer.paused = false;
    customer.alarmTriggered = false;
    const display = document.getElementById(`display-${id}`);
    display.textContent = formatTime(newSeconds);
    display.classList.remove("expired");
    // Hide time options
    const timeOptions = document.getElementById(`time-options-${id}`);
    timeOptions.style.display = 'none';
    // Update HTML to show/hide End Timer button
    updateEndTimerButton(id);
    if (save) {
        await saveCustomer(id);
        // Log change time action
        try {
            await addDoc(collection(db, "timer_actions"), {
                timerId: customer.timerId,
                action: "change_time",
                newTime: newSeconds,
                timestamp: new Date()
            });
        } catch (e) {
            console.error("Error logging change time action:", e.message);
        }
        const choice = newSeconds === 3600 ? "1 hour" : "unlimited";
        showNotification(`Time changed for ${customer.name} to ${choice}`);
    }
};

// Open set end time modal
window.openSetEndTimeModal = (id) => {
    window.currentSetEndTimeId = id;
    // Hide the change time modal
    document.getElementById('change-time-modal').style.display = 'none';
    document.getElementById('set-end-time-modal').style.display = 'flex';
    // Clear inputs
    document.getElementById('end-hours').value = '';
    document.getElementById('end-minutes').value = '';
};

// Confirm set end time
window.confirmSetEndTime = async () => {
    const id = window.currentSetEndTimeId;
    if (!id) return;
    const hours = parseInt(document.getElementById('end-hours').value) || 0;
    const minutes = parseInt(document.getElementById('end-minutes').value) || 0;
    if (hours === 0 && minutes === 0) {
        showNotification("Please enter a valid time.");
        return;
    }
    const totalSeconds = (hours * 3600) + (minutes * 60);
    const endTime = new Date(Date.now() + totalSeconds * 1000);
    // Store the calculated values for confirmation
    window.pendingEndTime = { id, totalSeconds, endTime: endTime.toISOString() };
    // Populate the confirmation modal
    const endTimeDisplay = endTime.toLocaleString();
    document.getElementById('confirm-end-time-display').textContent = endTimeDisplay;
    // Hide the set end time modal and show confirmation modal
    document.getElementById('set-end-time-modal').style.display = 'none';
    document.getElementById('set-end-time-confirm-modal').style.display = 'flex';
};

// Confirm set end time final
window.confirmSetEndTimeFinal = async () => {
    const { id, totalSeconds, endTime } = window.pendingEndTime;
    if (!id) return;
    const customer = customers[id];
    customer.endTime = endTime;
    // Hide the confirmation modal
    document.getElementById('set-end-time-confirm-modal').style.display = 'none';
    // Set the timer with the calculated seconds
    await setTime(id, totalSeconds);
    // Clear the stored data
    window.pendingEndTime = null;
    window.currentSetEndTimeId = null;
};

// Close set end time confirm modal
window.closeSetEndTimeConfirmModal = () => {
    document.getElementById('set-end-time-confirm-modal').style.display = 'none';
    // Clear the stored data
    window.pendingEndTime = null;
    window.currentSetEndTimeId = null;
};

// Close set end time modal
window.closeSetEndTimeModal = () => {
    document.getElementById('set-end-time-modal').style.display = 'none';
    // Clear the stored id
    window.currentSetEndTimeId = null;
};

// Save customer to Firebase
window.saveCustomer = async id => {
    const data = getCustomerData(id);
    if (!data) return;
    // Attach created timestamp if provided
    let created = customers[id]?.created;
    if (!created) created = new Date().toISOString();
    const timerId = customers[id].timerId;
    const startTime = customers[id].startTime ? new Date(customers[id].startTime) : null;
    const endTime = customers[id].endTime ? new Date(customers[id].endTime) : null;
    const paused = customers[id].paused || false;
    const receiptNumber = customers[id].receiptNumber || "";
    try {
        if (customers[id].docId) {
            // Update existing document
            await updateDoc(doc(db, "timers", customers[id].docId), {
                customerName: data.name,
                description: data.desc,
                time: data.seconds,
                timerId: timerId,
                startTime: startTime,
                endTime: endTime,
                paused: paused,
                receiptNumber: receiptNumber
            });
        } else {
            // Create new document
            const docRef = await addDoc(collection(db, "timers"), {
                customerName: data.name,
                description: data.desc,
                time: data.seconds,
                createdAt: new Date(created),
                timerId: timerId,
                startTime: startTime,
                endTime: endTime,
                paused: paused,
                receiptNumber: receiptNumber
            });
            customers[id].docId = docRef.id;
        }
    } catch (e) {
        console.error("Error saving customer:", e.message);
    }
};

// Update end timer button visibility
window.updateEndTimerButton = id => {
    const customer = customers[id];
    const endTimerBtn = document.getElementById(`end-timer-${id}`);
    if (endTimerBtn) {
        endTimerBtn.style.display = 'inline-block';
    }
};

// Show notification message
window.showNotification = message => {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.style.display = "block";
    setTimeout(() => {
        notification.style.display = "none";
    }, 3000);
};

// Filter customers based on search term
const filterCustomers = () => {
    const term = searchTerm.toLowerCase();
    for (const id in customers) {
        const customer = customers[id];
        const el = getCustomerElement(id);
        if (!el) continue;
        const name = customer.name.toLowerCase();
        const desc = el.querySelector("textarea").value.toLowerCase();
        const receipt = (customer.receiptNumber || "").toLowerCase();
        const matches = name.includes(term) || desc.includes(term) || receipt.includes(term);
        const isExpired = el.querySelector('.time').classList.contains('expired');
        el.style.display = (matches && !isExpired) ? 'block' : 'none';
    }
};

// Add event listener for search input
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value;
            filterCustomers();
        });
    }
});



// End timer
window.endTimer = async id => {
    const customer = customers[id];
    if (!customer) return;
    // Show confirmation modal
    window.currentEndTimerId = id;
    const modal = document.getElementById('end-time-modal');
    const messageEl = document.getElementById('end-time-message');
    messageEl.textContent = `Are you sure you want to end the timer for ${customer.name}?`;
    // Populate customer details
    document.getElementById('end-customer-name-title').textContent = customer.name;
    document.getElementById('end-customer-name').textContent = customer.name;
    document.getElementById('end-receipt-number').textContent = customer.receiptNumber || 'N/A';
    const descElement = document.querySelector(`#customer-${id} textarea`);
    document.getElementById('end-description').textContent = descElement ? descElement.value.trim() || 'N/A' : 'N/A';
    modal.style.display = 'flex';
};

// Close end time modal
window.closeEndTimeModal = () => {
    document.getElementById('end-time-modal').style.display = 'none';
    // Clear the stored id
    window.currentEndTimerId = null;
};

// Confirm end timer
window.confirmEndTimer = async () => {
    const id = window.currentEndTimerId;
    if (!id) return;
    const customer = customers[id];
    if (!customer) return;
    // Hide the modal
    document.getElementById('end-time-modal').style.display = 'none';
    // End the timer
    clearInterval(customer.interval);
    customer.interval = null;
    customer.endTime = new Date().toISOString();
    customer.paused = true;
    // For unlimited timers, calculate and save elapsed time
    if (customer.seconds === -1 && customer.startTime) {
        const elapsed = Math.floor((new Date(customer.endTime) - new Date(customer.startTime)) / 1000);
        customer.seconds = elapsed;
        // Update display to show elapsed time
        const display = document.getElementById(`display-${id}`);
        display.textContent = formatTime(customer.seconds);
    }
    await saveCustomer(id);
    // Log end timer action
    try {
        await addDoc(collection(db, "timer_actions"), {
            timerId: customer.timerId,
            action: "end_timer",
            timestamp: new Date()
        });
    } catch (e) {
        console.error("Error logging end timer action:", e.message);
    }
    // Hide the customer element
    const customerElement = getCustomerElement(id);
    if (customerElement) {
        customerElement.style.display = 'none';
    }
    // Clear the stored id
    window.currentEndTimerId = null;
};

// Logout dialog functions
window.showLogoutDialog = () => {
    const dialog = document.getElementById('logout-dialog');
    dialog.style.display = 'flex';
    const handleClickOutside = (event) => {
        if (event.target === dialog) {
            hideLogoutDialog();
        }
    };
    dialog.addEventListener('click', handleClickOutside);
    // Store the handler to remove later
    window.logoutDialogClickHandler = handleClickOutside;
};

// Function to populate customer report
const populateCustomerReport = (startDate = null, endDate = null) => {
    const reportContainer = document.getElementById('customer-report');
    reportContainer.innerHTML = '<h3>Customer Report</h3>';
    let hasReports = false;
    const table = document.createElement('table');
    table.className = 'report-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Name</th>
                <th>Receipt</th>
                <th>Description</th>
                <th>Start Time</th>
                <th>End Time</th>
            </tr>
        </thead>
        <tbody>
        </tbody>
    `;
    const tbody = table.querySelector('tbody');
    for (const id in customers) {
        const customer = customers[id];
        if (customer.endTime) {
            const endTimeDate = new Date(customer.endTime);
            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // Include the entire end date
                if (endTimeDate < start || endTimeDate > end) {
                    continue; // Skip if not in range
                }
            }
            hasReports = true;
            const startTime = customer.startTime ? new Date(customer.startTime).toLocaleString() : 'N/A';
            const endTime = endTimeDate.toLocaleString();
            const descElement = document.querySelector(`#customer-${id} textarea`);
            const description = descElement ? descElement.value.trim() || 'N/A' : 'N/A';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${customer.name}</td>
                <td>${customer.receiptNumber || 'N/A'}</td>
                <td>${description}</td>
                <td>${startTime}</td>
                <td>${endTime}</td>
            `;
            tbody.appendChild(row);
        }
    }
    if (hasReports) {
        reportContainer.appendChild(table);
    } else {
        reportContainer.innerHTML += '<p>No completed timers to report.</p>';
    }
};

// Show date range modal
window.showDateRangeModal = () => {
    document.getElementById('date-range-modal').style.display = 'flex';
};

// Add event listener for Generate Report button (using setTimeout to ensure DOM is ready for module scripts)
setTimeout(() => {
    const generateReportBtn = document.getElementById('generate-report-btn');
    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', () => {
            window.generateReport();
        });
    }
}, 0);

// Close date range modal
window.closeDateRangeModal = () => {
    document.getElementById('date-range-modal').style.display = 'none';
    // Clear inputs
    document.getElementById('start-date').value = '';
    document.getElementById('end-date').value = '';
};

// Generate report based on date range
window.generateReport = () => {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    if (!startDate || !endDate) {
        showNotification('Please select both start and end dates.');
        return;
    }
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Start date cannot be after end date.');
        return;
    }
    populateCustomerReport(startDate, endDate);
    closeDateRangeModal();
    document.getElementById('customer-report-modal').style.display = 'flex';
};

// Close customer report modal
window.closeCustomerReportModal = () => {
    document.getElementById('customer-report-modal').style.display = 'none';
};

window.hideLogoutDialog = () => {
    const dialog = document.getElementById('logout-dialog');
    dialog.style.display = 'none';
    if (window.logoutDialogClickHandler) {
        dialog.removeEventListener('click', window.logoutDialogClickHandler);
        delete window.logoutDialogClickHandler;
    }
};

// Play alarm sound
window.playBeep = () => {
    console.log('Alarm sound playing');
    const audio = new Audio('alarm.mp3');
    audio.play().catch(e => console.error('Error playing alarm sound:', e));
};





// Load customers on auth
onAuthStateChanged(auth, async user => {
    if (!user) return;
    // Load and display saved customers
    try {
        const querySnapshot = await getDocs(collection(db, "timers"));
        querySnapshot.forEach(doc => {
            const data = doc.data();
            customerId = Math.max(customerId, parseInt(data.timerId.split('_')[2]) || 0);
            const id = ++customerId;
            const startTime = data.startTime ? new Date(data.startTime.toDate ? data.startTime.toDate() : data.startTime) : null;
            const endTime = data.endTime ? new Date(data.endTime.toDate ? data.endTime.toDate() : data.endTime) : null;
            let seconds = data.time;
            if (endTime) {
                const remaining = Math.floor((endTime - new Date()) / 1000);
                seconds = Math.max(0, remaining);
            } else if (startTime && seconds !== -1) {
                const elapsed = Math.floor((new Date() - startTime) / 1000);
                seconds = Math.max(0, seconds - elapsed);
            }
            customers[id] = {
                seconds: seconds,
                interval: null,
                created: data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
                name: data.customerName,
                receiptNumber: data.receiptNumber || "",
                timerId: data.timerId,
                docId: doc.id,
                startTime: startTime ? startTime.toISOString() : null,
                endTime: endTime ? endTime.toISOString() : null,
                paused: data.paused || false,
                alarmTriggered: false
            };
            createCustomerElement(id, data.customerName, data.description, data.receiptNumber || "", formatTime(seconds));
            // Update end timer button visibility
            updateEndTimerButton(id);
            if (startTime) {
                // Disable textarea for started timers
                const el = getCustomerElement(id);
                el.querySelector("textarea").disabled = true;
                // Resume timer if not expired and not paused
                if (seconds > 0 && !data.paused) {
                    startCustomer(id);
                } else if (seconds <= 0) {
                    const display = document.getElementById(`display-${id}`);
                    display.classList.add("expired");
                    // Hide expired timers
                    el.style.display = 'none';
                }
            }
        });
        filterCustomers();
    } catch (e) {
        console.error("Error loading customers:", e.message);
    }
});