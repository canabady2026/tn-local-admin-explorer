const CATEGORY_STYLES = {
  district: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",
  taluk: "bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100",
} as const;

interface Props {
  category: keyof typeof CATEGORY_STYLES;
  value: string;
  onClick: () => void;
}

/** Clickable badge for district/taluk -- each category gets its own
 * consistent color so the two are easy to tell apart at a glance. */
export function LocationBadge({ category, value, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Filter the main list by this ${category}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold transition-colors ${CATEGORY_STYLES[category]}`}
    >
      {value}
    </button>
  );
}
