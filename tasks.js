// File: tasks.js
// Version: V1.0
// Description: Logic engine for the Implementation Task Tracker. Queries Projects and Master Tasks tables, calculates dynamic due dates based on start date and week offsets, merges JSON state, and handles API writes for task completion and notes.

const GLIDE_APP_ID = 'uptC6TQ34oTPr2dizY5O';
const GLIDE_TABLE_ID_PROJECTS = 'native-table-jl3zoddzYY6WxSA4YQZj';
const GLIDE_TABLE_ID_TASKS = 'native-table-knNptPhRxwixgn59h5wK';
const GLIDE_TOKEN = '77804d07-3b60-415c-a8f8-4f84f33b974a';

// DOM Elements
const tasksContainer = document.getElementById('tasks-container');
const projectDateRange = document.getElementById('project-date-range');
const tasksStatus = document.getElementById('tasks-status');
const modalOverlay = document.getElementById('modal-overlay');
const addModal = document.getElementById('add-modal');
const viewToggleBtn = document.getElementById('view-toggle-btn');

// State
let projectNumber = null;
let projectTitle = null;
let isGlobalView = false;
let hideCompleted = true; // Default to hiding completed tasks

let masterTasks = [];
let projectsData = [];
let mergedTasks = [];
let activeProjectRowId = null;
let projectStartDate = null;

function init() {
    extractProjectNumber();
    setupEventListeners();

    if (projectNumber) {
        if (String(projectNumber).toLowerCase().trim() === 'global') {
            isGlobalView = true;
            document.getElementById('add-task-btn').style.display = 'none'; // Hide add button in global view
            document.getElementById('main-title-group').style.display = 'none';
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
    let extractedTitle = params.get('title');
    if (extractedTitle && window.location.hash) extractedTitle += window.location.hash;
    if (extractedTitle) try { extractedTitle = decodeURIComponent(extractedTitle); } catch(e) {}
    projectTitle = extractedTitle || projectNumber;
}

function setHeaderLoading(isLoading) {
    const loader = document.getElementById('header-loader');
    const content = document.getElementById('header-content'); 
    if (isLoading) {
        if(loader) loader.style.display = 'flex';
        if(content) content.style.display = 'none';
        tasksContainer.innerHTML = ''; 
    } else {
        if(loader) loader.style.display = 'none';
        if(content) content.style.display = 'block';
    }
}

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
                queries: [
                    { tableName: GLIDE_TABLE_ID_PROJECTS },
                    { tableName: GLIDE_TABLE_ID_TASKS }
                ]
            })
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const result = await response.json();
        
        projectsData = result[0]?.rows || [];
        const rawTasks = result[1]?.rows || [];

        // Parse Master Tasks
        masterTasks = rawTasks.map(r => ({
            id: r['$rowID'],
            category: r['vmA2P'] || 'Uncategorized',
            subCategory: r['bLESd'] || '',
            wks: Number(r['zb9L1']) || 0,
            name: r['q093e'] || 'Unnamed Task',
            assignee: r['DpRD8'] || 'Unassigned'
        }));

        processAndMergeData();

    } catch (error) {
        console.error('Fetch Error:', error);
        projectDateRange.innerText = "Error Loading Database";
        setHeaderLoading(false);
    }
}

function calculateDueDate(startDateStr, wks) {
    if (!startDateStr) return null;
    let start = new Date(startDateStr);
    if (isNaN(start.getTime())) return null;
    start.setDate(start.getDate() - (wks * 7));
    return start;
}

