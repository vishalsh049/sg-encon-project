import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

// ─── Shared helpers ──────────────────────────────────────────────────────────

// Entity names are circle/CMP values straight from the database and regularly
// contain commas ("Delhi, NCR"). Unquoted they shift every later column one
// cell to the right, silently corrupting the export.
function csvCell(value) {
  if (value == null) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const fmtPct = (v) => (v == null || !Number.isFinite(Number(v)) ? "" : Number(v).toFixed(2));

// Excel needs real numbers to chart/sum a column; the display "%" belongs in a
// number format, not in the value.
const numOrBlank = (v) => (v == null || !Number.isFinite(Number(v)) ? "" : Number(Number(v).toFixed(2)));

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ─── CSV ─────────────────────────────────────────────────────────────────────

// chartData is [{ date, <entity>: number, ... }]; columns = entities, rows = dates.
export function exportChartAsCsv(chartData, entities, filename = "uptime.csv") {
  if (!chartData?.length) return;

  const lines = [["Date", ...entities].map(csvCell).join(",")];
  chartData.forEach((row) => {
    lines.push([row.date, ...entities.map((e) => fmtPct(row[e]))].map(csvCell).join(","));
  });

  // BOM so Excel opens UTF-8 circle names correctly instead of mojibake.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, filename);
}

// Every KPI stacked into one CSV, with a KPI column so the file stays flat and
// pivot-friendly rather than needing one file per KPI.
export function exportDashboardAsCsv(cards, meta = {}) {
  const rows = [];
  cards.forEach((card) => {
    (card.chartData || []).forEach((row) => {
      (card.entities || []).forEach((entity) => {
        if (row[entity] == null) return;
        rows.push([card.name, row.date, entity, fmtPct(row[entity])]);
      });
    });
  });

  if (!rows.length) return false;

  const lines = [];
  if (meta.title) lines.push(csvCell(meta.title));
  if (meta.subtitle) lines.push(csvCell(meta.subtitle));
  if (lines.length) lines.push("");
  lines.push(["KPI", "Date", "Circle / CMP", "Uptime %"].join(","));
  rows.forEach((r) => lines.push(r.map(csvCell).join(",")));

  saveAs(
    new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }),
    `KPI_Dashboard_${stamp()}.csv`
  );
  return true;
}

// ─── Excel ───────────────────────────────────────────────────────────────────

function autoFitColumns(rows) {
  const widths = [];
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      const len = String(cell ?? "").length;
      if (!widths[i] || widths[i] < len) widths[i] = len;
    });
  });
  return widths.map((w) => ({ wch: Math.min(Math.max(w + 2, 10), 40) }));
}

// Excel sheet names cannot exceed 31 chars or contain : \ / ? * [ ]
const safeSheetName = (name, fallback) =>
  String(name || fallback).replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || fallback;

// Workbook layout: an Overview sheet (one row per KPI, readable at a glance)
// plus one date x entity matrix sheet per KPI for analysis.
export function exportDashboardAsExcel(cards, meta = {}) {
  if (!cards?.length) return false;

  const wb = XLSX.utils.book_new();

  const overview = [
    [meta.title || "KPI Dashboard — Uptime Report"],
    [meta.subtitle || ""],
    [`Generated: ${new Date().toLocaleString("en-GB")}`],
    [],
    ["KPI", "Average Uptime %", "Days Covered", "Grouped By", "Circles / CMPs"],
  ];
  cards.forEach((card) => {
    overview.push([
      card.name,
      numOrBlank(parseFloat(card.uptime)),
      (card.chartData || []).length,
      card.groupBy === "cmp" ? "CMP" : "Circle",
      (card.entities || []).join(", "),
    ]);
  });

  const overviewSheet = XLSX.utils.aoa_to_sheet(overview);
  overviewSheet["!cols"] = autoFitColumns(overview);
  overviewSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  XLSX.utils.book_append_sheet(wb, overviewSheet, "Overview");

  cards.forEach((card, idx) => {
    const entities = card.entities || [];
    const aoa = [["Date", ...entities, "Daily Avg"]];
    (card.chartData || []).forEach((row) => {
      const vals = entities.map((e) => (row[e] == null ? null : Number(row[e]))).filter((v) => v != null);
      const dailyAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      aoa.push([row.date, ...entities.map((e) => numOrBlank(row[e])), numOrBlank(dailyAvg)]);
    });

    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet["!cols"] = autoFitColumns(aoa);
    XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(card.name, `KPI${idx + 1}`));
  });

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `KPI_Dashboard_${stamp()}.xlsx`
  );
  return true;
}

