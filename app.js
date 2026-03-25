// Version: V1.0
// Changes: Initial release of the Dashboard application incorporating SheetJS for XLSX parsing, state management for current week rendering, and data extraction from columns D, E, G, H.

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const dropText = document.getElementById('drop-text');
const calendarGrid = document.getElementById('calendar-grid');
const currentWeekLabel = document.getElementById('current-week-label');
const prevWeekBtn = document.getElementById('prev-week');
const nextWeekBtn = document.getElementById('next-week');

// State
let eventsData = [];
let currentDate = new Date(); // Defaults to today

// Initialize
function init() {
    setupEventListeners();
    renderCalendar();
}

// Event Listeners
function setupEventListeners() {
    // Dropzone events
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    // Navigation events
    prevWeekBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 7);
        renderCalendar();
    });
    nextWeekBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() + 7);
        renderCalendar();
    });
}

// File Processing
function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Parse raw arrays
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        processData(json);
        
        // UI updates after successful upload
        dropText.innerText = `Loaded: ${file.name} (Click to replace)`;
        dropzone.classList.add('collapsed');
    };
    reader.readAsArrayBuffer(file);
}

function processData(data) {
    eventsData = [];
    
    // Skip header row (index 0)
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        // Based on provided spec: D=3, E=4, G=6, H=7
        const eventName = row[3];
        let dateVal = row[4];
        const invited = parseInt(row[6]) || 0;
        const accepted = parseInt(row[7]) || 0;

        if (!eventName || !dateVal) continue;

        let dateStr = "";
        
        // Handle Excel numeric date serialization
        if (typeof dateVal === 'number') {
            const dateObj = new Date((dateVal - (25569 + 1)) * 86400 * 1000); 
            dateStr = formatDateObj(dateObj);
        } else {
            // Handle String format YYYY-MM-DD
            const parts = dateVal.toString().split(' ')[0];
            dateStr = parts;
        }

        eventsData.push({
            name: eventName,
            date: dateStr,
            invited: invited,
            accepted: accepted
        });
    }
    renderCalendar();
}

// Utility formatting
function formatDateObj(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Calendar Logic
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    return new Date(d.setDate(diff));
}

function renderCalendar() {
    calendarGrid.innerHTML = '';
    const startOfWeek = getStartOfWeek(currentDate);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    // Update label
    const options = { month: 'short', day: 'numeric' };
    currentWeekLabel.innerText = `${startOfWeek.toLocaleDateString('en-US', options)} - ${endOfWeek.toLocaleDateString('en-US', options)}`;

    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    // Render 7 columns
    for (let i = 0; i < 7; i++) {
        const colDate = new Date(startOfWeek);
        colDate.setDate(startOfWeek.getDate() + i);
        const dateString = formatDateObj(colDate);

        // Filter events for this day
        const dayEvents = eventsData.filter(event => event.date === dateString);

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
                        <span class="stat-invited">Inv: ${ev.invited}</span>
                        <span class="stat-accepted">Acc: ${ev.accepted}</span>
                    </div>
                </div>
            `;
        });

        // Construct Column
        const colDiv = document.createElement('div');
        colDiv.className = 'day-column';
        colDiv.innerHTML = `
            <div class="day-header">
                <div class="day-name">${daysOfWeek[i]}</div>
                <div class="day-date">${colDate.getDate()}</div>
            </div>
            <div class="events-container">
                ${eventsHtml}
            </div>
            <div class="day-totals">
                <span class="stat-invited">Tot: ${totalInvited}</span>
                <span class="stat-accepted">Tot: ${totalAccepted}</span>
            </div>
        `;

        calendarGrid.appendChild(colDiv);
    }
}

// Run init
init();
