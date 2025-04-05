// Modern GCash PDF Parser Script
document.addEventListener("DOMContentLoaded", () => {
  // Configure PDF.js worker path
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs";
  }

  // Set PDF.js worker path for GCashPDFParser
  if (window.GCashPDFParser && window.GCashPDFParser.setPdfWorkerPath) {
    window.GCashPDFParser.setPdfWorkerPath(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs"
    );
  }

  // DOM Elements
  const form = document.getElementById("parser-form");
  const fileInput = document.getElementById("pdfFile");
  const fileNameDisplay = document.getElementById("fileName");
  const passwordInput = document.getElementById("pdfPassword");
  const togglePasswordBtn = document.getElementById("togglePassword");
  const parseButton = document.getElementById("parseButton");
  const statusDiv = document.getElementById("status");
  const outputSection = document.getElementById("output-section");
  const resultsTableBody = document.getElementById("resultsBody");
  const downloadCsvButton = document.getElementById("downloadCsvButton");

  // State variables
  let currentCsvBlobUrl = null;
  let csvData = null;
  let isProcessing = false;

  // Update filename display when file is selected
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileNameDisplay.textContent = file ? file.name : "No file chosen";
  });

  // Toggle password visibility
  togglePasswordBtn.addEventListener("click", () => {
    const type = passwordInput.type === "password" ? "text" : "password";
    passwordInput.type = type;
    togglePasswordBtn.querySelector(".icon").textContent =
      type === "password" ? "👁️" : "🔒";
  });

  // Add click event listener for the download CSV button - FIXED IMPLEMENTATION
  downloadCsvButton.addEventListener("click", (e) => {
    e.preventDefault(); // Prevent default button behavior

    // Check if the button is disabled
    if (downloadCsvButton.disabled) {
      return;
    }

    // Check if we have CSV data
    if (csvData) {
      // Create a new blob each time to ensure fresh download
      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
      const blobUrl = URL.createObjectURL(blob);

      // Generate filename with current date
      const now = new Date();
      const formattedDate = `${now.getFullYear()}${String(
        now.getMonth() + 1
      ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const fileName = `gcash_transactions_${formattedDate}.csv`;

      // Create and trigger the download
      const tempLink = document.createElement("a");
      tempLink.href = blobUrl;
      tempLink.download = fileName;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);

      // Clean up the blob URL after download starts
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 100);

      console.log("Download initiated:", { fileName });
    } else {
      console.error("No CSV data available for download");
      showStatus("No data available for download", "error");
    }
  });

  // Form submission handler
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Prevent double submission
    if (isProcessing) return;

    const file = fileInput.files[0];
    const password = passwordInput.value;

    // Validation
    if (!file) {
      showStatus("Please select a PDF file", "error");
      return;
    }

    if (!password) {
      showStatus("Please enter the PDF password", "error");
      return;
    }

    if (!window.GCashPDFParser || !window.GCashPDFParser.parseGCashPDF) {
      showStatus("GCash Parser library not loaded correctly", "error");
      console.error("GCashPDFParser not found or incorrectly loaded");
      return;
    }

    // Start processing
    isProcessing = true;
    setLoadingState(true);
    hideOutput();

    try {
      // Read file as ArrayBuffer
      const fileBuffer = await readFileAsArrayBuffer(file);

      // Show parsing status
      showStatus("Parsing PDF statement...", "info");

      // Parse transactions (make a copy of buffer)
      const transactionsBuffer = fileBuffer.slice(0);
      const transactions = await window.GCashPDFParser.parseGCashPDF(
        transactionsBuffer,
        password
      );

      // Generate CSV (make another copy of buffer)
      const csvBuffer = fileBuffer.slice(0);
      csvData = await window.GCashPDFParser.parseGCashPDFtoCSV(
        csvBuffer,
        password
      );

      // Display results
      showStatus(
        `Successfully extracted ${transactions.length} transactions`,
        "success"
      );
      displayTransactions(transactions);
      downloadCsvButton.disabled = false;
      showOutput();
    } catch (error) {
      console.error("PDF Parsing Error:", error);

      // Determine error type and show appropriate message
      let errorMessage = "Failed to parse PDF. ";

      if (error.message?.toLowerCase().includes("password")) {
        errorMessage += "Please check if the password is correct.";
      } else if (error.message?.includes("invalid pdf structure")) {
        errorMessage +=
          "The PDF format is not supported or the file may be corrupted.";
      } else {
        errorMessage += "Please ensure this is a valid GCash statement.";
      }

      showStatus(errorMessage, "error");
    } finally {
      // Reset state
      isProcessing = false;
      setLoadingState(false);
    }
  });

  // Helper: Read file as ArrayBuffer
  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  }

  // Helper: Set loading state
  function setLoadingState(isLoading) {
    parseButton.disabled = isLoading;

    if (isLoading) {
      parseButton.innerHTML =
        '<span class="icon">⏳</span><span>Processing...</span>';
    } else {
      parseButton.innerHTML =
        '<span class="icon">🔍</span><span>Parse PDF</span>';
    }
  }

  // Helper: Show status message
  function showStatus(message, type = "info") {
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.classList.remove("hidden");
  }

  // Helper: Hide status message
  function hideStatus() {
    statusDiv.classList.add("hidden");
  }

  // Helper: Show output section
  function showOutput() {
    outputSection.classList.remove("hidden");

    // Scroll to output section with smooth animation
    outputSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Helper: Hide output section
  function hideOutput() {
    outputSection.classList.add("hidden");
    resultsTableBody.innerHTML = "";
    downloadCsvButton.disabled = true;

    // Clean up previous blob URL
    if (currentCsvBlobUrl) {
      URL.revokeObjectURL(currentCsvBlobUrl);
      currentCsvBlobUrl = null;
    }
  }

  // Helper: Display transactions in table
  function displayTransactions(transactions) {
    resultsTableBody.innerHTML = "";

    if (!transactions || transactions.length === 0) {
      const row = resultsTableBody.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 6;
      cell.textContent = "No transactions found in the statement";
      cell.className = "text-center";
      return;
    }

    // Add each transaction to the table
    transactions.forEach((tx) => {
      const row = resultsTableBody.insertRow();

      // Format cells with appropriate data
      addCell(row, tx.dateTime || "");
      addCell(row, tx.description || "");
      addCell(row, tx.referenceNo || "");
      addCell(row, tx.debit || "", tx.debit ? "debit" : "");
      addCell(row, tx.credit || "", tx.credit ? "credit" : "");
      addCell(row, tx.balance || "", "balance");
    });
  }

  // Helper: Add cell to row with optional class
  function addCell(row, content, className = "") {
    const cell = row.insertCell();
    cell.textContent = content;
    if (className) cell.className = className;
    return cell;
  }
});
