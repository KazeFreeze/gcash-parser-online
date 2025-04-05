// Wait for the DOM to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
  // Set PDF.js worker source - THIS IS THE CRITICAL FIX
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs";
  }

  // Set PDF.js worker path for GCashPDFParser if that function exists
  if (window.GCashPDFParser && window.GCashPDFParser.setPdfWorkerPath) {
    window.GCashPDFParser.setPdfWorkerPath(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs"
    );
  }

  // --- DOM Elements ---
  const form = document.getElementById("parser-form");
  const fileInput = document.getElementById("pdfFile");
  const passwordInput = document.getElementById("pdfPassword");
  const parseButton = document.getElementById("parseButton");
  const statusDiv = document.getElementById("status");
  const outputSection = document.getElementById("output-section");
  const resultsTableBody = document.getElementById("resultsBody");
  const downloadCsvButton = document.getElementById("downloadCsvButton");

  let currentCsvBlobUrl = null; // To store the Blob URL for cleanup
  let csvData = null; // To store the generated CSV data

  // --- Event Listener ---
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // Prevent default form submission

    const file = fileInput.files[0];
    const password = passwordInput.value;

    // Basic validation
    if (!file) {
      showStatus("Please select a PDF file.", "error");
      return;
    }
    if (!password) {
      showStatus("Please enter the PDF password.", "error");
      return;
    }
    if (
      typeof window.GCashPDFParser === "undefined" ||
      typeof window.GCashPDFParser.parseGCashPDF === "undefined"
    ) {
      showStatus("Error: GCash Parser library not loaded correctly.", "error");
      console.error(
        "GCashPDFParser or parseGCashPDF function not found on window object."
      );
      return;
    }

    // Disable button, show loading state
    parseButton.disabled = true;
    parseButton.textContent = "Parsing...";
    showStatus("Reading file...", "info");
    hideOutput();

    try {
      // Create a new file reader to read the file once
      const fileReader = new FileReader();

      fileReader.onload = async function () {
        try {
          showStatus("Parsing PDF... This may take a moment.", "info");

          // Create two separate copies of the ArrayBuffer for the two parsing operations
          const fileData = fileReader.result;

          // For transactions parsing - make a copy
          const transactionsBuffer = fileData.slice(0);
          // For CSV parsing - make another copy
          const csvBuffer = fileData.slice(0);

          try {
            // Parse the PDF to get transactions
            const transactions = await window.GCashPDFParser.parseGCashPDF(
              transactionsBuffer,
              password
            );

            // Get the CSV data directly from the library
            csvData = await window.GCashPDFParser.parseGCashPDFtoCSV(
              csvBuffer,
              password
            );

            showStatus(
              `Successfully parsed ${transactions.length} transactions.`,
              "success"
            );
            displayTable(transactions);
            setupCSVDownload(csvData);
            showOutput();
          } catch (error) {
            console.error("Parsing Error:", error);
            let errorMessage = "Failed to parse PDF. ";
            if (
              error.message &&
              error.message.toLowerCase().includes("password")
            ) {
              errorMessage += "Incorrect password?";
            } else if (
              error.message &&
              error.message.includes("invalid pdf structure")
            ) {
              errorMessage +=
                "The PDF structure might be unsupported or corrupted.";
            } else {
              errorMessage +=
                "Please check the password and ensure it is a valid GCash statement. See console for details.";
            }
            showStatus(errorMessage, "error");
            hideOutput();
          }
        } catch (parseError) {
          console.error("Parsing Error:", parseError);
          showStatus("Error parsing the file. Please try again.", "error");
        } finally {
          // Re-enable button
          parseButton.disabled = false;
          parseButton.textContent = "Parse PDF";
        }
      };

      fileReader.onerror = function () {
        console.error("FileReader Error:", fileReader.error);
        showStatus("Error reading the file. Please try again.", "error");
        parseButton.disabled = false;
        parseButton.textContent = "Parse PDF";
      };

      // Read the file as an ArrayBuffer
      fileReader.readAsArrayBuffer(file);
    } catch (fileError) {
      console.error("File Reading Error:", fileError);
      showStatus("Error reading the file. Please try again.", "error");
      parseButton.disabled = false;
      parseButton.textContent = "Parse PDF";
    }
  });

  // --- Helper Functions ---

  function showStatus(message, type = "info") {
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`; // Reset classes and add new ones
    statusDiv.classList.remove("hidden");
  }

  function hideStatus() {
    statusDiv.classList.add("hidden");
    statusDiv.textContent = "";
    statusDiv.className = "status-message"; // Reset classes
  }

  function showOutput() {
    outputSection.classList.remove("hidden");
  }

  function hideOutput() {
    outputSection.classList.add("hidden");
    resultsTableBody.innerHTML = ""; // Clear table
    downloadCsvButton.disabled = true;
    // Clean up previous blob URL if exists
    if (currentCsvBlobUrl) {
      URL.revokeObjectURL(currentCsvBlobUrl);
      currentCsvBlobUrl = null;
      downloadCsvButton.removeAttribute("href");
      downloadCsvButton.removeAttribute("download");
    }
  }

  function displayTable(transactions) {
    resultsTableBody.innerHTML = ""; // Clear previous results

    if (!transactions || transactions.length === 0) {
      const row = resultsTableBody.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 6; // Span across all columns
      cell.textContent = "No transactions found or extracted.";
      cell.style.textAlign = "center";
      return;
    }

    transactions.forEach((tx) => {
      const row = resultsTableBody.insertRow();
      row.insertCell().textContent = tx.dateTime || "";
      row.insertCell().textContent = tx.description || "";
      row.insertCell().textContent = tx.referenceNo || "";
      row.insertCell().textContent = tx.debit || "";
      row.insertCell().textContent = tx.credit || "";
      row.insertCell().textContent = tx.balance || "";
    });
  }

  function setupCSVDownload(csvContent) {
    // Clean up previous blob URL if exists before creating a new one
    if (currentCsvBlobUrl) {
      URL.revokeObjectURL(currentCsvBlobUrl);
      currentCsvBlobUrl = null;
    }

    if (!csvContent) {
      downloadCsvButton.disabled = true;
      return;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    currentCsvBlobUrl = URL.createObjectURL(blob); // Store the new URL

    downloadCsvButton.href = currentCsvBlobUrl;
    // Suggest a filename based on the date
    const date = new Date();
    const formattedDate = `${date.getFullYear()}${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;
    downloadCsvButton.download = `gcash_transactions_${formattedDate}.csv`;
    downloadCsvButton.disabled = false;
  }
}); // End DOMContentLoaded
