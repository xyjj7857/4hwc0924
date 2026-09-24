import WebSocket from 'ws';
import CryptoJS from 'crypto-js';

export interface AccountCredentials {
  accountName: string;
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
}

interface StreamSession {
  accountName: string;
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  listenKey: string | null;
  ws: WebSocket | null;
  keepAliveTimer: NodeJS.Timeout | null;
  reconnectTimer: NodeJS.Timeout | null;
  heartbeatCheckTimer: NodeJS.Timeout | null;
  lastMessageTime: number;
  reconnectAttempts: number;
  isStopping: boolean;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';
}

type SSEClient = {
  id: string;
  accountName: string;
  res: any;
};

class UserDataStreamManager {
  private sessions = new Map<string, StreamSession>();
  private sseClients = new Map<string, SSEClient>();
  private pingInterval: NodeJS.Timeout | null = null;
  private credentialLookup: ((accountName: string) => AccountCredentials | null) | null = null;

  constructor() {
    // Keep SSE connections active through reverse proxies
    this.pingInterval = setInterval(() => {
      this.broadcastSseComment('keepalive');
    }, 15000);
  }

  public setCredentialLookup(lookup: (accountName: string) => AccountCredentials | null) {
    this.credentialLookup = lookup;
  }

  /**
   * Register a new Server-Sent Events client from the browser
   */
  public addSseClient(id: string, accountName: string, res: any) {
    this.sseClients.set(id, { id, accountName, res });

    // 注入 2KB 注释填充，击穿 Cloud Run / 反向代理的数据积压缓冲区，确保后续事件零延迟推向前端
    try {
      res.write(`: ${'0'.repeat(2048)}\n\n`);
      if (typeof res.flush === 'function') {
        res.flush();
      }
    } catch (e) {}

    const session = this.sessions.get(accountName);
    const currentStatus = (session && session.status === 'CONNECTED' && session.ws?.readyState === WebSocket.OPEN)
      ? 'CONNECTED'
      : (session ? session.status : 'DISCONNECTED');

    // Send immediate status
    this.sendToClient(res, {
      type: 'STREAM_STATUS',
      accountName,
      status: currentStatus,
      listenKey: session?.listenKey || null,
      timestamp: Date.now()
    });

    // If stream is not connected and credentials can be found, start it
    if (currentStatus !== 'CONNECTED' && this.credentialLookup) {
      const creds = this.credentialLookup(accountName);
      if (creds && creds.apiKey) {
        this.startStream(creds);
      }
    }
  }

  /**
   * Remove an SSE client on disconnect
   */
  public removeSseClient(id: string) {
    this.sseClients.delete(id);
  }

  /**
   * Start or restart user data stream for an account
   */
  public async startStream(creds: AccountCredentials): Promise<boolean> {
    const { accountName, apiKey, apiSecret } = creds;
    if (!accountName || !apiKey) return false;

    let baseUrl = creds.baseUrl || 'https://fapi.binance.com';
    if (baseUrl.includes('fapi-gcp.binance.com')) {
      baseUrl = baseUrl.replace('fapi-gcp.binance.com', 'fapi.binance.com');
    }

    // If an existing session is running for this account with the same apiKey, reuse or refresh
    let session = this.sessions.get(accountName);
    if (session) {
      if (session.apiKey === apiKey && session.status === 'CONNECTED' && session.ws?.readyState === WebSocket.OPEN) {
        return true;
      }
      // Stop old session cleanly
      this.stopStream(accountName, false);
    }

    session = {
      accountName,
      apiKey,
      apiSecret,
      baseUrl,
      listenKey: null,
      ws: null,
      keepAliveTimer: null,
      reconnectTimer: null,
      heartbeatCheckTimer: null,
      lastMessageTime: Date.now(),
      reconnectAttempts: 0,
      isStopping: false,
      status: 'CONNECTING'
    };

    this.sessions.set(accountName, session);
    this.broadcastStatus(accountName, 'CONNECTING');

    return this.initiateConnection(session);
  }

