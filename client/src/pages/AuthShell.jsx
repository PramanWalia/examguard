import { Link } from 'react-router-dom';

const points = [
  { title: 'Server-timed attempts', body: 'The countdown reconciles with the server, so a slow laptop never changes the deadline.' },
  { title: 'Answers that survive', body: 'Every change is queued and retried. Refresh or lose signal without losing work.' },
  { title: 'Results on your terms', body: 'Release scores immediately, after the exam ends, or manually when you decide.' },
];

export const AuthShell = ({ kicker, title, description, children, footer }) => (
  <main className="min-h-[100dvh] bg-slate-950 text-white lg:grid lg:grid-cols-[1.05fr_minmax(0,1fr)]">
    <section className="relative hidden overflow-hidden border-r border-white/10 p-10 lg:flex lg:flex-col lg:justify-between">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(circle at 15% 10%, rgba(79,70,229,0.55), transparent 45%), radial-gradient(circle at 80% 85%, rgba(14,165,233,0.35), transparent 45%), #020617',
        }}
      />
      <div className="relative">
        <Link className="inline-flex items-center gap-2.5" to="/">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-sm font-black text-white">EG</span>
          <span className="text-lg font-bold tracking-tight">ExamGuard</span>
        </Link>
        <h2 className="mt-20 max-w-md text-balance text-4xl font-bold leading-tight tracking-tight">
          Every attempt deserves a fair clock.
        </h2>
        <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
          A focused workspace for secure online assessments — built around server authority, resilient
          autosave, and calm interfaces.
        </p>

        <ul className="mt-12 max-w-md space-y-6">
          {points.map((point) => (
            <li className="flex gap-3" key={point.title}>
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-brand-200">
                ✓
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{point.title}</span>
                <span className="mt-1 block text-sm leading-6 text-slate-400">{point.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-xs text-slate-500">ExamGuard · React client · Stateful MSW demo</p>
    </section>

    <section className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8 lg:min-h-0">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-sm font-black text-white">EG</span>
          <span className="text-lg font-bold tracking-tight text-slate-950 dark:text-white">ExamGuard</span>
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">{kicker}</p>
        <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</h1>
        {description && <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>}
        <div className="mt-7">{children}</div>
        {footer && <div className="mt-6 text-sm text-slate-600 dark:text-slate-400">{footer}</div>}
      </div>
    </section>
  </main>
);

export default AuthShell;
