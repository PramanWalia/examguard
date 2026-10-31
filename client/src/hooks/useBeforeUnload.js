import { useEffect } from 'react';

// Warn before leaving with unsaved answers. Browsers show their own generic copy.
export const useBeforeUnload = (enabled = true) => {
  useEffect(() => {
    if (!enabled) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled]);
};

export default useBeforeUnload;
