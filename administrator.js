import { db, auth } from "./firebase.js";
import { collection, getDocs, updateDoc, doc, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const START_TIME = 30 * 60; // 1800 seconds

// Format seconds to mm:ss
const formatTime = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

// Function to fetch all users
async function fetchAllUsers() {
    try {
        const q = collection(db, "users");
        const querySnapshot = await getDocs(q);
        const users = [];
        querySnapshot.forEach((doc) => {
            users.push({ id: doc.id, ...doc.data() });
        });
        return users;
    } catch (error) {
        console.error("Error fetching all users:", error);
        return [];
    }
}



// Function to approve a user
async function approveUser(userId) {
    try {
        await updateDoc(doc(db, "users", userId), {
            status: "approved"
        });
        alert("User approved successfully!");
        loadAllUsers(); // Reload the list
    } catch (error) {
        console.error("Error approving user:", error);
        alert("Error approving user.");
    }
}

// Function to decline a user
async function declineUser(userId) {
    try {
        await updateDoc(doc(db, "users", userId), {
            status: "declined"
        });
        alert("User declined successfully!");
        loadAllUsers(); // Reload the list
    } catch (error) {
        console.error("Error declining user:", error);
        alert("Error declining user.");
    }
}

// Function to remove a user
async function removeUser(userId) {
    try {
        await deleteDoc(doc(db, "users", userId));
        alert("User removed successfully!");
        loadAllUsers(); // Reload the list
    } catch (error) {
        console.error("Error removing user:", error);
        alert("Error removing user.");
    }
}



// Function to load and display all users
async function loadAllUsers() {
    const users = await fetchAllUsers();
    const userList = document.getElementById("users-list");
    userList.innerHTML = "";
    if (users.length === 0) {
        userList.innerHTML = "<p>No users found.</p>";
        return;
    }
    users.forEach(user => {
        const userDiv = document.createElement("div");
        userDiv.className = "pending-user";
        const statusText = user.status ? ` (${user.status})` : "";
        const approveButton = user.status === "pending" ? `<button onclick="approveUser('${user.id}')">Approve</button>` : "";
        const declineButton = user.status === "pending" ? `<button class="decline-btn" onclick="declineUser('${user.id}')">Decline</button>` : "";
        const removeButton = `<button onclick="removeUser('${user.id}')">Remove</button>`;
        userDiv.innerHTML = `
            <div class="user-info">
                <div class="info-line"><strong>Name:</strong> ${user.fullName || 'N/A'}</div>
                <div class="info-line"><strong>Email:</strong> ${user.email}</div>
                <div class="info-line"><strong>Status:</strong> ${user.status || 'N/A'}</div>
            </div>
            <div class="user-actions">
                ${approveButton}
                ${declineButton}
                ${removeButton}
            </div>
        `;
        userList.appendChild(userDiv);
    });
}



// Function to generate and show report
async function showReport() {
    const startDate = document.getElementById("start-date").value;
    const endDate = document.getElementById("end-date").value;

    if (!startDate || !endDate) {
        alert("Please select both start and end dates.");
        return;
    }

    try {
        // Fetch timers
        const startTimestamp = new Date(startDate);
        const endTimestamp = new Date(endDate);
        endTimestamp.setHours(23, 59, 59, 999); // Set to end of day
        const q = query(collection(db, "timers"), where("createdAt", ">=", startTimestamp), where("createdAt", "<=", endTimestamp));
        const querySnapshot = await getDocs(q);
        const timers = [];
        querySnapshot.forEach((doc) => {
            timers.push({ id: doc.id, ...doc.data() });
        });

        // Fetch timer actions for the same date range
        const actionsQuery = query(collection(db, "timer_actions"), where("timestamp", ">=", startTimestamp), where("timestamp", "<=", endTimestamp));
        const actionsSnapshot = await getDocs(actionsQuery);
        const actions = [];
        actionsSnapshot.forEach((doc) => {
            actions.push({ id: doc.id, ...doc.data() });
        });

        // Generate report content
        const reportContent = generateReportContent(timers, actions, startDate, endDate);
        document.getElementById("report-content").innerHTML = reportContent;
        document.getElementById("report-display").style.display = "block";
        // Make download buttons smaller
        document.querySelector(".report-download-buttons").classList.add("small-buttons");
    } catch (error) {
        console.error("Error generating report:", error);
        alert("Error generating report.");
    }
}

// Function to generate HTML content for the report
function generateReportContent(timers, actions, startDate, endDate) {
    if (timers.length === 0) {
        return "<p>No timer data found for the selected date range.</p>";
    }

    // Group actions by timerId
    const actionsByTimer = {};
    actions.forEach(action => {
        if (!actionsByTimer[action.timerId]) {
            actionsByTimer[action.timerId] = [];
        }
        actionsByTimer[action.timerId].push(action.action);
    });

    // Count pauses, resets, and get last change_time
    const actionsCountByTimer = {};
    for (const timerId in actionsByTimer) {
        const actions = actionsByTimer[timerId];
        // Sort actions by timestamp descending to get latest, handling undefined timestamps
        actions.sort((a, b) => {
            const aTime = a.timestamp ? a.timestamp.toDate().getTime() : 0;
            const bTime = b.timestamp ? b.timestamp.toDate().getTime() : 0;
            return bTime - aTime;
        });
        const lastChangeTimeAction = actions.find(a => a.action === 'change_time');
        const lastChangeTime = lastChangeTimeAction ? lastChangeTimeAction.newTime : null;
        actionsCountByTimer[timerId] = {
            pause: actions.filter(a => a === 'pause').length,
            reset: actions.filter(a => a === 'reset').length,
            lastChangeTime: lastChangeTime
        };
    }

    let html = `
        <h3>Report from ${startDate} to ${endDate}</h3>
        <p>Total Timers: ${timers.length}</p>
        <table class="report-table">
            <thead>
                <tr>
                    <th>Receipt Number</th>
                    <th>Customer Name</th>
                    <th>Description</th>
                    <th>Time</th>
                    <th>Actual Time</th>
                    <th>Date Created</th>
                    <th>Started Time</th>
                    <th>Ended Time</th>
                    <th>Number of Pauses</th>
                    <th>Number of Resets</th>
                </tr>
            </thead>
            <tbody>
    `;

    timers.forEach(timer => {
        const date = timer.createdAt ? new Date(timer.createdAt.seconds * 1000).toLocaleDateString() : "N/A";
        const timerActions = actionsCountByTimer[timer.id] || { pause: 0, reset: 0, lastChangeTime: null };
        const paused = timerActions.pause;
        const reset = timerActions.reset;
        const lastChangeTime = timerActions.lastChangeTime;
        const customerName = timer.customerName || "N/A";
        const description = timer.description || "N/A";
        const receiptNumber = timer.receiptNumber || "N/A";

        // Calculate started time
        let startedTime = "N/A";
        if (timer.startTime) {
            const startDate = timer.startTime.toDate ? timer.startTime.toDate() : new Date(timer.startTime);
            startedTime = startDate.toLocaleTimeString();
        }

        // Calculate ended time
        let endedTime = "N/A";
        if (timer.startTime && timer.time !== undefined && timer.time < START_TIME) {
            const startDate = timer.startTime.toDate ? timer.startTime.toDate() : new Date(timer.startTime);
            const elapsed = START_TIME - timer.time;
            const endDate = new Date(startDate.getTime() + elapsed * 1000);
            endedTime = endDate.toLocaleTimeString();
        }

        // Calculate actual time (use change timer input if available, else elapsed time)
        let actualTime = "N/A";
        if (lastChangeTime !== null) {
            const minutes = Math.floor(lastChangeTime / 60);
            actualTime = `${minutes} mins`;
        } else if (timer.time !== undefined) {
            actualTime = formatTime(START_TIME - timer.time);
        }

        html += `
            <tr>
                <td>${receiptNumber}</td>
                <td>${customerName}</td>
                <td>${description}</td>
                <td>${timer.time || "N/A"}</td>
                <td>${actualTime}</td>
                <td>${date}</td>
                <td>${startedTime}</td>
                <td>${endedTime}</td>
                <td>${paused}</td>
                <td>${reset}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    return html;
}

// Function to export report as PDF
function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const startDate = document.getElementById("start-date").value;
    const endDate = document.getElementById("end-date").value;

    // Add title
    doc.setFontSize(16);
    doc.text(`Playhouse Timer Report - ${startDate} to ${endDate}`, 20, 20);

    // Get table data
    const table = document.querySelector("#report-content table");
    if (table) {
        const rows = table.querySelectorAll("tr");
        let y = 40;
        rows.forEach((row, index) => {
            const cells = row.querySelectorAll("td, th");
            let x = 20;
            cells.forEach(cell => {
                // Set font size for headers
                if (index === 0) {
                    doc.setFontSize(12);
                    doc.setFont("helvetica", "bold");
                } else {
                    doc.setFontSize(10);
                    doc.setFont("helvetica", "normal");
                }
                doc.text(cell.textContent, x, y);
                x += 40; // Adjust column width
            });
            y += 10;
            if (y > 270) { // Add new page if needed
                doc.addPage();
                y = 20;
            }
        });
    }

    doc.save(`playhouse-timer-report-${startDate}-to-${endDate}.pdf`);
}

// Function to export report as Excel
function exportExcel() {
    const startDate = document.getElementById("start-date").value;
    const endDate = document.getElementById("end-date").value;

    // Get table data
    const table = document.querySelector("#report-content table");
    if (!table) {
        alert("No report data to export.");
        return;
    }

    const data = [];
    // Add title row
    data.push([`Playhouse Timer Report - ${startDate} to ${endDate}`]);
    data.push([]); // Blank row

    const rows = table.querySelectorAll("tr");
    rows.forEach(row => {
        const rowData = [];
        const cells = row.querySelectorAll("td, th");
        cells.forEach(cell => {
            rowData.push(cell.textContent);
        });
        data.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `playhouse-timer-report-${startDate}-to-${endDate}.xlsx`);
}

// Function to clear the report
function clearReport() {
    document.getElementById("report-display").style.display = "none";
    document.getElementById("report-content").innerHTML = "";
    document.getElementById("start-date").value = "";
    document.getElementById("end-date").value = "";
}

// Function to load and display chart
async function loadChart(period = 'daily') {
    try {
        const q = collection(db, "timers");
        const querySnapshot = await getDocs(q);
        const timers = [];
        querySnapshot.forEach((doc) => {
            timers.push({ id: doc.id, ...doc.data() });
        });

        let startDate, groupBy, labelFormat, chartLabel;

        switch (period) {
            case 'daily':
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 30);
                groupBy = 'day';
                labelFormat = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                chartLabel = 'Daily Total Time (seconds)';
                break;
            case 'weekly':
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 90); // 12 weeks
                groupBy = 'week';
                labelFormat = (date) => `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                chartLabel = 'Weekly Total Time (seconds)';
                break;
            case 'monthly':
                startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 12); // 12 months
                groupBy = 'month';
                labelFormat = (date) => date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                chartLabel = 'Monthly Total Time (seconds)';
                break;
            default:
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 30);
                groupBy = 'day';
                labelFormat = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                chartLabel = 'Daily Total Time (seconds)';
        }

        // Process data for chart
        const totals = {};

        timers.forEach(timer => {
            if (timer.createdAt && timer.createdAt.seconds) {
                const date = new Date(timer.createdAt.seconds * 1000);
                if (date >= startDate) {
                    let key;
                    if (groupBy === 'day') {
                        key = date.toISOString().split('T')[0]; // YYYY-MM-DD
                    } else if (groupBy === 'week') {
                        const weekStart = new Date(date);
                        weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
                        key = weekStart.toISOString().split('T')[0];
                    } else if (groupBy === 'month') {
                        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
                    }
                    const time = parseFloat(timer.time) || 0;
                    totals[key] = (totals[key] || 0) + time;
                }
            }
        });

        // Sort keys and prepare data
        const sortedKeys = Object.keys(totals).sort();
        const labels = sortedKeys.map(key => {
            const date = new Date(key + (groupBy === 'month' ? '-01' : ''));
            return labelFormat(date);
        });
        const data = sortedKeys.map(key => totals[key]);

        // Destroy existing chart if it exists
        const existingChart = Chart.getChart('timerChart');
        if (existingChart) {
            existingChart.destroy();
        }

        // Create chart
        const ctx = document.getElementById('timerChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: chartLabel,
                    data: data,
                    backgroundColor: 'rgba(232, 76, 76, 0.1)',
                    borderColor: 'rgba(232, 76, 76, 1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: 'rgba(232, 76, 76, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            color: '#f0f0f0'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#f0f0f0',
                        bodyColor: '#f0f0f0'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#f0f0f0'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#f0f0f0'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

    } catch (error) {
        console.error("Error loading chart:", error);
        alert("Error loading chart.");
    }
}

// Make functions global for onclick
window.loadAllUsers = loadAllUsers;
window.approveUser = approveUser;
window.declineUser = declineUser;
window.removeUser = removeUser;
window.showReport = showReport;
window.exportPDF = exportPDF;
window.exportExcel = exportExcel;
window.clearReport = clearReport;
window.loadChart = loadChart;



// Initialize
loadAllUsers();
