// File: app.js
// Version: V1.13
// Changes: Ensured `maxSlots` enforces a minimum value of 1 so that completely empty weeks will still output an empty body row to sync with the CSS minmax(65px) row constraints.

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
let editRelatedEvents = [];

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

    document.getElementById('edit-start-date').addEventListener('change', function() {
        updateRelatedEventsFromDOM();
        renderEditStats(this.value, document.getElementById('edit-end-date').value);
    });
    document.getElementById('edit-end-date').addEventListener('change', function() {
        updateRelatedEventsFromDOM();
        renderEditStats(document.getElementById('edit-start-date').value, this.value);
    });
}

// File Processing
function handleFile(file) {
    if (!projectNumber) return alert("Please add a project number to the URL.");

    setStatus('Parsing file...');
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
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
        
        if (dateVal instanceof Date) {
            const yyyy = dateVal.getUTCFullYear();
            const mm = String(dateVal.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(dateVal.getUTCDate()).padStart(2, '0');
            dateStr = `${yyyy}-${mm}-${dd}`;
        } else {
            const d = new Date(dateVal);
            if (!isNaN(d)) {
                dateStr = formatDateObj(d);
            } else {
                continue; 
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
    eventsData.sort((a, b) => new Date(a.date) - new Date(b.date));
}

// ADD Modal Logic
function openAddModal() {
    if (!projectNumber) return alert("Please add a ?project=XYZ variable to your URL to begin working.");

    document.getElementById('add-start-date').value = '';
    document.getElementById('add-end-date').value = '';
    document.getElementById('add-name').value = '';
    document.getElementById('add-invited').value = 0;
    document.getElementById('add-accepted').value = 0;
    document.getElementById('add-notes').value = '';
    
    modalOverlay.classList.remove('hidden');
    addModal.classList.remove('hidden');
    editModal.classList.add('hidden');
}

function saveNewEvent() {
    const startVal = document.getElementById('add-start-date').value;
    const endVal = document.getElementById('add-end-date').value;
    const name = document.getElementById('add-name').value.trim();
    const notes = document.getElementById('add-notes').value.trim();
    
    if (!name || !startVal) return alert("Event Name and Start Date are required.");

    let start = new Date(startVal + 'T00:00:00');
    let end = endVal ? new Date(endVal + 'T00:00:00') : new Date(start);
    if (end < start) end = new Date(start); 

    let current = new Date(start);
    const invited = parseInt(document.getElementById('add-invited').value) || 0;
    const accepted = parseInt(document.getElementById('add-accepted').value) || 0;

    while (current <= end) {
        if (current.getDay() !== 0) { 
            eventsData.push({
                id: generateId(), 
                name: name, 
                date: formatDateObj(current),
                invited: invited, 
                accepted: accepted, 
                notes: notes
            });
        }
        current.setDate(current.getDate() + 1);
    }

    eventsData.sort((a, b) => new Date(a.date) - new Date(b.date));
    closeModals(); renderCalendar(); saveToDatabase();
}

// EDIT Modal Logic
function openEditModal(eventId) {
    const ev = eventsData.find(e => e.id === eventId);
    if (!ev) return;

    document.getElementById('edit-title').innerText = ev.name;
    document.getElementById('edit-old-name').value = ev.name;
    document.getElementById('edit-notes').value = ev.notes || '';
    
    editRelatedEvents = eventsData.filter(e => e.name === ev.name).sort((a,b) => new Date(a.date) - new Date(b.date));
    
    let startStr = editRelatedEvents[0].date;
    let endStr = editRelatedEvents[editRelatedEvents.length - 1].date;
    
    document.getElementById('edit-start-date').value = startStr;
    document.getElementById('edit-end-date').value = endStr;
    
    renderEditStats(startStr, endStr);

    modalOverlay.classList.remove('hidden');
    editModal.classList.remove('hidden');
    addModal.classList.add('hidden');
}

function renderEditStats(startStr, endStr) {
    const container = document.getElementById('edit-daily-stats');
    container.innerHTML = '';
    
    if (!startStr) return;
    
    let start = new Date(startStr + 'T00:00:00');
    let end = endStr ? new Date(endStr + 'T00:00:00') : new Date(start);
    if (end < start) end = new Date(start);
    
    let current = new Date(start);
    while (current <= end) {
        if (current.getDay() !== 0) {
            let dStr = formatDateObj(current);
            let existing = editRelatedEvents.find(e => e.date === dStr);
            let inv = existing ? existing.invited : 0;
            let acc = existing ? existing.accepted : 0;
            
            container.innerHTML += `
                <div class="form-row daily-stat-row" data-date="${dStr}">
                    <div class="stat-date-label">${current.getMonth()+1}/${current.getDate()}</div>
                    <div class="form-group" style="flex-direction: row; align-items: center; gap: 5px;">
                        <label>I:</label>
                        <input type="number" class="edit-inv-input" value="${inv}" min="0" style="padding: 5px;">
                    </div>
                    <div class="form-group" style="flex-direction: row; align-items: center; gap: 5px;">
                        <label>A:</label>
                        <input type="number" class="edit-acc-input" value="${acc}" min="0" style="padding: 5px;">
                    </div>
                </div>
            `;
        }
        current.setDate(current.getDate() + 1);
    }
}

function updateRelatedEventsFromDOM() {
    const rows = document.querySelectorAll('.daily-stat-row');
    rows.forEach(row => {
        let dStr = row.getAttribute('data-date');
        let inv = parseInt(row.querySelector('.edit-inv-input').value) || 0;
        let acc = parseInt(row.querySelector('.edit-acc-input').value) || 0;
        
        let existing = editRelatedEvents.find(e => e.date === dStr);
        if (existing) {
            existing.invited = inv;
            existing.accepted = acc;
        } else {
            editRelatedEvents.push({ date: dStr, invited: inv, accepted: acc });
        }
    });
}

function saveEditedEvent() {
    const oldName = document.getElementById('edit-old-name').value;
    const newNotes = document.getElementById('edit-notes').value.trim();
    
    updateRelatedEventsFromDOM(); 
    
    eventsData = eventsData.filter(e => e.name !== oldName);
    
    const startStr = document.getElementById('edit-start-date').value;
    const endStr = document.getElementById('edit-end-date').value;
    
    let start = new Date(startStr + 'T00:00:00');
    let end = endStr ? new Date(endStr + 'T00:00:00') : new Date(start);
    if (end < start) end = new Date(start);
    
    let current = new Date(start);
    while (current <= end) {
        if (current.getDay() !== 0) {
            let dStr = formatDateObj(current);
            let stat = editRelatedEvents.find(e => e.date === dStr);
            
            eventsData.push({
                id: generateId(),
                name: oldName,
                date: dStr,
                invited: stat ? stat.invited : 0,
                accepted: stat ? stat.accepted : 0,
                notes: newNotes
            });
        }
        current.setDate(current.getDate() + 1);
    }
    
    eventsData.sort((a, b) => new Date(a.date) - new Date(b.date));
    closeModals(); renderCalendar(); saveToDatabase();
}

function closeModals() {
    modalOverlay.classList.add('hidden');
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
    const gridHeaders = document.querySelector('.grid-headers');
    gridHeaders.innerHTML = '';
    
    if (eventsData.length === 0) { 
        projectDateRange.innerText = "No events scheduled."; 
        return; 
    }
    eventsData.forEach(ev => { if(!ev.id) ev.id = generateId(); });

    const hasMondayEvents = eventsData.some(e => new Date(e.date + 'T00:00:00').getDay() === 1);
    const colCount = hasMondayEvents ? 6 : 5;
    document.documentElement.style.setProperty('--col-count', colCount);
    
    if (hasMondayEvents) gridHeaders.innerHTML += `<div class="day-label">Mon</div>`;
    gridHeaders.innerHTML += `
        <div class="day-label">Tue</div><div class="day-label">Wed</div>
        <div class="day-label">Thu</div><div class="day-label">Fri</div><div class="day-label">Sat</div>
    `;

    let minDate = new Date(eventsData[0].date + 'T00:00:00');
    let maxDate = new Date(eventsData[eventsData.length - 1].date + 'T00:00:00');

    let today = new Date();
    today.setHours(0,0,0,0);
    let todayStr = formatDateObj(today);
    let startOfTodayWeek = getStartOfWeek(today);
    
    let startOfGrid = getStartOfWeek(minDate);
    let endOfGridWeek = getStartOfWeek(maxDate);
    endOfGridWeek.setDate(endOfGridWeek.getDate() + 5); 

    let showLookAhead = false;
    let msDiff = startOfTodayWeek.getTime() - startOfGrid.getTime();
    let weeksDiff = Math.floor(msDiff / (7 * 86400000));

    if ((weeksDiff >= -4) && startOfTodayWeek <= getStartOfWeek(maxDate)) {
        showLookAhead = true;
        if (startOfTodayWeek < startOfGrid) {
            startOfGrid = new Date(startOfTodayWeek);
        }
        let minLookAheadEnd = new Date(startOfTodayWeek);
        minLookAheadEnd.setDate(minLookAheadEnd.getDate() + 27); 
        if (endOfGridWeek < minLookAheadEnd) {
            endOfGridWeek = new Date(minLookAheadEnd);
        }
    }

    projectDateRange.innerText = `${minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    let currentLoopDate = new Date(startOfGrid);
    const palette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FDCB6E', '#6C5CE7', '#fd79a8', '#00b894', '#e17055'];
    
    let htmlStr = '';
    let inLookAhead = false;
    let lookAheadCounter = 0;

    while (currentLoopDate <= endOfGridWeek || (inLookAhead && lookAheadCounter < 4)) {
        let weekDates = [];
        for(let i = 0; i < 6; i++) {
            let d = new Date(currentLoopDate);
            d.setDate(d.getDate() + i);
            weekDates.push(formatDateObj(d));
        }

        if (showLookAhead && currentLoopDate.getTime() === startOfTodayWeek.getTime()) {
            htmlStr += `
                <div class="look-ahead-wrapper" id="current-week-scroll-target">
                    <div class="look-ahead-title">3-Week Look Ahead</div>
            `;
            inLookAhead = true;
            lookAheadCounter = 0;
        }

        let weekEvents = eventsData.filter(ev => weekDates.includes(ev.date));
        let uniqueNames = [...new Set(weekEvents.map(e => e.name))];
        
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

        eventBlocks.sort((a, b) => {
            if (a.startCol !== b.startCol) return a.startCol - b.startCol;
            return b.span - a.span; 
        });

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
        
        // FIX: Ensure maxSlots is always at least 1, so the empty event row body is always rendered 
        let maxSlots = Math.max(slotsOccupied.length, 1);
        let weekHtml = `<div class="week-container">`;

        // Render Backgrounds and Headers
        for (let i = 0; i < 6; i++) {
            if (!hasMondayEvents && i === 0) continue;
            let gridCol = hasMondayEvents ? i + 1 : i; 
            
            let dateStr = weekDates[i];
            let d = new Date(currentLoopDate); d.setDate(d.getDate() + i);
            let isDayEmpty = !weekEvents.some(e => e.date === dateStr);
            let isToday = (dateStr === todayStr);
            let bgClasses = `day-bg ${isDayEmpty && !isToday ? 'dimmed-empty' : ''} ${isToday ? 'today-highlight' : ''}`;
            
            let dayTotals = weekEvents.filter(e => e.date === dateStr).reduce((acc, ev) => {
                acc.invited += ev.invited; acc.accepted += ev.accepted; return acc;
            }, { invited: 0, accepted: 0 });

            // Using maxSlots + 1 guarantees it always covers the header and the empty body
            weekHtml += `<div class="${bgClasses}" style="grid-column: ${gridCol}; grid-row: 1 / span ${maxSlots + 1};"></div>`;
            
            weekHtml += `
                <div class="cell-header" style="grid-column: ${gridCol}; grid-row: 1;">
                    <div class="header-left-col"><span>${d.getMonth() + 1}/${d.getDate()}</span></div>
                    ${isDayEmpty ? '' : `<div class="header-totals"><span class="stat-circle accepted-circle">${dayTotals.accepted}</span><span class="stat-divider">/</span><span class="stat-circle invited-circle">${dayTotals.invited}</span></div>`}
                </div>
            `;
        }

        // Render Event Blocks
        eventBlocks.forEach(block => {
            let colorIdx = uniqueNames.indexOf(block.name);
            let styleColor = palette[colorIdx % palette.length];
            let isMulti = block.span > 1;
            let gridCol = hasMondayEvents ? block.startCol + 1 : block.startCol;
            
            let cardStyle = `grid-column: ${gridCol} / span ${block.span}; grid-row: ${block.slot + 2}; border-left-color: ${styleColor};`;
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
        htmlStr += weekHtml;

        if (inLookAhead) {
            lookAheadCounter++;
            if (lookAheadCounter === 4) {
                htmlStr += `</div>`;
                inLookAhead = false;
            }
        }

        currentLoopDate.setDate(currentLoopDate.getDate() + 7);
    }
    
    if (inLookAhead) htmlStr += `</div>`;

    calendarGrid.innerHTML = htmlStr;

    if (showLookAhead) {
        setTimeout(() => {
            const target = document.getElementById('current-week-scroll-target');
            if (target) {
                const y = target.getBoundingClientRect().top + window.scrollY - 150; 
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        }, 100);
    }
}

init();
