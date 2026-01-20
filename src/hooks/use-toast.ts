import { useState, useCallback } from 'react';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: 'success' | 'danger' | 'warning' | 'info';
}

let toastListeners: ((toasts: ToastMessage[]) => void)[] = [];
let toasts: ToastMessage[] = [];

function notifyListeners() {
  toastListeners.forEach(listener => listener([...toasts]));
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

export function useToast() {
  const [, setUpdate] = useState(0);

  const subscribe = useCallback(() => {
    const listener = () => setUpdate(prev => prev + 1);
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);

  // Subscribe on mount
  useState(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  });

  const dismiss = useCallback((id: string) => {
    toasts = toasts.filter(t => t.id !== id);
    notifyListeners();
  }, []);

  return {
    toasts,
    toast,
    dismiss
  };
}
