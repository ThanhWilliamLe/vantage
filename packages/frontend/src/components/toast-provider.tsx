import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#27272B',
          border: '1px solid #2E2E33',
          color: '#ECECEF',
        },
      }}
    />
  );
}
