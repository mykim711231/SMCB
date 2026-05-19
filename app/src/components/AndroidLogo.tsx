type AndroidLogoProps = {
  size?: number;
  className?: string;
  'aria-hidden'?: boolean;
  'aria-label'?: string;
};

export default function AndroidLogo({
  size = 16,
  className,
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
}: AndroidLogoProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 576 512"
      fill="currentColor"
      className={className}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      <path d="M420.6 301.9a24 24 0 1 1 24-24 24 24 0 0 1-24 24m-265.1 0a24 24 0 1 1 24-24 24 24 0 0 1-24 24m273.7-144.5 47.9-83a10 10 0 1 0-17.3-10l-48.5 84.1a301.3 301.3 0 0 0-246.6 0L116.2 64.5a10 10 0 1 0-17.3 10l47.9 83C64.5 202.7 8.2 285.5 0 384h576c-8.2-98.5-64.5-181.3-146.8-226.6" />
    </svg>
  );
}
