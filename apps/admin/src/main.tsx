import './app/styles.css';
import './app/work-areas.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { router } from './app/router';
import { applyTheme } from './app/theme';
import { isApiError } from './lib/api';

applyTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Auth and role errors never fix themselves on retry.
      retry: (count, error) =>
        count < 2 && !isApiError(error, 'AUTH_REQUIRED') && !isApiError(error, 'FORBIDDEN'),
      refetchOnWindowFocus: true,
    },
  },
});

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element #root was not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