  /**
   * Fetch a fresh listenKey from Binance Futures REST API
   */
  private async getListenKey(session: StreamSession): Promise<string | null> {
    // 锁定币安全球主线集群申请 ListenKey
    const candidates = [
      'https://fapi.binance.com'
    ];

    for (const host of candidates) {
      try {
        const url = `${host}/fapi/v1/listenKey`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': session.apiKey
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (data && data.listenKey) {
            console.log(`[UserDataStream] Successfully acquired listenKey for [${session.accountName}] from ${host}`);
            return data.listenKey;
          }
        }
      } catch (err: any) {
        console.warn(`[UserDataStream] Failed to get listenKey from ${host}: ${err.message || err}`);
      }
    }
    return null;
  }

  /**
   * Keep-alive listenKey (PUT /fapi/v1/listenKey) every 30 minutes
   */
  private async keepAliveListenKey(session: StreamSession): Promise<boolean> {
    if (!session.listenKey || session.isStopping) return false;

    // 锁定全球主线集群续期 ListenKey
    const candidates = [
      'https://fapi.binance.com'
    ];

    for (const host of candidates) {
      try {
        const url = `${host}/fapi/v1/listenKey`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'X-MBX-APIKEY': session.apiKey
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(`[UserDataStream] Successfully refreshed listenKey for [${session.accountName}] via ${host}`);
          return true;
        }
      } catch (err: any) {
        console.warn(`[UserDataStream] Keep-alive failed via ${host}: ${err.message || err}`);
      }
    }
    return false;
  }

  /**
   * Close listenKey on Binance side when stopping stream
   */
  private async deleteListenKey(session: StreamSession): Promise<void> {
    if (!session.listenKey) return;
    const candidates = [
      'https://fapi.binance.com'
    ];
    for (const host of candidates) {
      try {
        const url = `${host}/fapi/v1/listenKey`;
        await fetch(url, {
          method: 'DELETE',
          headers: {
            'X-MBX-APIKEY': session.apiKey
          }
        });
        console.log(`[UserDataStream] Closed listenKey on Binance for [${session.accountName}] via ${host}`);
        break;
      } catch (e) {
        // Silent error on cleanup
      }
    }
  }

  /**
   * Connect to Binance Futures WebSocket
   */
  private async initiateConnection(session: StreamSession): Promise<boolean> {
    if (session.isStopping) return false;

    try {
      const listenKey = await this.getListenKey(session);
      if (!listenKey) {
        console.error(`[UserDataStream] Could not obtain listenKey for [${session.accountName}]. Scheduling retry...`);
        this.scheduleReconnect(session);
        return false;
      }

      session.listenKey = listenKey;
      // 官方标准最新私有流端点：wss://fstream.binance.com/private/ws/<listenKey>
      const wsUrl = `wss://fstream.binance.com/private/ws/${listenKey}`;
      console.log(`[UserDataStream] Connecting WebSocket for [${session.accountName}] -> ${wsUrl}`);

      const ws = new WebSocket(wsUrl);
      session.ws = ws;

      ws.on('open', () => {
        if (session.isStopping) {
          ws.close();
          return;
        }
        console.log(`[UserDataStream] WebSocket connection OPEN for [${session.accountName}]`);
        session.status = 'CONNECTED';
        session.reconnectAttempts = 0;
        session.lastMessageTime = Date.now();
        this.broadcastStatus(session.accountName, 'CONNECTED', listenKey);

        // Schedule 30-minute Keep-Alive
        if (session.keepAliveTimer) clearInterval(session.keepAliveTimer);
        session.keepAliveTimer = setInterval(async () => {
          const ok = await this.keepAliveListenKey(session);
          if (!ok) {
            console.warn(`[UserDataStream] Keep-alive ping failed for [${session.accountName}]. Reconnecting stream...`);
            this.reconnect(session);
          }
        }, 30 * 60 * 1000); // every 30 mins

        // 15-second Active WebSocket Health Check (Zombie Socket Killer)
        if (session.heartbeatCheckTimer) clearInterval(session.heartbeatCheckTimer);
        let isAwaitingPong = false;
        session.heartbeatCheckTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.ping();
            } catch (err) {
              console.warn(`[UserDataStream] Ping send failed for [${session.accountName}]. Terminating zombie socket...`);
              this.reconnect(session);
            }
          } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            this.reconnect(session);
          }
        }, 15000);
      });

      ws.on('message', (rawData: WebSocket.Data) => {
        session.lastMessageTime = Date.now();
        try {
          const messageStr = rawData.toString();
          const parsed = JSON.parse(messageStr);
          this.handleIncomingEvent(session, parsed);
        } catch (err) {
          console.error(`[UserDataStream] Error parsing WS message for [${session.accountName}]:`, err);
        }
      });

      ws.on('ping', () => {
        session.lastMessageTime = Date.now();
        try {
          ws.pong();
        } catch (e) {}
      });

      ws.on('pong', () => {
        session.lastMessageTime = Date.now();
      });

      ws.on('close', (code, reason) => {
        console.warn(`[UserDataStream] WS closed for [${session.accountName}]. Code: ${code}, Reason: ${reason.toString()}`);
        if (!session.isStopping) {
          this.scheduleReconnect(session);
        }
      });

      ws.on('error', (err) => {
        console.error(`[UserDataStream] WS error for [${session.accountName}]:`, err.message || err);
        if (!session.isStopping) {
          this.scheduleReconnect(session);
        }
      });

      return true;
    } catch (error: any) {
      console.error(`[UserDataStream] Exception during initiateConnection for [${session.accountName}]:`, error);
      this.scheduleReconnect(session);
      return false;
    }
  }

  /**
   * Handle incoming Binance WebSocket events and broadcast to front-end SSE clients
   */
  private handleIncomingEvent(session: StreamSession, event: any) {
    if (!event) return;
    const realData = event.data || event;
    const eventType = realData.e || event.e;

    // If listenKey expired on Binance server, reconnect with a fresh key immediately
    if (eventType === 'listenKeyExpired') {
      console.warn(`[UserDataStream] Received listenKeyExpired event for [${session.accountName}]. Re-establishing session...`);
      this.reconnect(session);
      return;
    }

    if (eventType === 'ACCOUNT_UPDATE') {
      // Event containing balance and position deltas
      this.broadcastToAccount(session.accountName, {
        type: 'ACCOUNT_UPDATE',
        accountName: session.accountName,
        eventTime: realData.E || event.E,
        transactionTime: realData.T || event.T,
        data: realData.a || realData.A || event.a
      });
    } else if (eventType === 'ORDER_TRADE_UPDATE') {
      // Event containing order execution and status updates
      this.broadcastToAccount(session.accountName, {
        type: 'ORDER_TRADE_UPDATE',
        accountName: session.accountName,
        eventTime: realData.E || event.E,
        transactionTime: realData.T || event.T,
        order: realData.o || event.o
      });
    } else if (eventType === 'MARGIN_CALL') {
      this.broadcastToAccount(session.accountName, {
        type: 'MARGIN_CALL',
        accountName: session.accountName,
        eventTime: realData.E || event.E,
        data: realData
      });
    } else if (eventType === 'ACCOUNT_CONFIG_UPDATE') {
      this.broadcastToAccount(session.accountName, {
        type: 'ACCOUNT_CONFIG_UPDATE',
        accountName: session.accountName,
        eventTime: realData.E || event.E,
        data: realData.ac || event.ac
      });
    }
  }

  /**
   * Schedule exponential backoff reconnect
   */
  private scheduleReconnect(session: StreamSession) {
    if (session.isStopping || session.reconnectTimer) return;

    session.status = 'RECONNECTING';
    this.broadcastStatus(session.accountName, 'RECONNECTING');

    this.cleanupSocket(session);

    session.reconnectAttempts += 1;
    const baseDelay = Math.min(1000 * Math.pow(1.5, session.reconnectAttempts), 15000);
    const jitter = Math.random() * 1000;
    const delay = Math.round(baseDelay + jitter);

    console.log(`[UserDataStream] Scheduling reconnect #${session.reconnectAttempts} for [${session.accountName}] in ${delay}ms...`);

    session.reconnectTimer = setTimeout(async () => {
      session.reconnectTimer = null;
      if (!session.isStopping) {
        await this.initiateConnection(session);
      }
    }, delay);
  }

  private reconnect(session: StreamSession) {
    if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
    this.scheduleReconnect(session);
  }

  private cleanupSocket(session: StreamSession) {
    if (session.keepAliveTimer) {
      clearInterval(session.keepAliveTimer);
      session.keepAliveTimer = null;
    }
    if (session.heartbeatCheckTimer) {
      clearInterval(session.heartbeatCheckTimer);
      session.heartbeatCheckTimer = null;
    }
    if (session.ws) {
      try {
        session.ws.removeAllListeners();
        if (session.ws.readyState === WebSocket.OPEN || session.ws.readyState === WebSocket.CONNECTING) {
          session.ws.terminate();
        }
      } catch (e) {}
      session.ws = null;
    }
  }

  /**
   * Stop stream for an account
   */
  public async stopStream(accountName: string, deleteKeyOnBinance = true) {
    const session = this.sessions.get(accountName);
    if (!session) return;

    session.isStopping = true;
    session.status = 'DISCONNECTED';

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }

    this.cleanupSocket(session);

    if (deleteKeyOnBinance) {
      await this.deleteListenKey(session);
    }

    this.sessions.delete(accountName);
    this.broadcastStatus(accountName, 'DISCONNECTED');
    console.log(`[UserDataStream] Stream stopped and cleared for [${accountName}]`);
  }

  /**
   * Broadcast status to all SSE subscribers of an account
   */
  private broadcastStatus(accountName: string, status: string, listenKey?: string | null) {
    this.broadcastToAccount(accountName, {
      type: 'STREAM_STATUS',
      accountName,
      status,
      listenKey: listenKey || null,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast structured payload to SSE clients of a given account
   */
  public broadcastToAccount(accountName: string, payload: any) {
    const dataStr = `data: ${JSON.stringify(payload)}\n\n`;
    for (const [_, client] of this.sseClients) {
      if (client.accountName === accountName || client.accountName === 'ALL' || !client.accountName) {
        try {
          client.res.write(dataStr, () => {
            if (typeof client.res.flush === 'function') {
              client.res.flush();
            }
          });
        } catch (err) {
          // Socket might have closed
        }
      }
    }
  }

  private broadcastSseComment(comment: string) {
    const commentStr = `: ${comment}\n\n`;
    for (const [id, client] of this.sseClients) {
      try {
        client.res.write(commentStr);
        if (typeof client.res.flush === 'function') {
          client.res.flush();
        }
      } catch (err) {
        this.sseClients.delete(id);
      }
    }
  }

  private sendToClient(res: any, payload: any) {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (typeof res.flush === 'function') {
        res.flush();
      }
    } catch (e) {}
  }

  public getStatus() {
    const list: any[] = [];
    for (const [acc, s] of this.sessions) {
      list.push({
        accountName: acc,
        status: s.status,
        listenKey: s.listenKey ? `${s.listenKey.substring(0, 8)}...` : null,
        reconnectAttempts: s.reconnectAttempts,
        lastMessageTime: s.lastMessageTime
      });
    }
    return {
      activeSessions: list,
      connectedSseClients: this.sseClients.size
    };
  }
}

export const userDataStreamManager = new UserDataStreamManager();
