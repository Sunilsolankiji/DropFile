import { useSyncExternalStore } from 'react';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: 'success' | 'danger' | 'warning' | 'info';
}

let toastListeners: (() => void)[] = [];
let toasts: ToastMessage[] = [];

function notifyListeners() {
  toastListeners.forEach(listener => listener());
}

export function toast({ title, description, variant = 'info' }: Omit<ToastMessage, 'id'>) {
  const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const newToast: ToastMessage = { id, title, description, variant };
  toasts = [...toasts, newToast];
  notifyListeners();

  // Auto-remove after 5 seconds
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    notifyListeners();
  }, 5000);

  return id;
}

function subscribe(listener: () => void) {
  toastListeners.push(listener);
  return () => {
    toastListeners = toastListeners.filter(l => l !== listener);
  };
}

function getSnapshot() {
  return toasts;
}

function dismiss(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  notifyListeners();
}

export function useToast() {
  const currentToasts = useSyncExternalStore(subscribe, getSnapshot);
  return {
    toasts: currentToasts,
    toast,
    dismiss
  };
}
