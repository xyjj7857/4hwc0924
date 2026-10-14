import React, { useState } from 'react';
import { 
  X, 
  Flame, 
  Layers, 
  TrendingUp, 
  Timer, 
  Clock, 
  CheckCircle2, 
  RotateCcw, 
  Info,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { Position } from '../types';
import { 
  ConditionControlConfig, 
  TimeoutPriceControlConfig, 
  getDefaultConditionControlConfig 
} from '../types/positionRisk';

interface BatchRiskCandDModalProps {
  isOpen: boolean;
  onClose: () => void;
  positions: Position[];
  onApplyBatch: (
    conditionControl: ConditionControlConfig,
    timeoutPriceControl: TimeoutPriceControlConfig
  ) => void;
  initialConditionControl?: ConditionControlConfig;
  initialTimeoutPriceControl?: TimeoutPriceControlConfig;
}

export const BatchRiskCandDModal: React.FC<BatchRiskCandDModalProps> = ({
  isOpen,
  onClose,
  positions,
  onApplyBatch,
  initialConditionControl,
  initialTimeoutPriceControl
}) => {
  const [conditionControl, setConditionControl] = useState<ConditionControlConfig>(() => {
    return initialConditionControl || getDefaultConditionControlConfig();
  });

  const [timeoutPriceControl, setTimeoutPriceControl] = useState<TimeoutPriceControlConfig>(() => {
    return initialTimeoutPriceControl || {
      enabled: true,
      timeoutHours: 24,
      priceMultiplier: 1.5
    };
  });

  const [isApplying, setIsApplying] = useState(false);

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    setConditionControl(getDefaultConditionControlConfig());
    setTimeoutPriceControl({
      enabled: true,
      timeoutHours: 24,
      priceMultiplier: 1.5
    });
  };

  const handleSubmit = async () => {
    setIsApplying(true);
    try {
      await onApplyBatch(conditionControl, timeoutPriceControl);
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div 
        className="bg-[#121214] border border-[#27272A] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-[#232326] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#18181B] to-[#121214]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.25)]">
              <Layers size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  一键调整所有仓单（条件 C & 条件 D）
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
                  共 {positions.length} 个活跃仓单
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                批量同步阶梯平仓、动态移动止损及超时平仓参数，各仓单持仓与止盈止损单保持独立
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 弹窗内容区域 */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">

          {/* 提示 Banner */}
          <div className="p-3.5 rounded-xl bg-purple-500/[0.08] border border-purple-500/25 flex items-start gap-3">
            <Zap className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs text-zinc-300 leading-relaxed">
              <span className="font-bold text-purple-300">一键全局生效说明：</span>
              点击底部确认后，当前设置的<strong className="text-white">【条件 C】</strong>与<strong className="text-white">【条件 D】</strong>参数将立即批量覆盖当前账号下的全部 {positions.length} 个持仓仓单，并自动固化至本地 SQLite 数据库。
            </div>
          </div>

          {/* ===================== 条件 C: 条件风控 ===================== */}
          <div className={`p-4 rounded-xl border transition-all ${
            conditionControl.enabled 
              ? 'bg-purple-950/20 border-purple-500/40 shadow-sm shadow-purple-500/10' 
              : 'bg-[#18181A] border-[#27272A]'
          }`}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800/80">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={conditionControl.enabled}
                  onChange={(e) => {
                    setConditionControl(prev => ({
                      ...prev,
                      enabled: e.target.checked
                    }));
                  }}
                  className="w-4 h-4 rounded text-purple-500 bg-zinc-900 border-zinc-700 focus:ring-purple-500"
                />
                <div className="flex items-center gap-1.5">
                  <Flame size={16} className={conditionControl.enabled ? 'text-purple-400' : 'text-zinc-400'} />
                  <span className="text-sm font-bold text-white">条件 C：条件风控 (阶梯分批平仓 & 动态回撤移动止损)</span>
                </div>
              </label>

              <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                conditionControl.enabled ? 'bg-purple-500/20 text-purple-300 font-semibold' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {conditionControl.enabled ? '已勾选启用 (默认)' : '未勾选'}
              </span>
            </div>

            {/* 条件 C 内部选项 */}
            <div className={`space-y-4 text-xs transition-opacity ${conditionControl.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              
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
                  {conditionControl.stageCloseRules.map((stage, idx) => {
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
                                setConditionControl(prev => {
                                  const updatedStages = [...prev.stageCloseRules];
                                  updatedStages[idx] = { ...updatedStages[idx], enabled: checked };
                                  return {
                                    ...prev,
                                    stageCloseRules: updatedStages
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
                                  setConditionControl(prev => {
                                    const updatedStages = [...prev.stageCloseRules];
                                    updatedStages[idx] = { ...updatedStages[idx], targetN: val };
                                    return {
                                      ...prev,
                                      stageCloseRules: updatedStages
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
                                  setConditionControl(prev => {
                                    const updatedStages = [...prev.stageCloseRules];
                                    updatedStages[idx] = { ...updatedStages[idx], closeRatio: val };
                                    return {
                                      ...prev,
                                      stageCloseRules: updatedStages
                                    };
                                  });
                                }}
                                className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-emerald-400 font-bold focus:outline-hidden focus:border-purple-500"
                              />
                              <span className="text-zinc-400 text-xs">%</span>
                            </div>

                            {/* 待触发标签 */}
                            <div className="text-[10px] font-mono">
                              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                待触发
                              </span>
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
                    <div>• 第3组（N=30 开启）：触达 N=30 时，平仓现有仓位 50 × 100% = 50 张，全仓平仓出场</div>
                  </div>
                </div>
              </div>

              {/* 子选项 2: N值动态移动回撤止损调整 */}
              <div className="bg-[#121214] p-3.5 rounded-xl border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={conditionControl.trailingStopRule.enabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setConditionControl(prev => ({
                          ...prev,
                          trailingStopRule: {
                            ...prev.trailingStopRule,
                            enabled: checked
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
                    conditionControl.trailingStopRule.enabled 
                      ? 'bg-purple-500/10 text-purple-300 font-bold' 
                      : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {conditionControl.trailingStopRule.enabled ? '已勾选生效 (默认)' : '未勾选'}
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
                        value={conditionControl.trailingStopRule.minN}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setConditionControl(prev => ({
                            ...prev,
                            trailingStopRule: {
                              ...prev.trailingStopRule,
                              minN: val
                            }
                          }));
                        }}
                        className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-amber-300 font-bold focus:outline-hidden focus:border-purple-500"
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
                        value={conditionControl.trailingStopRule.drawdownRatio}
                        onChange={(e) => {
                          const val = Math.min(99, Math.max(1, parseFloat(e.target.value) || 1));
                          setConditionControl(prev => ({
                            ...prev,
                            trailingStopRule: {
                              ...prev.trailingStopRule,
                              drawdownRatio: val
                            }
                          }));
                        }}
                        className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-rose-300 font-bold focus:outline-hidden focus:border-purple-500"
                      />
                      <span className="text-zinc-400 text-xs">%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#0D0D0E] p-2.5 rounded-lg border border-zinc-800 text-[11px] text-zinc-400 font-mono">
                  <span className="text-zinc-500">动态移动止损公式: </span>
                  <span className="text-zinc-200">开仓价 × N × (1 - 回撤比例)</span>
                </div>
              </div>

            </div>
          </div>

          {/* ===================== 条件 D: 超时未达预期倍数平仓 ===================== */}
          <div className={`p-4 rounded-xl border transition-all ${
            timeoutPriceControl.enabled
              ? 'bg-amber-950/20 border-amber-500/40 shadow-sm shadow-amber-500/10'
              : 'bg-[#18181A] border-[#27272A]'
          }`}>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800/80">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={timeoutPriceControl.enabled}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setTimeoutPriceControl(prev => ({
                      ...prev,
                      enabled: isChecked
                    }));
                  }}
                  className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500"
                />
                <div className="flex items-center gap-1.5">
                  <Timer size={16} className={timeoutPriceControl.enabled ? 'text-amber-400' : 'text-zinc-400'} />
                  <span className="text-sm font-bold text-white">条件 D：超时涨幅未达预期平仓（默认开启）</span>
                </div>
              </label>

              <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                timeoutPriceControl.enabled ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {timeoutPriceControl.enabled ? '已勾选生效' : '未勾选'}
              </span>
            </div>

            <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
              该仓单自下单开始后满设定小时数时，若币价未超过该仓单开仓价的设定倍数，则自动市价平仓。默认 24 小时未超 1.5 倍开仓价自动平仓。每张仓单独立统计各自数据。
            </p>

            {/* 参数配置区域 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1.5 flex items-center justify-between">
                  <span>检查等待时长 (小时)</span>
                  <span className="text-[10px] text-zinc-500 font-mono">默认 24 小时</span>
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.5"
                    min="0.1"
                    disabled={!timeoutPriceControl.enabled}
                    value={timeoutPriceControl.timeoutHours}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setTimeoutPriceControl(prev => ({
                        ...prev,
                        timeoutHours: val
                      }));
                    }}
                    className="w-full bg-[#121214] border border-[#333336] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="24"
                  />
                  <Clock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1.5 flex items-center justify-between">
                  <span>目标开仓价倍数 (倍)</span>
                  <span className="text-[10px] text-zinc-500 font-mono">默认 1.5 倍</span>
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.1"
                    min="0.1"
                    disabled={!timeoutPriceControl.enabled}
                    value={timeoutPriceControl.priceMultiplier}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setTimeoutPriceControl(prev => ({
                        ...prev,
                        priceMultiplier: val
                      }));
                    }}
                    className="w-full bg-[#121214] border border-[#333336] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="1.5"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">x</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* 底部确认与关闭操作栏 */}
        <div className="px-6 py-4 border-t border-[#232326] bg-[#141416] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors border border-white/5 cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>重置默认</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              取消
            </button>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isApplying || positions.length === 0}
            className="px-6 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:brightness-110 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-500/25 transition-all flex items-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 size={15} />
            <span>{isApplying ? '正在批量应用中...' : `一键应用至所有仓单 (共 ${positions.length} 个)`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchRiskCandDModal;
