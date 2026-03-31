// File: app.js
// Version: V2.26
// Changes: Fixed the premature return condition in renderCalendar() that caused Global View to blank out completely. Rewired the conditional structure so that minDate/maxDate null checks gracefully handle empty states without breaking the core global calendar frame.

// Config (Glide v2 API)
const GLIDE_APP_ID = 'uptC6TQ34oTPr2dizY5O';
const GLIDE_TABLE_ID = 'native-table-jl3zoddzYY6WxSA4YQZj';
const GLIDE_TOKEN = '77804d07-3b60-415c-a8f8-4f84f33b974a';

// DOM Elements
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const lastUpdatedLabel = document.getElementById('last-updated');
const projectDateRange = document.getElementById('project-date-range');
const calendarGrid = document.getElementById('calendar-grid');

// Modal Elements
const modalOverlay = document.getElementById('modal-overlay');
const addModal = document.getElementById('add-modal');
const editModal = document.getElementById('edit-modal');
const uploadModal = document.getElementById('global-upload-modal');
const dragOverlay = document.getElementById('global-drag-overlay');

// State
let eventsData = [];
let lastUpdatedDate = "";
let projectNumber = null;
let projectTitle = null;
let projectsList = [];
let projectRowIds = {}; 
let editRelatedEvents = [];
let isGlobalView = false;
let currentTypeFilter = "All";
let currentProjectFilter = "All";
let pendingUploadFile = null;
let dragCounter = 0;
let currentViewState = 'notes'; // 'notes', 'minimized', 'events'
let currentMainView = 'calendar'; // 'calendar', 'agenda'
let isMobileForce = false;

// Sleek Theme SVG Icons
const icons = {
    delivery: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`,
    inspection: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><polyline points="7 12.5 10 15.5 16 9.5"></polyline></svg>`,
    other: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`
};

// Initialize
function init() {
    extractProjectNumber();
    setupEventListeners();

    if (projectNumber) {
        if (String(projectNumber).toLowerCase().trim() === 'global') {
            isGlobalView = true;
            const mainTitleGroup = document.getElementById('main-title-group');
            if(mainTitleGroup) mainTitleGroup.style.display = 'none';
        }
        fetchDatabaseData();
    } else {
        projectDateRange.innerText = `No Project Selected`;
        setHeaderLoading(false);
    }
}

function extractProjectNumber() {
    const params = new URLSearchParams(window.location.search);
    projectNumber = params.get('project');
    
    // Check for explicit mobile framing
    if (params.has('mobile') || params.get('mobile') === 'true' || params.get('mobile') === '') {
        isMobileForce = true;
        currentMainView = 'agenda';
        document.body.classList.add('agenda-mode');
    }

    let extractedTitle = params.get('title');

    if (extractedTitle && window.location.hash) {
        extractedTitle += window.location.hash;
    }
    
    if (extractedTitle) {
        try { extractedTitle = decodeURIComponent(extractedTitle); } catch(e) {}
    }

    projectTitle = extractedTitle || projectNumber;
}

// Fade overlay safely without destroying DOM elements
function setHeaderLoading(isLoading) {
    const loader = document.getElementById('header-loader');
    const content = document.getElementById('header-content'); 
    
    if (isLoading) {
        if(loader) loader.style.display = 'flex';
        if(content) content.style.display = 'none';
        calendarGrid.innerHTML = ''; // Forces a redraw boundary
    } else {
        if(loader) loader.style.display = 'none';
        if(content) content.style.display = 'block';
    }
}

// Database Communication (Glide v2 API)
async function fetchDatabaseData() {
    setHeaderLoading(true);
    
    try {
        const response = await fetch('https://api.glideapp.io/api/function/queryTables', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GLIDE_TOKEN}`
            },
            body: JSON.stringify({
                appID: GLIDE_APP_ID,
                queries: [{ tableName: GLIDE_TABLE_ID }]
            })
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const result = await response.json();
        
        if (!result || !result[0]) {
            throw new Error("Invalid API Response");
        }

        const rows = result[0]?.rows || [];
        
        eventsData = [];
        projectsList = [];
        projectRowIds = {};
        
        rows.forEach(row => {
            let pid = row['$rowID']; 
            
            let pt = row['2UR8V'] || '';
            let address = row['Name'] || '';
            let citySt = row['8V1wO'] || '';
            
            let ptitle = `PT# ${pt}`;
            if (address) ptitle += ` - ${address}`;
            if (citySt) ptitle += `, ${citySt}`;
            if (!pt && !address && !citySt) ptitle = 'Unnamed Project';

            let rawJson = row['KYRQV']; 
            projectRowIds[pid] = pid; 

            if (!isGlobalView && String(pid) === String(projectNumber) && projectTitle && !pt && !address) {
                ptitle = projectTitle;
            }

            if (!projectsList.find(p => p.id === pid)) {
                projectsList.push({ id: pid, title: ptitle });
            }

            if (rawJson) {
                try {
                    let parsed = JSON.parse(rawJson);
                    let evs = Array.isArray(parsed) ? parsed : (parsed.eventsData || []);
                    
                    if (isGlobalView || String(pid).trim() === String(projectNumber).trim()) {
                        evs.forEach(ev => {
                            ev.projectId = pid;
                            ev.projectTitle = ptitle;
                            eventsData.push(ev);
                        });

                        if (!isGlobalView) {
                            lastUpdatedDate = parsed.lastUpdated || "";
                        }
                    }
                } catch(e) { console.error('JSON Parse Error for project', pid); }
            }
        });

        if (!isGlobalView && lastUpdatedDate) {
            document.getElementById('last-updated').innerText = `Last Import: ${lastUpdatedDate}`;
        } else {
            document.getElementById('last-updated').innerText = '';
        }

        if (!isGlobalView && !projectsList.find(p => p.id === projectNumber)) {
            projectsList.push({ id: projectNumber, title: projectTitle });
        }

        populateProjectDropdowns();

        if(eventsData.length > 0) {
            eventsData.sort((a, b) => new Date(a.date) - new Date(b.date));
        }
        
        setHeaderLoading(false);
        renderCalendar();
    } catch (error) {
        console.error('Fetch Error:', error);
        projectDateRange.innerText = "Error Loading Database";
        setHeaderLoading(false);
        renderCalendar();
    }
}

