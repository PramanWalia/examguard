import { EmptyState } from '../components/States';

export const PlaceholderPage = ({ title, description, emptyTitle, emptyMessage }) => (
  <section>
    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
    <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-300">{description}</p>
    <div className="mt-8"><EmptyState message={emptyMessage} title={emptyTitle} /></div>
  </section>
);
