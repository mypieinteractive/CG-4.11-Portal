// File: app.js
// Version: V1.8
// Changes: Simplified Excel date parsing by utilizing SheetJS's native { cellDates: true } configuration. This forces Excel serial numbers into standard JS Date objects. Extracted the date using UTC methods to prevent local timezone offsets from shifting the date backwards.

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
                // Ensure array is chronologically sorted on load
                eventsData.sort((a, b) => new Date(a.date) - new Date(b.date));
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

// File Processing
function handleFile(file) {
    if (!projectNumber) return alert("Please add a project number to the URL.");

    setStatus('Parsing file...');
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        
        // FIX: Added { cellDates: true } to force SheetJS to parse Excel serials natively into JS Date objects
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
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
        
        // FIX: Much simpler and more robust date extraction using native JS Date objects outputted by SheetJS
        if (dateVal instanceof Date) {
            // SheetJS creates the Date object in UTC. We use getUTC methods to avoid local timezone shifts entirely.
            const yyyy = dateVal.getUTCFullYear();
            const mm = String(dateVal.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(dateVal.getUTCDate()).padStart(2, '0');
            dateStr = `${yyyy}-${mm}-${dd}`;
        } else {
            // Fallback just in case the cell was formatted as plain text
            const d = new Date(dateVal);
            if (!isNaN(d)) {
                dateStr = formatDateObj(d);
            } else {
                continue; // Skip if date is completely unparseable
            }
        }

        const existingIndex = eventsData.findIndex(ev => ev.name === eventName && ev.date === dateStr);
        if (existingIndex > -1) {
            eventsData[existingIndex].invited = invited;
            eventsData[existingIndex].accepted = accepted;
        } else {
            eventsData.push({
                id: generateId(), name: eventName, date: dateStr,
                invited: invited, accepted: accepted, notes: ""
            });
        }
    }
    
    // Sort chronologically so calendar processes events cleanly regardless of spreadsheet order
    eventsData.sort((a, b) => new Date(a.date) - new Date(b.date));
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
    if (!name) return alert("Event Name is required.");

    eventsData.push({
        id: generateId(), name: name, date: date,
        invited: parseInt(document.getElementById('add-invited').value) || 0,
        accepted: parseInt(document.getElementById('add-accepted').value) || 0,
        notes: ""
    });

    closeModals(); renderCalendar(); saveToDatabase();
}

function saveEditedEvent() {
    const ev = eventsData.find(e => e.id === document.getElementById('edit-id').value);
    if (!ev) return;

    ev.invited = parseInt(document.getElementById('edit-invited').value) || 0;
    ev.accepted = parseInt(document.getElementById('edit-accepted').value) || 0;
    ev.notes = document.getElementById('edit-notes').value.trim();

    closeModals(); renderCalendar(); saveToDatabase();
}

// Utilities
function formatDateObj(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function generateId() { return '_' + Math.random().toString(36).substr(2, 9); }

function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); 
    return new Date(d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)));
}

