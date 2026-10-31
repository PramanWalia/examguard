import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Keep details in the console for developers; exam users get a calm, safe message.
    console.error('Unexpected application error:', error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <section className="card w-full max-w-md p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">ExamGuard</p>
            <h1 className="mt-2 text-xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Your saved exam answers are still on the server. Reload this screen to continue.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={this.handleRetry} type="button">
                Try again
              </button>
              <button className="btn-secondary" onClick={() => window.location.reload()} type="button">
                Reload page
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
