import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';

// 既定では画面に戻るたびに全クエリが再取得され、そのぶんGASへのリクエストが
// 増えて順番待ちが発生していた（GASは1リクエストあたり2秒以上かかる）。
// 明示的な更新・データ更新時の無効化に任せる。
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect:   false,
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
