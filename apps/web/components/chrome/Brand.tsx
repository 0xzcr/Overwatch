export function BrandMark({ className = "w-[18px]" }: { className?: string }) {
  // Overwatch mark: a watchtower eye — concentric arc + pupil, drawn for this project.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M2 16c4-6.5 8.7-9.5 14-9.5S26 9.5 30 16c-4 6.5-8.7 9.5-14 9.5S6 22.5 2 16Z" />
      <circle cx="16" cy="16" r="4.2" fill="currentColor" stroke="none" />
      <path d="M16 1v4M16 27v4" strokeLinecap="square" />
    </svg>
  );
}
