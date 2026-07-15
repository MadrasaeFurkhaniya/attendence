const SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/11nH6kzOViHtpgzTcOx8phg7YRJwm65OpTyYZjBGUu9g/edit?gid=0#gid=0";
const sheets = SpreadsheetApp.openByUrl(SPREADSHEET_URL);

const SHEETS = {
  students: "students",
  operators: "operators",
  attendance: "attendance"
};

const HEADERS = {
  students: [
    "id",
    "addedDate",
    "image",
    "name",
    "phone",
    "parentName",
    "parentPhone",
    "studying",
    "joiningDate",
    "status",
    "username",
    "password",
    "role"
  ],
  operators: [
    "id",
    "addedDate",
    "name",
    "phone",
    "status",
    "username",
    "password",
    "image",
    "role"
  ],
  attendance: [
    "id",
    "studentId",
    "date",
    "status",
    "markedAt"
  ]
};

function doGet() {
  return jsonResponse(getAllData());
}

function doPost(e) {
  ensureAllSheets();
  const data = e.parameter || {};
  const action = data.action || "list";

  try {
    switch (action) {
      case "list":
        return jsonResponse(getAllData());

      case "login":
        return jsonResponse(login(data));

      case "createStudent":
        return jsonResponse({ success: true, student: upsertStudent(parseJson(data.student)) });

      case "updateStudent":
        return jsonResponse({ success: true, student: upsertStudent(parseJson(data.student)) });

      case "deleteStudent":
        updateRecordStatus(SHEETS.students, data.id, "deleted");
        return jsonResponse({ success: true });

      case "resetPassword":
        updateField(SHEETS.students, data.id, "password", data.password);
        return jsonResponse({ success: true });

      case "createOperator":
        return jsonResponse({ success: true, operator: upsertOperator(parseJson(data.operator)) });

      case "updateProfileImage":
        return jsonResponse({ success: true, user: updateProfileImage(data) });

      case "deleteOperator":
        updateRecordStatus(SHEETS.operators, data.id, "deleted");
        return jsonResponse({ success: true });

      case "attendance":
        setAttendance(data.studentId, data.date, data.present === "true");
        return jsonResponse({ success: true });

      default:
        return jsonResponse({ success: false, message: "Unknown action: " + action });
    }
  } catch (error) {
    return jsonResponse({ success: false, message: error.message });
  }
}

function ensureAllSheets() {
  Object.keys(SHEETS).forEach(function(key) {
    const sheet = getOrCreateSheet(SHEETS[key]);
    ensureHeaders(sheet, HEADERS[key]);
  });
}

function getOrCreateSheet(name) {
  return sheets.getSheetByName(name) || sheets.insertSheet(name);
}

function ensureHeaders(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const missing = headers.some(function(header, index) {
    return current[index] !== header;
  });

  if (missing) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function getAllData() {
  ensureAllSheets();
  return {
    students: getRows(SHEETS.students),
    operators: getRows(SHEETS.operators),
    attendance: getRows(SHEETS.attendance)
  };
}

function getRows(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values.shift();
  return values
    .filter(function(row) {
      return row[0];
    })
    .map(function(row) {
      const record = {};
      headers.forEach(function(header, index) {
        record[header] = normalizeCellValue(header, row[index]);
      });
      return record;
    });
}

function upsertStudent(student) {
  if (!student || !student.id) throw new Error("Student id is required.");
  student.role = "student";
  return upsertRecord(SHEETS.students, HEADERS.students, student);
}

function upsertOperator(operator) {
  if (!operator || !operator.id) throw new Error("Operator id is required.");
  operator.role = operator.role || "operator";
  return upsertRecord(SHEETS.operators, HEADERS.operators, operator);
}

function upsertRecord(sheetName, headers, record) {
  const sheet = getOrCreateSheet(sheetName);
  const rowIndex = getRowIndexById(sheet, record.id);
  const row = headers.map(function(header) {
    return record[header] || "";
  });

  if (rowIndex) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return record;
}

function updateRecordStatus(sheetName, id, status) {
  updateField(sheetName, id, "status", status);
}

function updateField(sheetName, id, field, value) {
  const sheet = getOrCreateSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowIndex = getRowIndexById(sheet, id);
  const colIndex = headers.indexOf(field) + 1;

  if (!rowIndex || !colIndex) return;
  sheet.getRange(rowIndex, colIndex).setValue(value);
}

function updateProfileImage(data) {
  const id = data.id;
  const image = data.image || "";
  const role = data.role || "operator";

  if (!id) throw new Error("Profile id is required.");

  const sheet = getOrCreateSheet(SHEETS.operators);
  let rowIndex = getRowIndexById(sheet, id);

  if (!rowIndex && id === "default_admin") {
    upsertOperator({
      id: "default_admin",
      addedDate: formatDateValue(new Date()),
      name: "Admin",
      phone: "",
      status: "active",
      username: "admin",
      password: "admin123",
      image: image,
      role: "admin"
    });
    return getRows(SHEETS.operators).find(function(item) {
      return item.id === "default_admin";
    });
  }

  if (!rowIndex) throw new Error("Profile row not found.");

  updateField(SHEETS.operators, id, "image", image);
  updateField(SHEETS.operators, id, "role", role);
  return getRows(SHEETS.operators).find(function(item) {
    return item.id === id;
  });
}

function setAttendance(studentId, date, present) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    setAttendanceLocked(studentId, date, present);
  } finally {
    lock.releaseLock();
  }
}

