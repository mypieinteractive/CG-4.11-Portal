// File: tasks.js
// Version: V1.1
// Description: Logic engine for the Implementation Task Tracker. Groups by Date > Category > SubCategory. Autoscrolls to the first incomplete task on load.

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
let hideCompleted = false; // Default to FALSE so historical tasks are present to be scrolled up to

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
            document.getElementById('add-task-btn').style.display = 'none'; 
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
        
        projectsData.forEach(proj => {
            let pid = proj['$rowID'];
            let ptitle = proj['2UR8V'] ? `PT# ${proj['2UR8V']}` : proj['Name'] || 'Unnamed Project';
            let startStr = proj['GgPWW'];
            let jsonStr = proj['O2aWa'];

            let jsonArr = [];
            try { jsonArr = JSON.parse(jsonStr) || []; } catch(e) {}

            masterTasks.forEach(mt => {
                let savedState = jsonArr.find(j => j.id === mt.id);
                let isCompleted = savedState ? !!savedState.completed : false;
                
                if (isCompleted && hideCompleted) return; 

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
                if (ct.completed && hideCompleted) return;

                let dueDate = calculateDueDate(startStr, ct.wks);
                mergedTasks.push({
                    id: ct.id,
                    category: 'Custom',
                    subCategory: '',
                    projectId: pid,
                    projectTitle: ptitle,
                    name: ct.name,
                    wks: ct.wks,
                    assignee: ct.assignee,
                    dueDate: dueDate,
                    completed: !!ct.completed,
                    notes: ct.notes || "",
                    isCustom: true
                });
            });
        });

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
            projectDateRange.innerText = `No Start Date Configured. Tasks will not have due dates.`;
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
            let dueDate = calculateDueDate(projectStartDate, ct.wks);
            mergedTasks.push({
                id: ct.id,
                category: 'Custom',
                subCategory: '',
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

    setHeaderLoading(false);
    renderTasks();

    if (!initialRenderDone) {
        initialRenderDone = true;
        scrollToFirstIncomplete();
    }
}

function renderTasks() {
    tasksContainer.innerHTML = '';
    
    let displayTasks = mergedTasks;
    if (hideCompleted) {
        displayTasks = displayTasks.filter(t => !t.completed);
    }

    if (displayTasks.length === 0) {
        tasksContainer.innerHTML = `<div class="empty-agenda-text">No tasks available for this view.</div>`;
        updateHeaderStats();
        return;
    }

    // Sort by Due Date
    displayTasks.sort((a, b) => {
        let dateA = a.dueDate ? a.dueDate.getTime() : 9999999999999;
        let dateB = b.dueDate ? b.dueDate.getTime() : 9999999999999;
        return dateA - dateB;
    });

    let todayTime = new Date().setHours(0,0,0,0);
    let lookAheadLimit = todayTime + (21 * 86400000); // Today + 21 days

    // Grouping: Date -> Category -> SubCategory -> Tasks
    let dateGroups = {};
    displayTasks.forEach(task => {
        let dStr = task.dueDate ? formatDateObj(task.dueDate) : 'No Date';
        if (!dateGroups[dStr]) dateGroups[dStr] = [];
        dateGroups[dStr].push(task);
    });

    let htmlStr = '';
    let inLookAhead = false;

    Object.keys(dateGroups).forEach(dStr => {
        let dayTasks = dateGroups[dStr];
        let d = dStr !== 'No Date' ? new Date(dStr + 'T00:00:00') : null;
        
        let isPastDue = false;
        let isLookAheadBlock = false;

        if (d) {
            let taskTime = d.getTime();
            if (taskTime <= lookAheadLimit && taskTime >= todayTime) {
                isLookAheadBlock = true;
            }
            if (taskTime < todayTime && dayTasks.some(t => !t.completed)) {
                isPastDue = true;
            }
        }

        // Close look-ahead wrapper if we exit the zone
        if (inLookAhead && !isLookAheadBlock && d && d.getTime() > lookAheadLimit) {
            htmlStr += `</div>`; // Close wrapper
            inLookAhead = false;
        }

        // Open look-ahead wrapper if we enter the zone
        if (!inLookAhead && isLookAheadBlock) {
            htmlStr += `
                <div class="look-ahead-wrapper">
                    <div class="look-ahead-title">3-Week Look Ahead</div>
            `;
            inLookAhead = true;
        }

        let dayName = d ? d.toLocaleDateString('en-US', { weekday: 'short' }) : '';
        let dayNum = d ? d.getDate() : '';
        let monthNum = d ? d.getMonth() + 1 : '';
        let isToday = dStr === formatDateObj(new Date());

        htmlStr += `
            <div class="agenda-day-row ${isToday ? 'today-agenda-row' : ''}">
                <div class="agenda-day-left">
                    <div class="agenda-date ${isPastDue ? 'text-danger' : ''}">${dStr !== 'No Date' ? monthNum+'/'+dayNum : 'TBD'}</div>
                    <div class="agenda-day-name ${isPastDue ? 'text-danger' : ''}">${dayName}</div>
                </div>
                <div class="agenda-day-right">
        `;

        // Group by Category
        let catGroups = {};
        dayTasks.forEach(t => {
            let cat = t.category || 'Uncategorized';
            if (!catGroups[cat]) catGroups[cat] = {};
            let sub = t.subCategory || 'General';
            if (!catGroups[cat][sub]) catGroups[cat][sub] = [];
            catGroups[cat][sub].push(t);
        });

        Object.keys(catGroups).forEach(cat => {
            htmlStr += `<div class="task-category-header">${cat}</div>`;
            
            Object.keys(catGroups[cat]).forEach(sub => {
                if (sub !== 'General' && sub !== '') {
                    htmlStr += `<div class="task-subcategory-header">${sub}</div>`;
                }

                catGroups[cat][sub].forEach(task => {
                    let taskPastDue = !task.completed && d && d.getTime() < todayTime;
                    let rowClasses = 'task-row';
                    if (task.completed) rowClasses += ' completed';
                    if (taskPastDue) rowClasses += ' past-due';
                    if (!task.completed) rowClasses += ' incomplete-target'; // Marker for scroll

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
            });
        });

        htmlStr += `</div></div>`; // Close day row
    });

    if (inLookAhead) {
        htmlStr += `</div>`; // Close wrapper if ended inside
    }

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
            
            // Silently update the button text without re-rendering everything
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
            return { id: t.id, isCustom: true, name: t.name, assignee: t.assignee, wks: t.wks, completed: t.completed, notes: t.notes };
        } else {
            return { id: t.id, completed: t.completed, notes: t.notes };
        }
    });

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
            renderTasks();
            if (!hideCompleted) scrollToFirstIncomplete();
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
        category: 'Custom Tasks',
        subCategory: '',
        name: name,
        wks: wks,
        assignee: assignee || 'Unassigned',
        dueDate: dueDate,
        completed: false,
        notes: "",
        isCustom: true
    });

    closeModals();
    processAndMergeData(); 
    triggerGlideSave();
}

init();
