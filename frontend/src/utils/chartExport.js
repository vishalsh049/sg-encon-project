import { saveAs } from "file-saver";

// Builds a CSV from chartData shaped [{ date, entity1, entity2, ... }, ...]
// and triggers a browser download. Columns = entities, rows = dates.
export function exportChartAsCsv(chartData, entities, filename = "uptime.csv") {
  if (!chartData?.length) return;

  const header = ["Date", ...entities];
  const lines = [header.join(",")];

  chartData.forEach(row => {
    const cells = [row.date, ...entities.map(e => (row[e] != null ? row[e] : ""))];
    lines.push(cells.join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, filename);
}

// Downloads the raw SVG markup directly — the guaranteed-to-work export path.
export function exportChartAsSvg(svgEl, filename = "uptime.svg") {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  saveAs(blob, filename);
}

// Best-effort SVG -> PNG export via canvas. Falls back to the SVG download
// above on any failure (tainted canvas, unsupported browser, etc.) so export
// never dead-ends.
export function exportChartAsPng(svgEl, filename = "uptime.png") {
  if (!svgEl) return;

  try {
    const clone = svgEl.cloneNode(true);
    const width  = svgEl.clientWidth  || svgEl.viewBox?.baseVal?.width  || 800;
    const height = svgEl.clientHeight || svgEl.viewBox?.baseVal?.height || 400;

    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", width);
    clone.setAttribute("height", height);

    // White background rect so the PNG isn't transparent.
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width * 2;   // 2x for crisper export
        canvas.height = height * 2;
        const ctx = canvas.getContext("2d");
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        canvas.toBlob(blob => {
          if (blob) saveAs(blob, filename);
          else exportChartAsSvg(svgEl, filename.replace(/\.png$/, ".svg"));
        }, "image/png");
      } catch {
        URL.revokeObjectURL(url);
        exportChartAsSvg(svgEl, filename.replace(/\.png$/, ".svg"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      exportChartAsSvg(svgEl, filename.replace(/\.png$/, ".svg"));
    };
    img.src = url;
  } catch {
    exportChartAsSvg(svgEl, filename.replace(/\.png$/, ".svg"));
  }
}
