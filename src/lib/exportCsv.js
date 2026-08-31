// src/lib/exportCsv.js — CSV backup of entered cycle counts.
//
// Requested by Lirizeth (via Roxy) so staff have a downloadable copy of
// whatever's been counted so far, in case of an app crash, wifi drop, or
// anything else that would otherwise mean recounting from scratch. Works at
// any point in the session — it doesn't require every zone/location to be
// complete, unlike the shrink report.

function csvEscape(val) {
  const s = String(val ?? '')
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function timestampForFilename(d = new Date()) {
  return d.toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

// `countedProducts` — the same shape App.jsx's getCountedProducts() returns:
// one entry per (product, location) pair that already has a number entered,
// each with product_name/sku/category/price/counted_qty/shopify_qty/location.
export function exportCycleCountCsv(countedProducts, opts = {}) {
  const headers = ['Category', 'Product Name', 'SKU', 'Location', 'System Qty', 'Counted Qty', 'Variance', 'Retail Price']

  const rows = (countedProducts || [])
    // Group by product/location isn't necessary — one row per entry is fine
    // and matches exactly what's stored, which is what makes it a reliable backup.
    .slice()
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.product_name || '').localeCompare(b.product_name || ''))
    .map(p => {
      const variance = p.counted_qty - p.shopify_qty
      return [
        p.category || '',
        p.product_name || '',
        p.sku || '',
        p.location?.label || '',
        p.shopify_qty ?? '',
        p.counted_qty ?? '',
        variance,
        p.price != null ? Number(p.price).toFixed(2) : '',
      ]
    })

  const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = opts.filename || `Jellyland-Cycle-Count-Backup-${timestampForFilename()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
