import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * A single, visible connectivity notice. Autosave itself retries in the
 * background, so this banner never blocks the exam.
 */
export const ConnectivityBanner = ({ className = '' }) => {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      className={`border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-100 ${className}`}
      role="status"
    >
      You are offline. Answers stay on this screen and will retry automatically when the connection
      returns.
    </div>
  );
};

export default ConnectivityBanner;
