// ----------------------
// Parsing helpers
// ----------------------

// Extract all numbers from a block of text as an array of floats
function parseNumberList(text) {
    const matches = text.match(/-?\d+(\.\d+)?/g) || [];
    return matches.map(Number);
}

// Parse table data into a 2D array: one row per line, numbers per row
function parseMapMatrix(text) {
    const lines = text.trim().split(/\r?\n+/);
    return lines.map(line => {
        const nums = line.match(/-?\d+(\.\d+)?/g) || [];
        return nums.map(Number);
    });
}

// ----------------------
// Interpolation helpers
// ----------------------

// Linear interpolation on a monotonically increasing OR decreasing axis
function interp1D(axis, values, target) {
    const n = axis.length;
    const first = axis[0];
    const last = axis[n - 1];
    const increasing = last > first;

    // Clamp outside range
    if ((increasing && target <= first) || (!increasing && target >= first)) {
        return values[0];
    }
    if ((increasing && target >= last) || (!increasing && target <= last)) {
        return values[n - 1];
    }

    // Find interval
    for (let i = 0; i < n - 1; i++) {
        const x0 = axis[i];
        const x1 = axis[i + 1];

        const inSegment = increasing
            ? (x0 <= target && target <= x1)
            : (x0 >= target && target >= x1);

        if (inSegment) {
            const y0 = values[i];
            const y1 = values[i + 1];
            const t = (target - x0) / (x1 - x0);
            return y0 + t * (y1 - y0);
        }
    }

    // Fallback
    return values[n - 1];
}

// Bilinear interpolation across table Z on new axes
function interpolateTable(origX, origY, Z, newX, newY) {
    const Ny = origY.length;
    const Nx = origX.length;

    const xMin = Math.min(...origX);
    const xMax = Math.max(...origX);
    const yMin = Math.min(...origY);
    const yMax = Math.max(...origY);

    const output = [];

    for (let iy = 0; iy < newY.length; iy++) {
        const row = [];
        const yT = newY[iy];

        for (let ix = 0; ix < newX.length; ix++) {
            const xT = newX[ix];

            // -----------------------------
            // ZERO OUTSIDE ORIGINAL RANGE
            // -----------------------------
            if (xT < xMin || xT > xMax || yT < yMin || yT > yMax) {
                row.push(0);
                continue;
            }

            // Interpolate along X for each original Y row
            const temp = [];
            for (let r = 0; r < Ny; r++) {
                temp.push(interp1D(origX, Z[r], xT));
            }

            // Then interpolate along Y
            const finalVal = interp1D(origY, temp, yT);
            row.push(finalVal);
        }

        output.push(row);
    }

    return output;
}

// Format matrix as tab-separated rows (Holley-friendly)
function formatMatrixTabSeparated(matrix, decimals = 3) {
    return matrix
        .map(row => row.map(v => v.toFixed(decimals)).join("\t"))
        .join("\n");
}

// ----------------------
// Copy-to-clipboard helper
// ----------------------

function copyTextareaContents(textareaId) {
    const el = document.getElementById(textareaId);
    if (!el) return;

    const text = el.value;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error("Clipboard write failed:", err);
        });
    } else {
        // Fallback for older browsers
        el.select();
        el.setSelectionRange(0, 99999);
        try {
            document.execCommand("copy");
        } catch (err) {
            console.error("execCommand copy failed:", err);
        }
        el.blur();
    }
}

// ----------------------
// Main UI logic
// ----------------------

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("mapForm");
    const resultEl = document.getElementById("result");

    const outputNewY = document.getElementById("outputNewY");
    const outputNewX = document.getElementById("outputNewX");
    const outputMap  = document.getElementById("outputMap");

    document.getElementById("copyNewY").addEventListener("click", () => {
        copyTextareaContents("outputNewY");
    });

    document.getElementById("copyNewX").addEventListener("click", () => {
        copyTextareaContents("outputNewX");
    });

    document.getElementById("copyMap").addEventListener("click", () => {
        copyTextareaContents("outputMap");
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        // ---- Get textarea values ----
        const origYtext = document.getElementById("yAxis").value;
        const origXtext = document.getElementById("xAxis").value;
        const mapText   = document.getElementById("map").value;

        const newYtext = document.getElementById("newYAxis").value;
        const newXtext = document.getElementById("newXAxis").value;

        // ---- Parse inputs ----
        const origY = parseNumberList(origYtext);
        const origX = parseNumberList(origXtext);
        const Z     = parseMapMatrix(mapText);

        const newY = parseNumberList(newYtext);
        const newX = parseNumberList(newXtext);

        // ---- Validate ----
        const errors = [];
        if (!origY.length) errors.push("Original Y-axis contains no numbers.");
        if (!origX.length) errors.push("Original X-axis contains no numbers.");
        if (!Z.length)     errors.push("Table data contains no rows.");
        if (!newY.length)  errors.push("New Y-axis contains no numbers.");
        if (!newX.length)  errors.push("New X-axis contains no numbers.");

        const rowCount = Z.length;
        const colCounts = Z.map(r => r.length);
        const uniqueCols = [...new Set(colCounts)];

        if (uniqueCols.length !== 1) {
            errors.push("Each row of table data must have the same number of columns.");
        } else if (uniqueCols[0] !== origX.length) {
            errors.push(`Map rows have ${uniqueCols[0]} columns but X-axis has ${origX.length}.`);
        }

        if (origY.length !== rowCount) {
            errors.push(`Y-axis length (${origY.length}) does not match number of map rows (${rowCount}).`);
        }

        // ---- Show errors ----
        if (errors.length > 0) {
            resultEl.textContent = "❌ Errors:\n" + errors.join("\n");
            outputNewY.value = "";
            outputNewX.value = "";
            outputMap.value  = "";
            return;
        }

        // ---- Perform interpolation ----
        let newMatrix;
        try {
            newMatrix = interpolateTable(origX, origY, Z, newX, newY);
        } catch (e) {
            resultEl.textContent = "❌ Error during interpolation:\n" + e.message;
            outputNewY.value = "";
            outputNewX.value = "";
            outputMap.value  = "";
            return;
        }

        // ---- Build output strings ----
        const newYString = newY.map(v => v.toFixed(3)).join("\n");
        const newXString = newX.map(v => v.toFixed(3)).join("\t");
        const mapString  = formatMatrixTabSeparated(newMatrix, 3);

        // Fill the output textareas
        outputNewY.value = newYString;
        outputNewX.value = newXString;
        outputMap.value  = mapString;

        // Summary/message
        const summary = [
            "✅ Interpolating complete.",
            "",
            `Original Y: ${origY.length} points (first ${origY[0]}, last ${origY[origY.length - 1]})`,
            `Original X: ${origX.length} points (first ${origX[0]}, last ${origX[origX.length - 1]})`,
            "",
            `New Y: ${newY.length} points`,
            `New X: ${newX.length} points`
        ].join("\n");

        resultEl.textContent = summary;

        // Expose for debugging if you want to poke around in DevTools
        window.origY = origY;
        window.origX = origX;
        window.Z = Z;
        window.newY = newY;
        window.newX = newX;
        window.newMatrix = newMatrix;
    });
});
