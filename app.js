// File: app.js
// Version: V1.5
// Changes: Rewrote the renderCalendar() loop to chunk by weeks. Implemented slot assignment to visually align multi-day events across adjacent cards. Added dynamic colorization for multi-day events. Moved the [+] add button to a new footer div.

// Config
const API_URL = 'https://script.google.com/macros/s/AKfycbzhUX2KFFXNDpci0XFgNie4fpqaEjmgqISeff2vNecXvySEmcA4nVjZ_E4R7WoGs4GVEw/exec';

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const statusIndicator = document.getElementById('status-indicator');
const lastUpdatedLabel = document.getElementById('last-updated');
const projectDateRange = document.getElementById('project-date-range');
const calendarGrid = document.getElementById('calendar-grid');

// Modal Elements
const modalOverlay = document.getElementById('modal-overlay');
const addModal = document.getElementById('add-modal');
const editModal = document.getElementById('edit-modal');

// State
let eventsData = [];
let lastUpdatedDate = "";
let projectNumber = null;

// Initialize
function init() {
    setupEventListeners();
    extractProjectNumber();

    if (projectNumber) {
        fetchDatabaseData();
    } else {
        projectDateRange.innerText = `No Project Selected`;
        setStatus('Add ?project=XYZ to the URL.', 'error');
        renderCalendar();
    }
}

function extractProjectNumber() {
    const params = new URLSearchParams(window.location.search);
    projectNumber = params.get('project');
}

function setStatus(msg, type = '') {
    statusIndicator.innerText = msg;
    statusIndicator.className = `status ${type}`;
}

