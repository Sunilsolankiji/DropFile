import { useEffect, useRef, useState } from 'react';
import { useToast } from './use-toast';

async function writeClipboard(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('textarea');
  const previousFocus = document.activeElement;
  input.value = text;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard is unavailable');
  } finally {
    input.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  }
}

export function useCopyText() {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const { toast } = useToast();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (text: string) => {
    try {
      await writeClipboard(text);
      setCopiedText(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedText(null), 2000);
      return true;
    } catch {
      toast({ title: 'Could not copy', description: 'Select the text and copy it manually. Your browser may not allow clipboard access.', variant: 'danger' });
      return false;
    }
  };

  return { copy, copiedText };
}
