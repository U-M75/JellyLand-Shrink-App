// src/lib/exportPdf.js — Jellyland branded PDF with per-location analytics
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const PINK      = [242, 188, 204]
const PINK_DARK = [220, 140, 165]
const BROWN     = [107,  63,  42]
const BLUE      = [126, 200, 216]
const BLUE_DARK = [74, 155, 171]
const GREEN     = [107, 191, 142]
const RED       = [208,  90,  90]
const GRAY      = [176, 144, 128]
const LIGHTGRAY = [245, 240, 236]
const WHITE     = [255, 255, 255]

const REASON_LABELS = { theft:'Theft', damaged:'Damaged', miscount:'Miscount', misring:'Misring', receiving:'Receiving error', transfer:'Transfer', return:'Return', display:'Display item', other:'Other' }

// `row.priceIsCurrentEstimate` is set by App.jsx when a historical session
// predates the `price` column and had to be backfilled with today's Shopify
// price instead of the price at count time — flagged with a "*" so nobody
// mistakes it for an exact historical figure.
function formatPrice(row) {
  if (row.price == null) return '—'
  return `$${Number(row.price).toFixed(2)}${row.priceIsCurrentEstimate ? '*' : ''}`
}

function drawPriceEstimateNote(doc, y) {
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...GRAY)
  doc.text('* This session predates price tracking — price shown is the current Shopify price, not necessarily the price at count time.', 14, y)
  doc.setFont('helvetica', 'normal')
  return y + 4
}

async function loadLogoBase64() {
  try {
    const resp = await fetch('/jellyland-logo.png')
    const blob = await resp.blob()
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

function drawPageHeader(doc, logo, title, subtitle, dateStr, timeStr) {
  const W = doc.internal.pageSize.width
  doc.setFillColor(...PINK)
  doc.rect(0, 0, W, 36, 'F')
  doc.setFillColor(...WHITE)
  doc.circle(20, 18, 12, 'F')
  if (logo) { try { doc.addImage(logo, 'PNG', 9, 7, 22, 22) } catch {} }
  doc.setTextColor(...BROWN)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Jellyland', 38, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(title, 38, 20)
  doc.setFontSize(8)
  doc.setTextColor(...BROWN)
  doc.text(subtitle, W - 14, 11, { align: 'right' })
  doc.text(`${dateStr} at ${timeStr}`, W - 14, 18, { align: 'right' })
  doc.setFillColor(...BROWN)
  doc.rect(0, 36, W, 1.2, 'F')
}

function drawMetrics(doc, y, metrics) {
  const W = doc.internal.pageSize.width
  const m = 14
  const gap = 4
  const bw = (W - m * 2 - gap * (metrics.length - 1)) / metrics.length
  metrics.forEach((met, i) => {
    const x = m + i * (bw + gap)
    doc.setFillColor(...(met.bg || LIGHTGRAY))
    doc.roundedRect(x, y, bw, 20, 2, 2, 'F')
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(met.label.toUpperCase(), x + bw / 2, y + 6.5, { align: 'center' })
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...(met.color || BROWN))
    doc.text(String(met.value), x + bw / 2, y + 15, { align: 'center' })
  })
  return y + 24
}

function drawBarChart(doc, y, title, data, color) {
  if (!data || data.length === 0) return y
  const W = doc.internal.pageSize.width
  const m = 14
  const cw = W - m * 2
  const ch = 36
  const maxVal = Math.max(...data.map(d => d.value), 1)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BROWN)
  doc.text(title, m, y)
  y += 4
  doc.setFillColor(...LIGHTGRAY)
  doc.roundedRect(m, y, cw, ch, 2, 2, 'F')
  const bars = Math.min(data.length, 12)
  const bw = (cw - 8) / bars - 2
  data.slice(0, bars).forEach((d, i) => {
    const bh = Math.max(2, (d.value / maxVal) * (ch - 12))
    const x = m + 4 + i * (bw + 2)
    const by = y + ch - bh - 6
    doc.setFillColor(...color)
    doc.roundedRect(x, by, bw, bh, 1, 1, 'F')
    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BROWN)
    if (bh > 5) doc.text(String(d.value), x + bw / 2, by - 1, { align: 'center' })
    doc.setFontSize(5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    const lbl = d.label.length > 9 ? d.label.substring(0, 8) + '…' : d.label
    doc.text(lbl, x + bw / 2, y + ch - 1, { align: 'center' })
  })
  return y + ch + 7
}

