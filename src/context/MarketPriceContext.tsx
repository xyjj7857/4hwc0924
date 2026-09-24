import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

export interface LivePriceInfo {
  lastPrice: number;
  markPrice: number;
  change24h: number;
  fundingIntervalHours?: number;
  settlementCycle?: string;
  fundingRate?: number;
}

export interface StreamAlertEvent {
  type: 'gain' | 'loss' | 'amp' | 'spike';
  level: '15m' | '4h';
  symbol: string;
  val: number;
  timestamp: number;
}

export interface MarketPriceContextType {
  livePrices: Record<string, LivePriceInfo>;
  prices: Record<string, LivePriceInfo>;
  getPrice: (symbol: string) => number;
  getMarkPrice: (symbol: string) => number;
  getChange24h: (symbol: string) => number;
  status15m: any;
  monitoring15m: any;
  status4h: any;
  monitoring4h: any;
  fundingRates: any[];
  lastAlert: StreamAlertEvent | null;
  isConnected: boolean;
  triggerCycleScan15m: () => Promise<any>;
  triggerCycleScan4h: () => Promise<any>;
  triggerVolumeSpikeScan4h: () => Promise<any>;
  refresh15mManual: () => Promise<any>;
  refresh4hManual: () => Promise<any>;
  refreshVolumeSpikeManual: () => Promise<any>;
}

const MarketPriceContext = createContext<MarketPriceContextType | null>(null);

export const MarketPriceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [livePrices, setLivePrices] = useState<Record<string, LivePriceInfo>>({});
  const [status15m, setStatus15m] = useState<any>(null);
  const [status4h, setStatus4h] = useState<any>(null);
  const [fundingRates, setFundingRates] = useState<any[]>([]);
  const [lastAlert, setLastAlert] = useState<StreamAlertEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const livePricesRef = useRef<Record<string, LivePriceInfo>>({});
  useEffect(() => {
    livePricesRef.current = livePrices;
  }, [livePrices]);

  // Connect to SSE stream
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isMounted = true;

    const connect = () => {
      try {
        eventSource = new EventSource('/api/stream/events');

        eventSource.onopen = () => {
          if (isMounted) setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const parsed = JSON.parse(event.data);
            if (!parsed || !parsed.type) return;

            switch (parsed.type) {
              case 'INITIAL_STATE':
                if (parsed.data) {
                  if (parsed.data.livePrices) {
                    setLivePrices(parsed.data.livePrices);
                  }
                  if (parsed.data.status15m) {
                    setStatus15m(parsed.data.status15m);
                  }
                  if (parsed.data.status4h) {
                    setStatus4h(parsed.data.status4h);
                  }
                  if (parsed.data.fundingRates) {
                    setFundingRates(parsed.data.fundingRates);
                  }
                }
                break;

              case 'LIVE_PRICES':
                if (parsed.data) {
                  setLivePrices(prev => ({ ...prev, ...parsed.data }));
                }
                break;

              case '15M_STATUS':
                if (parsed.data) {
                  setStatus15m((prev: any) => ({ ...prev, ...parsed.data }));
                }
                break;

              case '4H_STATUS':
                if (parsed.data) {
                  setStatus4h((prev: any) => ({ ...prev, ...parsed.data }));
                }
                break;

              case 'FUNDING_RATES':
                if (parsed.data) {
                  setFundingRates(parsed.data);
                }
                break;

              case 'ALERT':
                if (parsed.data) {
                  setLastAlert({ ...parsed.data, timestamp: Date.now() });
                }
                break;

              default:
                break;
            }
          } catch (err) {
            // Ignore parse error
          }
        };

        eventSource.onerror = () => {
          if (isMounted) {
            setIsConnected(false);
            if (eventSource) {
              eventSource.close();
              eventSource = null;
            }
            // Auto reconnect after 2.5 seconds
            reconnectTimeout = setTimeout(connect, 2500);
          }
        };
      } catch (e) {
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 2500);
        }
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const getPrice = useCallback((symbol: string): number => {
    if (!symbol) return 0;
    const clean = symbol.trim().toUpperCase();
    const info = livePricesRef.current[clean];
    return info?.lastPrice || info?.markPrice || 0;
  }, []);

  const getMarkPrice = useCallback((symbol: string): number => {
    if (!symbol) return 0;
    const clean = symbol.trim().toUpperCase();
    const info = livePricesRef.current[clean];
    return info?.markPrice || info?.lastPrice || 0;
  }, []);

  const getChange24h = useCallback((symbol: string): number => {
    if (!symbol) return 0;
    const clean = symbol.trim().toUpperCase();
    const info = livePricesRef.current[clean];
    return info?.change24h || 0;
  }, []);

  const triggerCycleScan15m = useCallback(async () => {
    try {
      const res = await fetch('/api/monitoring/scan-phase1', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          setStatus15m((prev: any) => ({ ...prev, results: data.results, scanStats: data.scanStats }));
        }
        return data;
      }
    } catch (e) {
      console.error('Failed to trigger manual 15m scan:', e);
      throw e;
    }
    return null;
  }, []);

  const triggerCycleScan4h = useCallback(async () => {
    try {
      const res = await fetch('/api/monitoring-4h/scan-phase1', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          setStatus4h((prev: any) => ({ ...prev, results: data.results, scanStats: data.scanStats }));
        }
        return data;
      }
    } catch (e) {
      console.error('Failed to trigger manual 4h cycle scan:', e);
      throw e;
    }
    return null;
  }, []);

  const triggerVolumeSpikeScan4h = useCallback(async () => {
    try {
      const res = await fetch('/api/monitoring-4h/scan-volume-spike', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          setStatus4h((prev: any) => ({ ...prev, results: data.results }));
        }
        return data;
      }
    } catch (e) {
      console.error('Failed to trigger manual 1h volume spike scan:', e);
      throw e;
    }
    return null;
  }, []);

  return (
    <MarketPriceContext.Provider
      value={{
        livePrices,
        prices: livePrices,
        getPrice,
        getMarkPrice,
        getChange24h,
        status15m,
        monitoring15m: status15m,
        status4h,
        monitoring4h: status4h,
        fundingRates,
        lastAlert,
        isConnected,
        triggerCycleScan15m,
        triggerCycleScan4h,
        triggerVolumeSpikeScan4h,
        refresh15mManual: triggerCycleScan15m,
        refresh4hManual: triggerCycleScan4h,
        refreshVolumeSpikeManual: triggerVolumeSpikeScan4h,
      }}
    >
      {children}
    </MarketPriceContext.Provider>
  );
};

export const useMarketPrices = () => {
  const context = useContext(MarketPriceContext);
  if (!context) {
    throw new Error('useMarketPrices must be used within a MarketPriceProvider');
  }
  return context;
};
