import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from '@/hooks/useAuth';
import { ApiError } from '@/services/api';
import '@/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry an authorization or not-found failure - it will not
        // succeed, and retrying just delays the error the user needs to see.
        if (error instanceof ApiError) {
          if ([400, 401, 403, 404, 409, 422].includes(error.status)) return false;
          // 5xx and network errors are worth a couple of retries.
          if (error.status >= 500 || error.status === 0) return failureCount < 2;
        }
        return failureCount < 1;
      },
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#0f172a',
                color: '#fff',
                borderRadius: '10px',
                fontSize: '14px',
                padding: '12px 16px',
                maxWidth: '420px',
              },
              success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
              error: { duration: 6000, iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
