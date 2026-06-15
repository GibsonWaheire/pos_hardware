import React from 'react'

/**
 * Reusable pagination bar.
 *
 * Props:
 *   total     — total number of items
 *   page      — current page (1-based)
 *   pageSize  — items per page
 *   onChange  — (newPage: number) => void
 */
export default function Pagination({ total, page, pageSize, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1 && total <= pageSize) return null

  const from = Math.min((page - 1) * pageSize + 1, total)
  const to   = Math.min(page * pageSize, total)

  // Build page number list with ellipsis
  function pageNumbers() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages = []
    if (page <= 4) {
      pages.push(1, 2, 3, 4, 5, '…', totalPages)
    } else if (page >= totalPages - 3) {
      pages.push(1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
    } else {
      pages.push(1, '…', page - 1, page, page + 1, '…', totalPages)
    }
    return pages
  }

  const btnBase = {
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', cursor: 'pointer', borderRadius: 6,
    padding: '5px 10px', fontSize: 13, lineHeight: 1.4,
    transition: 'background 0.15s',
  }
  const btnActive = { ...btnBase, background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', fontWeight: 700 }
  const btnDisabled = { ...btnBase, opacity: 0.4, cursor: 'not-allowed' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px', flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {total === 0 ? 'No items' : `Showing ${from}–${to} of ${total}`}
      </span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button style={page === 1 ? btnDisabled : btnBase} disabled={page === 1}
          onClick={() => onChange(page - 1)}>
          ‹ Prev
        </button>
        {pageNumbers().map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} style={{ padding: '5px 6px', fontSize: 13, color: 'var(--text-muted)' }}>…</span>
            : <button key={p} style={p === page ? btnActive : btnBase} onClick={() => onChange(p)}>{p}</button>
        )}
        <button style={page === totalPages ? btnDisabled : btnBase} disabled={page === totalPages}
          onClick={() => onChange(page + 1)}>
          Next ›
        </button>
      </div>
    </div>
  )
}
