/** Keep the geometry and colors in sync with app/icon.svg. */
export function BrandMark({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="9" fill="#f4c95d" />
      <path
        d="M9 23V10L21 23V9M16 14L21 9L26 14"
        fill="none"
        stroke="#172b3a"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
