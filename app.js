// Version: V1.2
// Changes: Changed payload structure to include a lastUpdated timestamp. Refactored grid rendering to calculate absolute start/end weeks of the project, generating a scrollable 6-column grid (skipping Sundays). Applied proper flex alignment for headers and event totals.

// Config
const API_URL = 'https://script.google.com/macros/s/AKfycbzhUX2KFFXNDpci0XFgNie4fpqaEjmgqISeff2vNecXvySEmcA4nVjZ_E4R7WoGs4GVEw/exec';

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const statusIndicator = document.getElementById('status-indicator');
const lastUpdatedLabel = document.getElementById('last-updated');
const projectTitle = document.getElementById('project-title');
const projectDateRange = document.getElementById('project-date-range');
const calendarGrid = document.getElementById('calendar-grid');

// State
let eventsData = [];
let lastUpdatedDate = "";
let projectNumber = null;

// Initialize
function init() {
    setupEventListeners();
    extractProjectNumber();

    if (projectNumber) {
        projectTitle.innerText = `Project: ${projectNumber}`;
        fetchDatabaseData();
    } else {
        projectTitle.innerText = `No Project Selected`;
        projectDateRange.innerText = "";
        setStatus('Add ?project=XYZ to the URL.', 'error');
        renderCalendar();
    }
}

// Extract URL Parameter
function extractProjectNumber() {
    const params = new URLSearchParams(window.location.search);
    projectNumber = params.get('project');
}

function setStatus(msg, type = '') {
    statusIndicator.innerText = msg;
    statusIndicator.className = `status ${type}`;
}

// Database Communication (GET)
async function fetchDatabaseData() {
    setStatus('Loading project data...');
    try {
        const response = await fetch(`${API_URL}?project=${projectNumber}`);
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
            // Handle backwards compatibility if old array format vs new object format
            if (Array.isArray(result.data)) {
                eventsData = result.data;
                lastUpdatedDate = "Unknown";
            } else {
                eventsData = result.data.eventsData || [];
                lastUpdatedDate = result.data.lastUpdated || "Unknown";
            }

            if(eventsData.length > 0) {
                setStatus('Data loaded.', 'success');
                lastUpdatedLabel.innerText = `Last Updated: ${lastUpdatedDate}`;
            } else {
                setStatus('No events found. Upload a file.', '');
            }
        } else {
            setStatus('No data found for this project.', '');
        }
        renderCalendar();
    } catch (error) {
        console.error('Fetch Error:', error);
        setStatus('Error loading database.', 'error');
        renderCalendar();
    }
}

// Database Communication (POST)
async function saveToDatabase() {
    if (!projectNumber) return;
    setStatus('Saving to database...');
    
    // Format current date for Last Updated
    const now = new Date();
    lastUpdatedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear().toString().slice(-2)}`;
    
    const payload = {
        lastUpdated: lastUpdatedDate,
        eventsData: eventsData
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                projectNumber: projectNumber,
                eventsData: payload // Sending object instead of raw array
            })
        });
        
        const result = await response.json();
        if (result.status === 'success') {
            setStatus('Data saved.', 'success');
            lastUpdatedLabel.innerText = `Last Updated: ${lastUpdatedDate}`;
        } else {
            setStatus(`Save Error`, 'error');
        }
    } catch (error) {
        console.error('Save Error:', error);
        setStatus('Failed to save to database.', 'error');
    }
}

// Event Listeners
function setupEventListeners() {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });
}

// File Processing
function handleFile(file) {
    if (!projectNumber) {
        alert("Please add a project number to the URL (e.g., ?project=123) before uploading.");
        return;
    }

    setStatus('Parsing file...');
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        processData(json);
        
        renderCalendar();
        saveToDatabase();
    };
    reader.readAsArrayBuffer(file);
}

function processData(data) {
    eventsData = [];
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const eventName = row[3];
        let dateVal = row[4];
        const invited = parseInt(row[6]) || 0;
        const accepted = parseInt(row[7]) || 0;

        if (!eventName || !dateVal) continue;

        let dateStr = "";
        if (typeof dateVal === 'number') {
            const dateObj = new Date((dateVal - (25569 + 1)) * 86400 * 1000); 
            dateStr = formatDateObj(dateObj);
        } else {
            dateStr = dateVal.toString().split(' ')[0];
        }

        eventsData.push({
            name: eventName,
            date: dateStr,
            invited: invited,
            accepted: accepted
        });
    }
}

// Utility formatting
function formatDateObj(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Get the Monday of a given date's week
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
}

// Main Rendering Logic
function renderCalendar() {
    calendarGrid.innerHTML = '';
    
    if (eventsData.length === 0) {
        projectDateRange.innerText = "No events scheduled.";
        return;
    }

    // Find chronological start and end
    let minDate = new Date(eventsData[0].date + 'T00:00:00');
    let maxDate = new Date(eventsData[0].date + 'T00:00:00');

    eventsData.forEach(ev => {
        const d = new Date(ev.date + 'T00:00:00');
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
    });

    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    projectDateRange.innerText = `${minDate.toLocaleDateString('en-US', options)} - ${maxDate.toLocaleDateString('en-US', options)}`;

    // Establish Grid boundaries (Start on Monday of first event, end on Saturday of last event)
    const startOfGrid = getStartOfWeek(minDate);
    const endOfGridWeek = getStartOfWeek(maxDate);
    endOfGridWeek.setDate(endOfGridWeek.getDate() + 5); // Saturday of the last week

    let currentLoopDate = new Date(startOfGrid);

    while (currentLoopDate <= endOfGridWeek) {
        // Skip Sundays
        if (currentLoopDate.getDay() === 0) {
            currentLoopDate.setDate(currentLoopDate.getDate() + 1);
            continue;
        }

        const dateString = formatDateObj(currentLoopDate);
        const dayEvents = eventsData.filter(event => event.date === dateString);
        
        const isMonday = currentLoopDate.getDay() === 1;
        const isSaturday = currentLoopDate.getDay() === 6;

        let totalInvited = 0;
        let totalAccepted = 0;
        let eventsHtml = '';

        dayEvents.forEach(ev => {
            totalInvited += ev.invited;
            totalAccepted += ev.accepted;
            
            eventsHtml += `
                <div class="event-card">
                    <div class="event-name">${ev.name}</div>
                    <div class="event-stats">
                        <span class="stat-invited">I: ${ev.invited}</span>
                        <span class="stat-accepted">A: ${ev.accepted}</span>
                    </div>
                </div>
            `;
        });

        const cellDiv = document.createElement('div');
        // Apply classes for weekend styling and Monday opacity
        cellDiv.className = `day-cell ${isSaturday ? 'weekend' : ''} ${isMonday ? 'monday' : ''}`;
        
        const cellDateLabel = `${currentLoopDate.getMonth() + 1}/${currentLoopDate.getDate()}`;
        
        cellDiv.innerHTML = `
            <div class="cell-header">
                <span>${cellDateLabel}</span>
                <div class="header-totals">
                    <span class="stat-invited" title="Total Invited">I: ${totalInvited}</span>
                    <span class="stat-accepted" title="Total Accepted">A: ${totalAccepted}</span>
                </div>
            </div>
            <div class="cell-events">
                ${eventsHtml}
            </div>
        `;

        calendarGrid.appendChild(cellDiv);
        currentLoopDate.setDate(currentLoopDate.getDate() + 1);
    }
}

// Run init
init();
