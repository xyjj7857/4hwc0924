import React, { useState } from 'react';
import { 
  X, 
  Flame, 
  Timer, 
  Layers, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Info,
  ShieldCheck,
  Zap,
  RotateCcw
} from 'lucide-react';
import { Position } from '../types';
import { 
  ConditionControlConfig, 
  TimeoutPriceControlConfig,
  getDefaultConditionControlConfig
} from '../types/positionRisk';

interface BatchPositionRiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  positions: Position[];
  onBatchApply: (
    conditionControl: ConditionControlConfig,
    timeoutPriceControl: TimeoutPriceControlConfig
  ) => void;
  formatPrice?: (symbol: string, price: number) => string;
}

export const BatchPositionRiskModal: React.FC<BatchPositionRiskModalProps> = ({
  isOpen,
  onClose,
  positions,
  onBatchApply,
  formatPrice
}) => {
  if (!isOpen) return null;

  // 内部表单状态：条件 C (默认开启, 包含3组阶梯与动态回撤止损)
  const [conditionControl, setConditionControl] = useState<ConditionControlConfig>(() => 
    getDefaultConditionControlConfig()
  );

  // 内部表单状态：条件 D (默认开启, 24小时, 1.5倍)
  const [timeoutPriceControl, setTimeoutPriceControl] = useState<TimeoutPriceControlConfig>({
    enabled: true,
    timeoutHours: 24,
    priceMultiplier: 1.5
  });

  const [isApplying, setIsApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  // 恢复默认参数
  const handleResetToDefaults = () => {
    setConditionControl(getDefaultConditionControlConfig());
    setTimeoutPriceControl({
      enabled: true,
      timeoutHours: 24,
      priceMultiplier: 1.5
    });
    setAppliedSuccess(false);
  };

  // 确认一键应用
  const handleConfirmApply = () => {
    setIsApplying(true);
    try {
      onBatchApply(conditionControl, timeoutPriceControl);
      setAppliedSuccess(true);
      setTimeout(() => {
        setIsApplying(false);
        onClose();
      }, 700);
    } catch (e) {
      console.error('Failed to batch apply position risk settings:', e);
      setIsApplying(false);
    }
  };

  const activePositionsCount = positions.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-3xl bg-[#141416] border border-[#27272A] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#232326] flex items-center justify-between bg-[#18181B]/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-sm shadow-purple-500/20">
              <Zap size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>一键设置所有仓单 条件C 与 条件D 参数</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-medium border border-purple-500/30">
                  批量管理
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                一次性为当前全部 {activePositionsCount} 个持仓单同步更新阶梯平仓、动态止损及超时倍数出场参数
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="关闭窗口"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1 text-sm">
          
          {/* 影响仓位概览条 */}
          <div className="bg-[#1A1A1E] border border-zinc-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-zinc-200">
                生效目标持仓仓单 ({activePositionsCount} 个):
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {activePositionsCount === 0 ? (
                <span className="text-xs text-zinc-500 italic">当前暂无活跃持仓单</span>
              ) : (
                positions.map((p) => {
                  const isLong = p.side === 'BUY';
                  return (
                    <span 
                      key={p.id}
                      className={`text-[11px] px-2 py-0.5 rounded-md font-mono font-bold flex items-center gap-1 border ${
                        isLong 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                          : 'bg-red-500/10 text-red-400 border-red-500/30'
                      }`}
                    >
                      <span>{p.symbol}</span>
                      <span className="text-[10px] opacity-80">{isLong ? '多' : '空'}</span>
                    </span>
                  );
                })
              )}
            </div>
          </div>

          {/* ===================== 条件 C：条件风控 ===================== */}
          <div className={`p-4 rounded-xl border transition-all ${
            conditionControl.enabled 
              ? 'bg-purple-950/20 border-purple-500/40 shadow-sm shadow-purple-500/10' 
              : 'bg-[#18181A] border-[#27272A]'
          }`}>
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-zinc-800/80">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={conditionControl.enabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConditionControl(prev => ({ ...prev, enabled: checked }));
                  }}
                  className="w-4 h-4 rounded text-purple-500 bg-zinc-900 border-zinc-700 focus:ring-purple-500 cursor-pointer"
                />
                <div className="flex items-center gap-1.5">
                  <Flame size={17} className={conditionControl.enabled ? 'text-purple-400' : 'text-zinc-400'} />
                  <span className="text-sm font-bold text-white">条件 C：条件风控 (N值阶梯平仓 & 动态回撤移动止损)</span>
                </div>
              </label>

              <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                conditionControl.enabled ? 'bg-purple-500/20 text-purple-300 font-semibold' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {conditionControl.enabled ? '已启用 (批量应用)' : '已停用'}
              </span>
            </div>

            <div className={`space-y-4 transition-opacity ${conditionControl.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              
              {/* 子选项 1: N值阶梯分批平仓 (3组独立配置) */}
              <div className="bg-[#121214] p-3.5 rounded-xl border border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={14} className="text-purple-400" />
                    <span className="font-bold text-xs sm:text-sm text-zinc-200">1. N值阶梯分批平仓 (共 3 组，每次平当时现有仓位百分比)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">
                    各组独立勾选生效
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  当任意持仓的 N值（盈利倍数）达到目标时，自动按当时<strong className="text-purple-300 font-semibold">【现有仓位】</strong>的设定百分比市价平仓。
                </p>

                {/* 3 组阶梯配置 */}
                <div className="space-y-2">
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
                                  return { ...prev, stageCloseRules: updatedStages };
                                });
                              }}
                              className="w-3.5 h-3.5 rounded text-purple-500 bg-zinc-900 border-zinc-700 focus:ring-purple-500 cursor-pointer"
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
                                    return { ...prev, stageCloseRules: updatedStages };
                                  });
                                }}
                                className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-amber-300 font-bold focus:outline-hidden focus:border-purple-500"
                              />
                            </div>

                            {/* 平仓比例输入 */}
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-zinc-400 text-xs">平现有仓位</span>
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
                                    return { ...prev, stageCloseRules: updatedStages };
                                  });
                                }}
                                className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-emerald-400 font-bold focus:outline-hidden focus:border-purple-500"
                              />
                              <span className="text-zinc-400 text-xs">%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                      className="w-3.5 h-3.5 rounded text-purple-500 bg-zinc-900 border-zinc-700 focus:ring-purple-500 cursor-pointer"
                    />
                    <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-zinc-200">
                      <TrendingUp size={14} className="text-purple-400" />
                      <span>2. N值动态移动回撤止损调整 (自动抬升币安 Algo 算法止损单)</span>
                    </div>
                  </label>

                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                    conditionControl.trailingStopRule.enabled 
                      ? 'bg-purple-500/10 text-purple-300 font-bold' 
                      : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {conditionControl.trailingStopRule.enabled ? '已勾选生效' : '未勾选'}
                  </span>
                </div>

                {/* 参数输入 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 bg-[#18181C] rounded-lg border border-purple-500/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-400 font-mono text-xs">当持仓 N &gt;= 几时启动:</span>
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
                        className="w-18 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-rose-400 font-bold focus:outline-hidden focus:border-purple-500"
                      />
                      <span className="text-zinc-400 text-xs">%</span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-400 bg-[#0D0D0E] p-2.5 rounded-lg border border-zinc-800/80 leading-relaxed">
                  公式: <span className="font-mono text-amber-300">多单止损 = 开仓价 × N × (1 - 回撤比例)</span>，当实时试算止损价优于当前挂单价时，系统自动撤销旧挂单并重新挂上最优 Algo 算法止损委托。
                </div>
              </div>

            </div>
          </div>

          {/* ===================== 条件 D：超时未达预期倍数平仓 ===================== */}
          <div className={`p-4 rounded-xl border transition-all ${
            timeoutPriceControl.enabled
              ? 'bg-amber-950/20 border-amber-500/40 shadow-sm shadow-amber-500/10'
              : 'bg-[#18181A] border-[#27272A]'
          }`}>
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-zinc-800/80">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={timeoutPriceControl.enabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setTimeoutPriceControl(prev => ({ ...prev, enabled: checked }));
                  }}
                  className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500 cursor-pointer"
                />
                <div className="flex items-center gap-1.5">
                  <Timer size={17} className={timeoutPriceControl.enabled ? 'text-amber-400' : 'text-zinc-400'} />
                  <span className="text-sm font-bold text-white">条件 D：超时涨幅未达预期平仓 (默认开启)</span>
                </div>
              </label>

              <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                timeoutPriceControl.enabled ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {timeoutPriceControl.enabled ? '已启用 (默认24h/1.5倍)' : '已停用'}
              </span>
            </div>

            <p className="text-xs text-zinc-400 mb-3.5 leading-relaxed">
              每个仓单自下单开始后满设定小时数时，若币价未超过该仓单开仓价的设定倍数，则自动市价全流程平仓出场。每张仓单各自独立统计时间与开仓倍数。
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1.5 flex items-center justify-between">
                  <span>检查等待时长 (小时)</span>
                  <span className="text-[10px] text-zinc-500 font-mono">推荐 24 小时</span>
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.5"
                    min="0.1"
                    disabled={!timeoutPriceControl.enabled}
                    value={timeoutPriceControl.timeoutHours}
                    onChange={(e) => {
                      const val = Math.max(0.1, parseFloat(e.target.value) || 24);
                      setTimeoutPriceControl(prev => ({ ...prev, timeoutHours: val }));
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
                  <span className="text-[10px] text-zinc-500 font-mono">推荐 1.5 倍</span>
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.1"
                    min="0.1"
                    disabled={!timeoutPriceControl.enabled}
                    value={timeoutPriceControl.priceMultiplier}
                    onChange={(e) => {
                      const val = Math.max(0.1, parseFloat(e.target.value) || 1.5);
                      setTimeoutPriceControl(prev => ({ ...prev, priceMultiplier: val }));
                    }}
                    className="w-full bg-[#121214] border border-[#333336] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="1.5"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-xs">倍</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#232326] flex flex-wrap items-center justify-between gap-3 bg-[#18181B]/90 shrink-0">
          <button
            type="button"
            onClick={handleResetToDefaults}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-zinc-800 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>重置为默认值 (1.5倍/24h)</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
            >
              取消
            </button>

            <button
              type="button"
              onClick={handleConfirmApply}
              disabled={isApplying || activePositionsCount === 0}
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer active:scale-95 shadow-md ${
                appliedSuccess
                  ? 'bg-emerald-500 text-black shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {appliedSuccess ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>已成功应用至所有仓单！</span>
                </>
              ) : (
                <>
                  <Zap size={16} />
                  <span>⚡ 确认一键应用到所有仓单 ({activePositionsCount} 个)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
export default BatchPositionRiskModal;
