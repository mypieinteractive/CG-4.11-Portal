// File: tasks.js
// Version: V1.8
// Description: Introduced ENABLE_PAST_DUE_BLOCK logic. Replaced inline notes with a dedicated editing modal. Integrated generateTaskRowHtml helper function for custom SVG checkboxes and secondary note formatting.

const ENABLE_PAST_DUE_BLOCK = true; // Toggle to 'false' to revert to pure chronological sorting

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
const noteModal = document.getElementById('note-modal');
const viewToggleBtn = document.getElementById('view-toggle-btn');
const assigneeFilter = document.getElementById('assignee-filter');
const projFilterEl = document.getElementById('project-filter');

// State
let projectNumber = null;
let projectTitle = null;
let isGlobalView = false;
let hideCompleted = true; 
let currentAssigneeFilter = "All";

let masterTasks = [];
let projectsData = [];
let mergedTasks = [];
let activeProjectRowId = null;
let projectStartDate = null;
let initialRenderDone = false;

// Debounce Save State
let pendingSaveTimeout = null;
let dirtyProjects = new Set();

function init() {
    extractProjectNumber();
    setupEventListeners();

    if (projectNumber) {
        if (String(projectNumber).toLowerCase().trim() === 'global') {
            isGlobalView = true;
            document.getElementById('main-title-group').style.display = 'none';
            projFilterEl.style.display = 'flex';
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
    
    // Dynamic Background Color Injection
    let bgParam = params.get('bg');
    if (bgParam) {
        if (!bgParam.startsWith('#')) bgParam = '#' + bgParam;
        document.documentElement.style.setProperty('--bg-color', bgParam);
    }

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

        projectsData.sort((a, b) => {
            let dateA = a['GgPWW'] ? new Date(a['GgPWW']).getTime() : 0;
            let dateB = b['GgPWW'] ? new Date(b['GgPWW']).getTime() : 0;
            return dateB - dateA; 
        });

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
            
            let pt = proj['2UR8V'] || '';
            let address = proj['Name'] || '';
            let citySt = proj['8V1wO'] || '';
            let ptitle = `PT# ${pt}`;
            if (address) ptitle += ` - ${address}`;
            if (citySt) ptitle += `, ${citySt}`;
            if (!pt && !address && !citySt) ptitle = 'Unnamed Project';
            
            let shortTitle = pt ? `PT# ${pt}` : 'Project';

            let startStr = proj['GgPWW'];
            let jsonStr = proj['O2aWa'];
            let dueCount = proj['sZTch'];
            
            projOpts += `<option value="${pid}">${ptitle}</option>`;

            let needsInit = (!jsonStr || jsonStr.trim() === '' || jsonStr.trim() === '[]' || dueCount === undefined || dueCount === null || String(dueCount).trim() === '');

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
                    shortTitle: shortTitle,
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
                    shortTitle: shortTitle,
                    name: ct.name,
                    assignee: ct.assignee,
                    dueDate: dueDate,
                    completed: !!ct.completed,
                    notes: ct.notes || "",
                    isCustom: true
                });
            });

            if (needsInit) triggerGlideSave(pid);
        });
        
        projFilterEl.innerHTML = projOpts;

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
        let dueCount = activeProj['sZTch'];

        let needsInit = (!jsonStr || jsonStr.trim() === '' || jsonStr.trim() === '[]' || dueCount === undefined || dueCount === null || String(dueCount).trim() === '');

        let jsonArr = [];
        try { jsonArr = JSON.parse(jsonStr) || []; } catch(e) {}

        masterTasks.forEach(mt => {
            let savedState = jsonArr.find(j => j.id === mt.id);
            let dueDate = calculateDueDate(projectStartDate, mt.wks);
            mergedTasks.push({
                ...mt,
                projectId: activeProjectRowId,
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
                projectId: activeProjectRowId,
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

        if (needsInit) triggerGlideSave(activeProjectRowId);
    }

    populateAssigneeDropdown();
    setHeaderLoading(false);
    renderTasks();

    if (!initialRenderDone && !hideCompleted) {
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

function generateTaskRowHtml(task, hideHeaders, targetContextProjId, todayTime, forcePastDueStyling = false) {
    let taskPastDue = forcePastDueStyling || (!task.completed && task.dueDate && task.dueDate.getTime() < todayTime);
    let rowClasses = 'task-row';
    if (task.completed) rowClasses += ' completed';
    if (taskPastDue) rowClasses += ' past-due';
    if (!task.completed) rowClasses += ' incomplete-target';

    let globalBadge = hideHeaders ? `<span class="task-project-badge" data-tooltip="${task.projectTitle}">${task.shortTitle}</span>` : '';
    
    let pencilIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;

    let notesHtml = task.notes && task.notes.trim() !== '' 
        ? `<div class="task-display-notes">${task.notes.replace(/\n/g, '<br>')}</div>` 
        : '';

    let dateFlagHtml = '';
    if (forcePastDueStyling && task.dueDate) {
        let m = task.dueDate.getMonth() + 1;
        let d = task.dueDate.getDate();
        dateFlagHtml = `<span class="task-past-due-date">Due ${m}/${d}</span>`;
    }

    return `
        <div class="${rowClasses}" id="row-${task.id}">
            <div class="task-main-line">
                <div class="custom-checkbox ${task.completed ? 'checked' : ''}" onclick="toggleTaskComplete('${task.id}', ${!task.completed})">
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="task-assignee-large">${task.assignee}</div>
                <div class="task-name ${taskPastDue ? 'text-danger' : ''}">${task.name} ${globalBadge} ${dateFlagHtml}</div>
                <button class="note-edit-btn" onclick="openNoteModal('${task.id}')" data-tooltip="Edit Notes">${pencilIcon}</button>
            </div>
            ${notesHtml}
        </div>
    `;
}

function renderTasks() {
    tasksContainer.innerHTML = '';
    
    let isProjFiltered = isGlobalView && projFilterEl && projFilterEl.value !== 'All';
    let targetContextProjId = isProjFiltered ? projFilterEl.value : (isGlobalView ? null : activeProjectRowId);
    
    let displayTasks = mergedTasks;
    if (hideCompleted) displayTasks = displayTasks.filter(t => !t.completed);
    if (currentAssigneeFilter !== 'All') {
        displayTasks = displayTasks.filter(t => (t.assignee || 'Unassigned') === currentAssigneeFilter);
    }
    if (isProjFiltered) {
        displayTasks = displayTasks.filter(t => t.projectId === targetContextProjId);
    }

    if (displayTasks.length === 0) {
        tasksContainer.innerHTML = `<div class="empty-agenda-text">No tasks available for this view.</div>`;
        updateHeaderStats();
        return;
    }

    let todayTime = new Date().setHours(0,0,0,0);
    let htmlStr = '';

    // Extractor Logic for Dedicated Past Due Block
    let pastDueTasks = [];
    let standardTasks = [];

    if (ENABLE_PAST_DUE_BLOCK) {
        displayTasks.forEach(t => {
            if (!t.completed && t.dueDate && t.dueDate.getTime() < todayTime) {
                pastDueTasks.push(t);
            } else {
                standardTasks.push(t);
            }
        });
    } else {
        standardTasks = displayTasks;
    }

    let hideHeaders = isGlobalView && !isProjFiltered;

    // Render Past Due Block First
    if (pastDueTasks.length > 0) {
        pastDueTasks.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

        htmlStr += `
            <div class="past-due-block-wrapper">
                <div class="past-due-block-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    Past Due Action Items
                </div>
        `;
        pastDueTasks.forEach(task => {
            htmlStr += generateTaskRowHtml(task, hideHeaders, targetContextProjId, todayTime, true);
        });
        htmlStr += `</div>`;
    }

    // Standard Flat Sort: Date -> Category -> SubCategory -> Name
    standardTasks.sort((a, b) => {
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

    let lookAheadLimit = todayTime + (21 * 86400000); 
    let inLookAhead = false;
    let currentCat = null;
    let currentSub = null;
    let currentDateStr = null;
    let dayRowOpen = false;

    let dateGroups = {};
    standardTasks.forEach(task => {
        let dStr = task.dueDate ? formatDateObj(task.dueDate) : 'No Date';
        if (!dateGroups[dStr]) dateGroups[dStr] = [];
        dateGroups[dStr].push(task);
    });

    Object.keys(dateGroups).forEach(dStr => {
        let dayTasks = dateGroups[dStr];
        let d = dStr !== 'No Date' ? new Date(dStr + 'T00:00:00') : null;
        
        let isLookAheadBlock = false;
        if (d) {
            let taskTime = d.getTime();
            if (taskTime <= lookAheadLimit && taskTime >= todayTime) {
                isLookAheadBlock = true;
            }
        }

        if (inLookAhead && !isLookAheadBlock && d && d.getTime() > lookAheadLimit) {
            if (dayRowOpen) { htmlStr += `</div></div>`; dayRowOpen = false; }
            htmlStr += `</div>`; 
            inLookAhead = false;
            currentCat = null; currentSub = null; // Reset to force reprint
        }

        let dateChanged = dStr !== currentDateStr;
        if (dateChanged) {
            if (dayRowOpen) {
                htmlStr += `</div></div>`;
                dayRowOpen = false;
            }
        }

        if (!inLookAhead && isLookAheadBlock) {
            htmlStr += `<div class="look-ahead-wrapper"><div class="look-ahead-title">3-Week Look Ahead</div>`;
            inLookAhead = true;
            currentCat = null; currentSub = null; currentDateStr = null; 
            dateChanged = true;
        }

        if (dateChanged) {
            let dayNum = d ? d.getDate() : '';
            let monthNum = d ? d.getMonth() + 1 : '';
            let isToday = dStr === formatDateObj(new Date());

            let hideInlineAdd = hideHeaders || dStr === 'No Date';
            let addBtnHtml = hideInlineAdd ? '' : `<button class="add-task-inline-btn" onclick="openAddModal('${dStr}', '${targetContextProjId}')" data-tooltip="Add Custom Task">+</button>`;

            htmlStr += `
                <div class="agenda-day-row ${isToday ? 'today-agenda-row' : ''}">
                    <div class="agenda-day-left">
                        <div class="agenda-date">${dStr !== 'No Date' ? monthNum+'/'+dayNum : 'TBD'}</div>
                        ${addBtnHtml}
                    </div>
                    <div class="agenda-day-right">
            `;
            currentDateStr = dStr;
            dayRowOpen = true;
            currentCat = null; currentSub = null; 
        }

        let catGroups = {};
        dayTasks.forEach(t => {
            let cat = t.category || 'Uncategorized';
            if (!catGroups[cat]) catGroups[cat] = {};
            let sub = t.subCategory || 'General';
            if (!catGroups[cat][sub]) catGroups[cat][sub] = [];
            catGroups[cat][sub].push(t);
        });

        Object.keys(catGroups).forEach(cat => {
            if (!hideHeaders && cat !== currentCat) {
                htmlStr += `<div class="task-category-header">${cat}</div>`;
                currentCat = cat;
            }
            
            Object.keys(catGroups[cat]).forEach(sub => {
                if (!hideHeaders && sub !== 'General' && sub !== '' && sub !== currentSub) {
                    htmlStr += `<div class="task-subcategory-header">${sub}</div>`;
                    currentSub = sub;
                }

                catGroups[cat][sub].forEach(task => {
                    htmlStr += generateTaskRowHtml(task, hideHeaders, targetContextProjId, todayTime, false);
                });
            });
        });
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

// Modal Note Engine
window.openNoteModal = function(taskId) {
    let t = mergedTasks.find(x => x.id === taskId);
    if (!t) return;
    document.getElementById('note-task-id').value = taskId;
    document.getElementById('note-modal-text').value = t.notes || "";
    modalOverlay.classList.remove('hidden');
    noteModal.classList.remove('hidden');
}

window.saveNoteModal = function() {
    let taskId = document.getElementById('note-task-id').value;
    let newNotes = document.getElementById('note-modal-text').value;
    let t = mergedTasks.find(x => x.id === taskId);
    if (t) {
        if (t.notes !== newNotes) {
            t.notes = newNotes;
            triggerGlideSave(t.projectId);
            renderTasks(); 
        }
    }
    closeModals();
}

function updateHeaderStats() {
    if (isGlobalView) {
        let isProjFiltered = projFilterEl && projFilterEl.value !== 'All';
        if (!isProjFiltered) {
            tasksStatus.innerText = `${mergedTasks.length} Global Tasks`;
            tasksStatus.style.color = 'var(--text-secondary)';
            return;
        }
    }

    let todayTime = new Date().setHours(0,0,0,0);
    let pastDueCount = 0;
    let pendingCount = 0;
    let contextTasks = mergedTasks;

    if (isGlobalView && projFilterEl && projFilterEl.value !== 'All') {
        contextTasks = mergedTasks.filter(t => t.projectId === projFilterEl.value);
    }

    contextTasks.forEach(t => {
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
    let t = mergedTasks.find(x => x.id === taskId);
    if (t) {
        t.completed = isChecked;
        renderTasks(); 
        triggerGlideSave(t.projectId);
    }
};

function triggerGlideSave(targetProjectId) {
    if (!targetProjectId) return;
    
    dirtyProjects.add(targetProjectId);

    if (pendingSaveTimeout) clearTimeout(pendingSaveTimeout);
    
    pendingSaveTimeout = setTimeout(() => {
        executeGlideSave();
    }, 10000); 
}

function executeGlideSave() {
    if (dirtyProjects.size === 0) return;

    let mutations = [];
    let todayTime = new Date().setHours(0,0,0,0);

    dirtyProjects.forEach(pid => {
        let projectTasks = mergedTasks.filter(t => t.projectId === pid);
        
        let payloadToSave = projectTasks.map(t => {
            if (t.isCustom) {
                return { id: t.id, isCustom: true, name: t.name, assignee: t.assignee, targetDateStr: t.targetDateStr, completed: t.completed, notes: t.notes };
            } else {
                return { id: t.id, completed: t.completed, notes: t.notes };
            }
        });

        let actionRequiredCount = projectTasks.filter(t => !t.completed && t.dueDate && t.dueDate.getTime() < todayTime).length;

        mutations.push({
            tableName: GLIDE_TABLE_ID_PROJECTS,
            rowID: pid, 
            kind: "set-columns-in-row",
            columnValues: {
                "O2aWa": JSON.stringify(payloadToSave),
                "sZTch": String(actionRequiredCount)
            }
        });
    });

    dirtyProjects.clear(); 

    fetch('https://api.glideapp.io/api/function/mutateTables', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GLIDE_TOKEN}`
        },
        body: JSON.stringify({ 
            appID: GLIDE_APP_ID,
            mutations: mutations
        })
    }).catch(err => console.error("Background Save Failed", err));
}

function setupEventListeners() {
    if (viewToggleBtn) {
        viewToggleBtn.addEventListener('click', function() {
            hideCompleted = !hideCompleted;
            document.getElementById('view-toggle-text').innerText = hideCompleted ? "Show Completed" : "Hide Completed";
            
            if(hideCompleted) {
                this.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg><span id="view-toggle-text">Show Completed</span>`;
            } else {
                this.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg><span id="view-toggle-text">Hide Completed</span>`;
            }
            
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
    
    if (projFilterEl) {
        projFilterEl.addEventListener('change', function() {
            renderTasks();
        });
    }
}

function generateId() { return 'task_' + Math.random().toString(36).substr(2, 9); }

window.openAddModal = function(dateStr, targetContextProjId) {
    if (!projectNumber) return;
    
    let isProjFiltered = isGlobalView && projFilterEl && projFilterEl.value !== 'All';
    if (isGlobalView && !isProjFiltered) return; // Failsafe
    
    let activeTargetId = targetContextProjId || activeProjectRowId;
    if (!activeTargetId) return alert("Error: Could not identify target project context.");

    let displayDate = "TBD";
    if (dateStr && dateStr !== 'No Date') {
        let d = new Date(dateStr + 'T00:00:00');
        displayDate = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`;
    }
    
    document.getElementById('add-modal-title').innerText = `Add Task: ${displayDate}`;
    document.getElementById('add-name').value = '';
    document.getElementById('add-assignee').value = '';
    document.getElementById('add-target-date').value = dateStr;
    
    // Store target ID invisibly in the modal for save usage
    document.getElementById('add-modal').setAttribute('data-target-proj', activeTargetId);

    modalOverlay.classList.remove('hidden');
    addModal.classList.remove('hidden');
}

window.closeModals = function() {
    modalOverlay.classList.add('hidden');
    addModal.classList.add('hidden');
    if (noteModal) noteModal.classList.add('hidden');
}

window.saveCustomTask = function() {
    const name = document.getElementById('add-name').value.trim();
    const assignee = document.getElementById('add-assignee').value.trim();
    const targetDateStr = document.getElementById('add-target-date').value;
    const targetProjId = document.getElementById('add-modal').getAttribute('data-target-proj');

    if (!name) return alert("Task name is required.");
    if (!targetProjId) return alert("System error: Missing project context.");

    let dueDate = (targetDateStr && targetDateStr !== 'No Date') ? new Date(targetDateStr + 'T00:00:00') : null;

    mergedTasks.push({
        id: generateId(),
        projectId: targetProjId,
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
    triggerGlideSave(targetProjId);
}

init();
