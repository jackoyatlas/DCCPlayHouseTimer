import { db, auth } from "./firebase.js";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

let customerId = 0;
const customers = {};
const START_TIME = 30 * 60;

// Format seconds to mm:ss
const formatTime = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

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
const createCustomerHTML = (id, name = `Customer ${id}`, desc = "", receiptNumber = "", time = "30:00") => `
    <h3 class="customer-name">${name}</h3>
    ${receiptNumber ? `<div class="receipt-label">${receiptNumber}</div>` : ''}
    <textarea placeholder="Description...">${desc}</textarea>
    <div class="time" id="display-${id}">${time}</div>
    <button class="start" onclick="startCustomer(${id})">Start</button>
    <button class="pause" onclick="pauseCustomer(${id})">Pause</button>
    <button class="reset" onclick="resetCustomer(${id})">Reset</button>
    <button class="change-time" onclick="changeTime(${id})">Change Time</button>
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
        const handleConfirm = () => {
            const name = nameInput.value.trim();
            const receiptNumber = receiptInput.value.trim();
            if (name) {
                customerId++;
                const timerId = `timer_${Date.now()}_${customerId}`; // Unique timerId
                const created = new Date().toISOString();
                customers[customerId] = { seconds: START_TIME, interval: null, created, name, receiptNumber, timerId, paused: false, alarmTriggered: false };
                createCustomerElement(customerId, name, receiptNumber);
                saveCustomer(customerId, created);
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
    if (!customer || customer.interval || customer.seconds <= 0) return;

    // Check if description is provided
    const descElement = document.querySelector(`#customer-${id} textarea`);
    if (!descElement || descElement.value.trim() === "") {
        showNotification("Please enter a description before starting the timer.");
        return;
    }

    // Set start time
    customer.startTime = new Date().toISOString();
    customer.paused = false;
    // Save description before starting the timer
    await saveCustomer(id);
    // Disable description editing after starting
    descElement.disabled = true;
    // Show notification when starting
    showNotification(`Timer started for ${customer.name}`);
    customer.interval = setInterval(() => {
        customer.seconds--;
        const display = document.getElementById(`display-${id}`);
        display.textContent = formatTime(customer.seconds);
        // Check for 3 minutes left alarm
        if (customer.seconds <= 180 && !customer.alarmTriggered) {
            customer.alarmTriggered = true;
            playBeep();
            showNotification(`3 minutes left for ${customer.name}!`);
        }
        if (customer.seconds <= 0) {
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
    customers[id].seconds = START_TIME;
    customers[id].elapsedTime = 0;
    customers[id].startTime = null;
    customers[id].paused = false;
    customers[id].alarmTriggered = false;
    const display = document.getElementById(`display-${id}`);
    display.textContent = formatTime(0);
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
    const newTimeMinutes = prompt("Enter new time in minutes:");
    if (!newTimeMinutes || isNaN(newTimeMinutes) || newTimeMinutes <= 0) return;
    const newSeconds = parseInt(newTimeMinutes) * 60;
    // If timer is running, pause it first
    const wasRunning = customer.interval !== null;
    if (wasRunning) {
        clearInterval(customer.interval);
        customer.interval = null;
        customer.paused = true;
    }
    customer.seconds = newSeconds;
    customer.startTime = null; // Reset start time since time changed
    customer.paused = false;
    customer.alarmTriggered = false;
    const display = document.getElementById(`display-${id}`);
    display.textContent = formatTime(newSeconds);
    display.classList.remove("expired");
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
    showNotification(`Time changed for ${customer.name} to ${newTimeMinutes} minutes`);
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
                paused: paused,
                receiptNumber: receiptNumber
            });
            customers[id].docId = docRef.id;
        }
    } catch (e) {
        console.error("Error saving customer:", e.message);
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

// Play alarm sound
window.playBeep = () => {
    console.log('Alarm sound playing');
    const audio = new Audio('alarm.mp3');
    audio.play().catch(e => console.error('Error playing alarm sound:', e));
};

// Logout dialog functions
window.showLogoutDialog = () => {
    document.getElementById('logout-dialog').style.display = 'flex';
};

window.hideLogoutDialog = () => {
    document.getElementById('logout-dialog').style.display = 'none';
};

window.confirmLogout = () => {
    logout();
    hideLogoutDialog();
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
            let seconds = data.time;
            if (startTime) {
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
                paused: data.paused || false,
                alarmTriggered: false
            };
            createCustomerElement(id, data.customerName, data.description, data.receiptNumber || "", formatTime(seconds));
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
    } catch (e) {
        console.error("Error loading customers:", e.message);
    }
});