function populateProjectDropdowns() {
    const filter = document.getElementById('project-filter');
    const addSel = document.getElementById('add-project');
    const upSel = document.getElementById('upload-project-select');

    if(!filter) return;

    let opts = '';
    projectsList.forEach(p => {
        opts += `<option value="${p.id}">${p.title}</option>`;
    });

    if (isGlobalView) {
        filter.style.display = 'flex';
        filter.innerHTML = `<option value="All">All Projects</option>` + opts;
        if(addSel) addSel.innerHTML = opts;
        if(upSel) upSel.innerHTML = opts;
    }
}

async function saveToDatabase(targetId = projectNumber, targetTitle = projectTitle) {
    if (!targetId || targetId.toLowerCase() === 'global') return;
    
    setHeaderLoading(true);
    
    const now = new Date();
    const lastUpdatedStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear().toString().slice(-2)}`;
    
    const projectEvents = eventsData.filter(e => e.projectId === String(targetId));
    
    const cleanEvents = projectEvents.map(e => {
        const { projectId, projectTitle, ...rest } = e;
        return rest;
    });

    const payload = {
        lastUpdated: lastUpdatedStr,
        totalEvents: cleanEvents.length,
        eventsData: cleanEvents
    };

    const existingRowId = projectRowIds[String(targetId)];

    const mutation = {
        tableName: GLIDE_TABLE_ID,
        columnValues: {
            "KYRQV": JSON.stringify(payload),
            "ltptW": String(cleanEvents.length) 
        }
    };

    if (existingRowId) {
        mutation.kind = "set-columns-in-row";
        mutation.rowID = existingRowId;
    } else {
        mutation.kind = "add-row-to-table";
    }

    try {
        const response = await fetch('https://api.glideapp.io/api/function/mutateTables', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GLIDE_TOKEN}`
            },
            body: JSON.stringify({ 
                appID: GLIDE_APP_ID,
                mutations: [mutation]
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            if (!existingRowId && result[0]?.rowIDs?.length > 0) {
                projectRowIds[String(targetId)] = result[0].rowIDs[0];
            }
            if (!isGlobalView) {
                lastUpdatedDate = lastUpdatedStr;
                document.getElementById('last-updated').innerText = `Last Import: ${lastUpdatedDate}`;
            }
        } else {
            throw new Error('API Mutation Failed');
        }
        
        setHeaderLoading(false);
        renderCalendar(); // Redraw immediately so screen doesn't stay blank
    } catch (error) {
        console.error('Save Error:', error);
        setHeaderLoading(false);
        renderCalendar();
    }
}

