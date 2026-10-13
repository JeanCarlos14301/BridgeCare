/** Placeholder layout while a case is processing; it carries no data and is hidden from assistive tech. */
export function WorkspaceSkeleton() {
  return (
    <div className="inspector skeleton-workspace" aria-hidden="true">
      <div className="window skeleton-pane">
        <div className="window-bar">
          <span className="window-dots">
            <span />
            <span />
            <span />
          </span>
        </div>
        <div className="window-body">
          {[92, 70, 84, 40, 76, 60, 88].map((width, index) => (
            <span key={index} className="skeleton-line" style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
      <div className="workspace-side">
        <div className="card skeleton-card skeleton-block" />
        <div className="card skeleton-card skeleton-block tall" />
      </div>
    </div>
  );
}