// ─── SVG / PNG ───────────────────────────────────────────────────────────────

// Recharts renders plain SVG, so a chart can be rasterised without any
// screenshot library. Resolves to null (never rejects) so a single failed
// chart degrades to a table-only report instead of failing the whole export.
export function svgToPngDataUrl(svgEl, scale = 2) {
  return new Promise((resolve) => {
    if (!svgEl) return resolve(null);
    try {
      const width = svgEl.clientWidth || svgEl.viewBox?.baseVal?.width || 800;
      const height = svgEl.clientHeight || svgEl.viewBox?.baseVal?.height || 400;

      const clone = svgEl.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", width);
      clone.setAttribute("height", height);

      // Exports are printed on white — force a white backdrop so a dark-mode
      // chart doesn't come out as light text on a white page.
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("width", "100%");
      bg.setAttribute("height", "100%");
      bg.setAttribute("fill", "#ffffff");
      clone.insertBefore(bg, clone.firstChild);

      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" })
      );

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

// Downloads the raw SVG markup directly — the guaranteed-to-work export path.
export function exportChartAsSvg(svgEl, filename = "uptime.svg") {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  saveAs(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }),
    filename
  );
}

// Falls back to the SVG download on any rasterisation failure (tainted canvas,
// unsupported browser) so export never dead-ends.
export async function exportChartAsPng(svgEl, filename = "uptime.png") {
  const dataUrl = await svgToPngDataUrl(svgEl);
  if (!dataUrl) return exportChartAsSvg(svgEl, filename.replace(/\.png$/, ".svg"));
  const blob = await (await fetch(dataUrl)).blob();
  saveAs(blob, filename);
}

// ─── PDF / Print ─────────────────────────────────────────────────────────────

const REPORT_CSS = `
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #fff; font-size: 11px; }
  .doc { padding: 4px; }
  header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 14px; }
  header h1 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
  header p { margin: 3px 0 0; font-size: 11px; color: #64748b; }
  .meta { margin-top: 6px; font-size: 10px; color: #64748b; }
  .meta span { display: inline-block; margin-right: 14px; }
  .tiles { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 16px; }
  .tile { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
  .tile .k { font-size: 8px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; }
  .tile .v { font-size: 14px; font-weight: 700; margin-top: 3px; }
  .tile .s { font-size: 9px; color: #64748b; margin-top: 1px; }
  section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 18px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  section > h2 { margin: 0; font-size: 12px; font-weight: 700; padding: 8px 12px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; gap: 12px; }
  section > h2 .pct { color: #2563eb; white-space: nowrap; }
  .body { padding: 10px 12px; }
  .chart { text-align: center; margin-bottom: 10px; }
  .chart img { max-width: 100%; height: auto; }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; font-size: 10px; }
  .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 7px; text-align: right; white-space: nowrap; }
  th { background: #f8fafc; font-weight: 700; color: #334155; }
  th:first-child, td:first-child { text-align: left; }
  tbody tr:nth-child(even) { background: #fbfcfe; }
  tfoot td { font-weight: 700; background: #f1f5f9; }
  .empty { padding: 10px 12px; color: #64748b; font-style: italic; }
  footer { margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 6px; font-size: 9px; color: #94a3b8; text-align: center; }
`;

function sectionHtml(card) {
  const entities = card.entities || [];
  const rows = card.chartData || [];

  if (!rows.length || !entities.length) {
    return `<section><h2><span>${escapeHtml(card.name)}</span><span class="pct">${escapeHtml(card.uptime || "—")}</span></h2>
      <p class="empty">No data available for the selected filters.</p></section>`;
  }

  const legend = entities
    .map((e, i) => `<span><i style="background:${card.colorFor ? card.colorFor(e, i) : "#3b82f6"}"></i>${escapeHtml(e)}</span>`)
    .join("");

  const head = `<tr><th>Date</th>${entities.map((e) => `<th>${escapeHtml(e)}</th>`).join("")}<th>Daily Avg</th></tr>`;

  const body = rows
    .map((row) => {
      const vals = entities.map((e) => (row[e] == null ? null : Number(row[e]))).filter((v) => v != null);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const cells = entities.map((e) => `<td>${row[e] == null ? "—" : fmtPct(row[e]) + "%"}</td>`).join("");
      return `<tr><td>${escapeHtml(row.date)}</td>${cells}<td>${avg == null ? "—" : fmtPct(avg) + "%"}</td></tr>`;
    })
    .join("");

  // Per-entity column averages, so the printed table carries the same
  // aggregate the on-screen card headline shows.
  const foot = entities
    .map((e) => {
      const vals = rows.map((r) => Number(r[e])).filter((v) => Number.isFinite(v) && v > 0);
      return `<td>${vals.length ? fmtPct(vals.reduce((a, b) => a + b, 0) / vals.length) + "%" : "—"}</td>`;
    })
    .join("");

  return `<section>
    <h2><span>${escapeHtml(card.name)} — Uptime (${card.groupBy === "cmp" ? "by CMP" : "by Circle"})</span>
        <span class="pct">Avg ${escapeHtml(card.uptime || "—")}</span></h2>
    <div class="body">
      ${card.chartImage ? `<div class="chart"><img src="${card.chartImage}" alt="${escapeHtml(card.name)} chart" /></div>` : ""}
      <div class="legend">${legend}</div>
      <table>
        <thead>${head}</thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td>Average</td>${foot}<td>${escapeHtml(card.uptime || "—")}</td></tr></tfoot>
      </table>
    </div>
  </section>`;
}

// Opens a print-ready report in a new window and triggers the browser's print
// dialog, where "Save as PDF" produces the PDF. Using the print pipeline rather
// than a JS PDF library keeps text selectable, paginates without cutting rows
// in half, and needs no extra dependency.
export function printDashboardReport({ title, subtitle, meta = [], tiles = [], cards = [] }) {
  const win = window.open("", "_blank", "width=1200,height=850");
  if (!win) return false; // popup blocked — caller surfaces a message

  const html = `<!doctype html><html><head><meta charset="utf-8" />
    <title>${escapeHtml(title)}</title><style>${REPORT_CSS}</style></head>
    <body><div class="doc">
      <header>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
        <div class="meta">${meta.map((m) => `<span><strong>${escapeHtml(m.label)}:</strong> ${escapeHtml(m.value)}</span>`).join("")}</div>
      </header>
      ${tiles.length
        ? `<div class="tiles">${tiles
            .map((t) => `<div class="tile"><div class="k">${escapeHtml(t.label)}</div><div class="v">${escapeHtml(t.value)}</div>${t.sub ? `<div class="s">${escapeHtml(t.sub)}</div>` : ""}</div>`)
            .join("")}</div>`
        : ""}
      ${cards.map(sectionHtml).join("")}
      <footer>Uptime is the average of successful tower checks over the selected period. Generated ${escapeHtml(new Date().toLocaleString("en-GB"))}.</footer>
    </div></body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();

  // Chart <img> tags are data URIs but still decode asynchronously — printing
  // before they paint produces a report with blank chart areas.
  const start = () => {
    win.focus();
    win.print();
  };
  if (win.document.readyState === "complete") setTimeout(start, 400);
  else win.onload = () => setTimeout(start, 400);

  return true;
}
