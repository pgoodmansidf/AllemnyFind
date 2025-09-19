import toast from 'react-hot-toast';

interface ToastOptions {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  style?: React.CSSProperties;
  className?: string;
  icon?: string | React.ReactElement;
}

class ToastDebouncer {
  private recentToasts = new Map<string, number>();
  private readonly DEBOUNCE_TIME = 3000; // 3 seconds

  private shouldShowToast(message: string): boolean {
    const now = Date.now();
    const lastShown = this.recentToasts.get(message);

    if (!lastShown || (now - lastShown) >= this.DEBOUNCE_TIME) {
      this.recentToasts.set(message, now);
      return true;
    }

    return false;
  }

  success(message: string, options?: ToastOptions) {
    if (this.shouldShowToast(message)) {
      return toast.success(message, {
        duration: 4000,
        ...options
      });
    }
    return null;
  }

  error(message: string, options?: ToastOptions) {
    if (this.shouldShowToast(message)) {
      return toast.error(message, {
        duration: 5000,
        ...options
      });
    }
    return null;
  }

  loading(message: string, options?: ToastOptions) {
    if (this.shouldShowToast(message)) {
      return toast.loading(message, options);
    }
    return null;
  }

  info(message: string, options?: ToastOptions) {
    if (this.shouldShowToast(message)) {
      return toast(message, {
        duration: 4000,
        icon: 'ℹ️',
        ...options
      });
    }
    return null;
  }

  warning(message: string, options?: ToastOptions) {
    if (this.shouldShowToast(message)) {
      return toast(message, {
        duration: 4000,
        icon: '⚠️',
        style: {
          backgroundColor: '#f59e0b',
          color: '#ffffff',
        },
        ...options
      });
    }
    return null;
  }

  // Method to manually clear debounce cache
  clearCache() {
    this.recentToasts.clear();
  }

  // Method to clear specific message from cache
  clearMessage(message: string) {
    this.recentToasts.delete(message);
  }

  // Method to get debounce status for a message
  isDebounced(message: string): boolean {
    const now = Date.now();
    const lastShown = this.recentToasts.get(message);
    return lastShown !== undefined && (now - lastShown) < this.DEBOUNCE_TIME;
  }

  // Method to get remaining debounce time
  getRemainingDebounceTime(message: string): number {
    const now = Date.now();
    const lastShown = this.recentToasts.get(message);

    if (!lastShown) return 0;

    const elapsed = now - lastShown;
    return Math.max(0, this.DEBOUNCE_TIME - elapsed);
  }
}

// Create a singleton instance
export const debouncedToast = new ToastDebouncer();

// Export utility functions for common patterns
export const showSuccessOnce = (message: string, options?: ToastOptions) =>
  debouncedToast.success(message, options);

export const showErrorOnce = (message: string, options?: ToastOptions) =>
  debouncedToast.error(message, options);

export const showLoadingOnce = (message: string, options?: ToastOptions) =>
  debouncedToast.loading(message, options);

export const showInfoOnce = (message: string, options?: ToastOptions) =>
  debouncedToast.info(message, options);

export const showWarningOnce = (message: string, options?: ToastOptions) =>
  debouncedToast.warning(message, options);

// Progress-specific toast utilities
export class ProgressToastManager {
  private activeToasts = new Map<string, string>();

  showProgress(jobId: string, message: string, progress?: number) {
    const toastId = this.activeToasts.get(jobId);
    const displayMessage = progress !== undefined ?
      `${message} (${Math.round(progress)}%)` :
      message;

    if (toastId) {
      // Update existing toast
      toast.loading(displayMessage, { id: toastId });
    } else {
      // Create new toast
      const newToastId = toast.loading(displayMessage);
      this.activeToasts.set(jobId, newToastId);
    }
  }

  completeProgress(jobId: string, message: string) {
    const toastId = this.activeToasts.get(jobId);

    if (toastId) {
      toast.success(message, { id: toastId });
      this.activeToasts.delete(jobId);
    } else {
      debouncedToast.success(message);
    }
  }

  failProgress(jobId: string, message: string) {
    const toastId = this.activeToasts.get(jobId);

    if (toastId) {
      toast.error(message, { id: toastId });
      this.activeToasts.delete(jobId);
    } else {
      debouncedToast.error(message);
    }
  }

  dismissProgress(jobId: string) {
    const toastId = this.activeToasts.get(jobId);

    if (toastId) {
      toast.dismiss(toastId);
      this.activeToasts.delete(jobId);
    }
  }

  clearAll() {
    this.activeToasts.forEach((toastId) => {
      toast.dismiss(toastId);
    });
    this.activeToasts.clear();
  }
}

export const progressToast = new ProgressToastManager();

export default debouncedToast;