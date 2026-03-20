import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#1c1c24',
          border: '1px solid #2a2a36',
          color: '#e8e8ef',
        },
      }}
    />
  );
}
