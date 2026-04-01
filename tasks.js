// File: tasks.js
// Version: V1.2
// Description: Rewrote grouping array logic to Date -> Category -> Subcategory. Added dynamic assignee dropdown population. Connected inline Add Task buttons to absolute date strings.

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
const assigneeFilter = document.getElementById('assignee-filter');

// State
let projectNumber = null;
let projectTitle = null;
let isGlobalView = false;
let hideCompleted = false; // Default false to allow scroll-up history
let currentAssigneeFilter = "All";

let masterTasks = [];
let projectsData = [];
let mergedTasks = [];
let activeProjectRowId = null;
let projectStartDate = null;
let initialRenderDone = false;

function init() {
    extractProjectNumber();
    setupEventListeners();

    if (projectNumber) {
        if (String(projectNumber).toLowerCase().trim() === 'global') {
            isGlobalView = true;
            document.getElementById('main-title-group').style.display = 'none';
            document.getElementById('project-filter').style.display = 'flex';
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

function formatDateObj(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function processAndMergeData() {
    mergedTasks = [];

    if (isGlobalView) {
        projectDateRange.innerText = "Global Active Task Overview";
        
        let projOpts = `<option value="All">All Projects</option>`;
        
        projectsData.forEach(proj => {
            let pid = proj['$rowID'];
            let ptitle = proj['2UR8V'] ? `PT# ${proj['2UR8V']}` : proj['Name'] || 'Unnamed Project';
            let startStr = proj['GgPWW'];
            let jsonStr = proj['O2aWa'];
            
            projOpts += `<option value="${pid}">${ptitle}</option>`;

            let jsonArr = [];
            try { jsonArr = JSON.parse(jsonStr) || []; } catch(e) {}

            masterTasks.forEach(mt => {
                let savedState = jsonArr.find(j => j.id === mt.id);
                let isCompleted = savedState ? !!savedState.completed : false;
                
                let dueDate = calculateDueDate(startStr, mt.wks);
                mergedTasks.push({
                    ...mt,
                    projectId: pid,
                    projectTitle: ptitle,
                    dueDate: dueDate,
                    completed: isCompleted,
                    notes: savedState ? savedState.notes : "",
                    isCustom: false
                });
            });

            let customTasks = jsonArr.filter(j => j.isCustom);
            customTasks.forEach(ct => {
                let dueDate = ct.targetDateStr ? new Date(ct.targetDateStr + 'T00:00:00') : calculateDueDate(startStr, ct.wks || 0);
                mergedTasks.push({
                    id: ct.id,
                    category: 'Custom Tasks',
                    subCategory: '',
                    projectId: pid,
                    projectTitle: ptitle,
                    name: ct.name,
                    assignee: ct.assignee,
                    dueDate: dueDate,
                    completed: !!ct.completed,
                    notes: ct.notes || "",
                    isCustom: true
                });
            });
        });
        
        document.getElementById('project-filter').innerHTML = projOpts;

    } else {
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
            projectDateRange.innerText = `No Start Date Configured.`;
        }

        let jsonStr = activeProj['O2aWa'];
        let jsonArr = [];
        try { jsonArr = JSON.parse(jsonStr) || []; } catch(e) {}

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

        let customTasks = jsonArr.filter(j => j.isCustom);
        customTasks.forEach(ct => {
            let dueDate = ct.targetDateStr ? new Date(ct.targetDateStr + 'T00:00:00') : calculateDueDate(projectStartDate, ct.wks || 0);
            mergedTasks.push({
                id: ct.id,
                category: 'Custom Tasks',
                subCategory: '',
                name: ct.name,
                assignee: ct.assignee,
                dueDate: dueDate,
                completed: !!ct.completed,
                notes: ct.notes || "",
                targetDateStr: ct.targetDateStr,
                isCustom: true
            });
        });
    }

    populateAssigneeDropdown();
    setHeaderLoading(false);
    renderTasks();

    if (!initialRenderDone) {
        initialRenderDone = true;
        scrollToFirstIncomplete();
    }
}

function populateAssigneeDropdown() {
    if (!assigneeFilter) return;
    let currentVal = assigneeFilter.value;
    let assignees = [...new Set(mergedTasks.map(t => t.assignee).filter(a => a && a !== 'Unassigned'))].sort();
    
    let html = `<option value="All">All Assignees</option>`;
    assignees.forEach(a => { html += `<option value="${a}">${a}</option>`; });
    html += `<option value="Unassigned">Unassigned</option>`;
    
    assigneeFilter.innerHTML = html;
    if (currentVal && Array.from(assigneeFilter.options).some(o => o.value === currentVal)) {
        assigneeFilter.value = currentVal;
    }
}

function renderTasks() {
    tasksContainer.innerHTML = '';
    
    let displayTasks = mergedTasks;
    if (hideCompleted) displayTasks = displayTasks.filter(t => !t.completed);
    if (currentAssigneeFilter !== 'All') {
        displayTasks = displayTasks.filter(t => (t.assignee || 'Unassigned') === currentAssigneeFilter);
    }
    
    const projFilterEl = document.getElementById('project-filter');
    if (isGlobalView && projFilterEl && projFilterEl.value !== 'All') {
        displayTasks = displayTasks.filter(t => t.projectId === projFilterEl.value);
    }

    if (displayTasks.length === 0) {
        tasksContainer.innerHTML = `<div class="empty-agenda-text">No tasks available for this view.</div>`;
        updateHeaderStats();
        return;
    }

    // Sort Tasks: Date -> Category -> SubCategory -> Name
    displayTasks.sort((a, b) => {
        let dateA = a.dueDate ? a.dueDate.getTime() : 9999999999999;
        let dateB = b.dueDate ? b.dueDate.getTime() : 9999999999999;
        if (dateA !== dateB) return dateA - dateB;

        let catA = a.category || 'Uncategorized';
        let catB = b.category || 'Uncategorized';
        if (catA !== catB) return catA.localeCompare(catB);

        let subA = a.subCategory || '';
        let subB = b.subCategory || '';
        if (subA !== subB) return subA.localeCompare(subB);

        return a.name.localeCompare(b.name);
    });

    let todayTime = new Date().setHours(0,0,0,0);
    let lookAheadLimit = todayTime + (21 * 86400000); // Today + 21 days

    let htmlStr = '';
    let inLookAhead = false;
    let currentCat = null;
    let currentSub = null;
    let currentDateStr = null;
    let dayRowOpen = false;

    displayTasks.forEach((task, index) => {
        let dStr = task.dueDate ? formatDateObj(task.dueDate) : 'No Date';
        let cat = task.category || 'Uncategorized';
        let sub = task.subCategory || '';

        let taskTime = task.dueDate ? task.dueDate.getTime() : null;
        let isLookAheadTask = taskTime !== null && taskTime >= todayTime && taskTime <= lookAheadLimit;

        // Check if we leave the look-ahead window
        if (inLookAhead && !isLookAheadTask) {
            if (dayRowOpen) { htmlStr += `</div></div>`; dayRowOpen = false; }
            htmlStr += `</div>`; // Close wrapper
            inLookAhead = false;
        }

        let dateChanged = dStr !== currentDateStr;
        let catChanged = cat !== currentCat;
        let subChanged = catChanged || sub !== currentSub;

        if (dateChanged || catChanged || subChanged) {
            if (dayRowOpen) {
                htmlStr += `</div></div>`;
                dayRowOpen = false;
            }
        }

        // Open Look-Ahead wrapper
        if (!inLookAhead && isLookAheadTask) {
            htmlStr += `<div class="look-ahead-wrapper"><div class="look-ahead-title">3-Week Look Ahead</div>`;
            inLookAhead = true;
            currentCat = null; currentSub = null; currentDateStr = null; // Force headers to reprint inside wrapper
            catChanged = true; subChanged = true; dateChanged = true;
        }

        if (catChanged) {
            htmlStr += `<div class="task-category-header">${cat}</div>`;
            currentCat = cat;
        }
        if (subChanged && sub !== 'General' && sub !== '') {
            htmlStr += `<div class="task-subcategory-header">${sub}</div>`;
            currentSub = sub;
        }

        if (dateChanged || catChanged || subChanged) {
            let d = task.dueDate;
            let dayName = d ? d.toLocaleDateString('en-US', { weekday: 'short' }) : '';
            let dayNum = d ? d.getDate() : '';
            let monthNum = d ? d.getMonth() + 1 : '';
            let isToday = dStr === formatDateObj(new Date());
            let isPastDueBlock = d && d.getTime() < todayTime; 

            let addBtnHtml = isGlobalView || dStr === 'No Date' ? '' : `<button class="add-task-inline-btn" onclick="openAddModal('${dStr}')" data-tooltip="Add Custom Task">+</button>`;

            htmlStr += `
                <div class="agenda-day-row ${isToday ? 'today-agenda-row' : ''}">
                    <div class="agenda-day-left">
                        <div class="agenda-date ${isPastDueBlock ? 'text-danger' : ''}">${dStr !== 'No Date' ? monthNum+'/'+dayNum : 'TBD'}</div>
                        <div class="agenda-day-name ${isPastDueBlock ? 'text-danger' : ''}">${dayName}</div>
                        ${addBtnHtml}
                    </div>
                    <div class="agenda-day-right">
            `;
            currentDateStr = dStr;
            dayRowOpen = true;
        }

        // Render Task Row
        let taskPastDue = !task.completed && task.dueDate && task.dueDate.getTime() < todayTime;
        let rowClasses = 'task-row';
        if (task.completed) rowClasses += ' completed';
        if (taskPastDue) rowClasses += ' past-due';
        if (!task.completed) rowClasses += ' incomplete-target';

        let disabledAttr = isGlobalView ? 'disabled' : '';
        let globalBadge = isGlobalView ? `<span class="task-project-badge">${task.projectTitle}</span>` : '';
        let noteBtnText = task.notes && task.notes.trim() !== '' ? 'Edit Note' : '+ Note';

        htmlStr += `
            <div class="${rowClasses}" id="row-${task.id}">
                <div class="task-main-line">
                    <input type="checkbox" class="task-checkbox-lg" ${task.completed ? 'checked' : ''} ${disabledAttr} onchange="toggleTaskComplete('${task.id}', this.checked)">
                    <div class="task-assignee-large">${task.assignee}</div>
                    <div class="task-name ${taskPastDue ? 'text-danger' : ''}">${task.name} ${globalBadge}</div>
                    <button class="note-toggle-btn" onclick="toggleNoteField('${task.id}')">[${noteBtnText}]</button>
                </div>
                <div class="task-note-container" id="note-container-${task.id}" style="display: none;">
                    <textarea class="task-notes-input-dark" placeholder="Add custom notes..." ${isGlobalView ? 'readonly' : ''} onblur="updateTaskNotes('${task.id}', this.value)">${task.notes}</textarea>
                </div>
            </div>
        `;
    });

    if (dayRowOpen) htmlStr += `</div></div>`;
    if (inLookAhead) htmlStr += `</div>`;

    tasksContainer.innerHTML = htmlStr;
    updateHeaderStats();
}

function scrollToFirstIncomplete() {
    setTimeout(() => {
        let firstIncomplete = document.querySelector('.incomplete-target');
        if (firstIncomplete) {
            let headerOffset = document.querySelector('.sticky-top-section').offsetHeight + 20;
            let elementPosition = firstIncomplete.getBoundingClientRect().top;
            let offsetPosition = elementPosition + window.pageYOffset - headerOffset;
            window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
        }
    }, 100);
}

window.toggleNoteField = function(taskId) {
    const container = document.getElementById(`note-container-${taskId}`);
    if (container) {
        if (container.style.display === 'none') {
            container.style.display = 'block';
            let ta = container.querySelector('textarea');
            if (ta) ta.focus();
        } else {
            container.style.display = 'none';
        }
    }
}

function updateHeaderStats() {
    if (isGlobalView) {
        tasksStatus.innerText = `${mergedTasks.length} Global Tasks`;
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
            triggerGlideSave(); 
            
            let row = document.getElementById(`row-${taskId}`);
            if (row) {
                let btn = row.querySelector('.note-toggle-btn');
                if (btn) btn.innerText = val.trim() !== '' ? '[Edit Note]' : '[+ Note]';
            }
        }
    }
};

function triggerGlideSave() {
    if (isGlobalView || !activeProjectRowId) return;

    let payloadToSave = mergedTasks.map(t => {
        if (t.isCustom) {
            return { id: t.id, isCustom: true, name: t.name, assignee: t.assignee, targetDateStr: t.targetDateStr, completed: t.completed, notes: t.notes };
        } else {
            return { id: t.id, completed: t.completed, notes: t.notes };
        }
    });

    let todayTime = new Date().setHours(0,0,0,0);
    let actionRequiredCount = mergedTasks.filter(t => !t.completed && t.dueDate && t.dueDate.getTime() < todayTime).length;

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
            renderTasks();
            if (!hideCompleted) scrollToFirstIncomplete();
        });
    }

    if (assigneeFilter) {
        assigneeFilter.addEventListener('change', function() {
            currentAssigneeFilter = this.value;
            renderTasks();
        });
    }
    
    const projFilter = document.getElementById('project-filter');
    if (projFilter) {
        projFilter.addEventListener('change', function() {
            renderTasks();
        });
    }
}

function generateId() { return 'task_' + Math.random().toString(36).substr(2, 9); }

window.openAddModal = function(dateStr) {
    if (!projectNumber || isGlobalView) return;
    document.getElementById('add-name').value = '';
    document.getElementById('add-assignee').value = '';
    document.getElementById('add-target-date').value = dateStr;
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
    const targetDateStr = document.getElementById('add-target-date').value;

    if (!name) return alert("Task name is required.");

    let dueDate = (targetDateStr && targetDateStr !== 'No Date') ? new Date(targetDateStr + 'T00:00:00') : null;

    mergedTasks.push({
        id: generateId(),
        category: 'Custom Tasks',
        subCategory: '',
        name: name,
        assignee: assignee || 'Unassigned',
        targetDateStr: targetDateStr,
        dueDate: dueDate,
        completed: false,
        notes: "",
        isCustom: true
    });

    closeModals();
    renderTasks(); 
    triggerGlideSave();
}

init();
