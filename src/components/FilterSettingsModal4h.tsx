import React, { useState, useEffect } from 'react';
import { 
  X, 
  Filter, 
  RotateCcw, 
  Check, 
  Clock, 
  TrendingUp, 
  Percent, 
  Layers, 
  DollarSign, 
  Sparkles,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface FilterSettings4h {
  // 1. 涨幅范围
  gainRange: {
    enabled: boolean;
    min: string;
    max: string;
  };
  // 2. 收位范围
  closePosRange: {
    enabled: boolean;
    min: string;
    max: string;
  };
  // 3. 4h 成交额不小于 (万 USDT)
  minVolume4h: {
    enabled: boolean;
    value: string;
  };
  // 4. 资金费率范围 (%)
  fundingRateRange: {
    enabled: boolean;
    min: string;
    max: string;
  };
  // 5. 量比不小于 (跟随前端 量k 根数)
  minVolumeRatio: {
    enabled: boolean;
    value: string;
  };
  // 6. 前若干根K线涨跌幅最高值不大于 (跟随前端 涨跌k 根数与模式)
  minMaxGainPastK: {
    enabled: boolean;
    value: string;
  };
  // 7. 扫描时刻 (4小时绝对周期的第几小时、第几分、第几秒，始终生效)
  scanMoment: {
    hour: number;   // 0 ~ 3
    minute: number; // 0 ~ 59
    second: number; // 0 ~ 59
  };
  // 仅在表格中展示满足条件的币对
  filterTableRows?: boolean;
}

export const DEFAULT_FILTER_SETTINGS_4H: FilterSettings4h = {
  gainRange: {
    enabled: false,
    min: '-5.0',
    max: '30.0'
  },
  closePosRange: {
    enabled: false,
    min: '60.0',
    max: '100.0'
  },
  minVolume4h: {
    enabled: false,
    value: '1000'
  },
  fundingRateRange: {
    enabled: false,
    min: '-0.15',
    max: '0.02'
  },
  minVolumeRatio: {
    enabled: false,
    value: '2.0'
  },
  minMaxGainPastK: {
    enabled: false,
    value: '5.0'
  },
  scanMoment: {
    hour: 3,
    minute: 58,
    second: 30
  },
  filterTableRows: false
};

interface FilterSettingsModal4hProps {
  isOpen: boolean;
  onClose: () => void;
  settings: FilterSettings4h;
  onSave: (newSettings: FilterSettings4h) => void;
  currentVolumeKCount: number;
  currentGainKCount: number;
  currentGainMode: 'standard' | 'high';
}

export default function FilterSettingsModal4h({
  isOpen,
  onClose,
  settings,
  onSave,
  currentVolumeKCount,
  currentGainKCount,
  currentGainMode
}: FilterSettingsModal4hProps) {
  const [formData, setFormData] = useState<FilterSettings4h>(settings);

  // 同步外部设置
  useEffect(() => {
    if (isOpen) {
      setFormData(settings);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  // 安全数值输入过滤（允许负号、小数点与数字）
  const handleNumberInput = (val: string, setter: (cleaned: string) => void) => {
    // 允许空、负号、单个小数点及小数
    if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) {
      setter(val);
    }
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  const handleReset = () => {
    setFormData(DEFAULT_FILTER_SETTINGS_4H);
  };

  // 统计已启用的筛选规则数
  const activeCount = [
    formData.gainRange.enabled,
    formData.closePosRange.enabled,
    formData.minVolume4h.enabled,
    formData.fundingRateRange.enabled,
    formData.minVolumeRatio.enabled,
    formData.minMaxGainPastK.enabled
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
          className="relative w-full max-w-2xl bg-[#141518]/95 border border-emerald-500/30 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_30px_rgba(16,185,129,0.15)] overflow-hidden z-10 flex flex-col max-h-[92vh] backdrop-blur-xl"
        >
          {/* 弹窗头部 */}
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
                <Filter className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white tracking-wide">4H 筛选设置</h3>
                  {activeCount > 0 ? (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      已启用 {activeCount} 项条件
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-zinc-400">
                      未启用条件
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  勾选生效对应条件，量k 与 涨跌k 参数自动跟随前端当前选择
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
            
            {/* 1. 涨幅范围 */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.gainRange.enabled 
                ? 'bg-emerald-500/[0.06] border-emerald-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.gainRange.enabled}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      gainRange: { ...prev.gainRange, enabled: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 bg-white/10 border-white/20 accent-emerald-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    涨幅范围 (%)
                  </span>
                </label>
                <span className="text-xs font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded">
                  当前: {currentGainMode === 'high' ? '高涨幅模式' : '常规模式'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">最低涨幅 (Min %)</span>
                  <input 
                    type="text" 
                    value={formData.gainRange.min}
                    placeholder="如 -5.0"
                    onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                      ...prev,
                      gainRange: { ...prev.gainRange, min: val }
                    })))}
                    disabled={!formData.gainRange.enabled}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">最高涨幅 (Max %)</span>
                  <input 
                    type="text" 
                    value={formData.gainRange.max}
                    placeholder="如 30.0"
                    onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                      ...prev,
                      gainRange: { ...prev.gainRange, max: val }
                    })))}
                    disabled={!formData.gainRange.enabled}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* 2. 收位范围 */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.closePosRange.enabled 
                ? 'bg-sky-500/[0.06] border-sky-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.closePosRange.enabled}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      closePosRange: { ...prev.closePosRange, enabled: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500 focus:ring-offset-0 bg-white/10 border-white/20 accent-sky-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-sky-400" />
                    收位百分比范围 (%)
                  </span>
                </label>
                <span className="text-xs text-sky-300/80 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                  当前价在整根K线中的高低位置
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">最低收位 (Min %)</span>
                  <input 
                    type="text" 
                    value={formData.closePosRange.min}
                    placeholder="如 60.0"
                    onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                      ...prev,
                      closePosRange: { ...prev.closePosRange, min: val }
                    })))}
                    disabled={!formData.closePosRange.enabled}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">最高收位 (Max %)</span>
                  <input 
                    type="text" 
                    value={formData.closePosRange.max}
                    placeholder="如 100.0"
                    onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                      ...prev,
                      closePosRange: { ...prev.closePosRange, max: val }
                    })))}
                    disabled={!formData.closePosRange.enabled}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* 3. 4h 成交额不小于 */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.minVolume4h.enabled 
                ? 'bg-amber-500/[0.06] border-amber-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.minVolume4h.enabled}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      minVolume4h: { ...prev.minVolume4h, enabled: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 focus:ring-offset-0 bg-white/10 border-white/20 accent-amber-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    4H 成交额门槛 (万 USDT)
                  </span>
                </label>
                <span className="text-xs text-zinc-400">满足当前未完结 4H 成交额</span>
              </div>
              <div className="pl-6">
                <span className="text-[11px] text-zinc-400 mb-1 block">成交额不小于 (≥ 万 USDT)</span>
                <input 
                  type="text" 
                  value={formData.minVolume4h.value}
                  placeholder="如 1000"
                  onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                    ...prev,
                    minVolume4h: { ...prev.minVolume4h, value: val }
                  })))}
                  disabled={!formData.minVolume4h.enabled}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* 4. 资金费率范围 */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.fundingRateRange.enabled 
                ? 'bg-purple-500/[0.06] border-purple-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.fundingRateRange.enabled}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      fundingRateRange: { ...prev.fundingRateRange, enabled: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded text-purple-500 focus:ring-purple-500 focus:ring-offset-0 bg-white/10 border-white/20 accent-purple-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    资金费率范围 (%)
                  </span>
                </label>
                <span className="text-xs text-purple-300/80 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  支持正负费率区间
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">最低资金费率 (Min %)</span>
                  <input 
                    type="text" 
                    value={formData.fundingRateRange.min}
                    placeholder="如 -0.15"
                    onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                      ...prev,
                      fundingRateRange: { ...prev.fundingRateRange, min: val }
                    })))}
                    disabled={!formData.fundingRateRange.enabled}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">最高资金费率 (Max %)</span>
                  <input 
                    type="text" 
                    value={formData.fundingRateRange.max}
                    placeholder="如 0.02"
                    onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                      ...prev,
                      fundingRateRange: { ...prev.fundingRateRange, max: val }
                    })))}
                    disabled={!formData.fundingRateRange.enabled}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* 5. 量比不小于 (自动跟随前端 量k) */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.minVolumeRatio.enabled 
                ? 'bg-cyan-500/[0.06] border-cyan-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.minVolumeRatio.enabled}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      minVolumeRatio: { ...prev.minVolumeRatio, enabled: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0 bg-white/10 border-white/20 accent-cyan-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    量比不小于 (倍数)
                  </span>
                </label>
                <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-500/15 px-2.5 py-0.5 rounded border border-cyan-500/30">
                  跟随前端 量k: {currentVolumeKCount} 根
                </span>
              </div>
              <div className="pl-6">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                  <span>量比阈值 (当前未完结成交额 / 前 {currentVolumeKCount} 根最低成交额 ≥)</span>
                </div>
                <input 
                  type="text" 
                  value={formData.minVolumeRatio.value}
                  placeholder="如 2.0"
                  onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                    ...prev,
                    minVolumeRatio: { ...prev.minVolumeRatio, value: val }
                  })))}
                  disabled={!formData.minVolumeRatio.enabled}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* 6. 前 N 根 K 线的涨跌幅最高值不小于 (自动跟随前端 涨跌k) */}
            <div className={`p-4 rounded-2xl border transition-all ${
              formData.minMaxGainPastK.enabled 
                ? 'bg-emerald-500/[0.06] border-emerald-500/40 shadow-sm' 
                : 'bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={formData.minMaxGainPastK.enabled}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      minMaxGainPastK: { ...prev.minMaxGainPastK, enabled: e.target.checked }
                    }))}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 bg-white/10 border-white/20 accent-emerald-500 cursor-pointer"
                  />
                  <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    前 {currentGainKCount} 根 K 线涨跌幅最高值不大于 (%)
                  </span>
                </label>
                <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 rounded border border-emerald-500/30">
                  跟随前端 涨跌k: {currentGainKCount} 根 · {currentGainMode === 'high' ? '高涨幅' : '常规'}
                </span>
              </div>
              <div className="pl-6">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                  <span>前 {currentGainKCount} 根完结K线涨跌幅最高值阈值 (≤ %)</span>
                </div>
                <input 
                  type="text" 
                  value={formData.minMaxGainPastK.value}
                  placeholder="如 5.0 (支持负数和小数)"
                  onChange={e => handleNumberInput(e.target.value, (val) => setFormData(prev => ({
                    ...prev,
                    minMaxGainPastK: { ...prev.minMaxGainPastK, value: val }
                  })))}
                  disabled={!formData.minMaxGainPastK.enabled}
                  className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* 7. 扫描时刻 (4小时绝对周期，无勾选，始终生效) */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-zinc-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>4小时绝对周期扫描时刻</span>
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    始终生效
                  </span>
                </div>
                <span className="text-xs text-zinc-400 font-mono">00:00, 04:00, 08:00 等循环</span>
              </div>
              <p className="text-xs text-zinc-400 mb-3 pl-6">
                在 4 小时周期的第几小时、第几分钟、第几秒执行快照筛选
              </p>
              <div className="grid grid-cols-3 gap-3 pl-6">
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">第几小时 (0 ~ 3)</span>
                  <input 
                    type="number" 
                    min="0"
                    max="3"
                    value={formData.scanMoment.hour}
                    onChange={e => {
                      const val = Math.min(3, Math.max(0, parseInt(e.target.value) || 0));
                      setFormData(prev => ({
                        ...prev,
                        scanMoment: { ...prev.scanMoment, hour: val }
                      }));
                    }}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">第几分钟 (0 ~ 59)</span>
                  <input 
                    type="number" 
                    min="0"
                    max="59"
                    value={formData.scanMoment.minute}
                    onChange={e => {
                      const val = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                      setFormData(prev => ({
                        ...prev,
                        scanMoment: { ...prev.scanMoment, minute: val }
                      }));
                    }}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-400 mb-1 block">第几秒钟 (0 ~ 59)</span>
                  <input 
                    type="number" 
                    min="0"
                    max="59"
                    value={formData.scanMoment.second}
                    onChange={e => {
                      const val = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                      setFormData(prev => ({
                        ...prev,
                        scanMoment: { ...prev.scanMoment, second: val }
                      }));
                    }}
                    className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* 列表联动筛选勾选 */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={formData.filterTableRows ?? false}
                  onChange={e => setFormData(prev => ({ ...prev, filterTableRows: e.target.checked }))}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-white/10 border-white/20 accent-emerald-500 cursor-pointer"
                />
                <span className="text-xs text-zinc-200">
                  仅在榜单表格中高亮 / 过滤显示满足已勾选条件的币对
                </span>
              </label>
              <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                <Info className="w-3.5 h-3.5 text-zinc-400" />
                <span>实时运算</span>
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
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>保存配置并应用</span>
              </button>
            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
