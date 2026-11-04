import { useId, useState } from 'react';
import { t } from '../i18n/messages';
import { localeTag } from '../i18n/locale';
import type { WorkoutHistory } from '../lib/workoutHistory';
import { workoutPoints, type WorkoutMetric } from '../lib/workoutChart';
import { Icon } from './Icon';

export function WorkoutCharts({ history, exercises, onBack }: { history: WorkoutHistory; exercises: string[]; onBack: () => void }) {
  const gradientId = useId();
  const [exercise, setExercise] = useState(exercises[0] ?? '');
  const [metric, setMetric] = useState<WorkoutMetric>('weight');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const name = exercises.includes(exercise) ? exercise : exercises[0] ?? '';
  const points = workoutPoints(history, name, metric);
  const selected = points.find(point => point.date === selectedDate) ?? points[points.length - 1];
  const maximum = points.reduce((best, point) => !best || point.value >= best.value ? point : best, points[0]);
  const unit = metric === 'weight' ? 'kg' : t('charts.volumeUnit');
  const format = (value: number) => value.toLocaleString(localeTag(), { maximumFractionDigits: 2 });
  const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(localeTag());
  const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(localeTag(), { day: 'numeric', month: 'numeric' });
  const timestamp = (value: string) => new Date(`${value}T12:00:00`).getTime();
  const start = points.length ? timestamp(points[0].date) : 0;
  const span = points.length ? timestamp(points[points.length - 1].date) - start : 0;
  const rawTop = Math.max(1, maximum?.value ?? 0) * 1.05;
  const magnitude = 10 ** Math.floor(Math.log10(rawTop / 4));
  const step = Math.ceil(rawTop / 4 / magnitude) * magnitude;
  const top = step * 4;
  const x = (day: string) => span ? 58 + (timestamp(day) - start) / span * 282 : 199;
  const y = (value: number) => 196 - value / top * 170;
  const labels = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].filter(index => index >= 0);
  return <main id="main-content" className="workouts-page workout-charts">
    <div className="chart-navigation"><button type="button" className="text-button habit-order-trigger" onClick={onBack}><Icon name="left" size={17} />{t('charts.back')}</button></div>
    <div className="page-heading"><div><h1>{t('charts.title')}</h1><p className="page-description">{t('charts.description')}</p></div></div>
    <div className="chart-content">
    <section className="chart-filter-panel" aria-label={t('charts.metric')}>
    <div className="chart-controls">
      <div><label htmlFor="chart-exercise" className="field-label">{t('workouts.name')}</label>
        <select id="chart-exercise" className="form-input" value={name} disabled={!exercises.length} onChange={event => { setExercise(event.target.value); setSelectedDate(null); }}>
          {exercises.map(item => <option key={item} value={item}>{item}</option>)}
        </select></div>
      <div><label htmlFor="chart-metric" className="field-label">{t('charts.metric')}</label>
        <select id="chart-metric" className="form-input" value={metric} onChange={event => { setMetric(event.target.value as WorkoutMetric); setSelectedDate(null); }}>
          <option value="weight">{t('charts.weight')}</option><option value="volume">{t('charts.volume')}</option><option value="set">{t('charts.set')}</option>
        </select></div>
    </div>
    <p className="field-help">{t(metric === 'weight' ? 'charts.weightHelp' : metric === 'volume' ? 'charts.volumeHelp' : 'charts.setHelp')}</p>
    </section>
    {!points.length ? <div className="empty-state"><Icon name="chart" size={36} /><h2>{t('charts.empty')}</h2><p>{t('charts.emptyHelp')}</p></div> : <>
      <div className="chart-summary">
        <div className="chart-record"><span className="chart-stat-label"><Icon name="chart" size={15} />{t('charts.record')}</span><strong>{format(maximum.value)} <small>{unit}</small></strong><span>{date(maximum.date)}</span></div>
        <div><span>{t('charts.latest')}</span><strong>{format(points[points.length - 1].value)} <small>{unit}</small></strong><span>{date(points[points.length - 1].date)}</span></div>
      </div>
      <section className="chart-panel" aria-label={`${name} — ${t('charts.title')}`}>
        <div className="chart-panel-heading"><div><h2>{name}</h2><p>{t(metric === 'weight' ? 'charts.weight' : metric === 'volume' ? 'charts.volume' : 'charts.set')}</p></div><span className="chart-unit">{unit}</span></div>
        <svg viewBox="0 0 360 232" className="workout-chart" role="group" aria-label={t('charts.graphLabel', { name })}>
          <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".16" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
          <polygon points={`${x(points[0].date)},196 ${points.map(point => `${x(point.date)},${y(point.value)}`).join(' ')} ${x(points[points.length - 1].date)},196`} fill={`url(#${gradientId})`} />
          {[0, 1, 2, 3, 4].map(index => { const value = top * index / 4; return <g key={index}>
            <line x1="58" x2="340" y1={y(value)} y2={y(value)} className="chart-grid" />
            <text x="51" y={y(value) + 4} textAnchor="end" className="chart-label">{format(value)}</text>
          </g>; })}
          {labels.map(index => <text key={index} x={x(points[index].date)} y="220" textAnchor={index === 0 && span ? 'start' : index === points.length - 1 && span ? 'end' : 'middle'} className="chart-label">{shortDate(points[index].date)}</text>)}
          <polyline points={points.map(point => `${x(point.date)},${y(point.value)}`).join(' ')} fill="none" className="chart-line" />
          {points.map(point => <g key={point.date}>
            <circle cx={x(point.date)} cy={y(point.value)} r={point.date === selected.date ? 5 : 3} className="chart-dot" />
            <circle cx={x(point.date)} cy={y(point.value)} r="11" className="chart-hit" role="button" tabIndex={0}
              aria-label={`${date(point.date)}: ${format(point.value)} ${unit}`} aria-pressed={point.date === selected.date}
              onClick={() => setSelectedDate(point.date)} onFocus={() => setSelectedDate(point.date)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedDate(point.date); } }}>
              <title>{date(point.date)}: {format(point.value)} {unit}</title>
            </circle>
          </g>)}
        </svg>
        <p className="chart-selection" aria-live="polite"><strong>{format(selected.value)} {unit}</strong><span>{date(selected.date)}</span></p>
        <p className="field-help">{t('charts.tapHelp')}</p>
      </section>
      <details className="chart-data"><summary>{t('charts.data')}</summary>
        <table className="sets-table"><caption className="sr-only">{name}</caption><thead><tr><th scope="col">{t('workouts.day')}</th><th scope="col">{unit}</th></tr></thead>
          <tbody>{points.map(point => <tr key={point.date}><th scope="row">{date(point.date)}</th><td>{format(point.value)}</td></tr>)}</tbody>
        </table>
      </details>
    </>}
    </div>
  </main>;
}
