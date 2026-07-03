const ExcelJS = require("exceljs");

const COMPANY_NAME = "SG ENCON PVT LTD";

const COLOR = {
  categoryFill: "FF1E3A8A", // blue-900
  columnFill: "FFBFDBFE", // blue-200
  totalRowFill: "FFE0E7FF", // indigo-100
  altRowFill: "FFF8FAFC", // slate-50
  white: "FFFFFFFF",
  requirement: "FF1D4ED8", // blue-700
  gapGood: "FF059669", // emerald-600
  gapBad: "FFDC2626", // red-600
  black: "FF0F172A", // slate-900
};

const THIN_BORDER = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

function formatGeneratedAt() {
  return (
    new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " IST"
  );
}

/**
 * Builds the styled RAG workbook (Physical or Scrum) used by both export routes.
 *
 * @param {object} options
 * @param {string} options.reportTitle
 * @param {{search:string, circle:string, cmp:string}} options.filtersMeta
 * @param {Array<{title:string, items:string[]}>} options.groups - already filtered
 * @param {Array<{key:string, label:string}>} options.columns
 * @param {Array<{key:string, label:string, roleKeys:string[]}>} options.categoryGroups
 * @param {(cmpName:string) => object|undefined} options.getSignoffRow
 * @param {object} options.countLookup - cmp -> roleKey -> (number | {physical_count,new_joining_count,total})
 * @param {boolean} options.showJoining
 */
