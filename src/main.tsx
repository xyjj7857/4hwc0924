import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { MarketPriceProvider } from './context/MarketPriceContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MarketPriceProvider>
        <App />
      </MarketPriceProvider>
    </ErrorBoundary>
  </StrictMode>,
);