function processAndMergeData() {
    mergedTasks = [];

    if (isGlobalView) {
        projectDateRange.innerText = "Global Active Task Overview";
        
        projectsData.forEach(proj => {
            let pid = proj['$rowID'];
            let ptitle = proj['2UR8V'] ? `PT# ${proj['2UR8V']}` : proj['Name'] || 'Unnamed Project';
            let startStr = proj['GgPWW'];
            let jsonStr = proj['O2aWa'];

            let jsonArr = [];
            try { jsonArr = JSON.parse(jsonStr) || []; } catch(e) {}

            // Process Master Tasks for this project
            masterTasks.forEach(mt => {
                let savedState = jsonArr.find(j => j.id === mt.id);
                let isCompleted = savedState ? !!savedState.completed : false;
                
                // Skip completed tasks for Global View
                if (isCompleted) return; 

                let dueDate = calculateDueDate(startStr, mt.wks);
                mergedTasks.push({
                    ...mt,
                    projectId: pid,
                    projectTitle: ptitle,
                    dueDate: dueDate,
                    completed: false,
                    notes: savedState ? savedState.notes : "",
                    isCustom: false
                });
            });

            // Process Custom Tasks for this project
            let customTasks = jsonArr.filter(j => j.isCustom);
            customTasks.forEach(ct => {
                if (ct.completed) return; // Skip completed

                let dueDate = calculateDueDate(startStr, ct.wks);
                mergedTasks.push({
                    id: ct.id,
                    projectId: pid,
                    projectTitle: ptitle,
                    name: ct.name,
                    wks: ct.wks,
                    assignee: ct.assignee,
                    dueDate: dueDate,
                    completed: false,
                    notes: ct.notes || "",
                    isCustom: true
                });
            });
        });

    } else {
        // Single Project View
        let activeProj = projectsData.find(p => p['$rowID'] === projectNumber || (p['2UR8V'] && p['2UR8V'] === projectNumber));
        
        if (!activeProj) {
            projectDateRange.innerText = "Project not found.";
            setHeaderLoading(false);
            return;
        }

        activeProjectRowId = activeProj['$rowID'];
        projectStartDate = activeProj['GgPWW'];
        
        if (projectStartDate) {
            let d = new Date(projectStartDate);
            projectDateRange.innerText = `Project Start Date: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        } else {
            projectDateRange.innerText = `No Start Date Configured. Tasks will not have due dates.`;
        }

        let jsonStr = activeProj['O2aWa'];
        let jsonArr = [];
        try { jsonArr = JSON.parse(jsonStr) || []; } catch(e) {}

        // Map Master Tasks
        masterTasks.forEach(mt => {
            let savedState = jsonArr.find(j => j.id === mt.id);
            let dueDate = calculateDueDate(projectStartDate, mt.wks);
            mergedTasks.push({
                ...mt,
                dueDate: dueDate,
                completed: savedState ? !!savedState.completed : false,
                notes: savedState ? savedState.notes : "",
                isCustom: false
            });
        });

        // Map Custom Tasks
        let customTasks = jsonArr.filter(j => j.isCustom);
        customTasks.forEach(ct => {
            let dueDate = calculateDueDate(projectStartDate, ct.wks);
            mergedTasks.push({
                id: ct.id,
                name: ct.name,
                wks: ct.wks,
                assignee: ct.assignee,
                dueDate: dueDate,
                completed: !!ct.completed,
                notes: ct.notes || "",
                isCustom: true
            });
        });
    }

    // Master Sort: Incomplete first, then by Due Date, then by Name
    mergedTasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        let dateA = a.dueDate ? a.dueDate.getTime() : 9999999999999;
        let dateB = b.dueDate ? b.dueDate.getTime() : 9999999999999;
        if (dateA !== dateB) return dateA - dateB;
        return a.name.localeCompare(b.name);
    });

    setHeaderLoading(false);
    renderTasks();
}

function renderTasks() {
    tasksContainer.innerHTML = '';
    
    let displayTasks = mergedTasks;
    if (hideCompleted && !isGlobalView) {
        displayTasks = displayTasks.filter(t => !t.completed);
    }

    if (displayTasks.length === 0) {
        tasksContainer.innerHTML = `<div class="empty-agenda-text">No tasks available for this view.</div>`;
        updateHeaderStats();
        return;
    }

    let todayTime = new Date().setHours(0,0,0,0);
    let lookAheadLimit = todayTime + (21 * 86400000); // Today + 21 days

    let htmlStr = '';

    displayTasks.forEach(task => {
        let taskTime = task.dueDate ? task.dueDate.setHours(0,0,0,0) : null;
        let cardClass = 'task-card';
        
        let isPastDue = false;
        let isLookAhead = false;

        if (task.completed) {
            cardClass += ' task-completed';
        } else if (taskTime !== null) {
            if (taskTime < todayTime) {
                cardClass += ' task-past-due';
                isPastDue = true;
            } else if (taskTime <= lookAheadLimit) {
                cardClass += ' task-look-ahead';
                isLookAhead = true;
            }
        }

        let dateDisplay = task.dueDate ? task.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No Date';
        if (isPastDue) dateDisplay = `⚠️ Past Due (${dateDisplay})`;

        let checkedAttr = task.completed ? 'checked' : '';
        let disabledAttr = isGlobalView ? 'disabled' : '';
        let globalBadge = isGlobalView ? `<span class="task-project-badge">${task.projectTitle}</span>` : '';
        
        // Prevent typing in global mode
        let notesDisabledAttr = isGlobalView ? 'readonly' : '';

        htmlStr += `
            <div class="${cardClass}">
                <div class="task-header">
                    <input type="checkbox" class="task-checkbox" ${checkedAttr} ${disabledAttr} onchange="toggleTaskComplete('${task.id}', this.checked)">
                    <div class="task-info">
                        <div class="task-title-row">
                            <div class="task-name">${task.name}</div>
                            <div class="task-assignee-badge">${task.assignee}</div>
                        </div>
                        <div class="task-meta-row">
                            <span class="task-date ${isPastDue ? 'text-danger' : ''}">${dateDisplay}</span>
                            ${globalBadge}
                        </div>
                    </div>
                </div>
                <div class="task-notes-wrapper">
                    <textarea class="task-notes-input" placeholder="Add project-specific notes here..." ${notesDisabledAttr} onblur="updateTaskNotes('${task.id}', this.value)">${task.notes}</textarea>
                </div>
            </div>
        `;
    });

    tasksContainer.innerHTML = htmlStr;
    updateHeaderStats();
}

function updateHeaderStats() {
    if (isGlobalView) {
        tasksStatus.innerText = `${mergedTasks.length} Global Active Tasks`;
        return;
    }

    let todayTime = new Date().setHours(0,0,0,0);
    let pastDueCount = 0;
    let pendingCount = 0;

    mergedTasks.forEach(t => {
        if (!t.completed) {
            pendingCount++;
            if (t.dueDate && t.dueDate.setHours(0,0,0,0) < todayTime) {
                pastDueCount++;
            }
        }
    });

    let statText = `${pendingCount} Tasks Remaining`;
    if (pastDueCount > 0) {
        statText = `⚠️ ${pastDueCount} Past Due | ` + statText;
        tasksStatus.style.color = '#E74C3C';
    } else {
        tasksStatus.style.color = 'var(--text-secondary)';
    }

    tasksStatus.innerText = statText;
}

window.toggleTaskComplete = function(taskId, isChecked) {
    if (isGlobalView) return;
    let t = mergedTasks.find(x => x.id === taskId);
    if (t) {
        t.completed = isChecked;
        // Re-sort and render so it moves to the bottom/disappears
        mergedTasks.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            let dateA = a.dueDate ? a.dueDate.getTime() : 9999999999999;
            let dateB = b.dueDate ? b.dueDate.getTime() : 9999999999999;
            if (dateA !== dateB) return dateA - dateB;
            return a.name.localeCompare(b.name);
        });
        renderTasks(); 
        triggerGlideSave();
    }
};

window.updateTaskNotes = function(taskId, val) {
    if (isGlobalView) return;
    let t = mergedTasks.find(x => x.id === taskId);
    if (t) {
        if (t.notes !== val) {
            t.notes = val;
            triggerGlideSave(); // Save strictly in background, do not re-render to save cursor focus
        }
    }
};

function triggerGlideSave() {
    if (isGlobalView || !activeProjectRowId) return;

    let payloadToSave = mergedTasks.map(t => {
        if (t.isCustom) {
            return { id: t.id, isCustom: true, name: t.name, assignee: t.assignee, wks: t.wks, completed: t.completed, notes: t.notes };
        } else {
            return { id: t.id, completed: t.completed, notes: t.notes };
        }
    });

    // Calculate due/past due count for the sZTch column
    let todayTime = new Date().setHours(0,0,0,0);
    let actionRequiredCount = mergedTasks.filter(t => !t.completed && t.dueDate && t.dueDate.getTime() <= todayTime).length;

    const mutation = {
        tableName: GLIDE_TABLE_ID_PROJECTS,
        rowID: activeProjectRowId,
        kind: "set-columns-in-row",
        columnValues: {
            "O2aWa": JSON.stringify(payloadToSave),
            "sZTch": String(actionRequiredCount)
        }
    };

    fetch('https://api.glideapp.io/api/function/mutateTables', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GLIDE_TOKEN}`
        },
        body: JSON.stringify({ 
            appID: GLIDE_APP_ID,
            mutations: [mutation]
        })
    }).catch(err => console.error("Background Save Failed", err));
}

