import { lazy, StrictMode, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { AppRoutes } from './components/AppRoutes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuthStore } from './store/authStore';
import './styles.css';

// In development, mock API is opt-in via VITE_USE_MOCK=true. In production, always false.
const useMockApi =
  import.meta.env.MODE !== 'production' && import.meta.env.VITE_USE_MOCK === 'true';

const LazyDevToolsPanel = useMockApi
  ? lazy(() =>
      import('./mocks/DevToolsPanel').then((module) => ({
        default: module.DevToolsPanel,
      })),
    )
  : null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

const SessionBootstrapper = ({ children }) => {
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <ErrorBoundary>
        <SessionBootstrapper>
          <AppRoutes />
          {LazyDevToolsPanel && (
            <Suspense fallback={null}>
              <LazyDevToolsPanel />
            </Suspense>
          )}
        </SessionBootstrapper>
      </ErrorBoundary>
    </BrowserRouter>
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#0f172a',
          color: '#f8fafc',
          fontSize: '14px',
          borderRadius: '12px',
          padding: '10px 14px',
        },
        success: { iconTheme: { primary: '#34d399', secondary: '#0f172a' } },
        error: { iconTheme: { primary: '#f87171', secondary: '#0f172a' } },
      }}
    />
  </QueryClientProvider>
);

const startApp = async () => {
  if (useMockApi) {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: '/mockServiceWorker.js' },
    });
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

startApp();
