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
  Flame,
  Target,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Position, ApiConfig, OpenOrder } from '../types';
import { 
  PositionRiskConfig, 
  getDefaultPositionRiskConfig, 
  getRiskButtonDisplay, 
  normalizeConditionControl,
  detectPositionTpSl
} from '../types/positionRisk';

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
  openOrders?: OpenOrder[];
  onRefreshOrders?: () => void;
  currentN?: number;
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
  formatQty,
  openOrders = [],
  onRefreshOrders,
  currentN
}) => {
  const isLong = position ? position.side === 'BUY' : true;
  const entryPrice = position?.entryPrice || 0;

  // 内部表单临时状态，关闭或保存时生效
  const [currentConfig, setCurrentConfig] = useState<PositionRiskConfig>(() => {
    if (config) {
      const cloned = JSON.parse(JSON.stringify(config));
      cloned.conditionControl = normalizeConditionControl(cloned.conditionControl);
      return cloned;
    }
    if (position) return getDefaultPositionRiskConfig(position.id, position.symbol, position.side, entryPrice);
    return getDefaultPositionRiskConfig('default', '', 'BUY', 0);
  });

  // 当外部传入新的 config 或 position 切换时重置表单
  useEffect(() => {
    if (config) {
      const cloned = JSON.parse(JSON.stringify(config));
      cloned.conditionControl = normalizeConditionControl(cloned.conditionControl);
      setCurrentConfig(cloned);
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

      // 步骤 2: 若勾选了止盈，提交算法条件止盈委托 (TAKE_PROFIT_MARKET，0 占用合约保证金)
      if (currentConfig.tpSlControl.tpEnabled) {
        const finalTpPrice = formatPrice(position.symbol, calculatedTpPrice);
        const buildAlgoTpParams = (targetPosSide: string, withReduceOnly: boolean) => {
          const p: any = {
            symbol: position.symbol,
            side: closingSide,
            positionSide: targetPosSide,
            quantity: closingQty,
            workingType: 'MARK_PRICE',
            triggerPrice: finalTpPrice,
            algoType: 'CONDITIONAL',
            type: 'TAKE_PROFIT_MARKET'
          };
          if (withReduceOnly && targetPosSide === 'BOTH') {
            p.reduceOnly = 'true';
          }
          return p;
        };

        addLog(`[专属风控] 正在向币安 Algo 算法端点提交 ${position.symbol} 条件止盈单 (0占用保证金, 触发价: ${finalTpPrice}, 数量: ${closingQty})...`, 'TRADE');

        let currentPosSide = position.positionSide || 'BOTH';
        let algoTpParams = buildAlgoTpParams(currentPosSide, currentPosSide === 'BOTH');

        let tpRes = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'POST',
            endpoint: '/fapi/v1/algoOrder',
            params: algoTpParams,
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        let tpData = await tpRes.json();

        // 自愈重试 1: 若 position side 报错，自愈为另一侧重新在 algoOrder 提交
        if (!tpRes.ok && String(tpData?.msg || '').includes('position side')) {
          currentPosSide = currentPosSide === 'BOTH' ? 'LONG' : 'BOTH';
          algoTpParams = buildAlgoTpParams(currentPosSide, currentPosSide === 'BOTH');
          tpRes = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'POST',
              endpoint: '/fapi/v1/algoOrder',
              params: algoTpParams,
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          tpData = await tpRes.json();
        }

        // 自愈重试 2: 若 reduceOnly 报错，去除 reduceOnly 重新在 algoOrder 提交
        if (!tpRes.ok && String(tpData?.msg || '').includes('reduceOnly')) {
          algoTpParams = buildAlgoTpParams(currentPosSide, false);
          tpRes = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'POST',
              endpoint: '/fapi/v1/algoOrder',
              params: algoTpParams,
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          tpData = await tpRes.json();
        }

        if (tpRes.ok && (tpData.algoId || tpData.orderId || tpData.clientAlgoId)) {
          tpSuccess = true;
          const aId = String(tpData.algoId || tpData.orderId || tpData.clientAlgoId);
          lastTpId = aId;
          addLog(`[专属风控] ${position.symbol} 条件止盈委托 (AlgoOrder) 挂单成功(0占用保证金)！AlgoID: ${aId} (触发价: ${finalTpPrice})`, 'SUCCESS');
        } else {
          // 降级尝试以 /fapi/v1/order 条件单端点提交 TAKE_PROFIT_MARKET
          const fallbackParams: any = {
            symbol: position.symbol,
            side: closingSide,
            positionSide: currentPosSide,
            type: 'TAKE_PROFIT_MARKET',
            stopPrice: finalTpPrice,
            quantity: closingQty,
            workingType: 'MARK_PRICE'
          };
          if (currentPosSide === 'BOTH') fallbackParams.reduceOnly = 'true';
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
          const fallbackData = await fallbackRes.json();
          if (fallbackRes.ok && (fallbackData.orderId || fallbackData.clientOrderId)) {
            tpSuccess = true;
            lastTpId = String(fallbackData.orderId);
            addLog(`[专属风控] ${position.symbol} 条件止盈单挂单成功(0占用保证金)！订单ID: ${fallbackData.orderId} (触发价: ${finalTpPrice})`, 'SUCCESS');
          } else {
            addLog(`[专属风控] ${position.symbol} 止盈挂单失败: ${tpData?.msg || fallbackData?.msg || '未知异常'}`, 'ERROR');
          }
        }
      }

      // 步骤 3: 若勾选了止损，提交算法止损单（严格使用币安 /fapi/v1/algoOrder 算法端点）
      if (currentConfig.tpSlControl.slEnabled) {
        const finalSlPrice = formatPrice(position.symbol, calculatedSlPrice);
        const buildAlgoSlParams = (targetPosSide: string, withReduceOnly: boolean) => {
          const p: any = {
            symbol: position.symbol,
            side: closingSide,
            positionSide: targetPosSide,
            quantity: closingQty,
            workingType: 'MARK_PRICE',
            triggerPrice: finalSlPrice,
            algoType: 'CONDITIONAL',
            type: 'STOP_MARKET'
          };
          if (withReduceOnly && targetPosSide === 'BOTH') {
            p.reduceOnly = 'true';
          }
          return p;
        };

        addLog(`[专属风控] 正在向币安 Algo 算法端点提交 ${position.symbol} 条件止损单 (触发价: ${finalSlPrice}, 数量: ${closingQty})...`, 'TRADE');
        
        let currentPosSide = position.positionSide || 'BOTH';
        let algoParams = buildAlgoSlParams(currentPosSide, currentPosSide === 'BOTH');

        let slRes = await fetch('/api/binance-proxy', {
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

        let slData = await slRes.json();

        // 自愈重试 1: 若 position side 不匹配 (如单向/双向设置不一致)，自愈为另一侧重新提交
        if (!slRes.ok && String(slData?.msg || '').includes('position side')) {
          currentPosSide = currentPosSide === 'BOTH' ? (closingSide === 'SELL' ? 'LONG' : 'SHORT') : 'BOTH';
          algoParams = buildAlgoSlParams(currentPosSide, currentPosSide === 'BOTH');
          slRes = await fetch('/api/binance-proxy', {
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
          slData = await slRes.json();
        }

        // 自愈重试 2: 若 reduceOnly 报错，去除 reduceOnly 重新在 algoOrder 提交
        if (!slRes.ok && String(slData?.msg || '').includes('reduceOnly')) {
          algoParams = buildAlgoSlParams(currentPosSide, false);
          slRes = await fetch('/api/binance-proxy', {
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
          slData = await slRes.json();
        }

        if (slRes.ok && (slData.algoId || slData.orderId || slData.clientAlgoId)) {
          slSuccess = true;
          lastSlId = String(slData.algoId || slData.orderId || slData.clientAlgoId);
          addLog(`[专属风控] ✅ ${position.symbol} 算法止损委托 (AlgoOrder) 挂单成功！订单ID: ${lastSlId} (触发价: ${finalSlPrice})`, 'SUCCESS');
        } else {
          addLog(`[专属风控] ❌ ${position.symbol} 算法止损挂单失败: ${slData.msg || '未知异常'}`, 'ERROR');
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
      onRefreshOrders?.();

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
    onRefreshOrders?.();

    if (isTimeControlActive) {
      addLog(`[时间风控] 已为持仓 ${position.symbol} 激活最大持仓时间风控 (${currentConfig.timeControl.maxHoldMinutes} 分钟)，倒计时现已启动`, 'SUCCESS');
    }
    if (finalConfig.conditionControl.enabled) {
      addLog(`[条件风控] 已为持仓 ${position.symbol} 启用条件风控 (阶梯分批平仓 & 动态回撤移动止损已生效)`, 'SUCCESS');
    }

    onClose();
  };

  // 当前风控优先级展示预览
  const previewDisplay = getRiskButtonDisplay(currentConfig, openOrders, position || undefined);

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

          {/* 条件 C: 条件风控 (N值阶梯平仓 & 动态回撤移动止损) */}
          <div className={`p-4 rounded-xl border transition-all ${
            currentConfig.conditionControl.enabled 
              ? 'bg-purple-950/20 border-purple-500/40 shadow-sm shadow-purple-500/10' 
              : 'bg-[#18181A] border-[#27272A]'
          }`}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800/80">
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
                  <span className="text-sm font-bold text-white">条件 C：条件风控 (阶梯分批平仓 & 动态回撤移动止损)</span>
                </div>
              </label>

              <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                currentConfig.conditionControl.enabled ? 'bg-purple-500/20 text-purple-300 font-semibold' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {currentConfig.conditionControl.enabled ? '已勾选启用 (默认)' : '未勾选'}
              </span>
            </div>

            {/* 条件 C 内部选项 */}
            <div className={`space-y-4 text-xs transition-opacity ${currentConfig.conditionControl.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              
              {/* 子选项 1: N值阶梯分批平仓 (3组独立配置) */}
              <div className="bg-[#121214] p-3.5 rounded-xl border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={14} className="text-purple-400" />
                    <span className="font-bold text-zinc-200">1. N值阶梯分批平仓 (共 3 组，每次平现有仓位的百分比)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">
                    独立勾选生效
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  当持仓的 N值（盈利倍数）达到目标时，自动按当时<strong className="text-purple-300 font-semibold">【现有仓位】</strong>的设定百分比执行市价平仓。
                </p>

                {/* 3 组阶梯配置 */}
                <div className="space-y-2.5">
                  {currentConfig.conditionControl.stageCloseRules.map((stage, idx) => {
                    const stageNumber = idx + 1;
                    return (
                      <div 
                        key={stage.id || `stage_${stageNumber}`}
                        className={`p-2.5 rounded-lg border transition-all ${
                          stage.enabled 
                            ? 'bg-[#18181C] border-purple-500/30 shadow-xs' 
                            : 'bg-[#151517] border-zinc-800/60 opacity-60'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input 
                              type="checkbox"
                              checked={stage.enabled}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setCurrentConfig(prev => {
                                  const updatedStages = [...prev.conditionControl.stageCloseRules];
                                  updatedStages[idx] = { ...updatedStages[idx], enabled: checked };
                                  return {
                                    ...prev,
                                    conditionControl: {
                                      ...prev.conditionControl,
                                      stageCloseRules: updatedStages
                                    }
                                  };
                                });
                              }}
                              className="w-3.5 h-3.5 rounded text-purple-500 bg-zinc-900 border-zinc-700 focus:ring-purple-500"
                            />
                            <span className="font-bold text-xs text-white">
                              第 {stageNumber} 组
                            </span>
                          </label>

                          <div className="flex items-center gap-3">
                            {/* N = 输入 */}
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-zinc-400 text-xs">当 N =</span>
                              <input 
                                type="number"
                                min="1"
                                step="1"
                                value={stage.targetN}
                                onChange={(e) => {
                                  const val = Math.max(1, parseInt(e.target.value) || 1);
                                  setCurrentConfig(prev => {
                                    const updatedStages = [...prev.conditionControl.stageCloseRules];
                                    updatedStages[idx] = { ...updatedStages[idx], targetN: val };
                                    return {
                                      ...prev,
                                      conditionControl: {
                                        ...prev.conditionControl,
                                        stageCloseRules: updatedStages
                                      }
                                    };
                                  });
                                }}
                                className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-amber-300 font-bold focus:outline-hidden focus:border-purple-500"
                              />
                            </div>

                            {/* 平仓比例输入 */}
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-zinc-400 text-xs">平仓现有</span>
                              <input 
                                type="number"
                                min="1"
                                max="100"
                                step="1"
                                value={stage.closeRatio}
                                onChange={(e) => {
                                  const val = Math.min(100, Math.max(1, parseFloat(e.target.value) || 1));
                                  setCurrentConfig(prev => {
                                    const updatedStages = [...prev.conditionControl.stageCloseRules];
                                    updatedStages[idx] = { ...updatedStages[idx], closeRatio: val };
                                    return {
                                      ...prev,
                                      conditionControl: {
                                        ...prev.conditionControl,
                                        stageCloseRules: updatedStages
                                      }
                                    };
                                  });
                                }}
                                className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-emerald-400 font-bold focus:outline-hidden focus:border-purple-500"
                              />
                              <span className="text-zinc-400 text-xs">%</span>
                            </div>

                            {/* 执行状态标签 */}
                            <div className="text-[10px] font-mono">
                              {stage.executed ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                                  ✅ 已在 N={stage.targetN} 平仓 ({stage.executedAmount || '-'})
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                  待触发
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 阶梯平仓示例卡片 */}
                <div className="bg-[#0D0D0E] p-2.5 rounded-lg border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                  <div className="text-purple-300 font-semibold flex items-center gap-1">
                    <Info size={12} />
                    <span>按现有仓位分步平仓推演（例：初始持仓 100 张）：</span>
                  </div>
                  <div className="pl-4 space-y-0.5 text-zinc-400 font-mono text-[10px]">
                    <div>• 第1组（N=2 开启）：触达 N=2 时，平仓现有仓位 100 × 50% = 50 张，剩余 50 张</div>
                    <div>• 第2组（N=3 默认关闭）：未勾选不触发</div>
                    <div>• 第3组（N=100 开启）：触达 N=100 时，平仓现有仓位 50 × 100% = 50 张，全仓平仓出场</div>
                  </div>
                </div>
              </div>

              {/* 子选项 2: N值动态移动回撤止损调整 */}
              <div className="bg-[#121214] p-3.5 rounded-xl border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={currentConfig.conditionControl.trailingStopRule.enabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setCurrentConfig(prev => ({
                          ...prev,
                          conditionControl: {
                            ...prev.conditionControl,
                            trailingStopRule: {
                              ...prev.conditionControl.trailingStopRule,
                              enabled: checked
                            }
                          }
                        }));
                      }}
                      className="w-3.5 h-3.5 rounded text-purple-500 bg-zinc-900 border-zinc-700 focus:ring-purple-500"
                    />
                    <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                      <TrendingUp size={14} className="text-purple-400" />
                      <span>2. N值动态移动回撤止损调整 (自动抬升 Algo 算法止损单)</span>
                    </div>
                  </label>

                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                    currentConfig.conditionControl.trailingStopRule.enabled 
                      ? 'bg-purple-500/10 text-purple-300 font-bold' 
                      : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {currentConfig.conditionControl.trailingStopRule.enabled ? '已勾选生效 (默认)' : '未勾选'}
                  </span>
                </div>

                {/* 参数输入 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 bg-[#18181C] rounded-lg border border-purple-500/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-400 font-mono text-xs">当 N &gt;= 几时:</span>
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="text-zinc-500 text-xs">N &gt;=</span>
                      <input 
                        type="number"
                        min="1"
                        step="1"
                        value={currentConfig.conditionControl.trailingStopRule.minN}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setCurrentConfig(prev => ({
                            ...prev,
                            conditionControl: {
                              ...prev.conditionControl,
                              trailingStopRule: {
                                ...prev.conditionControl.trailingStopRule,
                                minN: val
                              }
                            }
                          }));
                        }}
                        className="w-18 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-amber-300 font-bold focus:outline-hidden focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-400 font-mono text-xs">回撤比例:</span>
                    <div className="flex items-center gap-1.5 font-mono">
                      <input 
                        type="number"
                        min="1"
                        max="99"
                        step="1"
                        value={currentConfig.conditionControl.trailingStopRule.drawdownRatio}
                        onChange={(e) => {
                          const val = Math.min(99, Math.max(1, parseFloat(e.target.value) || 1));
                          setCurrentConfig(prev => ({
                            ...prev,
                            conditionControl: {
                              ...prev.conditionControl,
                              trailingStopRule: {
                                ...prev.conditionControl.trailingStopRule,
                                drawdownRatio: val
                              }
                            }
                          }));
                        }}
                        className="w-18 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-rose-400 font-bold focus:outline-hidden focus:border-purple-500"
                      />
                      <span className="text-zinc-400 text-xs">%</span>
                    </div>
                  </div>
                </div>

                {/* 动态试算与对照卡片 */}
                {(() => {
                  const trailing = currentConfig.conditionControl.trailingStopRule;
                  const ratio = (trailing.drawdownRatio || 80) / 100;
                  const effectiveN = Math.max(currentN || 1, trailing.minN || 3);
                  const dynamicPrice = isLong 
                    ? entryPrice * effectiveN * (1 - ratio)
                    : (entryPrice / effectiveN) * (1 + ratio);
                  
                  const detected = detectPositionTpSl(position, openOrders, currentConfig);
                  const currentOrderSlPrice = detected.slPrice || currentConfig.tpSlControl.slPrice || 0;
                  const isPriceHigher = isLong ? (dynamicPrice > currentOrderSlPrice) : (dynamicPrice < currentOrderSlPrice);

                  return (
                    <div className="bg-[#0D0D0E] p-3 rounded-lg border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400 font-medium">公式: 开仓价 × N × (1 - 回撤比例)</span>
                        <span className="text-purple-300 font-mono">当前持仓 N值: {currentN || 1}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-[#141416] p-2 rounded border border-zinc-800/80">
                        <div>
                          <span className="text-zinc-500 block text-[10px]">当前止损挂单价</span>
                          <span className="text-zinc-200 font-bold">
                            {currentOrderSlPrice > 0 ? formatPrice(position.symbol, currentOrderSlPrice) : '暂无 (0)'}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block text-[10px]">N={effectiveN} 试算止损价</span>
                          <span className="text-amber-400 font-bold">
                            {formatPrice(position.symbol, dynamicPrice)}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10.5px] leading-relaxed text-zinc-400 pt-1 border-t border-zinc-800/60">
                        {isPriceHigher ? (
                          <div className="text-emerald-400 flex items-start gap-1">
                            <ArrowRight size={13} className="shrink-0 mt-0.5 text-emerald-400" />
                            <span>试算价 ({formatPrice(position.symbol, dynamicPrice)}) 优于当前止损价：触发撤销原挂单，以该价向币安重新挂 Algo 算法止损单！</span>
                          </div>
                        ) : (
                          <div className="text-zinc-400 flex items-start gap-1">
                            <Info size={13} className="shrink-0 mt-0.5 text-zinc-500" />
                            <span>试算价 ({formatPrice(position.symbol, dynamicPrice)}) 未超过当前止损价：维持当前止损挂单不变。当 N 增加至 {effectiveN + 1} 时自动抬升！</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

              </div>

            </div>
          </div>

          {/* 规则 5 动态优先级提示横幅 */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-zinc-900 to-[#18181A] border border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400">当前风控状态将展示为:</span>
              <div className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 ${
                previewDisplay === '止盈 / 止损' || previewDisplay === '止盈'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                  : previewDisplay === '止损'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                  : previewDisplay === '条件风控'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                  : previewDisplay === '时间风控'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                  : 'bg-red-950/40 text-red-300 border border-red-600/50'
              }`}>
                {previewDisplay === '止盈 / 止损' || previewDisplay === '止盈' ? (
                  <Target size={13} className="text-emerald-400" />
                ) : previewDisplay === '止损' ? (
                  <ShieldAlert size={13} className="text-rose-400" />
                ) : previewDisplay === '死斗' ? (
                  <Swords size={13} className="text-red-400" />
                ) : (
                  <ShieldAlert size={13} />
                )}
                <span>{previewDisplay}</span>
              </div>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              展示规则: 止盈/止损 ＞ 条件风控 ＞ 时间风控 ＞ 死斗
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
