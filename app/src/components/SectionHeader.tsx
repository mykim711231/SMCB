import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export default function SectionHeader({ title, subtitle, right }: Props): JSX.Element {
  return (
    <div className="flex items-end justify-between gap-3 mt-6 mb-2 border-b border-divider pb-2">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-fg leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
