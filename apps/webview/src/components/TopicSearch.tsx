interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function TopicSearch({
  value,
  onChange,
  placeholder = "Search topics, frameworks, tools…",
}: Props) {
  return (
    <div className="topic-search">
      <svg className="topic-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        className="input topic-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search topics"
      />
      <kbd className="topic-search-kbd">^K</kbd>
    </div>
  );
}
