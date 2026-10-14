import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { MarketPriceProvider } from './context/MarketPriceContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MarketPriceProvider>
      <App />
    </MarketPriceProvider>
  </StrictMode>,
);

