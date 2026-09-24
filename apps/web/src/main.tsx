import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { router } from './app/router';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mạng phòng thi có thể chập chờn, thử lại vài lần trước khi báo lỗi
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Lưu đáp án phải bền bỉ: đây là chức năng 4.6 và 4.7
      retry: 5,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 8_000),
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
