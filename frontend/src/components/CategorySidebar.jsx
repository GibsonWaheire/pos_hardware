// Category icons by common hardware-store category names (case-insensitive partial match)
const CATEGORY_ICONS = [
  [/nail|fastener/i,   '🔩'],
  [/screw|bolt/i,      '🪛'],
  [/wire|cable|elec/i, '⚡'],
  [/paint|colour/i,    '🎨'],
  [/pipe|plumb/i,      '🔧'],
  [/tool/i,            '🛠️'],
  [/wood|timber/i,     '🪵'],
  [/lock|security/i,   '🔒'],
  [/glass/i,           '🪟'],
  [/cement|concrete/i, '🏗️'],
  [/adhesive|glue/i,   '🔗'],
  [/garden/i,          '🌿'],
  [/safety|ppe/i,      '🦺'],
  [/measur/i,          '📏'],
  [/light|lamp/i,      '💡'],
  [/door|window/i,     '🚪'],
  [/bag|packag/i,      '🛍️'],
]

function getCategoryIcon(name) {
  for (const [pattern, icon] of CATEGORY_ICONS) {
    if (pattern.test(name)) return icon
  }
  return '📦'
}

export default function CategorySidebar({ categories, selected, onSelect }) {
  return (
    <div className="pos-cat-sidebar">
      <div
        className={`cat-item${!selected ? ' active' : ''}`}
        onClick={() => onSelect('')}
      >
        <span className="cat-item-icon">🏪</span>
        <span className="cat-item-label">All Items</span>
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

      {categories.map(cat => (
        <div
          key={cat.id}
          className={`cat-item${selected === String(cat.id) ? ' active' : ''}`}
          onClick={() => onSelect(String(cat.id))}
          title={cat.name}
        >
          <span className="cat-item-icon">{getCategoryIcon(cat.name)}</span>
          <span className="cat-item-label">{cat.name}</span>
        </div>
      ))}
    </div>
  )
}
