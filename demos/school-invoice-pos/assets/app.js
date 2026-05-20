(function () {
  const API_URL = "api.php";
  const LOCAL_KEY = "afss_fee_pos_fallback_records";
  const DRAFT_KEY = "afss_fee_pos_draft";

  const templates = {
    standard: [
      ["Tuition fee per term", 0, 1],
      ["Examination", 0, 1],
      ["Utility", 0, 1],
      ["Practicals", 0, 1],
      ["Development Levy", 0, 1],
      ["Hygiene", 0, 1],
      ["End of Session", 0, 1],
      ["Diction", 0, 1],
      ["Year Book", 0, 1],
      ["Internet Service", 0, 1],
      ["Boarding & Reading", 0, 1],
      ["Transport", 0, 1],
      ["Others", 0, 1]
    ],
    day: [
      ["Tuition fee per term", 85000, 1],
      ["Examination", 15000, 1],
      ["Utility", 10000, 1],
      ["Development Levy", 15000, 1],
      ["Hygiene", 5000, 1],
      ["Internet Service", 5000, 1]
    ],
    boarding: [
      ["Tuition fee per term", 85000, 1],
      ["Boarding & Reading", 95000, 1],
      ["Examination", 15000, 1],
      ["Utility", 10000, 1],
      ["Development Levy", 15000, 1],
      ["Hygiene", 5000, 1],
      ["Internet Service", 5000, 1]
    ],
    exam: [
      ["Examination", 25000, 1],
      ["Practicals", 10000, 1],
      ["Diction", 5000, 1]
    ]
  };

  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });
  const plainNumber = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
  let activeRecordId = "";
  let backendOnline = true;

  function formatMoney(value) {
    return money.format(Number(value || 0));
  }

  function formatPlain(value) {
    return plainNumber.format(Number(value || 0));
  }

  function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  async function api(action, payload) {
    try {
      const options = payload ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      } : {};
      const response = await fetch(API_URL + "?action=" + encodeURIComponent(action), options);
      if (!response.ok) throw new Error("Backend request failed");
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Backend error");
      backendOnline = true;
      return data;
    } catch (error) {
      backendOnline = false;
      throw error;
    }
  }

  async function apiForm(action, formData) {
    try {
      const response = await fetch(API_URL + "?action=" + encodeURIComponent(action), {
        method: "POST",
        body: formData
      });
      if (!response.ok) throw new Error("Backend request failed");
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Backend error");
      backendOnline = true;
      return data;
    } catch (error) {
      backendOnline = false;
      throw error;
    }
  }

  function readLocalRecords() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); }
    catch (_e) { return []; }
  }

  function writeLocalRecords(records) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(records));
  }

  function makeId(prefix) {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    return prefix + "-" + stamp + "-" + Math.floor(100 + Math.random() * 900);
  }

  function statusFor(total, paid) {
    if (total <= 0 && paid <= 0) return "Draft";
    if (paid <= 0) return "Unpaid";
    if (paid >= total) return "Paid";
    return "Part Payment";
  }

  function addFeeRow(name = "", unitPrice = 0, qty = 1) {
    const tr = document.createElement("tr");
    tr.innerHTML = [
      '<td><input class="item-name" data-item="name" type="text" value="' + escapeHtml(name) + '" placeholder="Fee item"></td>',
      '<td><input data-item="unitPrice" type="number" min="0" step="0.01" value="' + unitPrice + '"></td>',
      '<td><input data-item="qty" type="number" min="1" step="1" value="' + qty + '"></td>',
      '<td data-row-total>' + formatMoney(unitPrice * qty) + '</td>',
      '<td><button class="icon-btn" type="button" title="Remove item">x</button></td>'
    ].join("");
    tr.addEventListener("input", updateAll);
    tr.querySelector(".icon-btn").addEventListener("click", function () {
      tr.remove();
      if (!document.querySelector("#feeBody tr")) addFeeRow();
      updateAll();
    });
    $("feeBody").appendChild(tr);
  }

  function getFeeRows() {
    return Array.from(document.querySelectorAll("#feeBody tr")).map((row) => {
      const name = row.querySelector("[data-item='name']").value.trim();
      const unitPrice = numberValue(row.querySelector("[data-item='unitPrice']").value);
      const qty = numberValue(row.querySelector("[data-item='qty']").value) || 1;
      return { name, unitPrice, qty, amount: unitPrice * qty };
    }).filter((item) => item.name || item.amount > 0);
  }

  function calculate() {
    const items = getFeeRows();
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const previousPaid = numberValue($("previousPaid").value);
    const paidNow = numberValue($("amountPaidNow").value);
    const totalPaid = previousPaid + paidNow;
    return {
      items,
      total,
      previousPaid,
      paidNow,
      totalPaid,
      balance: Math.max(total - totalPaid, 0),
      status: statusFor(total, totalPaid)
    };
  }

  function getDraft() {
    const calc = calculate();
    return {
      id: activeRecordId,
      invoiceNo: $("receiptInvoiceNo").textContent === "Not saved" ? "" : $("receiptInvoiceNo").textContent,
      receiptNo: $("receiptNo").textContent === "Pending" ? "" : $("receiptNo").textContent,
      studentName: $("studentName").value.trim(),
      admissionNo: $("admissionNo").value.trim(),
      studentClass: $("studentClass").value,
      termSession: $("termSession").value,
      parentName: $("parentName").value.trim(),
      parentPhone: $("parentPhone").value.trim(),
      previousPaid: calc.previousPaid,
      paidNow: calc.paidNow,
      paymentMethod: $("paymentMethod").value,
      paymentReference: $("paymentReference").value.trim(),
      cashierName: $("cashierName").value.trim(),
      paymentDate: $("paymentDate").value || todayIso(),
      items: calc.items,
      total: calc.total,
      totalPaid: calc.totalPaid,
      balance: calc.balance,
      status: calc.status
    };
  }

  function updateRowTotals() {
    document.querySelectorAll("#feeBody tr").forEach((row) => {
      const unitPrice = numberValue(row.querySelector("[data-item='unitPrice']").value);
      const qty = numberValue(row.querySelector("[data-item='qty']").value) || 1;
      row.querySelector("[data-row-total]").textContent = formatMoney(unitPrice * qty);
    });
  }

  function numberToWords(num) {
    num = Math.floor(Number(num || 0));
    if (num === 0) return "Zero";
    const belowTwenty = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    function chunk(n) {
      if (n < 20) return belowTwenty[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + belowTwenty[n % 10] : "");
      return belowTwenty[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + chunk(n % 100) : "");
    }
    const units = [["Billion", 1000000000], ["Million", 1000000], ["Thousand", 1000]];
    const parts = [];
    for (const [label, value] of units) {
      if (num >= value) {
        parts.push(chunk(Math.floor(num / value)) + " " + label);
        num %= value;
      }
    }
    if (num) parts.push(chunk(num));
    return parts.join(" ");
  }

  function updateReceipt() {
    const record = getDraft();
    $("summaryTotal").textContent = formatMoney(record.total);
    $("summaryPaid").textContent = formatMoney(record.totalPaid);
    $("summaryBalance").textContent = formatMoney(record.balance);
    $("summaryStatus").textContent = record.status;
    $("receiptStatus").textContent = record.status;
    $("receiptDate").textContent = record.paymentDate || "-";
    $("receiptPrintedDate").textContent = record.paymentDate || "Date";
    $("receiptStudent").textContent = record.studentName || "Student name";
    $("receiptClass").textContent = record.studentClass || "-";
    $("receiptTerm").textContent = record.termSession || "-";
    $("receiptParent").textContent = [record.parentName, record.parentPhone].filter(Boolean).join(" - ") || "-";
    $("receiptTotal").textContent = formatPlain(record.total);
    $("receiptPrevious").textContent = formatMoney(record.previousPaid);
    $("receiptNow").textContent = formatMoney(record.paidNow);
    $("receiptPaid").textContent = formatMoney(record.totalPaid);
    $("receiptBalance").textContent = formatMoney(record.balance);
    $("amountWords").textContent = numberToWords(record.totalPaid) + " Naira Only";
    $("receiptMethod").textContent = "Payment method: " + record.paymentMethod + (record.paymentReference ? " (" + record.paymentReference + ")" : "");
    $("receiptCashier").textContent = record.cashierName || "Receiver's Signature";

    const body = $("receiptItems");
    body.innerHTML = "";
    record.items.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + escapeHtml(item.name || "Fee item") + "</td><td>" + formatPlain(item.unitPrice) + "</td><td>" + formatPlain(item.amount) + "</td>";
      body.appendChild(tr);
    });
    if (!record.items.length) body.innerHTML = '<tr><td>No fee items added</td><td>0</td><td>0</td></tr>';
    localStorage.setItem(DRAFT_KEY, JSON.stringify(record));
  }

  function updateAll() {
    updateRowTotals();
    updateReceipt();
  }

  function validate(record) {
    if (!record.studentName) return "Enter the student full name.";
    if (!record.admissionNo) return "Enter the admission number.";
    if (!record.studentClass) return "Select a class.";
    if (!record.termSession) return "Select the term/session.";
    if (!record.items.length || record.total <= 0) return "Add at least one fee item with an amount.";
    if (record.totalPaid <= 0) return "Enter the amount paid or previously paid.";
    if (!record.cashierName) return "Enter the receiver's name.";
    return "";
  }

  async function saveRecord() {
    const record = getDraft();
    const error = validate(record);
    if (error) {
      $("status").textContent = error;
      return;
    }

    try {
      const data = await api("save", record);
      loadRecord(data.record, false, true);
      await renderRecords();
      $("status").textContent = data.updatedExisting
        ? "Existing backend invoice updated. Balance/status recalculated."
        : "Payment saved to backend. Receipt is ready.";
    } catch (_error) {
      const records = readLocalRecords();
      const match = records.find((item) => item.id === record.id || (!record.id && item.admissionNo === record.admissionNo && item.studentClass === record.studentClass && item.termSession === record.termSession && item.balance > 0));
      const next = mergeRecord(match, record);
      if (match) records[records.indexOf(match)] = next;
      else records.unshift(next);
      writeLocalRecords(records);
      loadRecord(next, false, true);
      await renderRecords();
      $("status").textContent = "Saved locally because the PHP backend is not running. Use through a PHP server for backend storage.";
    }
  }

  function applyStudent(student) {
    if (!student) return false;
    $("studentName").value = student.studentName || "";
    $("studentClass").value = student.studentClass || "";
    $("parentName").value = student.parentName || "";
    $("parentPhone").value = student.parentPhone || "";
    $("studentMatch").textContent = "Loaded student: " + (student.studentName || "Unnamed student") + " (" + (student.admissionNo || "No admission number") + ").";
    updateAll();
    return true;
  }

  async function getStudents() {
    try {
      const data = await api("students");
      return data.students || [];
    } catch (_error) {
      return [];
    }
  }

  async function findStudentByAdmissionNo(admissionNo) {
    const key = String(admissionNo || "").trim().toLowerCase();
    if (!key) return null;
    return (await getStudents()).find((student) => String(student.admissionNo || "").trim().toLowerCase() === key) || null;
  }

  function mergeRecord(existing, incoming) {
    const base = existing || {
      id: makeId("AFSS-PAY"),
      invoiceNo: makeId("AFSS-INV"),
      receiptNo: makeId("AFSS-RCPT"),
      payments: []
    };
    const payments = Array.isArray(base.payments) ? base.payments.slice() : [];
    if (!existing && incoming.previousPaid > 0) payments.push(paymentEntry(incoming.previousPaid, incoming, "Previous payment"));
    if (incoming.paidNow > 0) payments.push(paymentEntry(incoming.paidNow, incoming, "Current payment"));
    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const total = incoming.total || base.total || 0;
    return {
      ...base,
      ...incoming,
      id: base.id,
      invoiceNo: base.invoiceNo,
      receiptNo: base.receiptNo,
      previousPaid: Math.max(totalPaid - incoming.paidNow, 0),
      paidNow: incoming.paidNow,
      payments,
      totalPaid,
      balance: Math.max(total - totalPaid, 0),
      status: statusFor(total, totalPaid),
      savedAt: new Date().toISOString()
    };
  }

  function paymentEntry(amount, record, label) {
    return {
      amount: Number(amount || 0),
      label,
      method: record.paymentMethod,
      reference: record.paymentReference,
      cashierName: record.cashierName,
      date: record.paymentDate || todayIso()
    };
  }

  function loadRecord(record, announce = true, keepPaidNow = false) {
    activeRecordId = record.id || "";
    $("invoiceBadge").textContent = record.invoiceNo || "New invoice";
    $("receiptInvoiceNo").textContent = record.invoiceNo || "Not saved";
    $("receiptNo").textContent = record.receiptNo || "Pending";
    $("studentName").value = record.studentName || "";
    $("admissionNo").value = record.admissionNo || "";
    $("studentClass").value = record.studentClass || "";
    $("termSession").value = record.termSession || "";
    $("parentName").value = record.parentName || "";
    $("parentPhone").value = record.parentPhone || "";
    $("previousPaid").value = Number(record.totalPaid || 0) - (keepPaidNow ? Number(record.paidNow || 0) : 0);
    $("amountPaidNow").value = keepPaidNow ? Number(record.paidNow || 0) : 0;
    $("paymentMethod").value = record.paymentMethod || "Cash";
    $("paymentReference").value = record.paymentReference || "";
    $("cashierName").value = record.cashierName || "";
    $("paymentDate").value = record.paymentDate || todayIso();
    $("feeBody").innerHTML = "";
    (record.items && record.items.length ? record.items : [{ name: "Tuition fee per term", unitPrice: 0, qty: 1 }]).forEach((item) => addFeeRow(item.name, item.unitPrice, item.qty));
    updateAll();
    if (announce) $("status").textContent = "Loaded " + (record.invoiceNo || "draft") + ". Enter a new amount paid now to update this invoice.";
  }

  function newPayment() {
    activeRecordId = "";
    $("invoiceBadge").textContent = "New invoice";
    $("receiptInvoiceNo").textContent = "Not saved";
    $("receiptNo").textContent = "Pending";
    $("studentName").value = "";
    $("admissionNo").value = "";
    $("studentClass").value = "";
    $("termSession").value = "";
    $("parentName").value = "";
    $("parentPhone").value = "";
    $("previousPaid").value = 0;
    $("amountPaidNow").value = 0;
    $("paymentMethod").value = "Cash";
    $("paymentReference").value = "";
    $("cashierName").value = "";
    $("paymentDate").value = todayIso();
    $("feeTemplate").value = "standard";
    $("feeBody").innerHTML = "";
    templates.standard.forEach((item) => addFeeRow(item[0], item[1], item[2]));
    updateAll();
    $("status").textContent = "Ready for a new payment.";
  }

  async function getRecords() {
    try {
      const data = await api("list");
      return data.records || [];
    } catch (_error) {
      return readLocalRecords();
    }
  }

  async function renderStudents() {
    const students = await getStudents();
    $("studentCountBadge").textContent = students.length + (students.length === 1 ? " student" : " students");

    const options = $("studentAdmissionList");
    options.innerHTML = "";
    students.forEach((student) => {
      const option = document.createElement("option");
      option.value = student.admissionNo || "";
      option.label = [student.studentName, student.studentClass].filter(Boolean).join(" - ");
      options.appendChild(option);
    });

    const body = $("studentsBody");
    body.innerHTML = "";
    students.slice(0, 100).forEach((student) => {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + escapeHtml(student.admissionNo || "") + "</td>",
        "<td>" + escapeHtml(student.studentName || "") + "</td>",
        "<td>" + escapeHtml(student.studentClass || "") + "</td>",
        "<td>" + escapeHtml(student.parentName || "") + "</td>",
        "<td>" + escapeHtml(student.parentPhone || "") + "</td>"
      ].join("");
      body.appendChild(tr);
    });
    if (!students.length) {
      body.innerHTML = '<tr><td colspan="5">No students imported yet.</td></tr>';
    }
  }

  async function renderRecords() {
    const query = $("recordSearch").value.trim().toLowerCase();
    const records = (await getRecords()).filter((record) => [record.studentName, record.admissionNo, record.studentClass, record.termSession, record.invoiceNo, record.status].join(" ").toLowerCase().includes(query));
    const body = $("recordsBody");
    body.innerHTML = "";
    records.forEach((record) => {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        "<td>" + escapeHtml(record.paymentDate || "") + "</td>",
        "<td>" + escapeHtml(record.studentName || "") + "</td>",
        "<td>" + escapeHtml(record.studentClass || "") + "</td>",
        "<td>" + escapeHtml(record.termSession || "") + "</td>",
        "<td>" + escapeHtml(record.invoiceNo || "") + "</td>",
        "<td>" + formatMoney(record.total) + "</td>",
        "<td>" + formatMoney(record.totalPaid) + "</td>",
        "<td>" + formatMoney(record.balance) + "</td>",
        '<td><span class="pill">' + escapeHtml(record.status) + "</span></td>",
        '<td><div class="records-actions"><button class="mini-btn" data-load="' + record.id + '" type="button">Load</button><button class="mini-btn" data-print="' + record.id + '" type="button">Print</button><button class="mini-btn danger" data-delete="' + record.id + '" type="button">Delete</button></div></td>'
      ].join("");
      body.appendChild(tr);
    });
    if (!records.length) body.innerHTML = '<tr><td colspan="10">No payment records found.</td></tr>';
    if (!backendOnline) $("status").textContent = "Backend not detected yet. Start this folder with PHP to save into data/records.json.";
  }

  async function deleteRecord(id) {
    try {
      await api("delete", { id });
    } catch (_error) {
      writeLocalRecords(readLocalRecords().filter((record) => record.id !== id));
    }
    await renderRecords();
    $("status").textContent = "Payment record deleted.";
  }

  async function findRecord(id) {
    return (await getRecords()).find((record) => record.id === id);
  }

  async function exportCsv() {
    const records = await getRecords();
    if (!records.length) {
      $("status").textContent = "No records to export yet.";
      return;
    }
    const headers = ["Date", "Student", "Admission No", "Class", "Term/Session", "Invoice", "Receipt", "Total", "Paid", "Balance", "Status", "Method", "Reference", "Receiver"];
    const rows = records.map((record) => [record.paymentDate, record.studentName, record.admissionNo, record.studentClass, record.termSession, record.invoiceNo, record.receiptNo, record.total, record.totalPaid, record.balance, record.status, record.paymentMethod, record.paymentReference, record.cashierName]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => '"' + String(cell || "").replace(/"/g, '""') + '"').join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "afss-fee-pos-records.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function downloadStudentTemplate() {
    const rows = [
      ["Admission No", "Student Name", "Class", "Parent Name", "Phone", "Gender", "Address"],
      ["AFSS/2026/001", "Sample Student", "JSS 1", "Sample Parent", "08000000000", "Female", "Egosi-Ile"]
    ];
    const csv = rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "afss-student-import-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importStudents(event) {
    event.preventDefault();
    const file = $("studentFile").files[0];
    if (!file) {
      $("status").textContent = "Select a CSV or XLSX student file first.";
      return;
    }
    const formData = new FormData();
    formData.append("studentFile", file);
    try {
      const data = await apiForm("importStudents", formData);
      await renderStudents();
      $("studentImportForm").reset();
      $("status").textContent = "Imported " + data.imported + " student(s). Updated " + data.updated + " existing record(s).";
    } catch (error) {
      $("status").textContent = error.message || "Student import failed. Use CSV, or enable PHP Zip for XLSX.";
    }
  }

  function applyTemplate(key) {
    if (!templates[key]) return;
    $("feeBody").innerHTML = "";
    templates[key].forEach((item) => addFeeRow(item[0], item[1], item[2]));
    updateAll();
  }

  function showView(viewId) {
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("active", view.id === viewId);
    });
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-view") === viewId);
    });
  }

  $("paymentDate").value = todayIso();
  templates.standard.forEach((item) => addFeeRow(item[0], item[1], item[2]));
  ["studentName", "studentClass", "termSession", "parentName", "parentPhone", "previousPaid", "amountPaidNow", "paymentMethod", "paymentReference", "cashierName", "paymentDate"].forEach((id) => {
    $(id).addEventListener("input", updateAll);
    $(id).addEventListener("change", updateAll);
  });
  $("admissionNo").addEventListener("input", updateAll);
  $("admissionNo").addEventListener("change", async function () {
    const student = await findStudentByAdmissionNo(this.value);
    if (!applyStudent(student)) {
      $("studentMatch").textContent = this.value.trim()
        ? "No student found for admission number: " + this.value.trim()
        : "Enter an admission number to load a student from the database.";
      updateAll();
    }
  });
  $("feeTemplate").addEventListener("change", function () { applyTemplate(this.value); });
  $("addFeeBtn").addEventListener("click", function () { addFeeRow(); updateAll(); });
  $("clearFeesBtn").addEventListener("click", function () { $("feeBody").innerHTML = ""; addFeeRow(); updateAll(); });
  $("newPaymentBtn").addEventListener("click", newPayment);
  $("saveBtn").addEventListener("click", saveRecord);
  $("printBtn").addEventListener("click", function () { updateAll(); window.print(); });
  $("exportBtn").addEventListener("click", exportCsv);
  $("studentImportForm").addEventListener("submit", importStudents);
  $("downloadStudentTemplateBtn").addEventListener("click", downloadStudentTemplate);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", function () {
      showView(this.getAttribute("data-view"));
    });
  });
  $("recordSearch").addEventListener("input", renderRecords);
  $("recordsBody").addEventListener("click", async function (event) {
    const loadId = event.target.getAttribute("data-load");
    const printId = event.target.getAttribute("data-print");
    const deleteId = event.target.getAttribute("data-delete");
    if (deleteId) {
      if (confirm("Delete this payment record?")) await deleteRecord(deleteId);
      return;
    }
    const id = loadId || printId;
    if (!id) return;
    const record = await findRecord(id);
    if (!record) return;
    loadRecord(record);
    if (printId) window.print();
  });

  const savedDraft = localStorage.getItem(DRAFT_KEY);
  if (savedDraft) {
    try {
      const draft = JSON.parse(savedDraft);
      if (draft && !draft.id) loadRecord(draft, false);
    } catch (_e) {
      updateAll();
    }
  } else {
    updateAll();
  }
  renderRecords();
  renderStudents();
})();
