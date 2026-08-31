// src/App.jsx
import { useState, useEffect } from 'react'
import Login from './screens/Login.jsx'
import Home from './screens/Home.jsx'
import Categories from './screens/Categories.jsx'
import CountProducts from './screens/CountProducts.jsx'
import ShrinkReport from './screens/ShrinkReport.jsx'
import ReportSummary from './screens/ReportSummary.jsx'
import SessionHistory from './screens/SessionHistory.jsx'
import LogAdjustment from './screens/LogAdjustment.jsx'
import SyncIssues from './screens/SyncIssues.jsx'
import AdjustmentLog from './screens/AdjustmentLog.jsx'
import MonthlyShrinkReport from './screens/MonthlyShrinkReport.jsx'
import QuickAdjust from './screens/QuickAdjust.jsx'
import QuickAdjustReport from './screens/QuickAdjustReport.jsx'
import QuickAdjustSyncIssues from './screens/QuickAdjustSyncIssues.jsx'
import { getShrinkReportPdfBlob, blobToBase64 } from './lib/exportPdf.js'
import { exportCycleCountCsv } from './lib/exportCsv.js'
import { saveProgress, loadProgress, clearProgress, saveAuth, loadAuth, loadAuthUser, clearAuth } from './lib/storage.js'

const SCREENS = { LOGIN:'login', HOME:'home', CATEGORIES:'categories', COUNT:'count', SHRINK:'shrink', REPORT:'report', HISTORY:'history', ADJUST:'adjust', SYNC_ISSUES:'sync_issues', ADJUSTMENT_LOG:'adjustment_log', MONTHLY_REPORT:'monthly_report', QUICK_ADJUST:'quick_adjust', QUICK_ADJUST_REPORT:'quick_adjust_report', QUICK_ADJUST_SYNC_ISSUES:'quick_adjust_sync_issues' }

const DEFAULT_LOCATIONS = []

