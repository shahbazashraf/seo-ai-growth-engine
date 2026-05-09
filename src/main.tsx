import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';

import { startLocalScheduler } from './lib/scheduler-worker';
import { startDistributionCampaignWorker } from './lib/distribution-campaign-worker';

const queryClient = new QueryClient();

// Start background worker for automated scheduling
startLocalScheduler(60000); // polls every 60 seconds
startDistributionCampaignWorker(60000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
