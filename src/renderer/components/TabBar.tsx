interface TabSummary {
  id: string;
  title: string;
}

interface Props {
  tabs: TabSummary[];
  activeTabId: string | null;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

export function TabBar({ tabs, activeTabId, onSwitch, onClose, onAdd }: Props) {
  return (
    <div className="tabbar">
      <div className="tabbar__tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`tab${isActive ? ' tab--active' : ''}`}
              onClick={() => onSwitch(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSwitch(tab.id);
                }
              }}
              role="tab"
              tabIndex={0}
              aria-selected={isActive}
            >
              <span className="tab__label">{tab.title}</span>
              <button
                type="button"
                className="tab__close"
                aria-label={`Close ${tab.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                >
                  <path
                    d="M2 2 L8 8 M8 2 L2 8"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="tabbar__add"
        aria-label="Open new repository"
        onClick={onAdd}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M5 1 L5 9 M1 5 L9 5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