export default function App() {
  const [screen, setScreen] = useState(() => loadAuth() ? SCREENS.HOME : SCREENS.LOGIN)
  const [loggedInUser, setLoggedInUser] = useState(() => loadAuthUser())
  const [categories, setCategories] = useState({})
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS)
  const [collections, setCollections] = useState([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productsError, setProductsError] = useState(null)
  const [counts, setCounts] = useState({})
  const [completedCats, setCompletedCats] = useState(new Set())
  // Locking now happens per (product + variant + location) cell, not per category —
  // a key here looks exactly like the keys in `counts`, e.g. "123_456__987654321".
  const [lockedCells, setLockedCells] = useState(new Set())
  const [currentCategory, setCurrentCategory] = useState(null)
  const [sessionStartedAt, setSessionStartedAt] = useState(null)
  const [shrinkRows, setShrinkRows] = useState([])
  const [reportLocationId, setReportLocationId] = useState(null) // a locations id, or 'ALL'
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasResume, setHasResume] = useState(false)
  const [reportSessionId, setReportSessionId] = useState(null)
  const [syncedLocations, setSyncedLocations] = useState([])
  const [isHistorical, setIsHistorical] = useState(false)
  const [historicalCountedProducts, setHistoricalCountedProducts] = useState([])
  const [historicalDisplayLocations, setHistoricalDisplayLocations] = useState([])
  const [reportCountedBy, setReportCountedBy] = useState(null)

  useEffect(() => {
    const saved = loadProgress()
    if (saved && Object.keys(saved.counts || {}).length > 0) setHasResume(true)
  }, [])

  // Auto-logout after the PIN session expires (2 days), even mid-use.
  // This never clears saved/locked counts — only the login state.
  useEffect(() => {
    const check = () => {
      if (screen !== SCREENS.LOGIN && !loadAuth()) {
        setScreen(SCREENS.LOGIN)
      }
    }
    const interval = setInterval(check, 60 * 1000)
    return () => clearInterval(interval)
  }, [screen])

  function handleLogin(user) {
    saveAuth(user)
    setLoggedInUser(user)
    setScreen(SCREENS.HOME)
  }

  function handleLogout() {
    clearAuth()
    setLoggedInUser(null)
    setScreen(SCREENS.LOGIN)
    resetSession()
  }

  function resetSession() {
    setCounts({}); setCompletedCats(new Set()); setLockedCells(new Set())
    setCurrentCategory(null); setShrinkRows([]); setSaving(false); setSaved(false)
    setSessionStartedAt(null); setHasResume(false); setReportLocationId(null)
    setReportSessionId(null); setSyncedLocations([]); setIsHistorical(false)
    setHistoricalCountedProducts([]); setHistoricalDisplayLocations([]); setReportCountedBy(null)
  }

  function persistProgress(newCounts, newCompleted, newLockedCells) {
    saveProgress({
      counts: newCounts,
      completedCats: [...newCompleted],
      lockedCells: [...newLockedCells],
      sessionStartedAt,
    })
  }

  async function fetchProducts() {
    setProductsLoading(true)
    setProductsError(null)
    try {
      const resp = await fetch('/api/products')
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Failed to load') }
      const data = await resp.json()
      setCategories(data.categories || {})
      setLocations(data.locations || [])
      setCollections(data.collections || [])
    } catch (err) { setProductsError(err.message) }
    finally { setProductsLoading(false) }
  }

  function handleStartCount() {
    const saved = loadProgress()
    const startedAt = saved?.sessionStartedAt || new Date().toISOString()
    setSessionStartedAt(startedAt)
    if (saved && Object.keys(saved.counts || {}).length > 0) {
      setCounts(saved.counts || {})
      setCompletedCats(new Set(saved.completedCats || []))
      setLockedCells(new Set(saved.lockedCells || []))
    } else {
      resetSession()
      setSessionStartedAt(new Date().toISOString())
    }
    fetchProducts()
    setScreen(SCREENS.CATEGORIES)
  }

  function handleClearAndStart() {
    clearProgress()
    resetSession()
    setSessionStartedAt(new Date().toISOString())
    fetchProducts()
    setScreen(SCREENS.CATEGORIES)
  }

  function handleOpenAdjustments() {
    if (Object.keys(categories).length === 0) fetchProducts()
    setScreen(SCREENS.ADJUST)
  }

  function handleOpenQuickAdjust() {
    if (Object.keys(categories).length === 0) fetchProducts()
    setScreen(SCREENS.QUICK_ADJUST)
  }

  function handleSelectCategory(cat) {
    setCurrentCategory(cat)
    setScreen(SCREENS.COUNT)
  }

  function handleSaveCategoryCount(category, catCounts) {
    const newCounts = { ...counts, ...catCounts }
    const newCompleted = new Set([...completedCats, category])
    setCounts(newCounts)
    setCompletedCats(newCompleted)
    persistProgress(newCounts, newCompleted, lockedCells)
    setScreen(SCREENS.CATEGORIES)
  }

  // Silent background save while someone is still actively counting a zone —
  // same persistence as a real Save, just without marking the zone complete
  // or navigating away. CountProducts.jsx calls this a few seconds after the
  // last edit, so a crash/wifi drop mid-zone loses at most a few seconds of
  // typing instead of the whole zone.
  function handleAutosaveCategoryCount(category, catCounts) {
    const newCounts = { ...counts, ...catCounts }
    setCounts(newCounts)
    persistProgress(newCounts, completedCats, lockedCells)
  }

  // CSV backup of everything entered so far, across every zone/location —
  // works mid-session, doesn't require completion. Item #2 from Lirizeth.
  function handleExportCsv() {
    exportCycleCountCsv(getCountedProducts('ALL'))
  }

  // Toggle the lock on a single (product, location) cell — e.g. locking in
  // just the Warehouse count for one product while DTD/DCA/Overstock on that
  // same product are still blank and untouched.
  function handleToggleLockCell(product, locId) {
    const k = `${product.product_id}_${product.variant_id}__${locId}`
    const newLocked = new Set(lockedCells)
    if (newLocked.has(k)) newLocked.delete(k)
    else newLocked.add(k)
    setLockedCells(newLocked)
    persistProgress(counts, completedCats, newLocked)
  }

  // Convenience bulk action: lock every cell in this zone that currently has
  // a value entered, in one tap. Still fundamentally per-cell underneath —
  // this just saves people from tapping the lock icon on every row.
  function handleLockAllCounted(category, catCounts) {
    const newCounts = { ...counts, ...catCounts }
    const newCompleted = new Set([...completedCats, category])
    const newLocked = new Set(lockedCells)
    const products = categories[category] || []
    products.forEach(p => {
      locations.forEach(loc => {
        const k = `${p.product_id}_${p.variant_id}__${loc.id}`
        if (newCounts[k] !== undefined) newLocked.add(k)
      })
    })
    setCounts(newCounts)
    setCompletedCats(newCompleted)
    setLockedCells(newLocked)
    persistProgress(newCounts, newCompleted, newLocked)
    setScreen(SCREENS.CATEGORIES)
  }

  function handleSelectCategoryFromGrid(cat) {
    // Always allow opening — locked ones show unlock button inside
    setCurrentCategory(cat)
    setScreen(SCREENS.COUNT)
  }

  function handleFinishCount(locationId) {
    setReportLocationId(locationId)
    buildVariances(locationId)
    setScreen(SCREENS.SHRINK)
  }

  // A variance is only flagged (and needs a reason) once it's off by 2% or more.
  // If the system shows 0 and any quantity is counted, that's always a flag —
  // there's no meaningful "percent" of zero.
  function isFlaggableVariance(counted, sysQty) {
    const diff = counted - sysQty
    if (diff === 0) return false
    if (sysQty === 0) return true
    return Math.abs(diff) / sysQty * 100 >= 2
  }

  function buildVariances(locationId) {
    const variances = []
    Object.entries(categories).forEach(([catName, products]) => {
      products.forEach(p => {
        locations.forEach(loc => {
          if (locationId && locationId !== 'ALL' && loc.id !== locationId) return
          const k = `${p.product_id}_${p.variant_id}__${loc.id}`
          const counted = counts[k]
          const sysQty = p.locationStock?.find(l => l.id === loc.id)?.qty ?? 0
          if (counted !== undefined && isFlaggableVariance(counted, sysQty)) {
            variances.push({ ...p, counted_qty: counted, shopify_qty: sysQty, location: loc, category: catName })
          }
        })
      })
    })
    setShrinkRows(variances)
  }

  // Every product x every location across every zone must have a value (0 counts)
  // before the shrink report can be generated.
  function getCompletionStats() {
    let total = 0
    let filled = 0
    Object.values(categories).forEach(products => {
      products.forEach(p => {
        locations.forEach(loc => {
          total += 1
          const k = `${p.product_id}_${p.variant_id}__${loc.id}`
          if (counts[k] !== undefined) filled += 1
        })
      })
    })
    return { total, filled, isComplete: total > 0 && filled === total }
  }

  // Same breakdown, but per zone — this is what lets the zone tiles tell you
  // exactly which zone still has a gap, instead of just the overall total.
  function getZoneCompletion() {
    const map = {}
    Object.entries(categories).forEach(([catName, products]) => {
      let total = 0
      let filled = 0
      products.forEach(p => {
        locations.forEach(loc => {
          total += 1
          const k = `${p.product_id}_${p.variant_id}__${loc.id}`
          if (counts[k] !== undefined) filled += 1
        })
      })
      map[catName] = { total, filled, missing: total - filled, isComplete: total > 0 && filled === total }
    })
    return map
  }

  // Per-location completion, across every zone — this is what lets staff generate
  // a report for just the Warehouse (say) once every product's Warehouse count is
  // in, even while DTD/DCA/Overstock are still incomplete.
  function getLocationCompletionStats() {
    return locations.map(loc => {
      let total = 0
      let filled = 0
      Object.values(categories).forEach(products => {
        products.forEach(p => {
          total += 1
          const k = `${p.product_id}_${p.variant_id}__${loc.id}`
          if (counts[k] !== undefined) filled += 1
        })
      })
      return { ...loc, total, filled, isComplete: total > 0 && filled === total }
    })
  }

  function getCountedProducts(locationId) {
    const result = []
    Object.entries(categories).forEach(([catName, products]) => {
      products.forEach(p => {
        locations.forEach(loc => {
          if (locationId && locationId !== 'ALL' && loc.id !== locationId) return
          const k = `${p.product_id}_${p.variant_id}__${loc.id}`
          const counted = counts[k]
          if (counted !== undefined) {
            const sysQty = p.locationStock?.find(l => l.id === loc.id)?.qty ?? 0
            result.push({ ...p, counted_qty: counted, shopify_qty: sysQty, location: loc, category: catName })
          }
        })
      })
    })
    return result
  }

  async function handleGenerateReport(rowsWithReasons) {
    setShrinkRows(rowsWithReasons)
    setScreen(SCREENS.REPORT)
    setSaving(true)
    setReportCountedBy(loggedInUser?.name || null)
    const locLabel = !reportLocationId || reportLocationId === 'ALL'
      ? 'Jellyland - All Locations'
      : `Jellyland - ${locations.find(l => l.id === reportLocationId)?.label || reportLocationId}`
    let sessId = null
    try {
      const resp = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: { location: locLabel, startedAt: sessionStartedAt, countedByUserId: loggedInUser?.id || null, countedBy: loggedInUser?.name || null },
          counts: getCountedProducts(reportLocationId),
          shrinkRows: rowsWithReasons,
        }),
      })
      const data = await resp.json()
      if (data.sessionId) { sessId = data.sessionId; setReportSessionId(data.sessionId) }
      setSaved(true)
    } catch (err) { console.error('Save error:', err) }
    finally { setSaving(false) }

    // Item #5 — auto-post the same PDF to #jellyland-inventory right after the
    // report is generated. Best-effort: a Slack failure never blocks the
    // person from seeing their report or downloading it manually.
    try {
      const displayLocations = !reportLocationId || reportLocationId === 'ALL'
        ? locations
        : locations.filter(l => l.id === reportLocationId)
      const { blob, filename } = await getShrinkReportPdfBlob({
        location: locLabel,
        startedAt: sessionStartedAt,
        countedProducts: getCountedProducts(reportLocationId),
        shrinkRows: rowsWithReasons,
        locations: displayLocations,
        countedBy: loggedInUser?.name || null,
      })
      const pdfBase64 = await blobToBase64(blob)
      const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      await fetch('/api/slack-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          pdfBase64,
          initialComment: `📋 ${locLabel} — Shrink report generated ${dateStr}${sessId ? ` (session #${sessId.slice(0, 8)})` : ''}`,
        }),
      })
    } catch (err) { console.error('Slack auto-post failed (non-blocking):', err) }
  }

  // Item #4: load a previously completed session (fetched from Supabase, with
  // real inventory_item_id/location columns now) back into the same
  // ReportSummary view used right after a live count, including the Sync
  // button (item #6) if it hasn't been pushed to Shopify yet.
  //
  // Pre-migration sessions never saved a location per row, so `location_id`
  // is null on every count/shrink row. Previously that meant `.location`
  // came out as `null` and never matched any of the 4 real location IDs —
  // the screen and PDF would show 0 counted everywhere while the unfiltered
  // top-line totals still looked right. Fixed by falling back to one
  // combined bucket that actually contains all the rows.
  //
  // Price enrichment: sessions saved before the `price` column existed on
  // `counts`/`shrink_reports` have no price at all (that's the "—" everyone's
  // been seeing on reopened/PDF'd historical reports — it was never captured,
  // not a display bug). Rather than leave those permanently blank, this
  // best-effort backfills the CURRENT Shopify price by SKU/product_id when a
  // row doesn't already have one. It won't match the price at count time if
  // it's since changed, but that beats a blank field on every report anyone
  // generated before this fix shipped.
  async function handleViewHistorySession(sessionDetail, locId) {
    const { session, counts, shrinkRows: dbShrinkRows, locationsInSession } = sessionDetail
    const hasLocationData = (locationsInSession || []).length > 0

    let liveCategories = categories
    if (Object.keys(liveCategories).length === 0) {
      try {
        const resp = await fetch('/api/products')
        if (resp.ok) {
          const data = await resp.json()
          liveCategories = data.categories || {}
          setCategories(liveCategories)
        }
      } catch (err) { console.error('Could not load live prices for historical session:', err) }
    }
    const priceBySku = {}
    const priceByProductId = {}
    Object.values(liveCategories).flat().forEach(p => {
      if (p.sku) priceBySku[p.sku] = p.price
      priceByProductId[p.product_id] = p.price
    })
    function withPrice(row) {
      if (row.price != null) return row
      const fallback = (row.sku && priceBySku[row.sku] != null) ? priceBySku[row.sku] : priceByProductId[row.product_id]
      return fallback != null ? { ...row, price: fallback, priceIsCurrentEstimate: true } : row
    }

    const toLocObj = row => row.location_id
      ? { id: row.location_id, label: row.location_name }
      : { id: 'COMBINED', label: session.location || 'All Locations (combined)' }

    const filteredCounts = (counts || []).map(c => ({ ...withPrice(c), location: toLocObj(c) }))
    const filteredShrink = (dbShrinkRows || []).map(r => ({ ...withPrice(r), location: toLocObj(r) }))

    const displayLocations = hasLocationData
      ? (locId && locId !== 'ALL' ? locationsInSession.filter(l => l.id === locId) : locationsInSession)
      : [{ id: 'COMBINED', label: session.location || 'All Locations (combined)' }]

    setSessionStartedAt(session.started_at)
    setReportSessionId(session.id)
    setSyncedLocations(session.synced_locations || [])
    setReportLocationId(hasLocationData ? locId : 'COMBINED')
    setShrinkRows(filteredShrink)
    setCounts({}) // historical view doesn't use the live in-progress counts map
    setIsHistorical(true)
    setSaved(true)
    setSaving(false)
    setReportCountedBy(session.counted_by || null)
    // Stash the fetched rows + the locations actually present in this
    // session's data, so ReportSummary filters against reality instead of
    // always assuming the 4 real Jellyland locations exist in the data.
    setHistoricalCountedProducts(filteredCounts)
    setHistoricalDisplayLocations(displayLocations)
    setScreen(SCREENS.REPORT)
  }

  function handleDone() {
    clearProgress()
    resetSession()
    setScreen(SCREENS.HOME)
  }

  if (screen === SCREENS.LOGIN) return <Login onLogin={handleLogin} />

  if (screen === SCREENS.HOME) return (
    <Home onStartCount={handleStartCount} onLogout={handleLogout} hasResume={hasResume} onClearAndStart={handleClearAndStart}
      onViewHistory={() => setScreen(SCREENS.HISTORY)} onLogAdjustment={handleOpenAdjustments}
      onQuickAdjust={handleOpenQuickAdjust}
      onViewMonthlyReport={() => setScreen(SCREENS.MONTHLY_REPORT)}
      loggedInUser={loggedInUser} />
  )

  if (screen === SCREENS.MONTHLY_REPORT) return (
    <MonthlyShrinkReport onBack={() => setScreen(SCREENS.HOME)} />
  )

  if (screen === SCREENS.ADJUST) return (
    <LogAdjustment locations={locations} categories={categories} onBack={() => setScreen(SCREENS.HOME)} onViewSyncIssues={() => setScreen(SCREENS.SYNC_ISSUES)} onViewAdjustmentLog={() => setScreen(SCREENS.ADJUSTMENT_LOG)} loggedInUser={loggedInUser} />
  )

  if (screen === SCREENS.SYNC_ISSUES) return (
    <SyncIssues onBack={() => setScreen(SCREENS.ADJUST)} />
  )

  if (screen === SCREENS.ADJUSTMENT_LOG) return (
    <AdjustmentLog onBack={() => setScreen(SCREENS.ADJUST)} />
  )

  if (screen === SCREENS.QUICK_ADJUST) return (
    <QuickAdjust locations={locations} categories={categories} loggedInUser={loggedInUser} onBack={() => setScreen(SCREENS.HOME)}
      onViewReport={() => setScreen(SCREENS.QUICK_ADJUST_REPORT)} onViewSyncIssues={() => setScreen(SCREENS.QUICK_ADJUST_SYNC_ISSUES)} />
  )

  if (screen === SCREENS.QUICK_ADJUST_REPORT) return (
    <QuickAdjustReport onBack={() => setScreen(SCREENS.QUICK_ADJUST)} />
  )

  if (screen === SCREENS.QUICK_ADJUST_SYNC_ISSUES) return (
    <QuickAdjustSyncIssues onBack={() => setScreen(SCREENS.QUICK_ADJUST)} />
  )

  if (screen === SCREENS.HISTORY) return (
    <SessionHistory onBack={() => setScreen(SCREENS.HOME)} onViewSession={handleViewHistorySession} />
  )

  if (screen === SCREENS.CATEGORIES) return (
    <Categories
      categories={categories} locations={locations} collections={collections} completedCats={completedCats} lockedCells={lockedCells}
      onSelectCategory={handleSelectCategoryFromGrid}
      onFinish={handleFinishCount}
      onBack={() => setScreen(SCREENS.HOME)}
      onStartFresh={handleClearAndStart}
      onExportCsv={handleExportCsv}
      completion={getCompletionStats()}
      zoneCompletion={getZoneCompletion()}
      locationCompletion={getLocationCompletionStats()}
      loading={productsLoading} error={productsError}
    />
  )

  if (screen === SCREENS.COUNT) return (
    <CountProducts
      locations={locations} category={currentCategory} products={categories[currentCategory] || []}
      existingCounts={counts} lockedCells={lockedCells}
      wasSaved={completedCats.has(currentCategory)}
      onSave={handleSaveCategoryCount}
      onAutosave={handleAutosaveCategoryCount}
      onToggleLock={handleToggleLockCell}
      onLockAllCounted={handleLockAllCounted}
      onBack={() => setScreen(SCREENS.CATEGORIES)}
    />
  )

  if (screen === SCREENS.SHRINK) return (
    <ShrinkReport variances={shrinkRows} onGenerate={handleGenerateReport} onBack={() => setScreen(SCREENS.CATEGORIES)} />
  )

  if (screen === SCREENS.REPORT) return (
    <ReportSummary
      startedAt={sessionStartedAt}
      locationId={reportLocationId}
      countedProducts={isHistorical ? historicalCountedProducts : getCountedProducts(reportLocationId)}
      shrinkRows={shrinkRows}
      locations={isHistorical ? historicalDisplayLocations : locations}
      allowSync={!(isHistorical && reportLocationId === 'COMBINED')}
      onDone={handleDone} saving={saving} saved={saved}
      sessionId={reportSessionId}
      syncedLocations={syncedLocations}
      onLocationSynced={(locId) => setSyncedLocations(prev => [...new Set([...prev, locId])])}
      countedBy={reportCountedBy}
    />
  )

  return null
}