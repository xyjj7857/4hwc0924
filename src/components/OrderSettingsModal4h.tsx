import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings2, 
  RotateCcw, 
  Check, 
  Gauge, 
  Calculator, 
  ShieldAlert, 
  Target, 
  DollarSign, 
  Coins,
  HelpCircle,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface OrderSettings4h {
  // 0. 最大持仓单数量 (默认10，默认勾选)
  maxPositionCount?: {
    enabled: boolean;
    value: string; // 默认 '10'
  };
  // 1. 杠杆倍数
  leverage: {
    enabled: boolean;
    value: string; // 支持手动输入
  };
  // 2. 合约计算量百分比 (规则同交易辅助，不能小于最小下单金额)
  calcQtyPercent: {
    enabled: boolean;
    value: string; // 如 20 (%)
    turnoverCoef: string; // 成交额系数，默认 1000
  };
  // 3. 最小下单金额 (USDT)
  minOrderAmount: {
    enabled: boolean;
    value: string;
  };
  // 4. 固定下单金额 (USDT)
  fixedOrderAmount: {
    enabled: boolean;
    value: string;
  };
  // 5. 止损价 = 当前开盘价的多少倍 (支持小数、负数)
  stopLossMultiplier: {
    enabled: boolean;
    value: string;
  };
  // 6. 止盈价 = 当前开盘价的多少倍 (支持小数、负数)
  takeProfitMultiplier: {
    enabled: boolean;
    value: string;
  };
}

export const DEFAULT_ORDER_SETTINGS_4H: OrderSettings4h = {
  maxPositionCount: {
    enabled: true,
    value: '10'
  },
  leverage: {
    enabled: true,
    value: '10'
  },
  calcQtyPercent: {
    enabled: true,
    value: '20',
    turnoverCoef: '1000'
  },
  minOrderAmount: {
    enabled: true,
    value: '20'
  },
  fixedOrderAmount: {
    enabled: false,
    value: '100'
  },
  stopLossMultiplier: {
    enabled: true,
    value: '0.985'
  },
  takeProfitMultiplier: {
    enabled: true,
    value: '1.05'
  }
};

interface OrderSettingsModal4hProps {
  isOpen: boolean;
  onClose: () => void;
  settings: OrderSettings4h;
  onSave: (newSettings: OrderSettings4h) => void;
}

