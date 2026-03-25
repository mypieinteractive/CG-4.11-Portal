// Version: V1.1
// Changes: Implemented GET and POST fetch requests to the Google Apps Script Web App for persistent data storage based on URL parameter. Altered grid generation to process a 42-day (6-week) array. Implemented automatic start-date calculation to display the week of the earliest chronological event upon loading.

// Config
const API_URL = 'https://script.google.com/macros/s/AKfycbzhUX2KFFXNDpci0XFgNie4fpqaEjmgqISeff2vNecXvySEmcA4nVjZ_E4R7WoGs4GVEw/exec';

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const statusIndicator = document.getElementById('status-indicator');
const projectTitle = document.getElementById('project-title');
const calendarGrid = document.getElementById('calendar-grid');
const currentPeriodLabel = document.getElementById('current-period-label');
const prevPeriodBtn = document.getElementById('prev-period');
const nextPeriodBtn = document.getElementById('next-period');

// State
let eventsData = [];
let currentDate = new Date();
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
    setStatus('Loading data from database...');
    try {
        const response = await fetch(`${API_URL}?project=${projectNumber}`);
        const result = await response.json();
        
        if (result.status === 'success' && result.data && result.data.length > 0) {
            eventsData = result.data;
            setStatus('Data loaded successfully.', 'success');
            setEarliestDate();
        } else {
            setStatus('No data found for this project. Upload a file.', '');
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
    try {
        // Send as text/plain to bypass Google Apps Script strict CORS preflight handling
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify({
                projectNumber: projectNumber,
                eventsData: eventsData
            })
        });
        
        const result = await response.json();
        if (result.status === 'success') {
            setStatus('Data saved and synced globally.', 'success');
        } else {
            setStatus(`Save Error: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Save Error:', error);
        setStatus('Failed to save to database.', 'error');
    }
}

// Set view to the earliest event
function setEarliestDate() {
    if (eventsData.length === 0) return;
    
    // Parse dates safely to avoid timezone day-shifting
    const earliest = eventsData.reduce((min, ev) => {
        const evDate = new Date(ev.date + 'T00:00:00');
        return evDate < min ? evDate : min;
    }, new Date(eventsData[0].date + 'T00:00:00'));
    
    currentDate = earliest;
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

    // Navigation jumps by 42 days (6 weeks)
    prevPeriodBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 42);
        renderCalendar();
    });
    nextPeriodBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() + 42);
        renderCalendar();
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
        
        // After processing, automatically jump to earliest date, render, and save
        setEarliestDate();
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

function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
}

// 6-Week Calendar Logic
function renderCalendar() {
    calendarGrid.innerHTML = '';
    const startOfFirstWeek = getStartOfWeek(currentDate);
    
    // Calculate end of the 6-week period (42 days later minus 1)
    const endOfPeriod = new Date(startOfFirstWeek);
    endOfPeriod.setDate(startOfFirstWeek.getDate() + 41); 

    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    currentPeriodLabel.innerText = `${startOfFirstWeek.toLocaleDateString('en-US', options)} - ${endOfPeriod.toLocaleDateString('en-US', options)}`;

    // Render 42 Cells (6 weeks x 7 days)
    for (let i = 0; i < 42; i++) {
        const colDate = new Date(startOfFirstWeek);
        colDate.setDate(startOfFirstWeek.getDate() + i);
        const dateString = formatDateObj(colDate);
        
        // Determine if weekend for styling
        const isWeekend = colDate.getDay() === 0 || colDate.getDay() === 6;

        const dayEvents = eventsData.filter(event => event.date === dateString);

        let totalInvited = 0;
        let totalAccepted = 0;
        let eventsHtml = '';

        dayEvents.forEach(ev => {
            totalInvited += ev.invited;
            totalAccepted += ev.accepted;
            
            eventsHtml += `
                <div class="event-card" title="${ev.name}">
                    <div class="event-name">${ev.name}</div>
                    <div class="event-stats">
                        <span class="stat-invited">Invited: ${ev.invited}</span>
                        <span class="stat-accepted">Accepted: ${ev.accepted}</span>
                    </div>
                </div>
            `;
        });

        const cellDiv = document.createElement('div');
        cellDiv.className = `day-cell ${isWeekend ? 'weekend' : ''}`;
        
        // Show month/day for the cell header
        const cellDateLabel = `${colDate.getMonth() + 1}/${colDate.getDate()}`;
        
        cellDiv.innerHTML = `
            <div class="cell-header">${cellDateLabel}</div>
            <div class="cell-events">
                ${eventsHtml}
            </div>
            <div class="cell-totals">
                <span class="stat-invited">I: ${totalInvited}</span>
                <span class="stat-accepted">A: ${totalAccepted}</span>
            </div>
        `;

        calendarGrid.appendChild(cellDiv);
    }
}

// Run init
init();