function buildRagWorkbook({
  reportTitle,
  filtersMeta,
  groups,
  columns,
  categoryGroups,
  getSignoffRow,
  countLookup,
  showJoining,
}) {
  const subLabels = showJoining ? ["R", "Total", "P", "NJ", "G"] : ["R", "A", "G"];
  const subColCount = subLabels.length;
  const totalCols = 1 + columns.length * subColCount;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY_NAME;
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(reportTitle.slice(0, 31) || "RAG Report");

  const colWidths = new Array(totalCols + 1).fill(10);
  const trackWidth = (colIndex, text) => {
    const length = String(text ?? "").length;
    if (length + 2 > colWidths[colIndex]) {
      colWidths[colIndex] = Math.min(length + 2, 28);
    }
  };

  const mergeAndSet = (r1, c1, r2, c2, value, style = {}) => {
    if (r1 !== r2 || c1 !== c2) worksheet.mergeCells(r1, c1, r2, c2);
    const cell = worksheet.getCell(r1, c1);
    cell.value = value;
    Object.assign(cell, style);
    return cell;
  };

  // ---- Report header block ----
  let row = 1;
  mergeAndSet(row, 1, row, totalCols, COMPANY_NAME, {
    font: { bold: true, size: 14, color: { argb: COLOR.black } },
    alignment: { horizontal: "left", vertical: "middle" },
  });
  row += 1;
  mergeAndSet(row, 1, row, totalCols, reportTitle, {
    font: { bold: true, size: 12, color: { argb: COLOR.black } },
    alignment: { horizontal: "left", vertical: "middle" },
  });
  row += 1;
  mergeAndSet(row, 1, row, totalCols, `Generated On: ${formatGeneratedAt()}`, {
    font: { size: 10, color: { argb: "FF475569" } },
  });
  row += 1;
  mergeAndSet(row, 1, row, totalCols, `Circle: ${filtersMeta.circle || "All Circles"}`, {
    font: { size: 10, color: { argb: "FF475569" } },
  });
  row += 1;
  mergeAndSet(row, 1, row, totalCols, `CMP: ${filtersMeta.cmp || "All CMPs"}`, {
    font: { size: 10, color: { argb: "FF475569" } },
  });
  row += 1;
  mergeAndSet(row, 1, row, totalCols, `Search: ${filtersMeta.search || "—"}`, {
    font: { size: 10, color: { argb: "FF475569" } },
  });
  row += 2; // blank spacer row

  // ---- 3-row table header ----
  const headerTopRow = row;
  const headerMidRow = row + 1;
  const headerSubRow = row + 2;

  mergeAndSet(headerTopRow, 1, headerSubRow, 1, "CMP", {
    font: { bold: true, size: 11, color: { argb: COLOR.white } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.categoryFill } },
    alignment: { horizontal: "center", vertical: "middle" },
    border: THIN_BORDER,
  });
  trackWidth(1, "Delhi-3 (Central-East) Total");

  let colCursor = 2;
  categoryGroups.forEach((category) => {
    const categoryColumns = columns.filter((column) => category.roleKeys.includes(column.key));
    const span = categoryColumns.length * subColCount;
    if (span > 0) {
      mergeAndSet(headerTopRow, colCursor, headerTopRow, colCursor + span - 1, category.label, {
        font: { bold: true, size: 10, color: { argb: COLOR.white } },
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.categoryFill } },
        alignment: { horizontal: "center", vertical: "middle" },
        border: THIN_BORDER,
      });
    }

    categoryColumns.forEach((column) => {
      mergeAndSet(headerMidRow, colCursor, headerMidRow, colCursor + subColCount - 1, column.label, {
        font: { bold: true, size: 9, color: { argb: "FF1E3A8A" } },
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.columnFill } },
        alignment: { horizontal: "center", vertical: "middle", wrapText: true },
        border: THIN_BORDER,
      });
      trackWidth(colCursor, column.label);

      subLabels.forEach((label, subIndex) => {
        const cell = worksheet.getCell(headerSubRow, colCursor + subIndex);
        cell.value = label;
        cell.font = { bold: true, size: 9, color: { argb: "FF1E3A8A" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = THIN_BORDER;
        trackWidth(colCursor + subIndex, label);
      });

      colCursor += subColCount;
    });
  });

  worksheet.views = [{ state: "frozen", xSplit: 1, ySplit: headerSubRow }];
  worksheet.autoFilter = {
    from: { row: headerSubRow, column: 1 },
    to: { row: headerSubRow, column: totalCols },
  };

  // ---- Body rows ----
  let bodyRow = headerSubRow + 1;
  let stripe = 0;

  const writeGapCell = (cell, gap) => {
    cell.value = gap;
    cell.font = {
      bold: true,
      color: { argb: gap <= 0 ? COLOR.gapGood : COLOR.gapBad },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = THIN_BORDER;
  };

  groups.forEach((group) => {
    // Group total row
    const totalRowCells = [];
    const labelCell = worksheet.getCell(bodyRow, 1);
    const totalLabel = `${group.title.replace(" SHQ", "")} Total`;
    labelCell.value = totalLabel;
    labelCell.font = { bold: true, color: { argb: COLOR.black } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.totalRowFill } };
    labelCell.alignment = { horizontal: "left", vertical: "middle" };
    labelCell.border = THIN_BORDER;
    trackWidth(1, totalLabel);
    totalRowCells.push(labelCell);

    let cursor = 2;
    columns.forEach((column) => {
      const totalRequirement = group.items.reduce((sum, cmpName) => {
        const signoffRow = getSignoffRow(cmpName);
        return sum + Number(signoffRow?.[column.key] || 0);
      }, 0);

      let totalAvailable = 0;
      let totalPhysical = 0;
      let totalNewJoining = 0;

      group.items.forEach((cmpName) => {
        if (showJoining) {
          const data = countLookup?.[cmpName]?.[column.key] || {};
          totalAvailable += Number(data.total || 0);
          totalPhysical += Number(data.physical_count || 0);
          totalNewJoining += Number(data.new_joining_count || 0);
        } else {
          totalAvailable += Number(countLookup?.[cmpName]?.[column.key] || 0);
        }
      });

      const totalGap = totalRequirement - totalAvailable;
      const values = showJoining
        ? [totalRequirement, totalAvailable, totalPhysical, totalNewJoining]
        : [totalRequirement, totalAvailable];

      values.forEach((value, idx) => {
        const cell = worksheet.getCell(bodyRow, cursor + idx);
        cell.value = value;
        cell.font = {
          bold: true,
          color: { argb: idx === 0 ? COLOR.requirement : COLOR.black },
        };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.totalRowFill } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = THIN_BORDER;
        trackWidth(cursor + idx, value);
      });

      const gapCell = worksheet.getCell(bodyRow, cursor + subColCount - 1);
      writeGapCell(gapCell, totalGap);
      gapCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.totalRowFill } };
      trackWidth(cursor + subColCount - 1, totalGap);

      cursor += subColCount;
    });

    bodyRow += 1;

    // CMP rows
    group.items.forEach((cmpName) => {
      const signoffRow = getSignoffRow(cmpName);
      const isAlt = stripe % 2 === 1;
      stripe += 1;

      const cmpCell = worksheet.getCell(bodyRow, 1);
      cmpCell.value = cmpName;
      cmpCell.font = { bold: true, color: { argb: COLOR.black } };
      cmpCell.alignment = { horizontal: "left", vertical: "middle" };
      cmpCell.border = THIN_BORDER;
      if (isAlt) {
        cmpCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.altRowFill } };
      }
      trackWidth(1, cmpName);

      let cur = 2;
      columns.forEach((column) => {
        const requirement = Number(signoffRow?.[column.key] || 0);

        let available = 0;
        let physicalCount = 0;
        let newJoiningCount = 0;

        if (showJoining) {
          const data = countLookup?.[cmpName]?.[column.key] || {};
          physicalCount = Number(data.physical_count || 0);
          newJoiningCount = Number(data.new_joining_count || 0);
          available = Number(data.total || 0);
        } else {
          available = Number(countLookup?.[cmpName]?.[column.key] || 0);
        }

        const gap = requirement - available;
        const values = showJoining
          ? [requirement, available, physicalCount, newJoiningCount]
          : [requirement, available];

        values.forEach((value, idx) => {
          const cell = worksheet.getCell(bodyRow, cur + idx);
          cell.value = value;
          cell.font = { color: { argb: idx === 0 ? COLOR.requirement : COLOR.black } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = THIN_BORDER;
          if (isAlt) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.altRowFill } };
          }
          trackWidth(cur + idx, value);
        });

        const gapCell = worksheet.getCell(bodyRow, cur + subColCount - 1);
        writeGapCell(gapCell, gap);
        if (isAlt) {
          gapCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.altRowFill } };
        }
        trackWidth(cur + subColCount - 1, gap);

        cur += subColCount;
      });

      bodyRow += 1;
    });
  });

  for (let colIndex = 1; colIndex <= totalCols; colIndex += 1) {
    worksheet.getColumn(colIndex).width = colWidths[colIndex];
  }

  return workbook;
}

module.exports = {
  buildRagWorkbook,
  COMPANY_NAME,
};