// Render Logic
function renderCalendar() {
    calendarGrid.innerHTML = '';
    if (eventsData.length === 0) { projectDateRange.innerText = "No events scheduled."; return; }
    eventsData.forEach(ev => { if(!ev.id) ev.id = generateId(); });

    let minDate = new Date(eventsData[0].date + 'T00:00:00');
    let maxDate = new Date(eventsData[0].date + 'T00:00:00');

    eventsData.forEach(ev => {
        const d = new Date(ev.date + 'T00:00:00');
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
    });

    projectDateRange.innerText = `${minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const startOfGrid = getStartOfWeek(minDate);
    const endOfGridWeek = getStartOfWeek(maxDate);
    endOfGridWeek.setDate(endOfGridWeek.getDate() + 5); 

    let currentLoopDate = new Date(startOfGrid);
    const palette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FDCB6E', '#6C5CE7', '#fd79a8', '#00b894', '#e17055'];

    while (currentLoopDate <= endOfGridWeek) {
        let weekDates = [];
        for(let i = 0; i < 6; i++) {
            let d = new Date(currentLoopDate);
            d.setDate(d.getDate() + i);
            weekDates.push(formatDateObj(d));
        }

        let weekEvents = eventsData.filter(ev => weekDates.includes(ev.date));
        let uniqueNames = [...new Set(weekEvents.map(e => e.name))];
        
        // 1. Group contiguous days into Blocks
        let eventBlocks = [];
        uniqueNames.forEach(name => {
            let startCol = -1;
            let segments = [];
            for (let i = 0; i < 6; i++) {
                let ev = weekEvents.find(e => e.name === name && e.date === weekDates[i]);
                if (ev) {
                    if (startCol === -1) startCol = i;
                    segments.push(ev);
                } else {
                    if (startCol !== -1) {
                        eventBlocks.push({ name, startCol, span: segments.length, segments });
                        startCol = -1;
                        segments = [];
                    }
                }
            }
            if (startCol !== -1) eventBlocks.push({ name, startCol, span: segments.length, segments });
        });

        // 2. Sort to float shorter/earlier events up
        eventBlocks.sort((a, b) => {
            if (a.startCol !== b.startCol) return a.startCol - b.startCol;
            return b.span - a.span; 
        });

        // 3. Assign row slots
        let slotsOccupied = [];
        eventBlocks.forEach(block => {
            let row = 0;
            while (true) {
                if (!slotsOccupied[row]) slotsOccupied[row] = [];
                let canFit = true;
                for (let i = 0; i < block.span; i++) {
                    if (slotsOccupied[row][block.startCol + i]) { canFit = false; break; }
                }
                if (canFit) {
                    for (let i = 0; i < block.span; i++) { slotsOccupied[row][block.startCol + i] = true; }
                    block.slot = row;
                    break;
                }
                row++;
            }
        });
        
        let maxSlots = slotsOccupied.length;
        let weekHtml = `<div class="week-container">`;

        // 4. Render Day Backgrounds, Headers, and Footers
        for (let i = 0; i < 6; i++) {
            let dateStr = weekDates[i];
            let d = new Date(currentLoopDate); d.setDate(d.getDate() + i);
            let isDayEmpty = !weekEvents.some(e => e.date === dateStr);
            let bgClasses = `day-bg ${i === 5 ? 'weekend' : ''} ${(i === 0 && isDayEmpty) ? 'dimmed-empty' : ''}`;
            
            let dayTotals = weekEvents.filter(e => e.date === dateStr).reduce((acc, ev) => {
                acc.invited += ev.invited; acc.accepted += ev.accepted; return acc;
            }, { invited: 0, accepted: 0 });

            weekHtml += `<div class="${bgClasses}" style="grid-column: ${i + 1}; grid-row: 1 / span ${maxSlots + 2};"></div>`;
            
            weekHtml += `
                <div class="cell-header" style="grid-column: ${i + 1}; grid-row: 1;">
                    <div class="header-left-col"><span>${d.getMonth() + 1}/${d.getDate()}</span></div>
                    ${isDayEmpty ? '' : `<div class="header-totals"><span class="stat-circle accepted-circle">${dayTotals.accepted}</span><span class="stat-divider">/</span><span class="stat-circle invited-circle">${dayTotals.invited}</span></div>`}
                </div>
            `;
            
            weekHtml += `
                <div class="cell-footer" style="grid-column: ${i + 1}; grid-row: ${maxSlots + 2};">
                    <button class="add-btn" onclick="openAddModal('${dateStr}')" title="Add Event">+</button>
                </div>
            `;
        }

        // 5. Render Spanning Blocks over the Grid
        eventBlocks.forEach(block => {
            let colorIdx = uniqueNames.indexOf(block.name);
            let styleColor = palette[colorIdx % palette.length];
            let isMulti = block.span > 1;
            
            let cardStyle = `grid-column: ${block.startCol + 1} / span ${block.span}; grid-row: ${block.slot + 2}; border-left-color: ${styleColor};`;
            if (isMulti) cardStyle += ` border-right-color: ${styleColor}; background-color: ${styleColor}1A;`;
            
            let segmentsHtml = block.segments.map((ev, idx) => {
                const hasNotes = ev.notes && ev.notes.trim().length > 0;
                let segmentStyle = (isMulti && idx < block.span - 1) ? `border-right: 1px dashed rgba(255,255,255,0.15);` : '';
                
                return `
                    <div class="day-segment" style="${segmentStyle}" onclick="openEditModal('${ev.id}')">
                        ${hasNotes ? `<span class="note-icon" title="${ev.notes}">📝</span>` : ''}
                        <div class="event-name">${ev.name}</div>
                        <div class="event-stats">
                            <span class="stat-circle accepted-circle" title="Accepted">${ev.accepted}</span>
                            <span class="stat-divider">/</span>
                            <span class="stat-circle invited-circle" title="Invited">${ev.invited}</span>
                        </div>
                    </div>
                `;
            }).join('');

            weekHtml += `
                <div class="event-card spanning-event ${isMulti ? 'multi-day' : ''}" style="${cardStyle}">
                    <div style="display: grid; grid-template-columns: repeat(${block.span}, 1fr); gap: 5px; height: 100%;">
                        ${segmentsHtml}
                    </div>
                </div>
            `;
        });

        weekHtml += `</div>`;
        calendarGrid.insertAdjacentHTML('beforeend', weekHtml);
        currentLoopDate.setDate(currentLoopDate.getDate() + 7);
    }
}

init();