function setupEventListeners() {
    if (viewToggleBtn) {
        viewToggleBtn.addEventListener('click', function() {
            hideCompleted = !hideCompleted;
            document.getElementById('view-toggle-text').innerText = hideCompleted ? "Show Completed" : "Hide Completed";
            
            if(hideCompleted) {
                this.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg><span id="view-toggle-text">Show Completed</span>`;
            } else {
                this.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg><span id="view-toggle-text">Hide Completed</span>`;
            }
            renderTasks();
        });
    }
}

function generateId() { return 'task_' + Math.random().toString(36).substr(2, 9); }

window.openAddModal = function() {
    if (!projectNumber || isGlobalView) return;
    document.getElementById('add-name').value = '';
    document.getElementById('add-assignee').value = '';
    document.getElementById('add-wks').value = '0';
    modalOverlay.classList.remove('hidden');
    addModal.classList.remove('hidden');
}

window.closeModals = function() {
    modalOverlay.classList.add('hidden');
    addModal.classList.add('hidden');
}

window.saveCustomTask = function() {
    const name = document.getElementById('add-name').value.trim();
    const assignee = document.getElementById('add-assignee').value.trim();
    const wks = parseInt(document.getElementById('add-wks').value) || 0;

    if (!name) return alert("Task name is required.");

    let dueDate = calculateDueDate(projectStartDate, wks);

    mergedTasks.push({
        id: generateId(),
        name: name,
        wks: wks,
        assignee: assignee || 'Unassigned',
        dueDate: dueDate,
        completed: false,
        notes: "",
        isCustom: true
    });

    mergedTasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        let dateA = a.dueDate ? a.dueDate.getTime() : 9999999999999;
        let dateB = b.dueDate ? b.dueDate.getTime() : 9999999999999;
        if (dateA !== dateB) return dateA - dateB;
        return a.name.localeCompare(b.name);
    });

    closeModals();
    renderTasks();
    triggerGlideSave();
}

init();