// Event Listeners
function setupEventListeners() {
    
    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        dragOverlay.classList.remove('hidden');
        void dragOverlay.offsetWidth;
        dragOverlay.classList.add('active');
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault(); 
    });

    document.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter === 0) {
            dragOverlay.classList.remove('active');
            setTimeout(() => {
                if(dragCounter === 0) dragOverlay.classList.add('hidden');
            }, 200);
        }
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dragOverlay.classList.remove('active');
        dragOverlay.classList.add('hidden');
        
        if (e.dataTransfer.files.length) {
            if (isGlobalView) {
                pendingUploadFile = e.dataTransfer.files[0];
                openGlobalUploadModal();
            } else {
                handleFile(e.dataTransfer.files[0], projectNumber, projectTitle);
            }
        }
    });

    uploadBtn.addEventListener('click', () => {
        if (isGlobalView) {
            pendingUploadFile = null;
            openGlobalUploadModal();
        } else {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            let pId = isGlobalView ? document.getElementById('upload-project-select').value : projectNumber;
            let pTitle = projectsList.find(p => String(p.id) === String(pId))?.title || pId;
            handleFile(e.target.files[0], pId, pTitle);
            fileInput.value = ''; 
        }
    });

    const viewToggleBtn = document.getElementById('view-toggle-btn');
    if (viewToggleBtn) {
        if (isMobileForce) {
            viewToggleBtn.style.display = 'none';
        } else {
            viewToggleBtn.addEventListener('click', function() {
                currentMainView = currentMainView === 'calendar' ? 'agenda' : 'calendar';
                document.body.classList.toggle('agenda-mode', currentMainView === 'agenda');
                this.innerHTML = currentMainView === 'calendar' 
                    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg><span>Agenda</span>`
                    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg><span>Calendar</span>`;
                renderCalendar();
            });
        }
    }

    const statsToggleBtn = document.getElementById('stats-toggle-btn');
    if (statsToggleBtn) {
        statsToggleBtn.addEventListener('click', function() {
            calendarGrid.classList.toggle('hide-stats');
            const isHidden = calendarGrid.classList.contains('hide-stats');
            this.innerHTML = isHidden 
                ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg><span>Volunteers</span>`
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg><span>Volunteers</span>`;
        });
    }

    const collapseBtn = document.getElementById('collapse-btn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', function() {
            if (currentViewState === 'notes') {
                currentViewState = 'minimized';
                calendarGrid.classList.remove('view-events', 'view-notes');
                calendarGrid.classList.add('view-minimized');
                this.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> <span>Show Events</span>`;
            } else if (currentViewState === 'minimized') {
                currentViewState = 'events';
                calendarGrid.classList.remove('view-minimized', 'view-notes');
                calendarGrid.classList.add('view-events');
                this.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> <span>Show Notes</span>`;
            } else {
                currentViewState = 'notes';
                calendarGrid.classList.remove('view-minimized', 'view-events');
                calendarGrid.classList.add('view-notes');
                this.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg> <span>Minimize</span>`;
            }

            setTimeout(() => {
                const target = document.getElementById('current-week-scroll-target');
                const stickyHeader = document.querySelector('.sticky-top-section');
                if (target && stickyHeader) {
                    const headerHeight = stickyHeader.offsetHeight;
                    const y = target.getBoundingClientRect().top + window.scrollY - headerHeight - 10; 
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            }, 50);
        });
    }

    const typeFilter = document.getElementById('event-type-filter');
    if (typeFilter) {
        typeFilter.addEventListener('change', function() {
            currentTypeFilter = this.value;
            renderCalendar();
        });
    }

    const projFilter = document.getElementById('project-filter');
    if (projFilter) {
        projFilter.addEventListener('change', function() {
            currentProjectFilter = this.value;
            renderCalendar();
        });
    }

    document.getElementById('add-type').addEventListener('change', function() {
        const val = this.value;
        const startLabel = document.getElementById('add-start-date-label');
        const endGroup = document.getElementById('add-end-date-group');
        const nameLabel = document.getElementById('add-name-label');
        const statsWrapper = document.getElementById('add-stats-wrapper');

        if (val === 'Work Event') {
            statsWrapper.style.display = 'flex';
            endGroup.style.display = 'flex';
            startLabel.innerText = 'Start Date';
            nameLabel.innerText = 'Event Name';
        } else if (val === 'Delivery' || val === 'Inspection') {
            statsWrapper.style.display = 'none';
            endGroup.style.display = 'none';
            startLabel.innerText = `Date of ${val}`;
            nameLabel.innerText = 'Description';
        } else {
            statsWrapper.style.display = 'none';
            endGroup.style.display = 'flex';
            startLabel.innerText = 'Start Date';
            nameLabel.innerText = 'Event Name';
        }
    });

    document.getElementById('edit-type').addEventListener('change', function() {
        const val = this.value;
        const startLabel = document.getElementById('edit-start-date-label');
        const endGroup = document.getElementById('edit-end-date-group');
        const statsWrapper = document.getElementById('edit-daily-stats');

        statsWrapper.style.display = 'flex'; 

        if (val === 'Work Event') {
            endGroup.style.display = 'flex';
            startLabel.innerText = 'Start Date';
        } else if (val === 'Delivery' || val === 'Inspection') {
            endGroup.style.display = 'none';
            startLabel.innerText = `Date of ${val}`;
        } else {
            endGroup.style.display = 'flex';
            startLabel.innerText = 'Start Date';
        }

        renderEditStats(document.getElementById('edit-start-date').value, document.getElementById('edit-end-date').value);
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

function openGlobalUploadModal() {
    if (projectsList.length === 0) return alert("No existing projects found to upload to.");
    modalOverlay.classList.remove('hidden');
    uploadModal.classList.remove('hidden');
    addModal.classList.add('hidden');
    editModal.classList.add('hidden');
}

window.confirmGlobalUpload = function() {
    if (pendingUploadFile) {
        let pId = document.getElementById('upload-project-select').value;
        let pTitle = projectsList.find(p => String(p.id) === String(pId))?.title || pId;
        handleFile(pendingUploadFile, pId, pTitle);
        closeModals();
        pendingUploadFile = null;
    } else {
        fileInput.click();
        closeModals();
    }
}

// File Processing
function handleFile(file, pId, pTitle) {
    setHeaderLoading(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        processData(json, String(pId), pTitle);
        renderCalendar();
        saveToDatabase(pId, pTitle);
    };
    reader.readAsArrayBuffer(file);
}

function processData(data, pId, pTitle) {
    let processedEventIds = new Set(); 

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

        const existingIndex = eventsData.findIndex(ev => ev.name === eventName && ev.date === dateStr && ev.projectId === pId);
        if (existingIndex > -1) {
            eventsData[existingIndex].invited = invited;
            eventsData[existingIndex].accepted = accepted;
            eventsData[existingIndex].type = 'Work Event'; 
            eventsData[existingIndex].imported = true;
            processedEventIds.add(eventsData[existingIndex].id); 
        } else {
            let newId = generateId();
            eventsData.push({
                id: newId, name: eventName, date: dateStr,
                invited: invited, accepted: accepted, notes: "",
                type: 'Work Event',
                imported: true,
                projectId: pId,
                projectTitle: pTitle
            });
            processedEventIds.add(newId); 
        }
    }
    
    eventsData = eventsData.filter(ev => {
        if (ev.projectId !== pId) return true; 
        if (!ev.imported) return true; 
        return processedEventIds.has(ev.id); 
    });

    eventsData.sort((a, b) => new Date(a.date) - new Date(b.date));
}

// ADD Modal Logic
function openAddModal() {
    if (!projectNumber) return alert("Please add a ?project=XYZ variable to your URL to begin working.");

    if (isGlobalView) {
        if (projectsList.length === 0) return alert("No existing projects found to add events to.");
        document.getElementById('add-project-group').style.display = 'flex';
    }

    const typeSelect = document.getElementById('add-type');
    typeSelect.value = 'Work Event';
    typeSelect.dispatchEvent(new Event('change')); 

    document.getElementById('add-start-date').value = '';
    document.getElementById('add-end-date').value = '';
    document.getElementById('add-name').value = '';
    document.getElementById('add-invited').value = 0;
    document.getElementById('add-accepted').value = 0;
    document.getElementById('add-notes').value = '';
    
    modalOverlay.classList.remove('hidden');
    addModal.classList.remove('hidden');
    editModal.classList.add('hidden');
    if(uploadModal) uploadModal.classList.add('hidden');
}

function saveNewEvent() {
    const startVal = document.getElementById('add-start-date').value;
    const endVal = document.getElementById('add-end-date').value;
    const name = document.getElementById('add-name').value.trim();
    const notes = document.getElementById('add-notes').value.trim();
    const eventType = document.getElementById('add-type').value;
    
    if (!name || !startVal) return alert("Event Name/Description and Date are required.");

    let pId = projectNumber;
    let pTitle = projectTitle;
    if (isGlobalView) {
        pId = document.getElementById('add-project').value;
        pTitle = projectsList.find(p => String(p.id) === String(pId))?.title || pId;
    }

    let start = new Date(startVal + 'T00:00:00');
    let end = endVal ? new Date(endVal + 'T00:00:00') : new Date(start);
    if (end < start || eventType === 'Delivery' || eventType === 'Inspection') {
        end = new Date(start); 
    }

    let current = new Date(start);
    const isWorkEvent = eventType === 'Work Event';
    const invited = isWorkEvent ? (parseInt(document.getElementById('add-invited').value) || 0) : 0;
    const accepted = isWorkEvent ? (parseInt(document.getElementById('add-accepted').value) || 0) : 0;

    let firstDayAssigned = false;
    while (current <= end) {
        if (current.getDay() !== 0) { 
            eventsData.push({
                id: generateId(), 
                name: name, 
                date: formatDateObj(current),
                invited: invited, 
                accepted: accepted, 
                notes: !firstDayAssigned ? notes : "",
                type: eventType,
                imported: false,
                projectId: String(pId),
                projectTitle: pTitle
            });
            firstDayAssigned = true;
        }
        current.setDate(current.getDate() + 1);
    }

    eventsData.sort((a, b) => new Date(a.date) - new Date(b.date));
    closeModals(); renderCalendar(); saveToDatabase(pId, pTitle);
}

// EDIT Modal Logic
function openEditModal(eventId) {
    const ev = eventsData.find(e => e.id === eventId);
    if (!ev) return;

    document.getElementById('edit-title').innerText = ev.name + (isGlobalView ? ` (${ev.projectTitle})` : '');
    document.getElementById('edit-old-name').value = ev.name;
    document.getElementById('edit-name').value = ev.name;
    
    const nameGroup = document.getElementById('edit-name-group');
    const typeGroup = document.getElementById('edit-type-group');
    const importedNote = document.getElementById('edit-imported-note');
    const deleteBtn = document.getElementById('delete-btn');
    const typeSelect = document.getElementById('edit-type');
    const startDateGroup = document.getElementById('edit-start-date').closest('.form-group');
    const endDateGroup = document.getElementById('edit-end-date-group');
    
    typeSelect.value = ev.type || 'Work Event';
    typeSelect.dispatchEvent(new Event('change')); 
    
    if (ev.imported) {
        if(nameGroup) nameGroup.style.display = 'none';
        typeGroup.style.display = 'none';
        importedNote.style.display = 'flex';
        deleteBtn.style.display = 'none';
        startDateGroup.style.display = 'none';
        endDateGroup.style.display = 'none';
    } else {
        if(nameGroup) nameGroup.style.display = 'flex';
        typeGroup.style.display = 'flex';
        importedNote.style.display = 'none';
        deleteBtn.style.display = 'block';
        startDateGroup.style.display = 'flex';
    }
    
    editRelatedEvents = eventsData.filter(e => e.name === ev.name && e.projectId === ev.projectId).sort((a,b) => new Date(a.date) - new Date(b.date));
    
    let startStr = editRelatedEvents[0].date;
    let endStr = editRelatedEvents[editRelatedEvents.length - 1].date;
    
    renderEditStats(startStr, endStr, ev.date);

    modalOverlay.classList.remove('hidden');
    editModal.classList.remove('hidden');
    addModal.classList.add('hidden');
    if(uploadModal) uploadModal.classList.add('hidden');
}

function renderEditStats(startStr, endStr, highlightDate = null) {
    const container = document.getElementById('edit-daily-stats');
    container.innerHTML = '';
    
    if (!startStr) return;
    
    const isImported = editRelatedEvents.length > 0 && editRelatedEvents[0].imported;
    
    let isSingleDayView = false;
    let end = null;
    let start = new Date(startStr + 'T00:00:00');
    
    if (isImported) {
        isSingleDayView = editRelatedEvents.length === 1;
    } else {
        end = endStr ? new Date(endStr + 'T00:00:00') : new Date(start);
        if (end < start) end = new Date(start);
        let days = 0;
        let c = new Date(start);
        while(c <= end) { if(c.getDay() !== 0) days++; c.setDate(c.getDate()+1); }
        isSingleDayView = days <= 1;
    }

    if (isImported) {
        editRelatedEvents.forEach(existing => {
            let dStr = existing.date;
            let current = new Date(dStr + 'T00:00:00');
            let inv = existing.invited || 0;
            let acc = existing.accepted || 0;
            let note = existing.notes || '';
            
            let statsHtml = `<input type="hidden" class="edit-inv-input" value="${inv}"><input type="hidden" class="edit-acc-input" value="${acc}">`;

            if (isSingleDayView) {
                container.innerHTML += `
                    <div class="daily-stat-row single-day-mode" data-date="${dStr}">
                        ${statsHtml}
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea class="edit-note-input" rows="4" placeholder="Add custom notes here...">${note}</textarea>
                        </div>
                    </div>
                `;
            } else {
                let isHighlighted = (dStr === highlightDate);
                let rowClass = isHighlighted ? 'daily-stat-row highlighted-row' : 'daily-stat-row';

                container.innerHTML += `
                    <div class="${rowClass}" data-date="${dStr}">
                        <div class="daily-stat-row-top">
                            <div class="stat-date-label">${current.getMonth()+1}/${current.getDate()}</div>
                            ${statsHtml}
                        </div>
                        <textarea class="edit-note-input" rows="2" placeholder="Notes for this day...">${note}</textarea>
                    </div>
                `;
            }
        });
    } else {
        let current = new Date(start);
        while (current <= end) {
            if (current.getDay() !== 0) {
                let dStr = formatDateObj(current);
                let existing = editRelatedEvents.find(e => e.date === dStr);
                let inv = existing ? existing.invited : 0;
                let acc = existing ? existing.accepted : 0;
                let note = existing && existing.notes ? existing.notes : '';
                
                let statsHtml = `<input type="hidden" class="edit-inv-input" value="${inv}"><input type="hidden" class="edit-acc-input" value="${acc}">`;

                if (isSingleDayView) {
                    container.innerHTML += `
                        <div class="daily-stat-row single-day-mode" data-date="${dStr}">
                            ${statsHtml}
                            <div class="form-group">
                                <label>Notes</label>
                                <textarea class="edit-note-input" rows="4" placeholder="Add custom notes here...">${note}</textarea>
                            </div>
                        </div>
                    `;
                } else {
                    let isHighlighted = (dStr === highlightDate);
                    let rowClass = isHighlighted ? 'daily-stat-row highlighted-row' : 'daily-stat-row';

                    container.innerHTML += `
                        <div class="${rowClass}" data-date="${dStr}">
                            <div class="daily-stat-row-top">
                                <div class="stat-date-label">${current.getMonth()+1}/${current.getDate()}</div>
                                ${statsHtml}
                            </div>
                            <textarea class="edit-note-input" rows="2" placeholder="Notes for this day...">${note}</textarea>
                        </div>
                    `;
                }
            }
            current.setDate(current.getDate() + 1);
        }
    }

    if (highlightDate && !isSingleDayView) {
        setTimeout(() => {
            const row = container.querySelector(`.daily-stat-row[data-date="${highlightDate}"]`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const firstInput = row.querySelector('.edit-note-input');
                if (firstInput) firstInput.focus();
            }
        }, 50);
    }
}

function updateRelatedEventsFromDOM() {
    const rows = document.querySelectorAll('.daily-stat-row');
    rows.forEach(row => {
        let dStr = row.getAttribute('data-date');
        let inv = parseInt(row.querySelector('.edit-inv-input').value) || 0;
        let acc = parseInt(row.querySelector('.edit-acc-input').value) || 0;
        let note = row.querySelector('.edit-note-input').value.trim();
        
        let existing = editRelatedEvents.find(e => e.date === dStr);
        if (existing) {
            existing.invited = inv;
            existing.accepted = acc;
            existing.notes = note;
        } else {
            editRelatedEvents.push({ date: dStr, invited: inv, accepted: acc, notes: note });
        }
    });
}

function saveEditedEvent() {
    const oldName = document.getElementById('edit-old-name').value;
    let newName = document.getElementById('edit-name').value.trim();
    const eventType = document.getElementById('edit-type').value;
    const isImported = editRelatedEvents[0] ? editRelatedEvents[0].imported : false;
    const pId = editRelatedEvents[0].projectId;
    const pTitle = editRelatedEvents[0].projectTitle;

    if (isImported) newName = oldName;
    if (!newName) return alert("Event name cannot be empty.");
    
    updateRelatedEventsFromDOM(); 
    
    eventsData = eventsData.filter(e => !(e.name === oldName && e.projectId === pId));
    
    const isWorkEvent = eventType === 'Work Event';

    if (isImported) {
        editRelatedEvents.forEach(stat => {
            eventsData.push({
                id: generateId(),
                name: newName,
                date: stat.date,
                invited: isWorkEvent ? stat.invited : 0,
                accepted: isWorkEvent ? stat.accepted : 0,
                notes: stat.notes || "",
                type: eventType,
                imported: true,
                projectId: pId,
                projectTitle: pTitle
            });
        });
    } else {
        const startStr = document.getElementById('edit-start-date').value;
        const endStr = document.getElementById('edit-end-date').value;
        
        let start = new Date(startStr + 'T00:00:00');
        let end = endStr ? new Date(endStr + 'T00:00:00') : new Date(start);
        if (end < start || eventType === 'Delivery' || eventType === 'Inspection') {
            end = new Date(start);
        }
        
        let current = new Date(start);
        while (current <= end) {
            if (current.getDay() !== 0) {
                let dStr = formatDateObj(current);
                let stat = editRelatedEvents.find(e => e.date === dStr);
                
                eventsData.push({
                    id: generateId(),
                    name: newName,
                    date: dStr,
                    invited: (isWorkEvent && stat) ? stat.invited : 0,
                    accepted: (isWorkEvent && stat) ? stat.accepted : 0,
                    notes: stat ? stat.notes : "",
                    type: eventType,
                    imported: false,
                    projectId: pId,
                    projectTitle: pTitle
                });
            }
            current.setDate(current.getDate() + 1);
        }
    }
    
    eventsData.sort((a, b) => new Date(a.date) - new Date(b.date));
    closeModals(); 
    renderCalendar(); 
    saveToDatabase(pId, pTitle);
}

window.deleteEvent = function() {
    if (!confirm("Are you sure you want to permanently delete this event?")) return;
    
    const oldName = document.getElementById('edit-old-name').value;
    const pId = editRelatedEvents[0].projectId;
    const pTitle = editRelatedEvents[0].projectTitle;
    
    eventsData = eventsData.filter(e => !(e.name === oldName && e.projectId === pId));
    
    closeModals();
    renderCalendar();
    saveToDatabase(pId, pTitle);
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

// Check Text Truncation
window.checkTruncation = function(el) {
    const textEl = el.querySelector('.event-name');
    if (!textEl) return;
    if (textEl.offsetWidth < textEl.scrollWidth || textEl.offsetHeight < textEl.scrollHeight) {
        el.setAttribute('data-tooltip', el.getAttribute('data-full-title'));
    } else {
        el.removeAttribute('data-tooltip');
    }
};

// Render Logic
function renderCalendar() {
    calendarGrid.innerHTML = '';
    const gridHeaders = document.querySelector('.grid-headers');

    const mainProjTitle = document.getElementById('main-project-title');
    if (mainProjTitle) {
        mainProjTitle.innerText = isGlobalView ? "All Projects" : (projectTitle || projectNumber || "Unnamed Project");
    }

    let displayEvents = eventsData;
    if (currentTypeFilter !== "All") {
        displayEvents = displayEvents.filter(e => (e.type || 'Work Event') === currentTypeFilter);
    }
    if (currentProjectFilter !== "All") {
        displayEvents = displayEvents.filter(e => e.projectId === currentProjectFilter);
    }

    let validDates = displayEvents.map(e => new Date(e.date + 'T00:00:00')).filter(d => !isNaN(d.getTime()));
    
    let minDate = validDates.length > 0 ? new Date(Math.min(...validDates)) : null;
    let maxDate = validDates.length > 0 ? new Date(Math.max(...validDates)) : null;

    if (minDate && maxDate) {
        if (!isGlobalView) {
            projectDateRange.innerText = `${minDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            
            let todayTime = new Date().setHours(0,0,0,0);
            let startTime = minDate.getTime();
            let endTime = maxDate.getTime();
            let totalRange = endTime - startTime;
            
            document.getElementById('progress-container').style.display = 'flex';
            
            let remaining = Math.ceil((endTime - todayTime) / (1000 * 60 * 60 * 24));
            if (remaining < 0) remaining = 0;
            
            document.getElementById('progress-text').innerText = `${remaining} Days Remaining`;
            
            let percent = 0;
            if (totalRange > 0) {
                percent = ((todayTime - startTime) / totalRange) * 100;
                percent = Math.max(0, Math.min(100, percent));
            } else {
                percent = todayTime >= startTime ? 100 : 0;
            }
            
            document.getElementById('progress-fill').style.width = `${percent}%`;
            document.getElementById('progress-marker').style.left = `${percent}%`;
            
        } else {
            projectDateRange.innerText = "Global Overview";
            document.getElementById('progress-container').style.display = 'none';
        }
    } else {
        projectDateRange.innerText = isGlobalView ? "Global Overview" : "No events scheduled.";
        document.getElementById('progress-container').style.display = 'none';
        if (gridHeaders) gridHeaders.innerHTML = '';
        return; 
    }

    displayEvents.forEach(ev => { if(!ev.id) ev.id = generateId(); });

    const hasMondayEvents = displayEvents.some(e => new Date(e.date + 'T00:00:00').getDay() === 1);
    const colCount = hasMondayEvents ? 6 : 5;
    document.documentElement.style.setProperty('--col-count', colCount);

    if (currentMainView === 'calendar') {
        if (gridHeaders) {
            gridHeaders.style.display = 'grid';
            gridHeaders.innerHTML = hasMondayEvents ? `<div class="day-label">Mon</div>` : '';
            gridHeaders.innerHTML += `
                <div class="day-label">Tue</div><div class="day-label">Wed</div>
                <div class="day-label">Thu</div><div class="day-label">Fri</div><div class="day-label">Sat</div>
            `;
        }
    } else {
        if (gridHeaders) gridHeaders.style.display = 'none';
    }

    let today = new Date();
    today.setHours(0,0,0,0);
    let todayStr = formatDateObj(today);
    let startOfTodayWeek = getStartOfWeek(today);
    
    let startOfNextWeek = new Date(startOfTodayWeek);
    startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);
    
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
        let minLookAheadEnd = new Date(startOfNextWeek);
        minLookAheadEnd.setDate(minLookAheadEnd.getDate() + 20); 
        if (endOfGridWeek < minLookAheadEnd) {
            endOfGridWeek = new Date(minLookAheadEnd);
        }
    }

    let currentLoopDate = new Date(startOfGrid);
    const palette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FDCB6E', '#6C5CE7', '#fd79a8', '#00b894', '#e17055'];
    
    let htmlStr = '';
    let inLookAhead = false;
    let lookAheadCounter = 0;
    
    let uniqueGroupings = [...new Set(displayEvents.map(e => e.name + '|' + e.projectId))];

    if (currentMainView === 'agenda') {
        
        while (currentLoopDate <= endOfGridWeek || (inLookAhead && lookAheadCounter < 3)) {
            let weekDates = [];
            for(let i = 0; i < 6; i++) {
                let d = new Date(currentLoopDate);
                d.setDate(d.getDate() + i);
                weekDates.push(formatDateObj(d));
            }

            if (showLookAhead && currentLoopDate.getTime() === startOfTodayWeek.getTime()) {
                htmlStr += `<div id="current-week-scroll-target"></div>`;
            }

            if (showLookAhead && currentLoopDate.getTime() === startOfNextWeek.getTime()) {
                htmlStr += `
                    <div class="look-ahead-wrapper">
                        <div class="look-ahead-title">3-Week Look Ahead</div>
                `;
                inLookAhead = true;
                lookAheadCounter = 0;
            }

            let weekHtml = `<div class="agenda-week-container">`;

            for (let i = 0; i < 6; i++) {
                if (!hasMondayEvents && i === 0) continue;
                let dateStr = weekDates[i];
                let d = new Date(currentLoopDate); d.setDate(d.getDate() + i);
                let isToday = (dateStr === todayStr);
                
                let dayEvents = displayEvents.filter(ev => ev.date === dateStr);
                let isDayEmpty = dayEvents.length === 0;

                let dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                let dayNum = d.getDate();
                let monthNum = d.getMonth() + 1;
                
                let agendaStatsHtml = '';
                let dayTotals = dayEvents.filter(e => (e.type || 'Work Event') === 'Work Event').reduce((acc, ev) => {
                    acc.invited += ev.invited; acc.accepted += ev.accepted; return acc;
                }, { invited: 0, accepted: 0 });

                if (dayTotals.invited > 0 || dayTotals.accepted > 0) {
                    agendaStatsHtml = `
                        <div class="agenda-daily-stats">
                            <span class="stat-circle accepted-circle" data-tooltip="Accepted">${dayTotals.accepted}</span>
                            <span class="stat-circle invited-circle" data-tooltip="Invited">${dayTotals.invited}</span>
                        </div>
                    `;
                }

                weekHtml += `
                    <div class="agenda-day-row ${isToday ? 'today-agenda-row' : ''} ${isDayEmpty ? 'empty-agenda-row' : ''}">
                        <div class="agenda-day-left">
                            <div class="agenda-date">${monthNum}/${dayNum}</div>
                            <div class="agenda-day-name">${dayName}</div>
                            ${agendaStatsHtml}
                        </div>
                        <div class="agenda-day-right">
                `;

                if (isDayEmpty) {
                    weekHtml += `<div class="agenda-empty-text">No events scheduled</div>`;
                } else {
                    dayEvents.forEach(ev => {
                        let groupKey = ev.name + '|' + ev.projectId;
                        let colorIdx = uniqueGroupings.indexOf(groupKey);
                        let styleColor = palette[colorIdx % palette.length];
                        
                        let blockType = ev.type || 'Work Event';
                        let isSpecial = blockType !== 'Work Event';
                        
                        if (blockType === 'Delivery') styleColor = '#F39C12'; 
                        else if (blockType === 'Inspection') styleColor = '#E74C3C'; 

                        let cardStyle = `border-left-color: ${styleColor};`;
                        if (isSpecial) {
                            cardStyle = `background-color: ${styleColor}4D; border-left: none;`;
                        }

                        const hasNotes = ev.notes && ev.notes.trim().length > 0;
                        let titleIconHtml = '';
                        let showStats = false;
                        
                        if (blockType === 'Delivery') titleIconHtml = `<div class="type-icon" data-tooltip="${blockType}">${icons.delivery}</div>`;
                        else if (blockType === 'Inspection') titleIconHtml = `<div class="type-icon" data-tooltip="${blockType}">${icons.inspection}</div>`;
                        else if (blockType === 'Other') titleIconHtml = `<div class="type-icon" data-tooltip="${blockType}">${icons.other}</div>`;
                        else showStats = true;
                        
                        let globalTag = isGlobalView ? `<div class="project-tag">${ev.projectTitle}</div>` : '';
                        let notesHtml = hasNotes ? `<div class="event-notes">${ev.notes}</div>` : '';
                        
                        let statsHtml = showStats ? `
                            <div class="event-stats inline-stats">
                                <span class="stat-circle accepted-circle" data-tooltip="Accepted" onclick="handleInlineEdit(event, '${ev.id}', 'accepted')">${ev.accepted}</span>
                                <span class="stat-circle invited-circle" data-tooltip="Invited" onclick="handleInlineEdit(event, '${ev.id}', 'invited')">${ev.invited}</span>
                            </div>
                        ` : '';

                        const safeName = ev.name.replace(/"/g, '&quot;');

                        weekHtml += `
                            <div class="agenda-event-card" style="${cardStyle}" onclick="openEditModal('${ev.id}')">
                                <div class="day-segment">
                                    <div class="event-name-wrapper">
                                        ${titleIconHtml}
                                        ${statsHtml}
                                        <div class="event-name-target" data-full-title="${safeName}" onmouseenter="checkTruncation(this)">
                                            <div class="event-name">${ev.name}${globalTag}</div>
                                        </div>
                                    </div>
                                    ${notesHtml}
                                </div>
                            </div>
                        `;
                    });
                }

                weekHtml += `</div></div>`; 
            }

            weekHtml += `</div>`;
            htmlStr += weekHtml;

            if (inLookAhead) {
                lookAheadCounter++;
                if (lookAheadCounter === 3) {
                    htmlStr += `</div>`;
                    inLookAhead = false;
                }
            }

            currentLoopDate.setDate(currentLoopDate.getDate() + 7);
        }

    } else {
        
        while (currentLoopDate <= endOfGridWeek || (inLookAhead && lookAheadCounter < 3)) {
            let weekDates = [];
            let weekEvents = [];

            for(let i = 0; i < 6; i++) {
                let d = new Date(currentLoopDate);
                d.setDate(d.getDate() + i);
                weekDates.push(formatDateObj(d));
            }

            if (showLookAhead && currentLoopDate.getTime() === startOfTodayWeek.getTime()) {
                htmlStr += `<div id="current-week-scroll-target"></div>`;
            }

            if (showLookAhead && currentLoopDate.getTime() === startOfNextWeek.getTime()) {
                htmlStr += `
                    <div class="look-ahead-wrapper">
                        <div class="look-ahead-title">3-Week Look Ahead</div>
                `;
                inLookAhead = true;
                lookAheadCounter = 0;
            }

            weekEvents = displayEvents.filter(ev => weekDates.includes(ev.date));
            
            let eventBlocks = [];
            uniqueGroupings.forEach(groupKey => {
                let startCol = -1;
                let segments = [];
                for (let i = 0; i < 6; i++) {
                    let ev = weekEvents.find(e => (e.name + '|' + e.projectId) === groupKey && e.date === weekDates[i]);
                    if (ev) {
                        if (startCol === -1) startCol = i;
                        segments.push(ev);
                    } else {
                        if (startCol !== -1) {
                            eventBlocks.push({ groupKey, startCol, span: segments.length, segments });
                            startCol = -1;
                            segments = [];
                        }
                    }
                }
                if (startCol !== -1) eventBlocks.push({ groupKey, startCol, span: segments.length, segments });
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
            
            let maxSlots = Math.max(slotsOccupied.length, 1);
            let weekHtml = `<div class="week-container">`;

            for (let i = 0; i < 6; i++) {
                if (!hasMondayEvents && i === 0) continue;
                let gridCol = hasMondayEvents ? i + 1 : i; 
                
                let dateStr = weekDates[i];
                let d = new Date(currentLoopDate); d.setDate(d.getDate() + i);
                let isDayEmpty = !weekEvents.some(e => e.date === dateStr);
                let hasWorkEvents = weekEvents.some(e => e.date === dateStr && (e.type || 'Work Event') === 'Work Event');
                let isToday = (dateStr === todayStr);
                let bgClasses = `day-bg ${isDayEmpty && !isToday ? 'dimmed-empty' : ''} ${isToday ? 'today-highlight' : ''}`;
                
                let dayTotals = weekEvents.filter(e => e.date === dateStr && (e.type || 'Work Event') === 'Work Event').reduce((acc, ev) => {
                    acc.invited += ev.invited; acc.accepted += ev.accepted; return acc;
                }, { invited: 0, accepted: 0 });

                weekHtml += `<div class="${bgClasses}" style="grid-column: ${gridCol}; grid-row: 1 / span ${maxSlots + 1};"></div>`;
                
                weekHtml += `
                    <div class="cell-header ${isToday ? 'today-header' : ''} ${isDayEmpty ? 'empty-header' : ''}" style="grid-column: ${gridCol}; grid-row: 1;">
                        <div class="header-left-col"><span>${d.getMonth() + 1}/${d.getDate()}</span></div>
                        ${!hasWorkEvents ? '' : `<div class="header-totals"><span class="stat-circle accepted-circle" data-tooltip="Accepted">${dayTotals.accepted}</span><span class="stat-circle invited-circle" data-tooltip="Invited">${dayTotals.invited}</span></div>`}
                    </div>
                `;
            }

            eventBlocks.forEach(block => {
                let colorIdx = uniqueGroupings.indexOf(block.groupKey);
                let styleColor = palette[colorIdx % palette.length];
                let isMulti = block.span > 1;
                let gridCol = hasMondayEvents ? block.startCol + 1 : block.startCol;
                
                let blockType = block.segments[0].type || 'Work Event';
                let isSpecial = blockType !== 'Work Event';

                if (blockType === 'Delivery') {
                    styleColor = '#F39C12'; 
                } else if (blockType === 'Inspection') {
                    styleColor = '#E74C3C'; 
                }

                let cardClass = isMulti ? 'multi-day' : '';
                if (isSpecial) cardClass += ' special-event';

                let cardStyle = `--group-color: ${styleColor}; grid-column: ${gridCol} / span ${block.span}; grid-row: ${block.slot + 2};`;
                
                if (isSpecial) {
                    cardStyle += ` background-color: ${styleColor}4D; border-radius: 6px;`;
                } else {
                    if (isMulti) {
                        cardStyle += ` background-color: ${styleColor}1A;`;
                    }
                }
                
                let segmentsHtml = block.segments.map((ev, idx) => {
                    const hasNotes = ev.notes && ev.notes.trim().length > 0;
                    let segmentStyle = (isMulti && idx < block.span - 1) ? `border-right: 1px dashed rgba(255,255,255,0.15);` : '';
                    let hideTitleClass = (isMulti && idx > 0) ? 'hidden-title' : '';
                    
                    const evType = ev.type || 'Work Event';
                    let titleIconHtml = '';
                    let showStats = false;
                    
                    if (evType === 'Delivery') titleIconHtml = `<div class="type-icon" data-tooltip="${evType}">${icons.delivery}</div>`;
                    else if (evType === 'Inspection') titleIconHtml = `<div class="type-icon" data-tooltip="${evType}">${icons.inspection}</div>`;
                    else if (evType === 'Other') titleIconHtml = `<div class="type-icon" data-tooltip="${evType}">${icons.other}</div>`;
                    else showStats = true;
                    
                    let globalTag = isGlobalView ? `<div class="project-tag">${ev.projectTitle}</div>` : '';
                    let notesHtml = hasNotes ? `<div class="event-notes">${ev.notes}</div>` : '';
                    
                    let statsHtml = showStats ? `
                        <div class="event-stats inline-stats">
                            <span class="stat-circle accepted-circle" data-tooltip="Accepted" onclick="handleInlineEdit(event, '${ev.id}', 'accepted')">${ev.accepted}</span>
                            <span class="stat-circle invited-circle" data-tooltip="Invited" onclick="handleInlineEdit(event, '${ev.id}', 'invited')">${ev.invited}</span>
                        </div>
                    ` : '';

                    const safeName = ev.name.replace(/"/g, '&quot;');

                    return `
                        <div class="day-segment" style="${segmentStyle}" onclick="openEditModal('${ev.id}')">
                            <div class="event-name-wrapper">
                                ${titleIconHtml}
                                ${statsHtml}
                                <div class="event-name-target ${hideTitleClass}" data-full-title="${safeName}" onmouseenter="checkTruncation(this)">
                                    <div class="event-name">${ev.name}${globalTag}</div>
                                </div>
                            </div>
                            ${notesHtml}
                        </div>
                    `;
                }).join('');

                weekHtml += `
                    <div class="event-card spanning-event ${cardClass}" style="${cardStyle}">
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
                if (lookAheadCounter === 3) {
                    htmlStr += `</div>`;
                    inLookAhead = false;
                }
            }

            currentLoopDate.setDate(currentLoopDate.getDate() + 7);
        }
    }
    
    if (inLookAhead) htmlStr += `</div>`;
    
    htmlStr += `<div class="calendar-bottom-padding"></div>`;
    calendarGrid.innerHTML = htmlStr;

    if (!calendarGrid.classList.contains('view-minimized') && showLookAhead) {
        setTimeout(() => {
            const target = document.getElementById('current-week-scroll-target');
            const stickyHeader = document.querySelector('.sticky-top-section');
            if (target && stickyHeader) {
                const headerHeight = stickyHeader.offsetHeight;
                const y = target.getBoundingClientRect().top + window.scrollY - headerHeight - 10; 
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        }, 100);
    }
}

// Inline Editing for Stats
window.handleInlineEdit = function(e, eventId, field) {
    e.stopPropagation(); // Prevents opening the edit modal
    let span = e.currentTarget;
    if (span.querySelector('input')) return; // Check if already editing

    let currentVal = span.innerText;
    
    // Swap text for input
    span.innerHTML = `<input type="number" class="inline-edit-input" value="${currentVal}" min="0">`;
    let input = span.querySelector('input');
    input.focus();
    input.select();

    let saved = false;

    const saveVal = () => {
        if (saved) return;
        saved = true;
        let newVal = parseInt(input.value) || 0;
        
        let ev = eventsData.find(x => x.id === eventId);
        if (ev) {
            if (field === 'accepted') ev.accepted = newVal;
            if (field === 'invited') ev.invited = newVal;
            
            // Save to DB and refresh UI so header totals update instantly
            saveToDatabase(ev.projectId, ev.projectTitle);
            renderCalendar(); 
        } else {
            span.innerHTML = newVal;
        }
    };

    // Save on blur (clicking away) or hitting Enter
    input.addEventListener('blur', saveVal);
    input.addEventListener('keydown', (keyEvent) => {
        if (keyEvent.key === 'Enter') {
            saveVal();
        }
        if (keyEvent.key === 'Escape') {
            saved = true; // Prevents blur from double-firing
            span.innerHTML = currentVal; // Revert
        }
    });
};

init();
