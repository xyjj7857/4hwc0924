import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ShieldAlert, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  RefreshCw, 
  Send, 
  Percent, 
  DollarSign, 
  Timer, 
  Sliders, 
  AlertTriangle,
  Info,
  Swords,
  Flame
} from 'lucide-react';
import { Position, ApiConfig } from '../types';
import { PositionRiskConfig, getDefaultPositionRiskConfig, getRiskButtonDisplay } from '../types/positionRisk';

interface PositionRiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: Position | null;
  config: PositionRiskConfig | undefined;
  onSaveConfig: (updated: PositionRiskConfig) => void;
  apiConfig: ApiConfig;
  isConnected: boolean;
  addLog: (msg: string, type?: 'INFO' | 'TRADE' | 'ERROR' | 'SUCCESS' | 'WARN') => void;
  formatPrice: (symbol: string, price: number) => string;
  formatQty: (symbol: string, qty: number) => string;
}

export const PositionRiskModal: React.FC<PositionRiskModalProps> = ({
  isOpen,
  onClose,
  position,
  config,
  onSaveConfig,
  apiConfig,
  isConnected,
  addLog,
  formatPrice,
  formatQty
}) => {
  const isLong = position ? position.side === 'BUY' : true;
  const entryPrice = position?.entryPrice || 0;

  // 内部表单临时状态，关闭或保存时生效
  const [currentConfig, setCurrentConfig] = useState<PositionRiskConfig>(() => {
    if (config) return JSON.parse(JSON.stringify(config));
    if (position) return getDefaultPositionRiskConfig(position.id, position.symbol, position.side, entryPrice);
    return getDefaultPositionRiskConfig('default', '', 'BUY', 0);
  });

  // 当外部传入新的 config 或 position 切换时重置表单
  useEffect(() => {
    if (config) {
      setCurrentConfig(JSON.parse(JSON.stringify(config)));
    } else if (position) {
      setCurrentConfig(getDefaultPositionRiskConfig(position.id, position.symbol, position.side, entryPrice));
    }
  }, [config, position?.id, position?.symbol, position?.side, entryPrice]);

  // 提交止盈止损时的加载状态与结果
  const [isSubmittingTpSl, setIsSubmittingTpSl] = useState(false);
  const [tpSlSubmitStatus, setTpSlSubmitStatus] = useState<string | null>(null);

  // 弹窗内实时时间风控倒计时展示
  const [remainingCountdown, setRemainingCountdown] = useState<string>('');

  useEffect(() => {
    if (!currentConfig.timeControl.enabled || !currentConfig.timeControl.activatedAt) {
      setRemainingCountdown('');
      return;
    }
    const update = () => {
      const activatedAt = currentConfig.timeControl.activatedAt!;
      const totalMs = (Number(currentConfig.timeControl.maxHoldMinutes) || 240) * 60 * 1000;
      const elapsedMs = Date.now() - activatedAt;
      const leftMs = Math.max(0, totalMs - elapsedMs);
      if (leftMs <= 0) {
        setRemainingCountdown('已超出设定最大持仓时间，即将触发市价全流程平仓出场！');
        return;
      }
      const totalSec = Math.floor(leftMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      setRemainingCountdown(`剩余 ${m} 分 ${s < 10 ? '0' : ''}${s} 秒 (已计入持仓 ${(elapsedMs / 60000).toFixed(1)} 分钟)`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [currentConfig.timeControl.enabled, currentConfig.timeControl.activatedAt, currentConfig.timeControl.maxHoldMinutes]);

  // 快捷动态联动计算：止盈
  const calculatedTpPrice = useMemo(() => {
    if (currentConfig.tpSlControl.tpMode === 'PRICE') {
      return currentConfig.tpSlControl.tpPrice;
    }
    const ratio = currentConfig.tpSlControl.tpPercent / 100;
    return isLong ? entryPrice * (1 + ratio) : entryPrice * (1 - ratio);
  }, [currentConfig.tpSlControl.tpMode, currentConfig.tpSlControl.tpPercent, currentConfig.tpSlControl.tpPrice, isLong, entryPrice]);

  const calculatedTpPercent = useMemo(() => {
    if (currentConfig.tpSlControl.tpMode === 'PERCENT') {
      return currentConfig.tpSlControl.tpPercent;
    }
    if (entryPrice <= 0) return 0;
    const diff = isLong 
      ? (currentConfig.tpSlControl.tpPrice - entryPrice) / entryPrice 
      : (entryPrice - currentConfig.tpSlControl.tpPrice) / entryPrice;
    return diff * 100;
  }, [currentConfig.tpSlControl.tpMode, currentConfig.tpSlControl.tpPrice, currentConfig.tpSlControl.tpPercent, isLong, entryPrice]);

  // 快捷动态联动计算：止损
  const calculatedSlPrice = useMemo(() => {
    if (currentConfig.tpSlControl.slMode === 'PRICE') {
      return currentConfig.tpSlControl.slPrice;
    }
    const ratio = currentConfig.tpSlControl.slPercent / 100;
    return isLong ? entryPrice * (1 - ratio) : entryPrice * (1 + ratio);
  }, [currentConfig.tpSlControl.slMode, currentConfig.tpSlControl.slPercent, currentConfig.tpSlControl.slPrice, isLong, entryPrice]);

  const calculatedSlPercent = useMemo(() => {
    if (currentConfig.tpSlControl.slMode === 'PERCENT') {
      return currentConfig.tpSlControl.slPercent;
    }
    if (entryPrice <= 0) return 0;
    const diff = isLong 
      ? (entryPrice - currentConfig.tpSlControl.slPrice) / entryPrice 
      : (currentConfig.tpSlControl.slPrice - entryPrice) / entryPrice;
    return diff * 100;
  }, [currentConfig.tpSlControl.slMode, currentConfig.tpSlControl.slPrice, currentConfig.tpSlControl.slPercent, isLong, entryPrice]);

  // 预计盈亏预估 (USDT)
  const estTpPnl = useMemo(() => {
    if (!position) return 0;
    const qty = Math.abs(position.amount || 0);
    const pDiff = isLong ? calculatedTpPrice - entryPrice : entryPrice - calculatedTpPrice;
    return pDiff * qty;
  }, [calculatedTpPrice, entryPrice, isLong, position?.amount]);

  const estSlPnl = useMemo(() => {
    if (!position) return 0;
    const qty = Math.abs(position.amount || 0);
    const pDiff = isLong ? calculatedSlPrice - entryPrice : entryPrice - calculatedSlPrice;
    return pDiff * qty;
  }, [calculatedSlPrice, entryPrice, isLong, position?.amount]);

  // 提交并向币安提交止盈委托单或算法止损单（支持自动撤旧换新）
  const handleSubmitTpSlToBinance = async () => {
    if (!position) return;
    if (!isConnected) {
      addLog(`[专属风控] 提交失败: API 未连接`, 'ERROR');
      setTpSlSubmitStatus('API 未连接，请先配置或检查 API 状态');
      return;
    }

    if (!currentConfig.tpSlControl.tpEnabled && !currentConfig.tpSlControl.slEnabled) {
      addLog(`[专属风控] 提示: 止盈与止损均未勾选，请至少勾选一项后再提交`, 'WARN');
      setTpSlSubmitStatus('请至少勾选“开启止盈”或“开启止损”');
      return;
    }

    setIsSubmittingTpSl(true);
    setTpSlSubmitStatus('正在撤销原有的止盈/止损挂单并替换新委托...');
    addLog(`[专属风控] 开始为 ${position.symbol} (${isLong ? '多单' : '空单'}) 提交专属止盈止损设置...`, 'INFO');

    const closingSide = isLong ? 'SELL' : 'BUY';
    const closingQty = formatQty(position.symbol, Math.abs(position.amount));

    try {
      // 步骤 1: 撤销该币对属于当前平仓方向的原有普通挂单（自动撤销原来的普通止盈单）
      addLog(`[专属风控] 正在检查并撤销 ${position.symbol} 的历史旧普通挂单...`, 'INFO');
      try {
        const openOrdersRes = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v1/openOrders',
            params: { symbol: position.symbol },
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        if (openOrdersRes.ok) {
          const openOrders = await openOrdersRes.json();
          if (Array.isArray(openOrders)) {
            for (const order of openOrders) {
              // 匹配同向平仓单（例如多单平仓为 SELL）
              if (order.side === closingSide) {
                await fetch('/api/binance-proxy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    method: 'DELETE',
                    endpoint: '/fapi/v1/order',
                    params: { symbol: position.symbol, orderId: order.orderId },
                    apiKey: apiConfig.apiKey,
                    apiSecret: apiConfig.apiSecret
                  })
                });
              }
            }
          }
        }
      } catch (cancelErr) {
        console.warn('Cancel old orders error:', cancelErr);
      }

      // 步骤 1.2: 撤销该币对属于当前平仓方向的原有算法止损单（重点修复：杜绝重复挂单产生多个算法止损单）
      addLog(`[专属风控] 正在查询并撤销 ${position.symbol} 的旧算法止损单...`, 'INFO');
      try {
        const openAlgoRes = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'GET',
            endpoint: '/fapi/v1/openAlgoOrders',
            params: { symbol: position.symbol },
            baseUrl: apiConfig.baseUrl || "https://fapi.binance.com",
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        if (openAlgoRes.ok) {
          const algoData = await openAlgoRes.json();
          const allAlgoOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
          const targetAlgoOrders = allAlgoOrders.filter((o: any) => 
            (!o.symbol || o.symbol === position.symbol) &&
            (!o.side || o.side === closingSide)
          );

          if (targetAlgoOrders.length > 0) {
            addLog(`[专属风控] 发现 ${position.symbol} 存在 ${targetAlgoOrders.length} 个历史算法止损单，正在逐一撤单清理...`, 'INFO');
            for (const algoOrder of targetAlgoOrders) {
              const delAlgoRes = await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: 'DELETE',
                  endpoint: '/fapi/v1/algoOrder',
                  params: { algoId: algoOrder.algoId, symbol: position.symbol },
                  baseUrl: apiConfig.baseUrl || "https://fapi.binance.com",
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
              if (delAlgoRes.ok) {
                addLog(`[专属风控] 旧算法单 ${algoOrder.algoId} 已成功撤单`, 'SUCCESS');
              }
            }
          }
        }
      } catch (algoCancelErr) {
        console.warn('Cancel old algo orders error:', algoCancelErr);
      }

      let tpSuccess = false;
      let slSuccess = false;
      let lastTpId = '';
      let lastSlId = '';

      // 步骤 2: 若勾选了止盈，提交止盈委托（LIMIT Maker 委托）
      if (currentConfig.tpSlControl.tpEnabled) {
        const finalTpPrice = formatPrice(position.symbol, calculatedTpPrice);
        const orderParams: any = {
          symbol: position.symbol,
          side: closingSide,
          positionSide: position.positionSide,
          type: 'LIMIT',
          price: finalTpPrice,
          quantity: closingQty,
          timeInForce: 'GTC',
        };
        if (position.positionSide === 'BOTH') orderParams.reduceOnly = 'true';

        addLog(`[专属风控] 正在提交 ${position.symbol} 止盈单 (价格: ${finalTpPrice}, 数量: ${closingQty})...`, 'TRADE');
        const tpRes = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'POST',
            endpoint: '/fapi/v1/order',
            params: orderParams,
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        const tpData = await tpRes.json();
        if (tpRes.ok && tpData.orderId) {
          tpSuccess = true;
          lastTpId = String(tpData.orderId);
          addLog(`[专属风控] ${position.symbol} 止盈委托挂单成功！订单ID: ${tpData.orderId} (止盈价: ${finalTpPrice})`, 'SUCCESS');
        } else {
          addLog(`[专属风控] ${position.symbol} 止盈挂单失败: ${tpData.msg || '未知异常'}`, 'ERROR');
        }
      }

      // 步骤 3: 若勾选了止损，提交算法止损单（CONDITIONAL / STOP_MARKET）
      if (currentConfig.tpSlControl.slEnabled) {
        const finalSlPrice = formatPrice(position.symbol, calculatedSlPrice);
        const algoParams: any = {
          symbol: position.symbol,
          side: closingSide,
          positionSide: position.positionSide,
          quantity: closingQty,
          workingType: 'MARK_PRICE',
          stopPrice: finalSlPrice,
          triggerPrice: finalSlPrice,
          algoType: 'CONDITIONAL',
          type: 'STOP_MARKET'
        };

        addLog(`[专属风控] 正在提交 ${position.symbol} 算法止损单 (触发价: ${finalSlPrice})...`, 'TRADE');
        const slRes = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'POST',
            endpoint: '/fapi/v1/algoOrder',
            baseUrl: apiConfig.baseUrl || "https://fapi.binance.com",
            params: algoParams,
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        const slData = await slRes.json();
        if (slRes.ok && (slData.algoId || slData.orderId || slData.clientAlgoId)) {
          slSuccess = true;
          lastSlId = String(slData.algoId || slData.orderId);
          addLog(`[专属风控] ${position.symbol} 算法止损委托挂单成功！触发价: ${finalSlPrice}`, 'SUCCESS');
        } else {
          // 兜底降级为普通 STOP_MARKET 或 STOP 委托
          addLog(`[专属风控] 算法止损提交遇到提示: ${slData.msg || '切换为标准止损单'}，正在使用标准止损挂单...`, 'INFO');
          const fallbackParams: any = {
            symbol: position.symbol,
            side: closingSide,
            positionSide: position.positionSide,
            type: 'STOP_MARKET',
            stopPrice: finalSlPrice,
            quantity: closingQty,
            workingType: 'MARK_PRICE',
          };
          if (position.positionSide === 'BOTH') fallbackParams.reduceOnly = 'true';

          const fallbackRes = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'POST',
              endpoint: '/fapi/v1/order',
              params: fallbackParams,
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          const fbData = await fallbackRes.json();
          if (fallbackRes.ok && fbData.orderId) {
            slSuccess = true;
            lastSlId = String(fbData.orderId);
            addLog(`[专属风控] ${position.symbol} 标准止损单挂单成功！订单ID: ${fbData.orderId}`, 'SUCCESS');
          } else {
            addLog(`[专属风控] ${position.symbol} 止损挂单最终失败: ${fbData.msg || '未知错误'}`, 'ERROR');
          }
        }
      }

      // 更新已提交状态（并同步激活/保持时间风控状态）
      const isTimeControlActive = currentConfig.timeControl.enabled;
      const updatedConfig: PositionRiskConfig = {
        ...currentConfig,
        timeControl: {
          ...currentConfig.timeControl,
          activatedAt: isTimeControlActive ? (currentConfig.timeControl.activatedAt || Date.now()) : undefined
        },
        tpSlControl: {
          ...currentConfig.tpSlControl,
          lastSubmittedTime: Date.now(),
          submittedOrders: {
            tpOrderId: lastTpId || undefined,
            slOrderId: lastSlId || undefined
          }
        }
      };

      setCurrentConfig(updatedConfig);
      onSaveConfig(updatedConfig);

      const statusSummary = [];
      if (currentConfig.tpSlControl.tpEnabled) statusSummary.push(tpSuccess ? '止盈挂单成功' : '止盈挂单失败');
      if (currentConfig.tpSlControl.slEnabled) statusSummary.push(slSuccess ? '止损挂单成功' : '止损挂单失败');
      setTpSlSubmitStatus(`✅ 委托更新完成: ${statusSummary.join('，')}（已自动替换旧单）`);

    } catch (err: any) {
      addLog(`[专属风控] 委托提交发生网络异常: ${err?.message || err}`, 'ERROR');
      setTpSlSubmitStatus(`❌ 提交失败: ${err?.message || '网络连接异常'}`);
    } finally {
      setIsSubmittingTpSl(false);
    }
  };

  // 用户点击“保存并生效”或关闭
  const handleSaveAndClose = () => {
    if (!position) {
      onClose();
      return;
    }

    // 规则 4.a: 这一条件在用户设置完成、关闭子界面的时刻开始生效
    const isTimeControlActive = currentConfig.timeControl.enabled;
    const finalConfig: PositionRiskConfig = {
      ...currentConfig,
      positionId: position.id,
      symbol: position.symbol,
      side: position.side,
      timeControl: {
        ...currentConfig.timeControl,
        activatedAt: isTimeControlActive ? (currentConfig.timeControl.activatedAt || Date.now()) : undefined
      }
    };

    onSaveConfig(finalConfig);

    if (isTimeControlActive) {
      addLog(`[时间风控] 已为持仓 ${position.symbol} 激活最大持仓时间风控 (${currentConfig.timeControl.maxHoldMinutes} 分钟)，倒计时现已启动`, 'SUCCESS');
    }
    if (finalConfig.conditionControl.enabled) {
      addLog(`[条件风控] 已勾选 ${position.symbol} 的条件风控框架`, 'INFO');
    }

    onClose();
  };

  // 当前风控优先级展示预览
  const previewDisplay = getRiskButtonDisplay(currentConfig);

  if (!isOpen || !position) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-[#121214] border border-[#27272A] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-[#232326] flex items-center justify-between bg-gradient-to-r from-[#18181B] to-[#121214]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">专属持仓风控管理</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                  {position.symbol}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  isLong ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}>
                  {isLong ? '做多 (LONG)' : '做空 (SHORT)'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                此持仓独立专属配置，各项风控条件互不干涉
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={handleSaveAndClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
            title="关闭并生效风控配置"
          >
            <X size={18} />
          </button>
        </div>

        {/* 持仓基本指标快照 */}
        <div className="px-6 py-3 bg-[#17171A] border-b border-[#232326] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-zinc-500 block text-[10px]">开仓均价</span>
            <span className="font-semibold text-white">{formatPrice(position.symbol, entryPrice)}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">当前标记价</span>
            <span className="font-semibold text-zinc-200">{formatPrice(position.symbol, position.markPrice)}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">持仓数量</span>
            <span className="font-semibold text-zinc-200">{position.amount}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">未实现盈亏 (ROE)</span>
            <span className={`font-bold ${position.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(2)} USDT ({position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* 主体风控配置表单（可滚动） */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">

          {/* 条件 A: 时间风控 */}
          <div className={`p-4 rounded-xl border transition-all ${
            currentConfig.timeControl.enabled 
              ? 'bg-amber-950/20 border-amber-500/40 shadow-sm shadow-amber-500/10' 
              : 'bg-[#18181A] border-[#27272A]'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={currentConfig.timeControl.enabled}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setCurrentConfig(prev => ({
                      ...prev,
                      timeControl: {
                        ...prev.timeControl,
                        enabled: isChecked,
                        activatedAt: isChecked ? (prev.timeControl.activatedAt || Date.now()) : undefined
                      }
                    }));
                  }}
                  className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500 focus:ring-offset-zinc-900"
                />
                <div className="flex items-center gap-1.5">
                  <Clock size={16} className={currentConfig.timeControl.enabled ? 'text-amber-400' : 'text-zinc-400'} />
                  <span className="text-sm font-bold text-white">条件 A：时间风控 (最大持仓时间)</span>
                </div>
              </label>

              <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                currentConfig.timeControl.enabled ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {currentConfig.timeControl.enabled ? '已勾选生效' : '未勾选'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">
                  最大持仓时间 (分钟，支持小数)
                </label>
                <div className="relative">
                  <input 
                    type="number"
                    step="0.5"
                    min="0.1"
                    disabled={!currentConfig.timeControl.enabled}
                    value={currentConfig.timeControl.maxHoldMinutes}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setCurrentConfig(prev => ({
                        ...prev,
                        timeControl: {
                          ...prev.timeControl,
                          maxHoldMinutes: val,
                          activatedAt: prev.timeControl.enabled ? Date.now() : undefined
                        }
                      }));
                    }}
                    className="w-full bg-[#121214] border border-[#333336] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="240"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-mono">
                    MIN
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-zinc-400 space-y-1.5 border-l border-[#27272A] pl-3">
                <div className="flex items-center gap-1 text-amber-300 font-medium">
                  <Timer size={13} />
                  <span>生效时机说明：</span>
                </div>
                <p>
                  默认初始值 240 分钟。这一条件在用户设置完成并<span className="text-white font-semibold">关闭子界面的时刻</span>开始生效倒计时。
                </p>
                {currentConfig.timeControl.enabled && currentConfig.timeControl.activatedAt && (
                  <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px] bg-emerald-950/40 border border-emerald-500/40 px-2.5 py-1.5 rounded-lg mt-1">
                    <Clock size={13} className="animate-pulse text-emerald-400 flex-shrink-0" />
                    <span className="leading-tight">{remainingCountdown || '倒计时已启动，正在运行中...'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 条件 B: 止盈 / 止损 */}
          <div className="p-4 rounded-xl bg-[#18181A] border border-[#27272A] space-y-4">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-2.5">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-blue-400" />
                <span className="text-sm font-bold text-white">条件 B：止盈 / 止损 (独立勾选)</span>
              </div>
              <span className="text-[11px] text-zinc-400">
                支持按具体价格或开仓价比例配置
              </span>
            </div>

            {/* 止盈设置卡片 */}
            <div className={`p-3.5 rounded-lg border transition-all ${
              currentConfig.tpSlControl.tpEnabled 
                ? 'bg-emerald-950/20 border-emerald-500/40' 
                : 'bg-[#141416] border-[#222225]'
            }`}>
              <div className="flex items-center justify-between mb-2.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={currentConfig.tpSlControl.tpEnabled}
                    onChange={(e) => {
                      setCurrentConfig(prev => ({
                        ...prev,
                        tpSlControl: {
                          ...prev.tpSlControl,
                          tpEnabled: e.target.checked
                        }
                      }));
                    }}
                    className="w-4 h-4 rounded text-emerald-500 bg-zinc-900 border-zinc-700 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-white flex items-center gap-1">
                    <TrendingUp size={14} className="text-emerald-400" />
                    开启止盈委托 (Take Profit)
                  </span>
                </label>

                {/* 模式切换 */}
                <div className="flex rounded-md bg-zinc-900 p-0.5 border border-zinc-800 text-[10px]">
                  <button
                    type="button"
                    disabled={!currentConfig.tpSlControl.tpEnabled}
                    onClick={() => {
                      setCurrentConfig(prev => ({
                        ...prev,
                        tpSlControl: {
                          ...prev.tpSlControl,
                          tpMode: 'PERCENT'
                        }
                      }));
                    }}
                    className={`px-2 py-0.5 rounded font-medium transition-all ${
                      currentConfig.tpSlControl.tpMode === 'PERCENT'
                        ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    按比例 (%)
                  </button>
                  <button
                    type="button"
                    disabled={!currentConfig.tpSlControl.tpEnabled}
                    onClick={() => {
                      setCurrentConfig(prev => ({
                        ...prev,
                        tpSlControl: {
                          ...prev.tpSlControl,
                          tpMode: 'PRICE',
                          tpPrice: calculatedTpPrice
                        }
                      }));
                    }}
                    className={`px-2 py-0.5 rounded font-medium transition-all ${
                      currentConfig.tpSlControl.tpMode === 'PRICE'
                        ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    按具体价格
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                {currentConfig.tpSlControl.tpMode === 'PERCENT' ? (
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">止盈涨幅比例 (%)</label>
                    <div className="relative">
                      <input 
                        type="number"
                        step="0.1"
                        min="0.01"
                        disabled={!currentConfig.tpSlControl.tpEnabled}
                        value={currentConfig.tpSlControl.tpPercent}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value) || 0;
                          setCurrentConfig(prev => ({
                            ...prev,
                            tpSlControl: {
                              ...prev.tpSlControl,
                              tpPercent: p
                            }
                          }));
                        }}
                        className="w-full bg-[#0D0D0E] border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                        placeholder="5.0"
                      />
                      <Percent size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">止盈目标价格 (USDT)</label>
                    <div className="relative">
                      <input 
                        type="number"
                        step="any"
                        disabled={!currentConfig.tpSlControl.tpEnabled}
                        value={currentConfig.tpSlControl.tpPrice}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value) || 0;
                          setCurrentConfig(prev => ({
                            ...prev,
                            tpSlControl: {
                              ...prev.tpSlControl,
                              tpPrice: p
                            }
                          }));
                        }}
                        className="w-full bg-[#0D0D0E] border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                        placeholder={formatPrice(position.symbol, entryPrice * 1.05)}
                      />
                      <DollarSign size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    </div>
                  </div>
                )}

                <div className="text-[11px] font-mono text-zinc-300 bg-[#0D0D0E] p-2 rounded border border-zinc-800">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">折算触发价:</span>
                    <span className="text-white font-bold">{formatPrice(position.symbol, calculatedTpPrice)}</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-zinc-500">折算比例:</span>
                    <span className="text-emerald-400">+{calculatedTpPercent.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-zinc-500">预估盈亏:</span>
                    <span className="text-emerald-400">+{estTpPnl.toFixed(2)} USDT</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 止损设置卡片 */}
            <div className={`p-3.5 rounded-lg border transition-all ${
              currentConfig.tpSlControl.slEnabled 
                ? 'bg-rose-950/20 border-rose-500/40' 
                : 'bg-[#141416] border-[#222225]'
            }`}>
              <div className="flex items-center justify-between mb-2.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={currentConfig.tpSlControl.slEnabled}
                    onChange={(e) => {
                      setCurrentConfig(prev => ({
                        ...prev,
                        tpSlControl: {
                          ...prev.tpSlControl,
                          slEnabled: e.target.checked
                        }
                      }));
                    }}
                    className="w-4 h-4 rounded text-rose-500 bg-zinc-900 border-zinc-700 focus:ring-rose-500"
                  />
                  <span className="text-xs font-bold text-white flex items-center gap-1">
                    <TrendingDown size={14} className="text-rose-400" />
                    开启止损委托 (Stop Loss)
                  </span>
                </label>

                {/* 模式切换 */}
                <div className="flex rounded-md bg-zinc-900 p-0.5 border border-zinc-800 text-[10px]">
                  <button
                    type="button"
                    disabled={!currentConfig.tpSlControl.slEnabled}
                    onClick={() => {
                      setCurrentConfig(prev => ({
                        ...prev,
                        tpSlControl: {
                          ...prev.tpSlControl,
                          slMode: 'PERCENT'
                        }
                      }));
                    }}
                    className={`px-2 py-0.5 rounded font-medium transition-all ${
                      currentConfig.tpSlControl.slMode === 'PERCENT'
                        ? 'bg-rose-500/20 text-rose-300 font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    按比例 (%)
                  </button>
                  <button
                    type="button"
                    disabled={!currentConfig.tpSlControl.slEnabled}
                    onClick={() => {
                      setCurrentConfig(prev => ({
                        ...prev,
                        tpSlControl: {
                          ...prev.tpSlControl,
                          slMode: 'PRICE',
                          slPrice: calculatedSlPrice
                        }
                      }));
                    }}
                    className={`px-2 py-0.5 rounded font-medium transition-all ${
                      currentConfig.tpSlControl.slMode === 'PRICE'
                        ? 'bg-rose-500/20 text-rose-300 font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    按具体价格
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                {currentConfig.tpSlControl.slMode === 'PERCENT' ? (
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">止损跌幅比例 (%)</label>
                    <div className="relative">
                      <input 
                        type="number"
                        step="0.1"
                        min="0.01"
                        disabled={!currentConfig.tpSlControl.slEnabled}
                        value={currentConfig.tpSlControl.slPercent}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value) || 0;
                          setCurrentConfig(prev => ({
                            ...prev,
                            tpSlControl: {
                              ...prev.tpSlControl,
                              slPercent: p
                            }
                          }));
                        }}
                        className="w-full bg-[#0D0D0E] border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-rose-300 font-mono focus:outline-none focus:border-rose-500 disabled:opacity-50"
                        placeholder="3.0"
                      />
                      <Percent size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">止损目标价格 (USDT)</label>
                    <div className="relative">
                      <input 
                        type="number"
                        step="any"
                        disabled={!currentConfig.tpSlControl.slEnabled}
                        value={currentConfig.tpSlControl.slPrice}
                        onChange={(e) => {
                          const p = parseFloat(e.target.value) || 0;
                          setCurrentConfig(prev => ({
                            ...prev,
                            tpSlControl: {
                              ...prev.tpSlControl,
                              slPrice: p
                            }
                          }));
                        }}
                        className="w-full bg-[#0D0D0E] border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-rose-300 font-mono focus:outline-none focus:border-rose-500 disabled:opacity-50"
                        placeholder={formatPrice(position.symbol, entryPrice * 0.97)}
                      />
                      <DollarSign size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    </div>
                  </div>
                )}

                <div className="text-[11px] font-mono text-zinc-300 bg-[#0D0D0E] p-2 rounded border border-zinc-800">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">折算触发价:</span>
                    <span className="text-white font-bold">{formatPrice(position.symbol, calculatedSlPrice)}</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-zinc-500">折算比例:</span>
                    <span className="text-rose-400">-{calculatedSlPercent.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-zinc-500">预估盈亏:</span>
                    <span className="text-rose-400">{estSlPnl.toFixed(2)} USDT</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 提交至币安云端按钮 (支持自动撤销旧单并替换) */}
            <div className="pt-1">
              <button
                type="button"
                disabled={isSubmittingTpSl || (!currentConfig.tpSlControl.tpEnabled && !currentConfig.tpSlControl.slEnabled)}
                onClick={handleSubmitTpSlToBinance}
                className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${
                  isSubmittingTpSl
                    ? 'bg-blue-600/40 text-blue-300 cursor-not-allowed'
                    : (!currentConfig.tpSlControl.tpEnabled && !currentConfig.tpSlControl.slEnabled)
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                }`}
              >
                {isSubmittingTpSl ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>正在撤旧单并提交新止盈止损到币安...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>提交止盈/止损到币安（支持自动撤旧换新）</span>
                  </>
                )}
              </button>

              {tpSlSubmitStatus && (
                <p className="mt-2 text-center text-xs font-mono text-zinc-300 bg-zinc-900/80 py-1.5 px-3 rounded border border-zinc-800 animate-in fade-in">
                  {tpSlSubmitStatus}
                </p>
              )}
            </div>
          </div>

          {/* 条件 C: 条件风控 (框架预留) */}
          <div className={`p-4 rounded-xl border transition-all ${
            currentConfig.conditionControl.enabled 
              ? 'bg-purple-950/20 border-purple-500/40 shadow-sm shadow-purple-500/10' 
              : 'bg-[#18181A] border-[#27272A]'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={currentConfig.conditionControl.enabled}
                  onChange={(e) => {
                    setCurrentConfig(prev => ({
                      ...prev,
                      conditionControl: {
                        ...prev.conditionControl,
                        enabled: e.target.checked
                      }
                    }));
                  }}
                  className="w-4 h-4 rounded text-purple-500 bg-zinc-900 border-zinc-700 focus:ring-purple-500"
                />
                <div className="flex items-center gap-1.5">
                  <Flame size={16} className={currentConfig.conditionControl.enabled ? 'text-purple-400' : 'text-zinc-400'} />
                  <span className="text-sm font-bold text-white">条件 C：条件风控 (规则框架预留)</span>
                </div>
              </label>

              <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                currentConfig.conditionControl.enabled ? 'bg-purple-500/20 text-purple-300 font-semibold' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {currentConfig.conditionControl.enabled ? '已勾选启用' : '未勾选'}
              </span>
            </div>

            <div className="bg-[#121214] p-3 rounded-lg border border-dashed border-purple-500/30 text-xs text-zinc-400 space-y-2">
              <div className="flex items-center gap-1.5 text-purple-300 font-medium">
                <Info size={14} />
                <span>框架保留声明：</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                按照您的指令，此处完整保留了“条件风控”的数据结构、开关以及规则优先判定机制。待您想好具体策略（如：动态移动追踪止损、指标背离平仓、突发巨幅振幅平仓等）后，我们将随时为您接入具体执行规则！
              </p>
              <div className="flex items-center gap-2 text-[10px] text-purple-400/80 font-mono">
                <span className="px-1.5 py-0.5 bg-purple-500/10 rounded">规则类型: RESERVED_FRAMEWORK</span>
                <span className="px-1.5 py-0.5 bg-purple-500/10 rounded">权重优先级: 最高 (条件风控 ＞ 时间风控 ＞ 死斗)</span>
              </div>
            </div>
          </div>

          {/* 规则 5 动态优先级提示横幅 */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-zinc-900 to-[#18181A] border border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400">当前风控状态将展示为:</span>
              <div className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 ${
                previewDisplay === '条件风控'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                  : previewDisplay === '时间风控'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                  : 'bg-red-950/40 text-red-300 border border-red-600/50'
              }`}>
                {previewDisplay === '死斗' ? <Swords size={13} className="text-red-400" /> : <ShieldAlert size={13} />}
                <span>{previewDisplay}</span>
              </div>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              展示优先级: 条件风控 ＞ 时间风控 ＞ 死斗
            </span>
          </div>

        </div>

        {/* 底部确认与关闭操作栏 */}
        <div className="px-6 py-4 border-t border-[#232326] bg-[#141416] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            取消 / 放弃修改
          </button>

          <button
            type="button"
            onClick={handleSaveAndClose}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5 active:scale-95"
          >
            <CheckCircle2 size={15} />
            <span>保存并生效风控配置</span>
          </button>
        </div>
      </div>
    </div>
  );
};
