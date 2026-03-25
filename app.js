// Version: V1.1
// Changes: Initial creation of the Google Apps Script to serve as the database backend. Added a robust logExecution function that automatically creates a "Logs" tab to record all incoming requests, data writes, and errors for detailed troubleshooting.

function doPost(e) {
  const logId = Utilities.getUuid().substring(0, 8);
  logExecution(logId, 'POST Request Received', JSON.stringify(e));

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No data received in the POST request.');
    }

    const payload = JSON.parse(e.postData.contents);
    const projectNumber = payload.projectNumber;
    const eventsData = payload.eventsData; 

    if (!projectNumber) {
      throw new Error('Missing projectNumber in payload.');
    }

    logExecution(logId, 'Data Parsed', `Project: ${projectNumber}, Event Count: ${eventsData.length}`);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Data');
    if (!sheet) {
      throw new Error('Sheet named "Data" not found. Please ensure the tab is named exactly "Data".');
    }

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    let rowFound = false;

    // Search for the project number in Column A (Index 0)
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(projectNumber)) {
        // Update existing row, Column B (Index 1)
        sheet.getRange(i + 1, 2).setValue(JSON.stringify(eventsData));
        rowFound = true;
        logExecution(logId, 'Success', `Updated existing project data at row ${i + 1}`);
        break;
      }
    }

    // If project not found, append a new row
    if (!rowFound) {
      sheet.appendRow([String(projectNumber), JSON.stringify(eventsData)]);
      logExecution(logId, 'Success', 'Appended new project data to the bottom of the sheet.');
    }

    return createJsonResponse({ status: 'success', message: 'Data saved successfully.' });

  } catch (error) {
    logExecution(logId, 'ERROR', error.toString());
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

function doGet(e) {
  const logId = Utilities.getUuid().substring(0, 8);
  logExecution(logId, 'GET Request Received', JSON.stringify(e));

  try {
    const projectNumber = e.parameter.project;
    
    if (!projectNumber) {
      logExecution(logId, 'Warning', 'No project parameter provided in the URL. Returning empty data.');
      return createJsonResponse({ status: 'success', data: [] }); 
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Data');
    if (!sheet) {
      throw new Error('Sheet named "Data" not found.');
    }

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    let projectData = [];

    // Search for the project number in Column A (Index 0)
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(projectNumber)) {
        const rawJson = values[i][1];
        if (rawJson) {
          projectData = JSON.parse(rawJson);
        }
        logExecution(logId, 'Success', `Retrieved data for project ${projectNumber} at row ${i + 1}`);
        break;
      }
    }

    if (projectData.length === 0) {
      logExecution(logId, 'Notice', `No existing data found for project ${projectNumber}. Returning empty array.`);
    }

    return createJsonResponse({ status: 'success', data: projectData });

  } catch (error) {
    logExecution(logId, 'ERROR', error.toString());
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

// Helper to format JSON responses with CORS headers
function createJsonResponse(responseObject) {
  return ContentService.createTextOutput(JSON.stringify(responseObject))
    .setMimeType(ContentService.MimeType.JSON);
}

// Helper to maintain a detailed execution log in the spreadsheet
function logExecution(id, action, details) {
  console.log(`[${id}] ${action}: ${details}`); // Logs to the Apps Script dashboard
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName('Logs');
  
  // Auto-create the Logs sheet if it does not exist
  if (!logSheet) {
    logSheet = ss.insertSheet('Logs');
    logSheet.appendRow(['Timestamp', 'Execution ID', 'Action', 'Details']);
    logSheet.getRange("A1:D1").setFontWeight("bold");
    logSheet.setColumnWidth(4, 600);
  }
  
  logSheet.appendRow([new Date(), id, action, details]);
}
