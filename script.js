// Wait for the DOM to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
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

  // --- PDF.js Worker Configuration ---
  // The UMD build of gcash-pdf-parser bundles pdf.js. We need to tell
  // *that* bundled pdf.js where to find its worker script.
  // We try setting the global workerSrc assuming the library uses it.
  // IMPORTANT: The path must be correct relative to where the worker script is served.
  // Using the CDN link directly is often the easiest for GitHub Pages.
  if (window.pdfjsLib) {
    // Use version matching the one potentially bundled or use a recent stable one
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;
    console.log("pdf.js worker source configured.");
  } else if (
    window.GCashPDFParser &&
    window.GCashPDFParser.GCashPDFParser &&
    typeof window.GCashPDFParser.GCashPDFParser.setWorkerSrc === "function"
  ) {
    // Ideal scenario: If the library explicitly provides a method
    window.GCashPDFParser.GCashPDFParser.setWorkerSrc(
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`
    );
    console.log("pdf.js worker source configured via library method.");
  } else {
    console.warn(
      "Could not automatically configure pdf.js worker. Parsing might fail. Ensure 'pdf.worker.min.mjs' is accessible or workerSrc is set correctly."
    );
    // Attempting a best guess - assumes the library exposes pdfjsLib under its namespace
    try {
      if (window.GCashPDFParser && window.GCashPDFParser.pdfjsLib) {
        window.GCashPDFParser.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;
        console.log(
          "Attempted worker configuration via GCashPDFParser.pdfjsLib"
        );
      }
    } catch (e) {}
  }

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

    // Read file as ArrayBuffer
    const reader = new FileReader();
    reader.onload = async (e) => {
      const pdfData = e.target.result; // ArrayBuffer

      try {
        showStatus("Parsing PDF... This may take a moment.", "info");

        // --- Call the Parser ---
        const transactions = await window.GCashPDFParser.parseGCashPDF(
          pdfData,
          password
        );

        showStatus(
          `Successfully parsed ${transactions.length} transactions.`,
          "success"
        );
        displayTable(transactions);
        setupCSVDownload(transactions);
        showOutput();
      } catch (error) {
        console.error("Parsing Error:", error);
        let errorMessage = "Failed to parse PDF. ";
        if (error.message.toLowerCase().includes("password")) {
          errorMessage += "Incorrect password?";
        } else if (error.message.includes("invalid pdf structure")) {
          errorMessage +=
            "The PDF structure might be unsupported or corrupted.";
        } else {
          errorMessage +=
            "Please check the password and ensure it is a valid GCash statement. See console for details.";
        }
        showStatus(errorMessage, "error");
        hideOutput();
      } finally {
        // Re-enable button
        parseButton.disabled = false;
        parseButton.textContent = "Parse PDF";
      }
    };

    reader.onerror = () => {
      showStatus("Error reading the selected file.", "error");
      parseButton.disabled = false;
      parseButton.textContent = "Parse PDF";
    };

    reader.readAsArrayBuffer(file);
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

  function generateCSV(transactions) {
    if (!transactions || transactions.length === 0) {
      return "";
    }

    const header = [
      "Date and Time",
      "Description",
      "Reference No",
      "Debit",
      "Credit",
      "Balance",
    ];
    // Escape commas and quotes within fields
    const escapeCsvCell = (cellData) => {
      const strData = String(cellData || ""); // Ensure it's a string
      // If data contains comma, newline, or double quote, enclose in double quotes
      if (
        strData.includes(",") ||
        strData.includes("\n") ||
        strData.includes('"')
      ) {
        // Escape existing double quotes by doubling them
        const escapedData = strData.replace(/"/g, '""');
        return `"${escapedData}"`;
      }
      return strData;
    };

    const rows = transactions.map((tx) =>
      [
        escapeCsvCell(tx.dateTime),
        escapeCsvCell(tx.description),
        escapeCsvCell(tx.referenceNo),
        escapeCsvCell(tx.debit),
        escapeCsvCell(tx.credit),
        escapeCsvCell(tx.balance),
      ].join(",")
    );

    return [header.join(","), ...rows].join("\n");
  }

  function setupCSVDownload(transactions) {
    // Clean up previous blob URL if exists before creating a new one
    if (currentCsvBlobUrl) {
      URL.revokeObjectURL(currentCsvBlobUrl);
      currentCsvBlobUrl = null;
    }

    const csvContent = generateCSV(transactions);
    if (!csvContent) {
      downloadCsvButton.disabled = true;
      return;
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    currentCsvBlobUrl = URL.createObjectURL(blob); // Store the new URL

    downloadCsvButton.href = currentCsvBlobUrl;
    // Suggest a filename based on the date maybe?
    const date = new Date();
    const formattedDate = `${date.getFullYear()}${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;
    downloadCsvButton.download = `gcash_transactions_${formattedDate}.csv`;
    downloadCsvButton.disabled = false;

    // Optional: Add listener to revoke URL after click (might be handled by browser anyway)
    // downloadCsvButton.onclick = () => {
    //     setTimeout(() => {
    //         if (currentCsvBlobUrl) {
    //             URL.revokeObjectURL(currentCsvBlobUrl);
    //             currentCsvBlobUrl = null;
    //             console.log("Blob URL revoked after download click.");
    //         }
    //     }, 100); // Delay allows download to initiate
    // };
  }
}); // End DOMContentLoaded
