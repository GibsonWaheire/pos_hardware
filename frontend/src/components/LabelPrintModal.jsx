import React, { useState, useEffect } from 'react'
import { printBarcodeLabels } from '../utils/print'
import { getStoreConfig } from '../api'

/**
 * LabelPrintModal
 *
 * Props:
 *   products  — array of product objects to print labels for
 *   onClose   — callback to close the modal
 *
 * Shows format picker (58mm / A4), per-product qty inputs,
 * total label count, then prints via printBarcodeLabels().
 */
export default function LabelPrintModal({ products = [], onClose }) {
  const [format, setFormat]     = useState('58mm')
  const [qtys, setQtys]         = useState({})
  const [storeName, setStoreName] = useState('')

  useEffect(() => {
    // Default qty = 1 per product
    const init = {}
    products.forEach(p => { init[p.id] = 1 })
    setQtys(init)
    // Load store name for label header
    getStoreConfig().then(r => setStoreName(r.data?.name || '')).catch(() => {})
  }, [products])

  function setQty(id, val) {
    const n = Math.max(1, Math.min(999, parseInt(val) || 1))
    setQtys(prev => ({ ...prev, [id]: n }))
  }

  const totalLabels = products.reduce((s, p) => s + (qtys[p.id] || 1), 0)
  const a4Sheets    = Math.ceil(totalLabels / 30)

  function handlePrint() {
    const items = products.map(p => ({ product: p, qty: qtys[p.id] || 1 }))
    printBarcodeLabels(items, format, storeName)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-title">Print Barcode Labels</div>

        {/* Format picker */}
        <div style={{ marginBottom: 16 }}>
          <div className="label">Label format</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: '58mm', icon: '🖨️', title: '58 mm Roll', sub: 'One label per item printed' },
              { key: 'a4',   icon: '📄', title: 'A4 Sheet',   sub: `3 columns · 30 per page` },
            ].map(f => (
              <div key={f.key}
                onClick={() => setFormat(f.key)}
                style={{
                  flex: 1, border: `2px solid ${format === f.key ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                  background: format === f.key ? 'var(--accent)10' : 'var(--surface)',
                  transition: 'border-color 0.15s',
                }}>
                <div style={{ fontSize: 20 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{f.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{f.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-product qty */}
        <div className="label" style={{ marginBottom: 6 }}>
          Copies per product
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
          {products.map((p, i) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              borderBottom: i < products.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              {p.image_url && (
                <img src={p.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {p.barcode || p.plu_code || `ID:${p.id}`}
                </div>
              </div>
              <input
                type="number" min={1} max={999}
                value={qtys[p.id] || 1}
                onChange={e => setQty(p.id, e.target.value)}
                style={{ width: 64, textAlign: 'center', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, fontWeight: 600, background: 'var(--surface2)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 36 }}>label{qtys[p.id] !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{
          background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px',
          marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 13,
        }}>
          <span style={{ color: 'var(--text-muted)' }}>
            {products.length} product{products.length !== 1 ? 's' : ''} · <strong>{totalLabels}</strong> label{totalLabels !== 1 ? 's' : ''}
          </span>
          {format === 'a4' && (
            <span style={{ color: 'var(--text-muted)' }}>
              ~{a4Sheets} A4 sheet{a4Sheets !== 1 ? 's' : ''}
            </span>
          )}
          {format === '58mm' && (
            <span style={{ color: 'var(--text-muted)' }}>
              {totalLabels} slip{totalLabels !== 1 ? 's' : ''} on roll
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={handlePrint}>
            Print {totalLabels} Label{totalLabels !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
