const API_URL = "https://script.google.com/macros/s/AKfycbxgxo2KgMZustxuRkWLXebUxoHvGFIRGkrr3L--QiXWdOqYUdHmjwicQagTDSsb81MQ/exec";
const STORE_KEY = "attendancePortalData";
const DB_NAME = "AttendanceDB";
const DB_VERSION = 1;
const STUDENT_STORE = "students";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STUDENT_STORE)) {
        const store = db.createObjectStore(STUDENT_STORE, {
          keyPath: "id"
        });

        store.createIndex("name", "name", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveStudentsToIndexedDB(students) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STUDENT_STORE, "readwrite");
    const store = tx.objectStore(STUDENT_STORE);

    store.clear();

    students.forEach(student => store.put(student));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function searchStudentsFromIndexedDB(keyword) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STUDENT_STORE, "readonly");
    const store = tx.objectStore(STUDENT_STORE);

    const req = store.getAll();

    req.onsuccess = () => {
      const value = keyword.toLowerCase();

      resolve(
        req.result.filter(student =>
          student.name?.toLowerCase().includes(value) ||
          student.phone?.includes(value) ||
          student.parentName?.toLowerCase().includes(value)
        )
      );
    };

    req.onerror = () => reject(req.error);
  });
}
const ADMIN = {
  id: "default_admin",
  username: "admin",
  password: "admin123",
  name: "Admin",
  phone: "",
  role: "admin",
  status: "active",
  image: "",
  addedDate: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
function isValidPhone(phone) {
  return /^[6-9]\d{9}$/.test(phone);
}

let state = loadState();
let currentUser = null;
let activeTab = "";
let loadingCount = 0;

const today = new Date().toISOString().slice(0, 10);
$("#joiningDate").value = today;
$("#attendanceMonth").value = today.slice(0, 7);

function loadState() {
  const stored = localStorage.getItem(STORE_KEY);
  if (stored) return JSON.parse(stored);
  return {
    students: [],
    operators: [],
    attendance: []
  };
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

async function apiRequest(action, payload = {}) {
  try {
    const form = new URLSearchParams();
    form.set("action", action);
    Object.entries(payload).forEach(([key, value]) => {
      form.set(key, typeof value === "string" ? value : JSON.stringify(value));
    });

    const response = await fetch(API_URL, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: form.toString()
    });
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    console.warn("Apps Script API unavailable, using local data.", error);
    return null;
  }
}

function setLoading(isLoading, text = "Loading...") {
  loadingCount = Math.max(0, loadingCount + (isLoading ? 1 : -1));
  const active = loadingCount > 0;
  $("#loadingText").textContent = text;
  $("#loadingOverlay").classList.toggle("hidden", !active);
  document.body.classList.toggle("is-loading", active);
  $$("button, input, select, textarea").forEach((element) => {
    if (element.id !== "profileImageInput") element.disabled = active;
  });
  if (currentUser?.role === "parent") $("#profileImageBtn").disabled = true;
}

async function withLoading(text, task) {
  setLoading(true, text);
  try {
    return await task();
  } finally {
    setLoading(false, text);
  }
}

async function refreshData() {
  const data = await apiRequest("list");
  if (data?.students || data?.operators || data?.attendance) {
    mergeApiData(data);
  }
  return data;
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function makeCredential(name, role) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || role;
  const pin = Math.floor(1000 + Math.random() * 9000);
  return {
    username: `${role}_${base}${pin}`,
    password: `${role}@${pin}`
  };
}

function imageToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");

    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");

        const MAX = 60; // 🔥 VERY SMALL
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));

        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 🔥 EXTREME COMPRESSION
        const base64 = canvas.toDataURL("image/jpeg", 0.2);

        console.log("Image size:", base64.length); // debug

        resolve(base64);
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

function placeholderImage(name) {
  const initials = encodeURIComponent((name || "ST").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase());
  return `https://placehold.co/160x160/e7eef8/172033?text=${initials}`;
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = $("#loginUsername").value.trim();
  const password = $("#loginPassword").value.trim();
  $("#loginError").textContent = "";

  const apiLogin = await withLoading("Signing in...", () => apiRequest("login", { username, password }));
if (apiLogin?.success && apiLogin.data) {
  mergeApiData(apiLogin.data);

  if (apiLogin.user) {
    currentUser = normalizeLoginUser(apiLogin.user);

    localStorage.setItem("loggedInUser", JSON.stringify(currentUser));

    // Redirect to dashboard page
    window.location.replace("index.html");
    return;
  }
}

  const localUser = findLocalLogin(username, password);
 if (localUser) {
  currentUser = localUser;

  // ✅ SAVE SESSION
  localStorage.setItem("loggedInUser", JSON.stringify(currentUser));
  if (currentUser.role === "parent") {
    location.reload();
    return;
  }
  showDashboard();
  return;
}
  $("#loginError").textContent = "Invalid login details or inactive account.";
});

