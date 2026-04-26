interface Props {
  onOpen: () => void;
}

export function EmptyState({ onOpen }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-state__title">Terrain</div>
      <button type="button" className="empty-state__button" onClick={onOpen}>
        Open repository
      </button>
      <div className="empty-state__hint">
        Pick a folder containing a git repository
      </div>
    </div>
  );
}