// Builds the jsPDF document without saving it — used by both the "Download PDF"
// button and (once the Slack channel/token question is settled) the auto-post
// to #jellyland-inventory, so both paths render from the exact same report.
export async function buildShrinkReportPdf({ location, startedAt, countedProducts, shrinkRows, locations, countedBy }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const logo = await loadLogoBase64()
  // Folded into the existing `location` subtitle (used on every page header)
  // rather than threading a separate field through each drawPageHeader call.
  const locationSubtitle = countedBy ? `${location} · Counted by ${countedBy}` : location

  // ── PAGE 1: Overall summary ───────────────────────────────
  const isSingleLocation = (locations || []).length === 1
  drawPageHeader(doc, logo, isSingleLocation ? `Jellyland Cycle Count — ${locations[0].label}` : 'Jellyland Cycle Count — Combined Report', locationSubtitle, dateStr, timeStr)
  let y = 44

  const totalLost = shrinkRows.filter(r => r.counted_qty < r.shopify_qty).reduce((s, r) => s + Math.abs(r.counted_qty - r.shopify_qty), 0)
  const totalOver = shrinkRows.filter(r => r.counted_qty > r.shopify_qty).reduce((s, r) => s + (r.counted_qty - r.shopify_qty), 0)
  const valueLost = shrinkRows.filter(r => r.counted_qty < r.shopify_qty).reduce((s, r) => s + Math.abs(r.counted_qty - r.shopify_qty) * (r.price || 0), 0)
  const accuracy = countedProducts.length > 0 ? Math.round(((countedProducts.length - shrinkRows.length) / countedProducts.length) * 100) : 100
  // "Accuracy" (above) is SKU-based: % of SKUs with no flagged variance.
  // "Shrink %" is unit-based: units lost as a share of the system quantity that
  // was supposed to be on hand — the two numbers answer different questions,
  // which is exactly why Roxy asked for both on the same report.
  const totalSystemQty = countedProducts.reduce((s, p) => s + (p.shopify_qty || 0), 0)
  const shrinkPct = totalSystemQty > 0 ? (totalLost / totalSystemQty * 100) : 0

  y = drawMetrics(doc, y, [
    { label: 'Products Counted', value: countedProducts.length, bg: LIGHTGRAY },
    { label: 'Total Variances',  value: shrinkRows.length,      bg: shrinkRows.length > 0 ? [252,235,235] : [232,245,238], color: shrinkRows.length > 0 ? RED : GREEN },
    { label: 'Units Lost',       value: totalLost,              bg: totalLost > 0 ? [252,235,235] : LIGHTGRAY, color: totalLost > 0 ? RED : GRAY },
    { label: 'Units Over',       value: `+${totalOver}`,        bg: totalOver > 0 ? [232,245,238] : LIGHTGRAY, color: totalOver > 0 ? GREEN : GRAY },
  ])
  y = drawMetrics(doc, y, [
    { label: 'Value Lost',       value: `$${valueLost.toFixed(0)}`, bg: valueLost > 0 ? [252,235,235] : [232,245,238], color: valueLost > 0 ? RED : GREEN },
    { label: 'Accuracy',         value: `${accuracy}%`,         bg: accuracy >= 95 ? [232,245,238] : [252,235,235], color: accuracy >= 95 ? GREEN : RED },
    { label: 'Shrink %',         value: `${shrinkPct.toFixed(2)}%`, bg: shrinkPct <= 2 ? [232,245,238] : [252,235,235], color: shrinkPct <= 2 ? GREEN : RED },
  ])

  // Per-location summary table (skipped when the report only covers one location —
  // the per-location page right after this already covers it in full)
  if (!isSingleLocation) {
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BROWN)
  doc.text('Summary by Location', 14, y)
  y += 4

  const locSummaryRows = (locations || []).map(loc => {
    const lv = shrinkRows.filter(r => r.location?.id === loc.id)
    const lc = countedProducts.filter(p => p.location?.id === loc.id)
    const ll = lv.filter(r => r.counted_qty < r.shopify_qty)
    const lLost = ll.reduce((s, r) => s + Math.abs(r.counted_qty - r.shopify_qty), 0)
    const lVal = ll.reduce((s, r) => s + Math.abs(r.counted_qty - r.shopify_qty) * (r.price || 0), 0)
    const lSystemQty = lc.reduce((s, p) => s + (p.shopify_qty || 0), 0)
    const lShrinkPct = lSystemQty > 0 ? (lLost / lSystemQty * 100) : 0
    return [loc.label, lc.length, lv.length, lLost, `$${lVal.toFixed(2)}`, `${lShrinkPct.toFixed(2)}%`]
  })

  autoTable(doc, {
    startY: y,
    head: [['Location', 'Counted', 'Variances', 'Units Lost', 'Est. Value Lost', 'Shrink %']],
    body: locSummaryRows,
    theme: 'striped',
    headStyles: { fillColor: PINK_DARK, textColor: BROWN, fontStyle: 'bold' },
    bodyStyles: { textColor: BROWN },
    alternateRowStyles: { fillColor: [253, 245, 248] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  })
  y = doc.lastAutoTable.finalY + 8

  // Bar chart: variances by location
  const locChartData = (locations || []).map(loc => ({
    label: loc.short || loc.label,
    value: shrinkRows.filter(r => r.location?.id === loc.id).length,
  })).filter(d => d.value > 0)
  if (locChartData.length > 0) y = drawBarChart(doc, y, 'Variances by Location', locChartData, PINK_DARK)
  }

  // ── PER-LOCATION PAGES ────────────────────────────────────
  for (const loc of (locations || [])) {
    const locVariances = shrinkRows.filter(r => r.location?.id === loc.id)
    const locCounted = countedProducts.filter(p => p.location?.id === loc.id)
    if (locCounted.length === 0) continue

    doc.addPage()
    drawPageHeader(doc, logo, `Location Report: ${loc.label}`, locationSubtitle, dateStr, timeStr)
    y = 44

    const locLosses = locVariances.filter(r => r.counted_qty < r.shopify_qty)
    const locOverages = locVariances.filter(r => r.counted_qty > r.shopify_qty)
    const locLost = locLosses.reduce((s, r) => s + Math.abs(r.counted_qty - r.shopify_qty), 0)
    const locOver = locOverages.reduce((s, r) => s + (r.counted_qty - r.shopify_qty), 0)
    const locVal = locLosses.reduce((s, r) => s + Math.abs(r.counted_qty - r.shopify_qty) * (r.price || 0), 0)
    const locAcc = locCounted.length > 0 ? Math.round(((locCounted.length - locVariances.length) / locCounted.length) * 100) : 100
    const locSystemQty = locCounted.reduce((s, p) => s + (p.shopify_qty || 0), 0)
    const locShrinkPct = locSystemQty > 0 ? (locLost / locSystemQty * 100) : 0

    // Dedicated shrink-% banner for this location, right under the page header —
    // this is the "separate header of shrink percentage of that location" ask.
    const bannerColor = locShrinkPct <= 2 ? GREEN : RED
    const bannerBg = locShrinkPct <= 2 ? [232,245,238] : [252,235,235]
    doc.setFillColor(...bannerBg)
    doc.roundedRect(14, y, doc.internal.pageSize.width - 28, 12, 2, 2, 'F')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...bannerColor)
    doc.text(`${loc.label} Shrink Rate: ${locShrinkPct.toFixed(2)}%`, 20, y + 8)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BROWN)
    doc.text(`(${locLost} units lost of ${locSystemQty} on hand)`, doc.internal.pageSize.width - 20, y + 8, { align: 'right' })
    y += 17

    y = drawMetrics(doc, y, [
      { label: 'Counted',    value: locCounted.length,          bg: LIGHTGRAY },
      { label: 'Variances',  value: locVariances.length,        bg: locVariances.length > 0 ? [252,235,235] : [232,245,238], color: locVariances.length > 0 ? RED : GREEN },
      { label: 'Units Lost', value: locLost,                    bg: locLost > 0 ? [252,235,235] : LIGHTGRAY, color: locLost > 0 ? RED : GRAY },
      { label: 'Units Over', value: `+${locOver}`,              bg: locOver > 0 ? [232,245,238] : LIGHTGRAY, color: locOver > 0 ? GREEN : GRAY },
    ])
    y = drawMetrics(doc, y, [
      { label: 'Value Lost', value: `$${locVal.toFixed(2)}`,    bg: locVal > 0 ? [252,235,235] : [232,245,238], color: locVal > 0 ? RED : GREEN },
      { label: 'Accuracy',   value: `${locAcc}%`,               bg: locAcc >= 95 ? [232,245,238] : [252,235,235], color: locAcc >= 95 ? GREEN : RED },
      { label: 'Shrink %',   value: `${locShrinkPct.toFixed(2)}%`, bg: locShrinkPct <= 2 ? [232,245,238] : [252,235,235], color: locShrinkPct <= 2 ? GREEN : RED },
    ])

    // Bar chart: top variance items
    const itemChart = locVariances.map(r => ({ label: r.product_name.substring(0, 12), value: Math.abs(r.counted_qty - r.shopify_qty) })).sort((a, b) => b.value - a.value).slice(0, 10)
    if (itemChart.length > 0) y = drawBarChart(doc, y, 'Top Variance Items', itemChart, BLUE_DARK)

    // Variance table
    if (locVariances.length > 0) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...BROWN)
      doc.text('Variance Detail', 14, y)
      y += 4

      autoTable(doc, {
        startY: y,
        // Price added here too — same reasoning as the Full Count Log: a
        // reference for the amount actually behind the Value Lost math,
        // right where the variance itself is shown.
        head: [['Product', 'Type', 'SKU', 'Price', 'System', 'Counted', 'Diff', 'Shrink %', 'Reason']],
        body: locVariances.map(r => {
          const diff = r.counted_qty - r.shopify_qty
          const skuShrinkPct = r.shopify_qty > 0 ? (Math.abs(diff) / r.shopify_qty * 100) : null
          return [
            r.product_name.length > 22 ? r.product_name.substring(0, 22) + '…' : r.product_name,
            r.category || '—', r.sku || '—',
            formatPrice(r),
            r.shopify_qty, r.counted_qty,
            diff > 0 ? `+${diff}` : diff,
            skuShrinkPct === null ? 'N/A' : `${skuShrinkPct.toFixed(1)}%`,
            REASON_LABELS[r.reason] || r.reason || '—',
          ]
        }),
        theme: 'striped',
        headStyles: { fillColor: PINK_DARK, textColor: BROWN, fontStyle: 'bold' },
        bodyStyles: { textColor: BROWN },
        alternateRowStyles: { fillColor: [253, 245, 248] },
        styles: { fontSize: 7.5 },
        margin: { left: 14, right: 14 },
        didParseCell(data) {
          if (data.column.index === 6 && data.section === 'body') {
            const v = parseFloat(data.cell.raw)
            if (v < 0) data.cell.styles.textColor = RED
            else if (v > 0) data.cell.styles.textColor = GREEN
          }
        }
      })
      y = doc.lastAutoTable.finalY + 4
      if (locVariances.some(r => r.priceIsCurrentEstimate)) y = drawPriceEstimateNote(doc, y)
      y += 4
    }

    // Full count log for this location
    if (y > 200) { doc.addPage(); drawPageHeader(doc, logo, `Count Log: ${loc.label}`, locationSubtitle, dateStr, timeStr); y = 44 }
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BROWN)
    doc.text(`Full Count Log (${locCounted.length} products)`, 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      // Item #4 — Retail Price added so the Full Count Log carries the same
      // pricing reference as the original Shrink Report workbook, making it
      // easy to verify the amount behind the Value Lost calculation.
      head: [['Product', 'Type', 'SKU', 'Price', 'System', 'Counted', 'Variance', 'Shrink %']],
      body: locCounted.map(c => {
        const diff = c.counted_qty - c.shopify_qty
        const skuShrinkPct = c.shopify_qty > 0 ? (Math.abs(diff) / c.shopify_qty * 100) : null
        return [
          c.product_name.length > 26 ? c.product_name.substring(0, 26) + '…' : c.product_name,
          c.category || '—', c.sku || '—',
          formatPrice(c),
          c.shopify_qty, c.counted_qty,
          diff === 0 ? '—' : diff > 0 ? `+${diff}` : diff,
          diff === 0 ? '—' : (skuShrinkPct === null ? 'N/A' : `${skuShrinkPct.toFixed(1)}%`),
        ]
      }),
      theme: 'striped',
      headStyles: { fillColor: [176, 144, 128], textColor: WHITE, fontStyle: 'bold' },
      bodyStyles: { textColor: BROWN },
      alternateRowStyles: { fillColor: LIGHTGRAY },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
      didParseCell(data) {
        if (data.column.index === 6 && data.section === 'body') {
          const v = parseFloat(data.cell.raw)
          if (v < 0) data.cell.styles.textColor = RED
          else if (v > 0) data.cell.styles.textColor = GREEN
        }
      }
    })
    if (locCounted.some(c => c.priceIsCurrentEstimate)) drawPriceEstimateNote(doc, doc.lastAutoTable.finalY + 4)
  }

  // ── Footer on all pages ───────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const H = doc.internal.pageSize.height
    const W = doc.internal.pageSize.width
    doc.setFillColor(...PINK)
    doc.rect(0, H - 9, W, 9, 'F')
    doc.setFontSize(7)
    doc.setTextColor(...BROWN)
    doc.text(`Jellyland · Jellyland Cycle Count · ${dateStr} · Page ${i} of ${pageCount}`, W / 2, H - 3.5, { align: 'center' })
  }

  const filename = `Jellyland-Shrink-${now.toISOString().split('T')[0]}.pdf`
  return { doc, filename }
}