$("#logoutBtn").addEventListener("click", () => {
  currentUser = null;

  // ✅ CLEAR SESSION
  localStorage.removeItem("loggedInUser");

  $("#dashboardView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");
});

async function showDashboard() {
  $("#loginView").classList.add("hidden");
  $("#dashboardView").classList.remove("hidden");
$("#roleLabel").textContent = currentUser.name || capitalize(currentUser.role);

// Optional: keep dashboard title clean
$("#dashboardTitle").textContent = "Dashboard";
  $("#headerAvatar").src = getCurrentUserImage();
  $("#profileImageBtn").disabled = currentUser.role === "parent";

  $("#adminTabs").classList.toggle("hidden", currentUser.role !== "admin");
  $("#operatorTabs").classList.toggle("hidden", currentUser.role !== "operator");

  hideAllPanels();
  if (currentUser.role === "admin") {
    const savedTab = localStorage.getItem("activeTab") || "addStudent";
await showTab(savedTab);
  } else if (currentUser.role === "operator") {
    await showTab("attendance");
  } else {
    $("#parentPanel").classList.remove("hidden");
    renderParentDashboard();
  }
}

function hideAllPanels() {
  ["addStudent", "students", "credentials", "operators", "attendance", "parent"].forEach((name) => {
    $(`#${name}Panel`)?.classList.add("hidden");
  });
}

async function showTab(tab) {
  if (activeTab === tab) return; // 🚫 avoid re-render

  activeTab = tab;

  // 👉 Active state
  $$(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  // 👉 Smooth panel switching
  const panels = $$(".panel");

  panels.forEach((panel) => {
    panel.style.opacity = "0";
    panel.style.transform = "translateY(10px)";
    panel.classList.add("hidden");
  });

  const activePanel = $(`#${tab}Panel`);
  if (activePanel) {
    activePanel.classList.remove("hidden");

    requestAnimationFrame(() => {
      activePanel.style.opacity = "1";
      activePanel.style.transform = "translateY(0)";
    });
  }

  // 👉 Load attendance only when needed
  if (tab === "attendance") {
    await withLoading("Loading attendance...", refreshData);
  }

  renderAll();
}

$$(".tab-btn").forEach((button) => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
});

// Validate student image on file selection
$("#studentImage").addEventListener("change", (e) => {
  const file = e.target.files[0];

  if (!file) return;

  // Check image type
  if (!file.type.startsWith("image/")) {
    showToast("Please select a valid image.", "error");
    e.target.value = "";
    return;
  }

  // Check size (100 KB)
  if (file.size > 100 * 1024) {
    showToast("Image size should not exceed 100 KB.", "error");
    e.target.value = "";
    return;
  }
});

$("#studentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#studentId").value;
  const existing = state.students.find((student) => student.id === id);
  const studentFile = $("#studentImage").files[0];

if (studentFile && studentFile.size > 100 * 1024) {
  showToast("Image size should not exceed 100 KB.", "error");
  return;
}

const fileImage = await imageToDataUrl(studentFile);
  const formData = {
    id: id || makeId("student"),
    image: fileImage || existing?.image || "",
    name: $("#studentName").value.trim(),
    phone: $("#studentPhone").value.trim(),
    parentName: $("#parentName").value.trim(),
    parentPhone: $("#parentPhone").value.trim(),
    studying: $("#studying").value,
    joiningDate: $("#joiningDate").value,
    addedDate: existing?.addedDate || today,
    role: "student",
    status: $("#studentStatus").value
  };

  if (existing) {
    Object.assign(existing, formData);
    await withLoading("Saving student...", async () => {
      await apiRequest("updateStudent", { student: existing });
      await refreshData();
    });
    showPreview(existing, "studentPreview");
  } else {
    const credential = makeCredential(formData.name, "parent");
    const student = { ...formData, ...credential };
    state.students.unshift(student);
    await withLoading("Saving student...", async () => {
      await apiRequest("createStudent", { student });
      await refreshData();
    });
    showPreview(student, "studentPreview");
  }

  saveState();
  renderAll();
  resetStudentForm();
});

$("#clearStudentForm").addEventListener("click", resetStudentForm);

function resetStudentForm() {
  $("#studentForm").reset();
  $("#studentId").value = "";
  $("#joiningDate").value = today;
  $("#studentStatus").value = "active";

   // Clear uploaded image
  $("#studentImage").value = "";
  $("#imagePreview").src = "";
  $("#imagePreview").style.display = "none";
  $("#uploadIcon").style.display = "block";
}

function resetOperatorForm() {
  $("#operatorForm").reset();
  $("#operatorId").value = "";
  $("#operatorRole").value = "operator";
}

