import type { Tab } from '../tab';
import { EmptyState } from './EmptyState';
import { ProgressIndicator } from './ProgressIndicator';
import { Sunburst } from './Sunburst';

interface Props {
  activeTab: Tab | null;
  onOpen: () => void;
  onFocusChange: (tabId: string, path: string[]) => void;
}

/**
 * Workspace area below the tab bar. Switches between empty state, scan
 * progress, and the loaded sunburst based on the active tab's kind.
 */
export function Workspace({ activeTab, onOpen, onFocusChange }: Props) {
  return (
    <div className="workspace">
      {activeTab === null ? <EmptyState onOpen={onOpen} /> : null}
      {activeTab?.kind === 'scanning' ? (
        <ProgressIndicator
          mode="centered"
          filesScanned={activeTab.filesScanned}
        />
      ) : null}
      {activeTab?.kind === 'loaded' ? (
        <Sunburst
          key={activeTab.id}
          data={activeTab.result.tree}
          initialFocusPath={activeTab.focusPath}
          onFocusChange={(path) => onFocusChange(activeTab.id, path)}
        />
      ) : null}
    </div>
  );
}
