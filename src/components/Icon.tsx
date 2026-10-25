import type { ReactNode } from 'react';

type IconName = 'habits' | 'workouts' | 'plus' | 'check' | 'refresh' | 'external' | 'logout' | 'left' | 'right' | 'close' | 'today' | 'edit' | 'trash';
const paths: Record<IconName, ReactNode> = {
  habits: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M3.5 9h17M9 9v11.5m5-6 2 2 4-4" /></>,
  workouts: <><path d="M7 6v12M4 9v6m13-9v12m3-9v6M7 12h10" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  refresh: <><path d="M20 6v5h-5M4 18v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></>,
  external: <><path d="M14 4h6v6m0-6L10 14" /><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  logout: <><path d="M9 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4m7-12 5 5-5 5m-7-5h12" /></>,
  left: <path d="m14 6-6 6 6 6" />,
  right: <path d="m10 6 6 6-6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  today: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 10h16" /><circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none" /></>,
  edit: <><path d="m15 4 5 5M4 20l5-1 11-11a2.1 2.1 0 0 0-5-5L4 14Z" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6" /></>,
};
export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}
