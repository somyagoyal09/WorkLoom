const STAGE_STYLE = {
  'Design Approved': 'slate',
  'Casting': 'copper',
  'Filing': 'copper',
  'Setting': 'gold',
  'Polishing': 'gold',
  'Quality Check': 'emerald',
  'Ready for Dispatch': 'emerald',
};

export function StageBadge({ stage }) {
  const tone = STAGE_STYLE[stage] || 'slate';
  return <span className={`wl-badge wl-badge-${tone}`}>{stage}</span>;
}

export function PriorityTag({ priority }) {
  const cls = priority === 'High' ? 'wl-priority-high' : priority === 'Medium' ? 'wl-priority-medium' : 'wl-priority-low';
  const icon = priority === 'High' ? 'bi-arrow-up-short' : priority === 'Medium' ? 'bi-dash' : 'bi-arrow-down-short';
  return (
    <span className={cls}>
      <i className={`bi ${icon}`} /> {priority}
    </span>
  );
}
