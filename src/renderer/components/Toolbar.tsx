interface Props {
  repoName?: string;
  onOpen: () => void;
  onClose?: () => void;
}

export function Toolbar({ repoName, onOpen, onClose }: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar__title">{repoName ?? 'Terrain'}</div>
      <div className="toolbar__spacer" />
      <div className="toolbar__actions">
        {onClose ? (
          <button type="button" className="toolbar__button" onClick={onClose}>
            Close
          </button>
        ) : null}
        <button type="button" className="toolbar__button" onClick={onOpen}>
          Open repository
        </button>
      </div>
    </div>
  );
}
