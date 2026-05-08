export type TerminalTab = {
  id: string;
  label: string;
};

export function TerminalTabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: TerminalTab[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="terminal-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={tab.id === activeId ? "is-active" : ""}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