$("#operatorForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const btn = event.target.querySelector("button[type='submit']");
  const originalText = btn.textContent;

  btn.disabled = true;
  btn.textContent = "Adding staff...";

  try {
    const name = $("#operatorName").value.trim();
    const phone = $("#operatorPhone").value.trim();

    if (!name) {
      showToast("Name is required", "error");
      return;
    }

    // ✅ CREATE OPERATOR OBJECT (FIX)
    const operator = {
      id: makeId("operator"),
      name,
      phone,
      role: "operator",
      status: "active",
      ...makeCredential(name, "operator")
    };

    await withLoading("Saving staff...", async () => {
      await apiRequest("createOperator", { operator });
      await refreshData();
    });

    showToast("Operator saved successfully", "success");
    resetOperatorForm();
    renderOperators();
    $("#operatorModal").close();

  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

$("#attendanceMonth").addEventListener("change", async () => {
  await withLoading("Loading attendance...", refreshData);
  renderAttendance();
});
$("#closeModal").addEventListener("click", () => $("#studentModal").close());
$("#profileImageBtn").addEventListener("click", () => {
  if (currentUser?.role !== "parent") $("#profileImageInput").click();
});
$("#profileImageInput").addEventListener("change", updateCurrentUserImage);
$("#closeCredentialModal").addEventListener("click", () => $("#credentialModal").close());
$("#credentialForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const student = state.students.find((item) => item.id === $("#credentialStudentId").value);
  if (!student) return;

  student.username = $("#credentialUsername").value.trim();
  student.password = $("#credentialPassword").value.trim();
  saveState();
  $("#credentialModal").close();
  renderAll();
  await withLoading("Saving login...", async () => {
    await apiRequest("updateStudent", { student });
    await refreshData();
  });
  renderAll();
});

function showPreview(item, targetId) {
  const target = $(`#${targetId}`);
  const isStudent = Boolean(item.parentName);

  target.innerHTML = `
    <img class="avatar" src="${item.image || placeholderImage(item.name)}" alt="${item.name}">
    <div class="meta-grid">
      <div class="meta-item"><span>${isStudent ? "Student" : "Operator"}</span><strong>${item.name}</strong></div>
      ${isStudent ? `<div class="meta-item"><span>Parent</span><strong>${item.parentName}</strong></div>` : ""}
      <div class="meta-item"><span>Username</span><strong>${item.username}</strong></div>
      <div class="meta-item"><span>Password</span><strong>${item.password}</strong></div>
    </div>
  `;

  target.classList.remove("hidden");

  // Hide after 10 seconds
  clearTimeout(target.hideTimer);
  target.hideTimer = setTimeout(() => {
    target.classList.add("hidden");
    target.innerHTML = "";
  }, 10000);
}

function renderAll() {
  renderStudents();
  renderCredentials();
  renderOperators();
  renderAttendance();
}

function activeStudents() {
  return state.students.filter((student) => student.status !== "deleted");
}

function renderStudents(students = null) {

  students = students || activeStudents();

  $("#studentsTable").innerHTML = students.map((student) => `
    <tr>
      <td>
        <div class="student-cell">
          <img class="avatar" src="${student.image || placeholderImage(student.name)}" alt="${student.name}">
          <strong>${student.name}</strong>
        </div>
      </td>
      <td>${student.phone}</td>
      <td>${student.parentName}<br><small>${student.parentPhone}</small></td>
      <td>${student.studying}</td>
      <td><span class="status ${student.status}">${capitalize(student.status)}</span></td>
      <td>${student.username}</td>
      <td>${student.password}</td>
      <td>
        <div class="actions">
          <button class="small-btn" onclick="editStudent('${student.id}')">Edit</button>
          <button class="small-btn ${student.status === "active" ? "warning" : "success"}" onclick="toggleStudent('${student.id}')">${student.status === "active" ? "Suspend" : "Active"}</button>
          <button class="small-btn danger" onclick="softDeleteStudent('${student.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="8">No students added yet.</td></tr>`;
}

window.editStudent = (id) => {
  const student = state.students.find((item) => item.id === id);
  if (!student) return;
  $("#studentId").value = student.id;
  $("#studentName").value = student.name;
  $("#studentPhone").value = student.phone;
  $("#parentName").value = student.parentName;
  $("#parentPhone").value = student.parentPhone;
  $("#studying").value = student.studying;
  $("#joiningDate").value = student.joiningDate;
  $("#studentStatus").value = student.status;
  showTab("addStudent");
};

window.toggleStudent = async (id) => {
  const student = state.students.find((item) => item.id === id);
  if (!student) return;
  student.status = student.status === "active" ? "suspended" : "active";
  saveState();
  await withLoading("Updating student...", async () => {
    await apiRequest("updateStudent", { student });
    await refreshData();
  });
  renderAll();
};

window.softDeleteStudent = async (id) => {
  const student = state.students.find((item) => item.id === id);
  if (!student) return;
  student.status = "deleted";
  saveState();
  await withLoading("Deleting student...", async () => {
    await apiRequest("deleteStudent", { id });
    await refreshData();
  });
  renderAll();
};

function renderCredentials() {
  $("#credentialList").innerHTML = activeStudents().map((student) => `
    <article class="credential-row">
      <img class="avatar" src="${student.image || placeholderImage(student.name)}" alt="${student.name}">
      
      <div>
        <strong>${student.name}</strong>

        <div class="meta-grid">
          <div class="meta-item">
            <span>Student Phone</span>
            <strong>${student.phone || "-"}</strong>
          </div>

          <div class="meta-item">
            <span>Parent Name</span>
            <strong>${student.parentName || "-"}</strong>
          </div>

          <div class="meta-item">
            <span>Parent Phone</span>
            <strong>${student.parentPhone || "-"}</strong>
          </div>

          <div class="meta-item">
            <span>Class</span>
            <strong>${student.studying || "-"}</strong>
          </div>

          <div class="meta-item">
            <span>Joining Date</span>
            <strong>${formatDate(student.joiningDate)}</strong>
          </div>

          <div class="meta-item">
            <span>Status</span>
            <strong>${capitalize(student.status)}</strong>
          </div>

          <div class="meta-item">
            <span>Username</span>
            <strong>${student.username}</strong>
          </div>

          <div class="meta-item">
            <span>Password</span>
            <strong>${student.password}</strong>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="small-btn" onclick="openCredentialModal('${student.id}')">
          Edit Login
        </button>
      </div>
    </article>
  `).join("") || `<p>No student login credentials yet.</p>`;
}

window.openCredentialModal = (id) => {
  const student = state.students.find((item) => item.id === id);
  if (!student) return;
  $("#credentialStudentId").value = student.id;
  $("#credentialUsername").value = student.username || "";
  $("#credentialPassword").value = student.password || "";
  $("#credentialModal").showModal();
};

window.resetPassword = async (id) => {
  const student = state.students.find((item) => item.id === id);
  if (!student) return;
  student.password = makeCredential(student.name, "parent").password;
  saveState();
  await apiRequest("resetPassword", { id, password: student.password });
  renderAll();
};



function renderOperators() {
  $("#operatorList").innerHTML = state.operators.filter((operator) => operator.status !== "deleted").map((operator) => `
    <article class="credential-row">
      <img class="avatar" src="${operator.image || placeholderImage(operator.name)}" alt="${operator.name}">
      <div>
        <strong>${operator.name}</strong>
        <div class="meta-grid">
          <div class="meta-item"><span>Role</span><strong>${capitalize(operator.role || "operator")}</strong></div>
          <div class="meta-item"><span>Phone</span><strong>${operator.phone}</strong></div>
          <div class="meta-item"><span>Status</span><strong>${capitalize(operator.status || "active")}</strong></div>
          <div class="meta-item"><span>Username</span><strong>${operator.username}</strong></div>
          <div class="meta-item"><span>Password</span><strong>${operator.password}</strong></div>
        </div>
      </div>
      <div class="actions">
        <button class="small-btn" onclick="editOperator('${operator.id}')">Edit</button>
        <button class="small-btn ${operator.status === "active" ? "warning" : "success"}" onclick="toggleOperator('${operator.id}')">${operator.status === "active" ? "Suspend" : "Active"}</button>
        <button class="small-btn danger" onclick="deleteOperator('${operator.id}')">Delete</button>
      </div>
    </article>
  `).join("") || `<p>No operators added yet.</p>`;
}

$("#operatorModalForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!validateOperatorForm()) return;

  const id = $("#modalOperatorId").value;
  const operator = state.operators.find((item) => item.id === id);
  if (!operator) return;

  operator.name = $("#modalOperatorName").value.trim();
  operator.phone = $("#modalOperatorPhone").value.trim();
  operator.role = $("#modalOperatorRole").value;

  const newImage = $("#modalOperatorPreview").dataset.image;
  if (newImage) operator.image = newImage;

  saveState();
  $("#operatorModal").close();

  await withLoading("Updating operator...", async () => {
    await apiRequest("createOperator", { operator }); // or updateOperator
    await refreshData();
  });

  renderOperators();
});

$("#closeOperatorModal").addEventListener("click", () => {
  $("#operatorModal").close();
});

window.editOperator = (id) => {
  const operator = state.operators.find((item) => item.id === id);
  if (!operator) return;

  $("#modalOperatorId").value = operator.id;
  $("#modalOperatorName").value = operator.name || "";
  $("#modalOperatorPhone").value = operator.phone || "";
  $("#modalOperatorRole").value = operator.role || "operator";

  $("#modalOperatorPreview").src =
    operator.image || placeholderImage(operator.name);

  $("#operatorModal").showModal();
};

$("#uploadBtn").addEventListener("click", () => {
  $("#modalOperatorImage").click();
});

$("#modalOperatorImage").addEventListener("change", async (e) => {
 const file = e.target.files[0];
if (!file) return;

if (file.size > 100 * 1024) {
  showToast("Image size should not exceed 100 KB.", "error");
  e.target.value = "";
  return;
}

const base64 = await imageToDataUrl(file);
  $("#modalOperatorPreview").src = base64;

  // temporarily store
  $("#modalOperatorPreview").dataset.image = base64;
});

function validateOperatorForm() {
  let valid = true;

  const name = $("#modalOperatorName").value.trim();
  const phone = $("#modalOperatorPhone").value.trim();

  $("#nameError").textContent = "";
  $("#phoneError").textContent = "";

  if (!name) {
    $("#nameError").textContent = "Name is required";
    valid = false;
  }

  // ✅ ENABLE THIS (your regex)
  // if (!/^[6-9]\d{9}$/.test(phone)) {
  //   $("#phoneError").textContent = "Enter valid 10-digit phone";
  //   valid = false;
  // }

  return valid;
}


window.toggleOperator = async (id) => {
  const operator = state.operators.find((item) => item.id === id);
  if (!operator) return;
  operator.status = operator.status === "active" ? "suspended" : "active";
  saveState();
  await withLoading("Updating staff...", async () => {
    await apiRequest("createOperator", { operator });
    await refreshData();
  });
  renderOperators();
};

window.deleteOperator = async (id) => {
  const operator = state.operators.find((item) => item.id === id);
  if (!operator) return;
  operator.status = "deleted";
  saveState();
  await withLoading("Deleting staff...", async () => {
    await apiRequest("deleteOperator", { id });
    await refreshData();
  });
  renderOperators();
};

function countMonthlyAttendance(studentId, month) {
  return state.attendance.filter((item) =>
    item.studentId === studentId &&
    normalizeDateString(item.date).startsWith(month)
  ).length;
}


function renderAttendance(students = null) {

    students = students || activeStudents().filter(
        student => student.status === "active"
    );

    const dates = getAttendanceDates();
    const selectedMonth = $("#attendanceMonth").value || today.slice(0, 7);

    if (!students.length) {
        $("#attendanceList").innerHTML = "<p>No active students available.</p>";
        return;
    }

  $("#attendanceList").innerHTML = `
    <div class="attendance-table-wrap">
      <table class="attendance-table">
        <thead>
          <tr>
            <th class="sticky-col">Student</th>
            <th>Total</th>
            ${dates.map((date) => `<th class="${isSunday(date) ? "holiday-head" : ""}">${formatShortDate(date)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${students.map((student) => `
            <tr>
              <td class="sticky-col">
                <div class="student-cell">
                  <img class="avatar" src="${student.image || placeholderImage(student.name)}" alt="${student.name}">
                  <div>
                    <button class="link-btn" onclick="openStudentModal('${student.id}')">${student.name}</button>

                  </div>
                </div>
              </td>
            <td><strong>${countMonthlyAttendance(student.id, selectedMonth)}</strong></td>
              ${dates.map((date) => attendanceCell(student, date)).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function attendanceCell(student, date) {
  if (isSunday(date)) {
    return `<td class="holiday-cell">Holiday</td>`;
  }

  // ✅ FIX: Compare using Date objects
  if (student.joiningDate) {
    const join = new Date(student.joiningDate + "T00:00:00");
    const current = new Date(date + "T00:00:00");

    if (current < join) {
      return `<td class="muted-cell">-</td>`;
    }
  }

  const present = hasAttendance(student.id, date);

  return `
    <td>
      <label class="check-cell">
       <input type="checkbox"
  ${present ? "checked" : ""}
  onchange="markAttendance('${student.id}', '${date}', this.checked, this)">
<span></span>
      </label>
    </td>
  `;
}

function getAttendanceDates() {
  const selectedMonth = $("#attendanceMonth").value || today.slice(0, 7);
  const [year, month] = selectedMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const dates = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${selectedMonth}-${String(day).padStart(2, "0")}`;
    if (date > today) break;
    dates.push(date);
  }

  return dates;
}

function isSunday(date) {
  return new Date(`${date}T00:00:00`).getDay() === 0;
}

function formatShortDate(date) {
  const value = new Date(`${date}T00:00:00`);
  return value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short"
  });
}

window.markAttendance = async (studentId, date, checked, el) => {
  const existing = state.attendance.find(
    (item) =>
      item.studentId === studentId &&
      normalizeDateString(item.date) === date
  );

  const shouldBePresent =
    typeof checked === "boolean" ? checked : !existing;

  // Update state
  if (existing) {
    state.attendance = state.attendance.filter(
      (item) =>
        !(
          item.studentId === studentId &&
          normalizeDateString(item.date) === date
        )
    );
  }

  if (shouldBePresent) {
    state.attendance.push({
      id: makeId("att"),
      studentId,
      date,
      status: "present",
    });
  }

  saveState();

  // ✅ ONLY update total cell instead of full render
  const row = el.closest("tr");
  const totalCell = row.querySelector("td:nth-child(2)");
  const selectedMonth = $("#attendanceMonth").value;

  totalCell.innerHTML = `<strong>${countMonthlyAttendance(
    studentId,
    selectedMonth
  )}</strong>`;

  // API call (no UI block)
  apiRequest("attendance", {
    studentId,
    date,
    present: shouldBePresent,
  }).catch(() => console.warn("Sync failed"));
};

window.openStudentModal = (id) => {
  const student = state.students.find((item) => item.id === id);
  if (!student) return;
  const month = new Date().toISOString().slice(0, 7);
  const monthPresent = state.attendance.filter((item) => item.studentId === id && item.date.startsWith(month)).length;
  const days = buildMonthDays(id, month);
  $("#studentModalBody").innerHTML = `
    <div class="preview-card">
      <img class="avatar" src="${student.image || placeholderImage(student.name)}" alt="${student.name}">
      <div class="meta-grid">
        <div class="meta-item"><span>Student</span><strong>${student.name}</strong></div>
        <div class="meta-item"><span>Parent</span><strong>${student.parentName}</strong></div>
        <div class="meta-item"><span>Joined</span><strong>${formatDate(student.joiningDate)}</strong></div>
        <div class="meta-item"><span>Total days present</span><strong>${monthPresent} days</strong></div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><span>Total Present</span><strong>${countAttendance(id)}</strong></div>
      <div class="stat"><span>Current Month</span><strong>${monthPresent}</strong></div>
      <div class="stat"><span>Studying</span><strong>${student.studying}</strong></div>
      <div class="stat"><span>Status</span><strong>${capitalize(student.status)}</strong></div>
    </div>
    <div class="month-grid">${days}</div>
  `;
  $("#studentModal").showModal();
};

function buildMonthDays(studentId, month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const totalDays = new Date(year, monthNumber, 0).getDate();

  let html = "";

  // Monday = 0 ... Sunday = 6
  let firstDay = new Date(year, monthNumber - 1, 1).getDay();
  firstDay = firstDay === 0 ? 6 : firstDay - 1;

  // Empty cells before the 1st day
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="day-box empty"></div>`;
  }

  // Days
  for (let day = 1; day <= totalDays; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;

    const sunday = isSunday(date);

    const className = sunday
      ? "holiday"
      : hasAttendance(studentId, date)
      ? "present"
      : "";

    html += `
      <div class="day-box ${className}">
        ${sunday ? "Sun" : day}
      </div>
    `;
  }

  return html;
}
function renderParentDashboard() {
  const student = state.students.find((item) => item.id === currentUser.studentId);
  if (!student) {
    $("#parentDashboard").innerHTML = "<p>Student data not found.</p>";
    return;
  }
  const month =
  $("#parentMonthFilter")?.value ||
  new Date().toISOString().slice(0, 7);
  const total = countAttendance(student.id);
  const monthTotal = state.attendance.filter((item) => item.studentId === student.id && item.date.startsWith(month)).length;
  $("#parentDashboard").innerHTML = `
    <div class="panel-title">
      <div>
        <h2>${student.name}</h2>
        <p>${student.studying} · Joined ${formatDate(student.joiningDate)} · Added ${formatDate(student.addedDate)}</p>
      </div>
      <button class="ghost-btn dwn-rert-btn" onclick="downloadReport('${student.id}')"><img src="./images/download.png" alt="Download Report Card" style="width: 16px; height: 16px; margin-right: 8px;">Download Report Card</button>
    </div>
    <article class="parent-card">
      <img class="avatar" src="${student.image || placeholderImage(student.name)}" alt="${student.name}">
      <div class="meta-grid">
        <div class="meta-item"><span>Parent</span><strong>${student.parentName}</strong></div>
        <div class="meta-item"><span>Phone</span><strong>${student.parentPhone}</strong></div>
        <div class="meta-item"><span>Username</span><strong>${student.username}</strong></div>
        <div class="meta-item"><span>Password</span><strong>${student.password}</strong></div>
      </div>
    </article>
    <div class="stats">
      <div class="stat"><span>Total Present</span><strong>${total}</strong></div>
      <div class="stat"><span>Total days present</span><strong>${monthTotal}</strong></div>
      <div class="stat"><span>Status</span><strong>${capitalize(student.status)}</strong></div>
      <div class="stat"><span>Class</span><strong>${student.studying}</strong></div>
    </div>
    <div class="month-grid">${buildMonthDays(student.id, month)}</div>
  `;
}

function getCurrentUserImage() {
  if (!currentUser) return placeholderImage("User");

  if (currentUser.role === "admin") {
    const admin = state.operators.find((item) => item.id === currentUser.id);
    return admin?.image || currentUser.image || placeholderImage(currentUser.name || "Admin");
  }

  if (currentUser.role === "operator") {
    return currentUser.image || placeholderImage(currentUser.name);
  }

  if (currentUser.role === "parent") {
    const student = state.students.find((item) => item.id === currentUser.studentId);
    return student?.image || placeholderImage(currentUser.name);
  }

  return placeholderImage(currentUser.name || "User");
}

async function updateCurrentUserImage() {
  const file = $("#profileImageInput").files[0];

  if (!file) return;

  // Validate image type
  if (!file.type.startsWith("image/")) {
    showToast("Please select a valid image.", "error");
    $("#profileImageInput").value = "";
    return;
  }

  // Validate size (100 KB)
  if (file.size > 100 * 1024) {
    showToast("Image size should not exceed 100 KB.", "error");
    $("#profileImageInput").value = "";
    return;
  }

  const image = await imageToDataUrl(file);

  if (!image || !currentUser || currentUser.role === "parent") return;

  await withLoading("Saving image...", async () => {
    let staff = state.operators.find((item) => item.id === currentUser.id);

    if (!staff && currentUser.role === "admin") {
      staff = {
        id: ADMIN.id,
        name: "Admin",
        username: "admin",
        password: "admin123",
        role: "admin",
        status: "active",
        addedDate: today,
        image: ""
      };

      state.operators.unshift(staff);
    }

    if (!staff) return;

    staff.image = image;
    currentUser.image = image;

    $("#headerAvatar").src = image + "?t=" + Date.now();

    saveState();

    const res = await apiRequest("updateProfileImage", {
      id: staff.id,
      role: staff.role || currentUser.role,
      image
    });

    console.log("Image upload response:", res);

    await refreshData();

    const freshStaff = state.operators.find((item) => item.id === staff.id);
    if (freshStaff) currentUser = normalizeLoginUser(freshStaff);

    $("#headerAvatar").src = getCurrentUserImage();
    renderOperators();
  });
}

function findLocalLogin(username, password) {
  if (username === ADMIN.username && password === ADMIN.password) {
    const storedAdmin = state.operators.find((item) => item.id === ADMIN.id);
    return { ...ADMIN, ...storedAdmin, role: "admin" };
  }

  const staff = state.operators.find((item) => item.username === username && item.password === password && item.status !== "deleted" && item.status !== "suspended");
  if (staff) return normalizeLoginUser(staff);

  const student = state.students.find((item) => item.username === username && item.password === password && item.status !== "deleted");
  if (student) return { role: "parent", studentId: student.id, name: student.parentName, image: student.image };

  return null;
}

function normalizeLoginUser(user) {
  if (user.role === "student" || user.parentName) {
    return { role: "parent", studentId: user.id, name: user.parentName, image: user.image };
  }
  return { ...user, role: user.role || "operator" };
}

window.downloadReport = (id) => {
  const student = state.students.find((item) => item.id === id);
  if (!student) return;
  const rows = state.attendance
    .filter((item) => item.studentId === id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => `${item.date},Present`)
    .join("\n");
  const content = [
    "Student Attendance Report",
    `Student,${student.name}`,
    `Parent,${student.parentName}`,
    `Studying,${student.studying}`,
    `Joining Date,${student.joiningDate}`,
    `Added Date,${student.addedDate}`,
    `Total Present,${countAttendance(id)}`,
    "",
    "Date,Status",
    rows
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${student.name.replace(/\s+/g, "_")}_report.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

function hasAttendance(studentId, date) {
  return state.attendance.some((item) => item.studentId === studentId && normalizeDateString(item.date) === date);
}

function countAttendance(studentId) {
  return state.attendance.filter((item) => item.studentId === studentId).length;
}
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDateString(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return formatLocalDate(value);
  }

  const raw = String(value);

  // 🔥 HANDLE ISO DATE PROPERLY (LOCAL TIME)
  if (raw.includes("T")) {
    const d = new Date(raw);
    return formatLocalDate(d);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    return `${slash[3]}-${String(slash[2]).padStart(2, "0")}-${String(slash[1]).padStart(2, "0")}`;
  }

  return raw.slice(0, 10);
}

function formatDate(value) {
  if (!value) return "-";
  const raw = String(value);
  const date = raw.includes("T") ? new Date(raw) : new Date(`${raw}T00:00:00`);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function capitalize(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}

function mergeApiData(data) {
  if (Array.isArray(data)) {
    state.students = data;
    saveState();
    saveStudentsToIndexedDB(state.students);
    return;
  }
  if (Array.isArray(data.students)) state.students = data.students.map((student) => ({
    role: "student",
    ...student,
      phone: String(student.phone || ""),
  parentPhone: String(student.parentPhone || ""),
    addedDate: normalizeDateString(student.addedDate) || student.addedDate,
    joiningDate: normalizeDateString(student.joiningDate) || student.joiningDate
  }));
  if (Array.isArray(data.operators)) state.operators = data.operators.map((operator) => ({ role: "operator", status: "active", ...operator }));
  if (Array.isArray(data.attendance)) state.attendance = dedupeAttendance(data.attendance.map((record) => ({ ...record, date: normalizeDateString(record.date) })));
  saveState();
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

$("#modalOperatorPhone").addEventListener("input", () => {
  let phone = $("#modalOperatorPhone").value;

  // Only digits, max 10
  phone = phone.replace(/\D/g, "").slice(0, 10);
  $("#modalOperatorPhone").value = phone;

  // Live validation
  if (/^[6-9]\d{9}$/.test(phone)) {
    $("#phoneError").textContent = "";
  }
});


function dedupeAttendance(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.studentId}|${record.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

apiRequest("list").then((data) => {
  if (data?.students || data?.operators || data?.attendance) {
    mergeApiData(data);
    renderAll();
  }
});

window.addEventListener("DOMContentLoaded", () => {

  // ADD THIS
  const monthInput = $("#parentMonthFilter");
  if (monthInput) {
    monthInput.value = new Date().toISOString().slice(0, 7);
  }

  const savedUser = localStorage.getItem("loggedInUser");

  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showDashboard();
  } else {
    $("#loginView").classList.remove("hidden");
    $("#dashboardView").classList.add("hidden");
  }
});

$("#parentMonthFilter")?.addEventListener("change", () => {
  renderParentDashboard();
});
const attendanceSearch = $("#attendanceSearch");

attendanceSearch.addEventListener("input", (e) => {

    const keyword = e.target.value.trim().toLowerCase();

    if (keyword === "") {
        renderAttendance(); // Show all students
        return;
    }

    const filteredStudents = activeStudents().filter(student =>
        student.name &&
        student.name.toLowerCase().includes(keyword)
    );

    renderAttendance(filteredStudents);
});

const studentSearch = $("#studentSearch");

studentSearch.addEventListener("input", (e) => {

    const keyword = e.target.value.trim().toLowerCase();

    if (keyword === "") {
        renderStudents();
        return;
    }

    const filteredStudents = activeStudents().filter(student =>
        student.name?.toLowerCase().includes(keyword) ||
        student.phone?.includes(keyword) ||
        student.parentName?.toLowerCase().includes(keyword) ||
        student.parentPhone?.includes(keyword)
    );

    renderStudents(filteredStudents);
});


const parentMonthFilter = $("#parentMonthFilter");

parentMonthFilter.addEventListener("change", () => {
  if (!parentMonthFilter.value) {
    parentMonthFilter.value = new Date().toISOString().slice(0, 7);
  }

  renderParentDashboard();
});
$("#attendanceMonth").addEventListener("change", async () => {
  if (!$("#attendanceMonth").value) {
    $("#attendanceMonth").value = new Date().toISOString().slice(0, 7);
  }

  await withLoading("Loading attendance...", refreshData);
  renderAttendance();
});

const studentImage = document.getElementById("studentImage"); const imagePreview = document.getElementById("imagePreview"); const uploadIcon = document.getElementById("uploadIcon"); studentImage.addEventListener("change", function () { const file = this.files[0]; if (file) { const reader = new FileReader(); reader.onload = function (e) { imagePreview.src = e.target.result; imagePreview.style.display = "block"; uploadIcon.style.display = "none"; }; reader.readAsDataURL(file); } });
// Student Phone
$("#studentPhone").addEventListener("input", function () {
  this.value = this.value.replace(/\D/g, "").slice(0, 10);
});

// Parent Phone
$("#parentPhone").addEventListener("input", function () {
  this.value = this.value.replace(/\D/g, "").slice(0, 10);
});

// Student Name
$("#studentName").addEventListener("input", function () {
  this.value = this.value.replace(/[^a-zA-Z\s]/g, "");
});

// Parent Name
$("#parentName").addEventListener("input", function () {
  this.value = this.value.replace(/[^a-zA-Z\s]/g, "");
});