import { useTranslations } from 'next-intl';
import type { LearningModeRow } from '@/lib/analytics/types';
import { BarList } from './BarList';
import { ChartPanel } from './ChartPanel';
import { DataTable } from './DataTable';
import { DemoLabel } from './DemoLabel';
import { useFigures } from './figures';
import { NotTrackedNote } from './NotTrackedNote';

/** Gains are drawn on a 0–50 point scale (as in the design), or wider if needed. */
const SCALE_POINTS = 50;

/** "Read vs listen", with the fixed "not tracked" note underneath. */
export function ModesPanel({ modes, className }: { modes: LearningModeRow[]; className?: string }) {
  const t = useTranslations('analytics.modes');
  const f = useFigures();
  const scale = Math.max(SCALE_POINTS, ...modes.map((m) => Math.abs(m.gain ?? 0)));

  return (
    <ChartPanel
      className={className}
      title={t('title')}
      subtitle={t('subtitle')}
      how={t('how')}
      label={<DemoLabel />}
      chart={
        <BarList
          bars={modes.map((m) => ({
            key: m.mode,
            label: t(`items.${m.mode}`),
            width: m.gain === null ? null : (100 * Math.max(m.gain, 0)) / scale,
            value: f.points(m.gain) ?? f.hidden,
            tone: m.mode === 'read' ? 'ink' : 'brand',
          }))}
        />
      }
      table={
        <DataTable
          caption={t('title')}
          columns={[t('columns.mode'), t('columns.users'), t('columns.gain')]}
          rows={modes.map((m) => ({
            key: m.mode,
            cells: [t(`items.${m.mode}`), f.count(m.users) ?? f.hidden, f.points(m.gain) ?? f.hidden],
          }))}
        />
      }
      footer={<NotTrackedNote className="mt-auto" />}
    />
  );
}
