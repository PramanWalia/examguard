import { useCallback } from 'react';
import toast from 'react-hot-toast';

export const useCopy = () => {
  const copy = useCallback(async (value, message = 'Copied to clipboard') => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
      return true;
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.');
      return false;
    }
  }, []);

  return copy;
};

export default useCopy;