// Database Communication
async function fetchDatabaseData() {
    setStatus('Loading project data...');
    try {
        const response = await fetch(`${API_URL}?project=${projectNumber}`);
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
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

async function saveToDatabase() {
    if (!projectNumber) return;
    setStatus('Saving to database...');
    
    const now = new Date();
    lastUpdatedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear().toString().slice(-2)}`;
    
    const payload = {
        lastUpdated: lastUpdatedDate,
        totalEvents: eventsData.length,
        eventsData: eventsData
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ projectNumber: projectNumber, eventsData: payload })
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
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault(); dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });
}

// File Processing (UPSERT Logic)
function handleFile(file) {
    if (!projectNumber) {
        alert("Please add a project number to the URL.");
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

        const existingIndex = eventsData.findIndex(ev => ev.name === eventName && ev.date === dateStr);
        
        if (existingIndex > -1) {
            eventsData[existingIndex].invited = invited;
            eventsData[existingIndex].accepted = accepted;
        } else {
            eventsData.push({
                id: generateId(),
                name: eventName,
                date: dateStr,
                invited: invited,
                accepted: accepted,
                notes: ""
            });
        }
    }
}

// Modal Logic
function openAddModal(dateStr) {
    document.getElementById('add-date').value = dateStr;
    document.getElementById('add-name').value = '';
    document.getElementById('add-invited').value = 0;
    document.getElementById('add-accepted').value = 0;
    
    modalOverlay.classList.remove('hidden');
    addModal.classList.remove('hidden');
    editModal.classList.add('hidden');
}

function openEditModal(eventId) {
    const ev = eventsData.find(e => e.id === eventId);
    if (!ev) return;

    document.getElementById('edit-title').innerText = ev.name;
    document.getElementById('edit-id').value = ev.id;
    document.getElementById('edit-invited').value = ev.invited || 0;
    document.getElementById('edit-accepted').value = ev.accepted || 0;
    document.getElementById('edit-notes').value = ev.notes || '';

    modalOverlay.classList.remove('hidden');
    editModal.classList.remove('hidden');
    addModal.classList.add('hidden');
}

function closeModals() {
    modalOverlay.classList.add('hidden');
}

function saveNewEvent() {
    const date = document.getElementById('add-date').value;
    const name = document.getElementById('add-name').value.trim();
    const invited = parseInt(document.getElementById('add-invited').value) || 0;
    const accepted = parseInt(document.getElementById('add-accepted').value) || 0;

    if (!name) return alert("Event Name is required.");

    eventsData.push({
        id: generateId(),
        name: name,
        date: date,
        invited: invited,
        accepted: accepted,
        notes: ""
    });

    closeModals();
    renderCalendar();
    saveToDatabase();
}

function saveEditedEvent() {
    const id = document.getElementById('edit-id').value;
    const ev = eventsData.find(e => e.id === id);
    if (!ev) return;

    ev.invited = parseInt(document.getElementById('edit-invited').value) || 0;
    ev.accepted = parseInt(document.getElementById('edit-accepted').value) || 0;
    ev.notes = document.getElementById('edit-notes').value.trim();

    closeModals();
    renderCalendar();
    saveToDatabase();
}

// Utilities
function formatDateObj(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
}

// Render Logic
function renderCalendar() {
    calendarGrid.innerHTML = '';
    
    if (eventsData.length === 0) {
        projectDateRange.innerText = "No events scheduled.";
        return;
    }

    eventsData.forEach(ev => { if(!ev.id) ev.id = generateId(); });

    let minDate = new Date(eventsData[0].date + 'T00:00:00');
    let maxDate = new Date(eventsData[0].date + 'T00:00:00');

    eventsData.forEach(ev => {
        const d = new Date(ev.date + 'T00:00:00');
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
    });

    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    projectDateRange.innerText = `${minDate.toLocaleDateString('en-US', options)} - ${maxDate.toLocaleDateString('en-US', options)}`;

    const startOfGrid = getStartOfWeek(minDate);
    const endOfGridWeek = getStartOfWeek(maxDate);
    endOfGridWeek.setDate(endOfGridWeek.getDate() + 5); 

    let currentLoopDate = new Date(startOfGrid);
    
    // Palette for multi-day events
    const palette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FDCB6E', '#6C5CE7', '#fd79a8', '#00b894', '#e17055'];

    // Process week by week to align slots
    while (currentLoopDate <= endOfGridWeek) {
        
        // 1. Gather all dates for the current Mon-Sat week
        let weekDates = [];
        for(let i = 0; i < 6; i++) {
            let d = new Date(currentLoopDate);
            d.setDate(d.getDate() + i);
            weekDates.push(formatDateObj(d));
        }

        // 2. Extract this week's events
        let weekEvents = eventsData.filter(ev => weekDates.includes(ev.date));
        let isWeekEmpty = weekEvents.length === 0;

        // 3. Slot assignment logic for vertical alignment
        let uniqueEventNames = [...new Set(weekEvents.map(e => e.name))];
        
        uniqueEventNames.sort((a, b) => {
            let aDate = weekEvents.find(e => e.name === a).date;
            let bDate = weekEvents.find(e => e.name === b).date;
            if (aDate === bDate) return a.localeCompare(b);
            return aDate.localeCompare(bDate);
        });

        let eventStyling = {};
        uniqueEventNames.forEach((name, index) => {
            let occurrences = weekEvents.filter(e => e.name === name).length;
            let color = palette[index % palette.length];
            eventStyling[name] = {
                slot: index,
                isMulti: occurrences > 1,
                color: color
            };
        });

        let maxSlots = uniqueEventNames.length;

        // 4. Render the 6 days
        for(let i = 0; i < 6; i++) {
            let d = new Date(currentLoopDate);
            d.setDate(d.getDate() + i);
            const dateString = formatDateObj(d);
            const isMonday = d.getDay() === 1;
            const isSaturday = d.getDay() === 6;

            const dayEvents = weekEvents.filter(ev => ev.date === dateString);
            const isEmpty = dayEvents.length === 0;

            let totalInvited = 0;
            let totalAccepted = 0;
            let eventsHtml = '';

            if (!isWeekEmpty) {
                // Render assigned slots to maintain alignment across days
                for (let s = 0; s < maxSlots; s++) {
                    let ev = dayEvents.find(e => eventStyling[e.name].slot === s);
                    
                    if (ev) {
                        totalInvited += ev.invited;
                        totalAccepted += ev.accepted;
                        const hasNotes = ev.notes && ev.notes.trim().length > 0;
                        const style = eventStyling[ev.name];
                        
                        let cardStyle = '';
                        if (style.isMulti) {
                            // Assign border color and a 20% opacity background color (33 is hex for 20%)
                            cardStyle = `style="border-left-color: ${style.color}; background-color: ${style.color}33;"`;
                        }

                        eventsHtml += `
                            <div class="event-card ${hasNotes ? 'has-notes' : ''}" onclick="openEditModal('${ev.id}')" ${cardStyle}>
                                ${hasNotes ? `<span class="note-icon" title="${ev.notes}">📝</span>` : ''}
                                <div class="event-name">${ev.name}</div>
                                <div class="event-stats">
                                    <span class="stat-circle accepted-circle" title="Accepted">${ev.accepted}</span>
                                    <span class="stat-divider">/</span>
                                    <span class="stat-circle invited-circle" title="Invited">${ev.invited}</span>
                                </div>
                            </div>
                        `;
                    } else {
                        // Invisible placeholder to keep the grid slots perfectly aligned
                        eventsHtml += `
                            <div class="event-card" style="visibility: hidden; pointer-events: none;">
                                <div class="event-name">&nbsp;</div>
                                <div class="event-stats"><span class="stat-divider">&nbsp;</span></div>
                            </div>
                        `;
                    }
                }
            }

            const cellDiv = document.createElement('div');
            // Apply a 'collapsed' class if the entire week has 0 events
            cellDiv.className = `day-cell ${isSaturday ? 'weekend' : ''} ${(isMonday && isEmpty) ? 'dimmed-empty' : ''} ${isWeekEmpty ? 'collapsed' : ''}`;
            
            const cellDateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
            
            const totalsHtml = isEmpty ? '' : `
                <div class="header-totals">
                    <span class="stat-circle accepted-circle" title="Total Accepted">${totalAccepted}</span>
                    <span class="stat-divider">/</span>
                    <span class="stat-circle invited-circle" title="Total Invited">${totalInvited}</span>
                </div>
            `;

            cellDiv.innerHTML = `
                <div class="cell-header">
                    <div class="header-left-col">
                        <span>${cellDateLabel}</span>
                    </div>
                    ${totalsHtml}
                </div>
                <div class="cell-events">
                    ${eventsHtml}
                </div>
                <div class="cell-footer">
                    <button class="add-btn" onclick="openAddModal('${dateString}')" title="Add Event">+</button>
                </div>
            `;

            calendarGrid.appendChild(cellDiv);
        }

        // Jump exactly 7 days to the next Monday chunk
        currentLoopDate.setDate(currentLoopDate.getDate() + 7);
    }
}

// Run init
init();