export default function OrderSettingsModal4h({
  isOpen,
  onClose,
  settings,
  onSave
}: OrderSettingsModal4hProps) {
  const [formData, setFormData] = useState<OrderSettings4h>(() => ({
    ...DEFAULT_ORDER_SETTINGS_4H,
    ...settings,
    maxPositionCount: settings.maxPositionCount || DEFAULT_ORDER_SETTINGS_4H.maxPositionCount
  }));

  useEffect(() => {
    if (isOpen) {
      setFormData({
        ...DEFAULT_ORDER_SETTINGS_4H,
        ...settings,
        maxPositionCount: settings.maxPositionCount || DEFAULT_ORDER_SETTINGS_4H.maxPositionCount
      });
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  // 安全数值输入过滤（允许负号、小数点与数字）
  const handleNumberInput = (val: string, setter: (cleaned: string) => void) => {
    if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) {
      setter(val);
    }
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  const handleReset = () => {
    setFormData(DEFAULT_ORDER_SETTINGS_4H);
  };

  const activeCount = [
    formData.maxPositionCount?.enabled,
    formData.leverage.enabled,
    formData.calcQtyPercent.enabled,
    formData.minOrderAmount.enabled,
    formData.fixedOrderAmount.enabled,
    formData.stopLossMultiplier.enabled,
    formData.takeProfitMultiplier.enabled
  ].filter(Boolean).length;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* 背景遮罩 */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity" 
        />

        {/* 弹窗主体 */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl bg-[#141518]/95 border border-amber-500/30 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_30px_rgba(245,158,11,0.15)] overflow-hidden z-10 flex flex-col max-h-[92vh] backdrop-blur-xl"
        >
          {/* 弹窗头部 */}
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                <Settings2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white tracking-wide">4H 下单设置</h3>
                  {activeCount > 0 ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      已启用 {activeCount} 项配置
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-zinc-400">
                      未勾选生效项
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  所有参数勾选生效，支持手动输入小数与负数，规则与交易辅助保持一致
                </p>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 弹窗内容表单区 */}
          <div className="p-6 overflow-y-auto space-y-4.5 flex-1 text-sm custom-scrollbar">

            {/* 0. 最大持仓单数量 (在最上方，默认10，默认勾选) */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.maxPositionCount?.enabled 
                ? 'bg-amber-500/[0.06] border-amber-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.maxPositionCount?.enabled ?? true}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      maxPositionCount: { 
                        enabled: e.target.checked,
                        value: prev.maxPositionCount?.value || '10'
                      }
                    }))}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-white/10 border-white/20 accent-amber-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-400" />
                    最大持仓单数量
                  </span>
                </label>
                <span className="text-xs text-zinc-400 font-mono">持仓上限控制</span>
              </div>
              <div className="pl-6">
                <span className="text-[11px] text-zinc-400 mb-1 block">同时持仓币对上限 (超过此数量不再自动开新仓)</span>
                <input 
                  type="text" 
                  value={formData.maxPositionCount?.value ?? '10'}
                  placeholder="默认 10"
                  onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                    ...prev,
                    maxPositionCount: { 
                      enabled: prev.maxPositionCount?.enabled ?? true,
                      value: val 
                    }
                  })))}
                  disabled={!formData.maxPositionCount?.enabled}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* 1. 杠杆倍数 */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.leverage.enabled 
                ? 'bg-amber-500/[0.06] border-amber-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.leverage.enabled}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      leverage: { ...prev.leverage, enabled: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-white/10 border-white/20 accent-amber-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-amber-400" />
                    合约杠杆倍数
                  </span>
                </label>
                <span className="text-xs text-zinc-400 font-mono">1x ~ 125x</span>
              </div>
              <div className="pl-6">
                <span className="text-[11px] text-zinc-400 mb-1 block">下单前自动设置杠杆 (倍数)</span>
                <input 
                  type="text" 
                  value={formData.leverage.value}
                  placeholder="如 10"
                  onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                    ...prev,
                    leverage: { ...prev.leverage, value: val }
                  })))}
                  disabled={!formData.leverage.enabled}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* 2. 合约计算量百分比 */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.calcQtyPercent.enabled 
                ? 'bg-cyan-500/[0.06] border-cyan-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.calcQtyPercent.enabled}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      calcQtyPercent: { ...prev.calcQtyPercent, enabled: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 bg-white/10 border-white/20 accent-cyan-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-cyan-400" />
                    合约计算量百分比 (%)
                  </span>
                </label>
                <div className="flex items-center gap-1 text-xs text-cyan-300 font-medium cursor-help" title="计算规则与交易辅助相同：&#10;基础量1 = 合约余额 × 百分比&#10;基础量2 = 15分钟成交额 ÷ 成交额系数&#10;下单量 = min(基础量1, 基础量2)，向下取整&#10;且不得小于最小下单金额">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>计算规则说明</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">余额百分比 (%)</span>
                  <input 
                    type="text" 
                    value={formData.calcQtyPercent.value}
                    placeholder="如 20.0"
                    onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                      ...prev,
                      calcQtyPercent: { ...prev.calcQtyPercent, value: val }
                    })))}
                    disabled={!formData.calcQtyPercent.enabled}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">成交额系数 (默认 1000)</span>
                  <input 
                    type="text" 
                    value={formData.calcQtyPercent.turnoverCoef || '1000'}
                    placeholder="默认 1000"
                    onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                      ...prev,
                      calcQtyPercent: { ...prev.calcQtyPercent, turnoverCoef: val }
                    })))}
                    disabled={!formData.calcQtyPercent.enabled}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* 3. 最小下单金额 & 固定下单金额 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 最小下单金额 */}
              <div className={`p-4 rounded-2xl border transition-all ${
                formData.minOrderAmount.enabled 
                  ? 'bg-emerald-500/[0.06] border-emerald-500/40 shadow-sm' 
                  : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={formData.minOrderAmount.enabled}
                      onChange={e => setFormData(prev => ({
                        ...prev,
                        minOrderAmount: { ...prev.minOrderAmount, enabled: e.target.checked }
                      }))}
                      className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-white/10 border-white/20 accent-emerald-500 cursor-pointer"
                    />
                    <span className="font-bold text-zinc-100 flex items-center gap-1.5 text-xs">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      最小下单金额
                    </span>
                  </label>
                  <span className="text-[10px] text-zinc-500">保底限额</span>
                </div>
                <div className="pl-6">
                  <span className="text-[11px] text-zinc-400 mb-1 block">USDT (不能小于此值)</span>
                  <input 
                    type="text" 
                    value={formData.minOrderAmount.value}
                    placeholder="如 20.0"
                    onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                      ...prev,
                      minOrderAmount: { ...prev.minOrderAmount, value: val }
                    })))}
                    disabled={!formData.minOrderAmount.enabled}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* 固定下单金额 */}
              <div className={`p-4 rounded-2xl border transition-all ${
                formData.fixedOrderAmount.enabled 
                  ? 'bg-purple-500/[0.06] border-purple-500/40 shadow-sm' 
                  : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={formData.fixedOrderAmount.enabled}
                      onChange={e => setFormData(prev => ({
                        ...prev,
                        fixedOrderAmount: { ...prev.fixedOrderAmount, enabled: e.target.checked }
                      }))}
                      className="w-4 h-4 rounded text-purple-500 focus:ring-purple-500 bg-white/10 border-white/20 accent-purple-500 cursor-pointer"
                    />
                    <span className="font-bold text-zinc-100 flex items-center gap-1.5 text-xs">
                      <Coins className="w-3.5 h-3.5 text-purple-400" />
                      固定下单金额
                    </span>
                  </label>
                  <span className="text-[10px] text-zinc-500">独立模式</span>
                </div>
                <div className="pl-6">
                  <span className="text-[11px] text-zinc-400 mb-1 block">USDT (固定金额下单)</span>
                  <input 
                    type="text" 
                    value={formData.fixedOrderAmount.value}
                    placeholder="如 100.0"
                    onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                      ...prev,
                      fixedOrderAmount: { ...prev.fixedOrderAmount, value: val }
                    })))}
                    disabled={!formData.fixedOrderAmount.enabled}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* 4. 止损价倍数 */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.stopLossMultiplier.enabled 
                ? 'bg-rose-500/[0.06] border-rose-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.stopLossMultiplier.enabled}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      stopLossMultiplier: { ...prev.stopLossMultiplier, enabled: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 bg-white/10 border-white/20 accent-rose-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    止损价 = 当前4H开盘价 × 设定倍数
                  </span>
                </label>
                <span className="text-xs text-rose-300 font-mono">
                  如 0.985 (即跌 1.5% 止损)
                </span>
              </div>
              <div className="pl-6">
                <span className="text-[11px] text-zinc-400 mb-1 block">止损价格倍数 (支持小数与负数)</span>
                <input 
                  type="text" 
                  value={formData.stopLossMultiplier.value}
                  placeholder="如 0.985"
                  onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                    ...prev,
                    stopLossMultiplier: { ...prev.stopLossMultiplier, value: val }
                  })))}
                  disabled={!formData.stopLossMultiplier.enabled}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* 5. 止盈价倍数 */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.takeProfitMultiplier.enabled 
                ? 'bg-emerald-500/[0.06] border-emerald-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.takeProfitMultiplier.enabled}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      takeProfitMultiplier: { ...prev.takeProfitMultiplier, enabled: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-white/10 border-white/20 accent-emerald-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-emerald-400" />
                    止盈价 = 当前4H开盘价 × 设定倍数
                  </span>
                </label>
                <span className="text-xs text-emerald-300 font-mono">
                  如 1.05 (即涨 5% 止盈)
                </span>
              </div>
              <div className="pl-6">
                <span className="text-[11px] text-zinc-400 mb-1 block">止盈价格倍数 (支持小数与负数)</span>
                <input 
                  type="text" 
                  value={formData.takeProfitMultiplier.value}
                  placeholder="如 1.05"
                  onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                    ...prev,
                    takeProfitMultiplier: { ...prev.takeProfitMultiplier, value: val }
                  })))}
                  disabled={!formData.takeProfitMultiplier.enabled}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

          </div>

          {/* 底部按钮栏 */}
          <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/10"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>重置默认</span>
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold transition-colors border border-white/10"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>保存下单设置</span>
              </button>
            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