// Convenience wrapper for the "Download PDF" button — same as before, just
// built on top of buildShrinkReportPdf now.
export async function exportShrinkReportPdf(args) {
  const { doc, filename } = await buildShrinkReportPdf(args)
  doc.save(filename)
}

// Returns { blob, filename } — this is what the future Slack auto-post (item #5)
// will send via files.getUploadURLExternal / upload / completeUploadExternal,
// once the bot token + channel ID for #jellyland-inventory are confirmed.
export async function getShrinkReportPdfBlob(args) {
  const { doc, filename } = await buildShrinkReportPdf(args)
  const blob = doc.output('blob')
  return { blob, filename }
}

// ── Monthly Shrink Report PDF ─────────────────────────────────────────────
// Landscape, same header/branding as the cycle-count PDF above, but built
// for the wide 13-column monthly reconciliation table instead of a per-
// session variance report. This is the "open it without me running
// anything" deliverable Roxy/April asked for.
function fmtMoney(v) {
  if (v === null || v === undefined) return 'N/A'
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.abs(v).toFixed(2)}`
}
function fmtPct(v) { return v === null || v === undefined ? 'N/A' : `${v.toFixed(1)}%` }
function fmtNum(v) { return v === null || v === undefined ? 'N/A' : v }

export async function buildMonthlyShrinkReportPdf({ month, cutoffDate, rows, warnings }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const logo = await loadLogoBase64()

  const [y, m] = (month || '').split('-').map(Number)
  const monthLabel = y && m ? new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : month

  drawPageHeader(doc, logo, `Monthly Shrink Report — ${monthLabel}`, `Cutoff: ${cutoffDate || '—'}`, dateStr, timeStr)
  let yPos = 44

  const withVariance = (rows || []).filter(r => r.variance !== null)
  const totalShrinkCost = (rows || []).filter(r => r.shrink_cost !== null).reduce((s, r) => s + r.shrink_cost, 0)
  const totalShrinkValue = (rows || []).filter(r => r.shrink_value !== null).reduce((s, r) => s + r.shrink_value, 0)
  const missingActual = (rows || []).length - withVariance.length
  const shortageRows = withVariance.filter(r => r.variance > 0)
  const topIssues = [...shortageRows]
    .sort((a, b) => {
      const av = a.shrink_cost !== null ? Math.abs(a.shrink_cost) : a.variance
      const bv = b.shrink_cost !== null ? Math.abs(b.shrink_cost) : b.variance
      return bv - av
    })
    .slice(0, 5)

  // Same one-sentence headline as the in-app screen, so the PDF reads the
  // same way whichever surface someone opens first.
  let headline
  if (withVariance.length === 0) {
    headline = `No completed cycle count found for ${monthLabel} yet.`
  } else if (shortageRows.length === 0) {
    headline = `No shortages across ${withVariance.length} product${withVariance.length !== 1 ? 's' : ''} with a cycle count. Clean month.`
  } else {
    const costPart = (rows || []).some(r => r.shrink_cost !== null) ? ` (${fmtMoney(totalShrinkCost)} at cost)` : ' (cost data unavailable)'
    headline = `${shortageRows.length} product${shortageRows.length !== 1 ? 's' : ''} came up short${costPart}, out of ${withVariance.length} checked.`
  }

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BROWN)
  const headlineLines = doc.splitTextToSize(headline, doc.internal.pageSize.width - 28)
  doc.text(headlineLines, 14, yPos)
  yPos += headlineLines.length * 5 + 4

  yPos = drawMetrics(doc, yPos, [
    { label: 'Products', value: (rows || []).length, bg: LIGHTGRAY },
    { label: 'With cycle count', value: `${withVariance.length}/${(rows || []).length}`, bg: missingActual > 0 ? [252,235,235] : [232,245,238], color: missingActual > 0 ? RED : GREEN },
    { label: 'Total Shrink Cost', value: fmtMoney(totalShrinkCost), bg: totalShrinkCost > 0 ? [252,235,235] : [232,245,238], color: totalShrinkCost > 0 ? RED : GREEN },
    { label: 'Total Shrink Value', value: fmtMoney(totalShrinkValue), bg: totalShrinkValue > 0 ? [252,235,235] : [232,245,238], color: totalShrinkValue > 0 ? RED : GREEN },
  ])

  // "Biggest shortages" — same top-5-by-dollar-impact list as the in-app
  // screen, so the story is visible on page 1 without reading the full table.
  if (topIssues.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BROWN)
    doc.text('Biggest shortages this month', 14, yPos)
    yPos += 4
    autoTable(doc, {
      startY: yPos,
      head: [['Product', 'SKU', 'Expected', 'Actual', 'Shortage', 'Shrink Cost']],
      body: topIssues.map(r => [
        r.product_name?.length > 34 ? r.product_name.substring(0, 34) + '…' : (r.product_name || '—'),
        r.sku || '—', fmtNum(r.expected_ending_units), fmtNum(r.actual_ending_units),
        `-${r.variance}`, fmtMoney(r.shrink_cost),
      ]),
      theme: 'striped',
      headStyles: { fillColor: PINK_DARK, textColor: BROWN, fontStyle: 'bold' },
      bodyStyles: { textColor: BROWN },
      alternateRowStyles: { fillColor: [253, 245, 248] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    })
    yPos = doc.lastAutoTable.finalY + 8
  }

  // Warnings — the "double-check this" list, printed once up front so it
  // travels with the PDF instead of only living in the live app.
  if (warnings && warnings.length > 0) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...RED)
    doc.text(`${warnings.length} thing${warnings.length !== 1 ? 's' : ''} to double-check:`, 14, yPos)
    yPos += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...BROWN)
    warnings.forEach(w => {
      const lines = doc.splitTextToSize(`• ${w}`, doc.internal.pageSize.width - 28)
      doc.text(lines, 14, yPos)
      yPos += lines.length * 3.2 + 1
    })
    yPos += 3
  }

  autoTable(doc, {
    startY: yPos,
    head: [['Product', 'SKU', 'Start', 'Sent', 'Dmg', 'Test', 'Sold', 'Expected', 'Actual', 'Variance', 'Shrink %', 'Shrink Cost', 'Shrink Value', 'Notes']],
    body: (rows || []).map(r => [
      r.product_name?.length > 30 ? r.product_name.substring(0, 30) + '…' : (r.product_name || '—'),
      r.sku || '—',
      fmtNum(r.starting_inventory), fmtNum(r.total_qty_sent), fmtNum(r.total_damaged), fmtNum(r.total_tester),
      fmtNum(r.net_items_sold), fmtNum(r.expected_ending_units), fmtNum(r.actual_ending_units),
      r.variance === null ? 'N/A' : r.variance,
      fmtPct(r.shrink_pct), fmtMoney(r.shrink_cost), fmtMoney(r.shrink_value),
      r.notes ? (r.notes.length > 40 ? r.notes.substring(0, 40) + '…' : r.notes) : '—',
    ]),
    theme: 'striped',
    headStyles: { fillColor: PINK_DARK, textColor: BROWN, fontStyle: 'bold' },
    bodyStyles: { textColor: BROWN },
    alternateRowStyles: { fillColor: [253, 245, 248] },
    styles: { fontSize: 6.8 },
    margin: { left: 10, right: 10 },
    didParseCell(data) {
      if (data.column.index === 9 && data.section === 'body') {
        const raw = data.cell.raw
        if (raw !== 'N/A') {
          const v = parseFloat(raw)
          if (v > 0) data.cell.styles.textColor = RED
          else if (v < 0) data.cell.styles.textColor = GREEN
        }
      }
    },
  })

  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const H = doc.internal.pageSize.height
    const W = doc.internal.pageSize.width
    doc.setFillColor(...PINK)
    doc.rect(0, H - 9, W, 9, 'F')
    doc.setFontSize(7)
    doc.setTextColor(...BROWN)
    doc.text(`Jellyland · Monthly Shrink Report · ${dateStr} · Page ${i} of ${pageCount}`, W / 2, H - 3.5, { align: 'center' })
  }

  const filename = `Jellyland-Monthly-Shrink-${month || now.toISOString().split('T')[0]}.pdf`
  return { doc, filename }
}

export async function exportMonthlyShrinkReportPdf(args) {
  const { doc, filename } = await buildMonthlyShrinkReportPdf(args)
  doc.save(filename)
}

// Converts a Blob to a base64 string (no data-URL prefix) using FileReader —
// safe for large PDFs, unlike manually chunking bytes through String.fromCharCode.
// Used to send the PDF to /api/slack-upload as JSON.
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result || ''
      resolve(String(result).split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