function setAttendanceLocked(studentId, date, present) {
  const sheet = getOrCreateSheet(SHEETS.attendance);
  date = normalizeDateValue(date);
  const values = sheet.getDataRange().getValues();
  let rowIndex = null;
  const duplicateRows = [];

  for (let i = 1; i < values.length; i++) {
    if (values[i][1] == studentId && normalizeDateValue(values[i][2]) == date) {
      if (!rowIndex) {
        rowIndex = i + 1;
      } else {
        duplicateRows.push(i + 1);
      }
    }
  }

  for (let i = duplicateRows.length - 1; i >= 0; i--) {
    sheet.deleteRow(duplicateRows[i]);
  }

  if (present && !rowIndex) {
    sheet.appendRow([
      Utilities.getUuid(),
      studentId,
      date,
      "present",
      formatDateTime(new Date())
    ]);
  }

  if (present && rowIndex) {
    sheet.getRange(rowIndex, 3).setValue(date);
    sheet.getRange(rowIndex, 4).setValue("present");
    sheet.getRange(rowIndex, 5).setValue(formatDateTime(new Date()));
  }

  if (!present && rowIndex) {
    sheet.deleteRow(rowIndex);
  }
}

function login(data) {
  const username = data.username;
  const password = data.password;

  if (username === "admin" && password === "admin123") {
    const savedAdmin = getRows(SHEETS.operators).find(function(item) {
      return item.id === "default_admin";
    });
    return {
      success: true,
      data: getAllData(),
      user: savedAdmin || {
        id: "default_admin",
        name: "Admin",
        phone: "",
        username: "admin",
        password: "admin123",
        status: "active",
        role: "admin",
        image: ""
      }
    };
  }

  const staff = getRows(SHEETS.operators).find(function(item) {
    return item.username === username &&
      item.password === password &&
      item.status !== "deleted" &&
      item.status !== "suspended";
  });
  if (staff) return { success: true, data: getAllData(), user: staff };

  const student = getRows(SHEETS.students).find(function(item) {
    return item.username === username &&
      item.password === password &&
      item.status !== "deleted";
  });
  if (student) return { success: true, data: getAllData(), user: student };

  return { success: false, data: getAllData(), user: null };
}

function getRowIndexById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] == id) return i + 2;
  }
  return null;
}

function parseJson(value) {
  if (!value) return {};
  return JSON.parse(value);
}

function normalizeCellValue(header, value) {
  if (value instanceof Date) {
    if (header === "date" || header === "joiningDate" || header === "addedDate") {
      return formatDateValue(value);
    }
    return formatDateTime(value);
  }
  return value;
}

function normalizeDateValue(value) {
  if (!value) return "";
  if (value instanceof Date) return formatDateValue(value);

  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const iso = text.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (iso) return iso[1];

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    return slash[3] + "-" + String(slash[2]).padStart(2, "0") + "-" + String(slash[1]).padStart(2, "0");
  }

  return text.slice(0, 10);
}

function formatDateValue(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatDateTime(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  const h = date.getHours() % 12 || 12;
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ampm = date.getHours() >= 12 ? "PM" : "AM";

  return `${d}/${m}/${y} ${h}:${min}:${s} ${ampm}`;
}
