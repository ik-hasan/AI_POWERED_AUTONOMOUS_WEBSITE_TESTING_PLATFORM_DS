import clsx from 'clsx';

interface Props {
  value: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  color?: 'brand' | 'green' | 'red';
}

export default function ProgressBar({ value, label, size = 'md', showLabel = true, color = 'brand' }: Props) {
  const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' };
  const colors = {
    brand: 'bg-brand-600',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };

  return (
    <div className="w-full">
      {(showLabel || label) && (
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>{label}</span>
          <span>{Math.round(value)}%</span>
        </div>
      )}
      <div className={clsx('w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700', heights[size])}>
        <div
          className={clsx('rounded-full transition-all duration-500', heights[size], colors[color])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
