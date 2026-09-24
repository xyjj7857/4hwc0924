import React, { useState, useMemo } from 'react';
import { 
  X, 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Percent, 
  DollarSign, 
  HelpCircle, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  Shield,
  Layers,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

interface KellyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance?: number;
  onApplyPositionSize?: (size: number) => void;
}

export const KellyModal: React.FC<KellyModalProps> = ({
  isOpen,
  onClose,
  currentBalance = 0,
  onApplyPositionSize
}) => {
  // Input parameters:
  // p: Win Rate (%)
  // R: Profit rate per winning trade relative to position (%)
  // L: Loss rate per losing trade relative to position (%)
  // z: Initial capital (USDT)
  // n: Number of compound trades
  const [pInput, setPInput] = useState<string>('60'); // 60%
  const [rInput, setRInput] = useState<string>('20'); // 20%
  const [lInput, setLInput] = useState<string>('10'); // 10%
  const [zInput, setZInput] = useState<string>(currentBalance > 0 ? currentBalance.toFixed(2) : '1000');
  const [nInput, setNInput] = useState<string>('30'); // 30 trades
  const [selectedFraction, setSelectedFraction] = useState<'full' | 'half' | 'quarter'>('full');

  // Sync current balance if user wants to use account balance
  const handleUseCurrentBalance = () => {
    if (currentBalance > 0) {
      setZInput(currentBalance.toFixed(2));
    }
  };

  // Preset quick strategy scenarios
  const applyPreset = (preset: 'conservative' | 'balanced' | 'aggressive') => {
    if (preset === 'conservative') {
      setPInput('55');
      setRInput('15');
      setLInput('8');
      setNInput('30');
    } else if (preset === 'balanced') {
      setPInput('60');
      setRInput('20');
      setLInput('10');
      setNInput('30');
    } else if (preset === 'aggressive') {
      setPInput('65');
      setRInput('30');
      setLInput('12');
      setNInput('30');
    }
  };

  // Real-time calculation based on the Kelly formula:
  // f* = (p / L) - ((1 - p) / R)
  const calculation = useMemo(() => {
    const p = parseFloat(pInput) / 100; // e.g. 0.60
    const R = parseFloat(rInput) / 100; // e.g. 0.20
    const L = parseFloat(lInput) / 100; // e.g. 0.10
    const z = parseFloat(zInput);       // e.g. 1000
    const n = Math.max(1, Math.min(1000, parseInt(nInput, 10) || 1));

    if (isNaN(p) || isNaN(R) || isNaN(L) || isNaN(z) || p <= 0 || p >= 1 || R <= 0 || L <= 0 || z <= 0) {
      return {
        isValid: false,
        error: '请输入有效的正数值（胜率须在 0% ~ 100% 之间，收益率、亏损率与本金均须大于 0）',
        fStar: 0,
        fStarPercent: '0.00%',
        positionAmount: 0,
        Z: 0,
        netProfit: 0,
        roiPercent: 0,
        gFactor: 1,
        expectedSingleReturn: 0,
        edge: 0,
        chartData: []
      };
    }

    // Mathematical Edge E = p * R - (1 - p) * L
    const edge = p * R - (1 - p) * L;

    // Exact formula from image: f* = p / L - (1 - p) / R
    const fStar = (p / L) - ((1 - p) / R);

    // If edge is non-positive or f* <= 0
    if (fStar <= 0) {
      return {
        isValid: true,
        isNegativeEdge: true,
        error: null,
        p,
        R,
        L,
        z,
        n,
        edge,
        fStar: 0,
        fStarPercent: '0.00%',
        positionAmount: 0,
        Z: z,
        netProfit: 0,
        roiPercent: 0,
        gFactor: 1,
        expectedSingleReturn: 0,
        chartData: Array.from({ length: Math.min(n + 1, 51) }, (_, i) => ({
          round: i,
          capital: Math.round(z * 100) / 100
        }))
      };
    }

    // Effective fraction based on user selection
    const fractionMultiplier = selectedFraction === 'half' ? 0.5 : selectedFraction === 'quarter' ? 0.25 : 1.0;
    const effectiveF = fStar * fractionMultiplier;

    // Geometric growth factor per trade: G = (1 + f * R)^p * (1 - f * L)^(1 - p)
    const winTerm = 1 + effectiveF * R;
    const lossTerm = Math.max(0.000001, 1 - effectiveF * L);
    const gFactor = Math.pow(winTerm, p) * Math.pow(lossTerm, 1 - p);
    const expectedSingleReturn = (gFactor - 1) * 100;

    // Final compounding result Z = z * G^n
    const Z = z * Math.pow(gFactor, n);
    const netProfit = Z - z;
    const roiPercent = ((Z - z) / z) * 100;

    // Position amount for single trade
    const positionAmount = z * effectiveF;

    // Chart curve points
    const stepCount = Math.min(n, 50);
    const stepInterval = n / stepCount;
    const chartData = [];
    for (let i = 0; i <= stepCount; i++) {
      const currentRound = Math.round(i * stepInterval);
      const cap = z * Math.pow(gFactor, currentRound);
      chartData.push({
        round: currentRound,
        capital: isFinite(cap) && cap < 1e12 ? Math.round(cap * 100) / 100 : 1e12
      });
    }

    return {
      isValid: true,
      isNegativeEdge: false,
      error: null,
      p,
      R,
      L,
      z,
      n,
      edge,
      fStar,
      effectiveF,
      fStarPercent: (fStar * 100).toFixed(2) + '%',
      effectiveFPercent: (effectiveF * 100).toFixed(2) + '%',
      positionAmount: Math.round(positionAmount * 100) / 100,
      Z: isFinite(Z) && Z < 1e15 ? Math.round(Z * 100) / 100 : Z,
      netProfit: isFinite(netProfit) && netProfit < 1e15 ? Math.round(netProfit * 100) / 100 : netProfit,
      roiPercent: isFinite(roiPercent) ? Math.round(roiPercent * 100) / 100 : 0,
      gFactor,
      expectedSingleReturn,
      chartData
    };
  }, [pInput, rInput, lInput, zInput, nInput, selectedFraction]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl bg-[#111827] border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-500/10 overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-gradient-to-r from-amber-500/10 via-[#111827] to-yellow-500/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-100 flex items-center gap-2">
                  凯利仓位与复利计算器
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Kelly Formula
                  </span>
                </h3>
                <p className="text-xs text-gray-400">结合胜率与盈亏比，快速解构最优复利仓位比 f* 与最终收益 Z</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Formula Display Banner */}
          <div className="px-5 py-3 bg-[#0c121d] border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-medium">数学公式：</span>
              <div className="px-3 py-1 bg-[#1a2333] border border-amber-500/30 rounded-lg text-amber-300 font-mono text-sm tracking-wide shadow-inner flex items-center gap-2">
                <span className="font-bold">f*</span> = <span>p / L</span> - <span>(1 - p) / R</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500">预设模板:</span>
              <button 
                onClick={() => applyPreset('conservative')} 
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] transition-colors"
              >
                稳健
              </button>
              <button 
                onClick={() => applyPreset('balanced')} 
                className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] transition-colors"
              >
                均衡
              </button>
              <button 
                onClick={() => applyPreset('aggressive')} 
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] transition-colors"
              >
                激进
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5 max-h-[78vh] overflow-y-auto">
            {/* Input Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* p (Win Rate) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-emerald-400" />
                    胜率 p (%)
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    = {(parseFloat(pInput) / 100 || 0).toFixed(2)}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="99.9"
                    value={pInput}
                    onChange={(e) => setPInput(e.target.value)}
                    placeholder="如: 60"
                    className="w-full bg-[#1e293b]/70 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-gray-500">%</span>
                </div>
              </div>

              {/* z (Initial Capital) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                    初始本金 z (USDT)
                  </span>
                  {currentBalance > 0 && (
                    <button
                      type="button"
                      onClick={handleUseCurrentBalance}
                      className="text-[11px] text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                    >
                      填入当前余额 ({currentBalance.toFixed(2)})
                    </button>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="1"
                    value={zInput}
                    onChange={(e) => setZInput(e.target.value)}
                    placeholder="如: 1000"
                    className="w-full bg-[#1e293b]/70 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-gray-500">USDT</span>
                </div>
              </div>

              {/* R (Profit Rate on Winning Trade) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    盈利收益率 R (%)
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    相对于下单仓位
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={rInput}
                    onChange={(e) => setRInput(e.target.value)}
                    placeholder="如: 20"
                    className="w-full bg-[#1e293b]/70 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-gray-500">%</span>
                </div>
              </div>

              {/* L (Loss Rate on Losing Trade) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    亏损亏损率 L (%)
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    相对于下单仓位
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={lInput}
                    onChange={(e) => setLInput(e.target.value)}
                    placeholder="如: 10"
                    className="w-full bg-[#1e293b]/70 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-red-500 transition-colors font-mono"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-gray-500">%</span>
                </div>
              </div>

              {/* n (Compound Rounds) */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    复利交易轮数 N
                  </span>
                  <div className="flex gap-1">
                    {[10, 20, 30, 50, 100].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setNInput(num.toString())}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                          nInput === num.toString() 
                            ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40' 
                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={nInput}
                    onChange={(e) => setNInput(e.target.value)}
                    placeholder="如: 30"
                    className="w-full bg-[#1e293b]/70 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-gray-500">笔 / 轮</span>
                </div>
              </div>
            </div>

            {/* Error or Notice message */}
            {!calculation.isValid && (
              <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{calculation.error}</span>
              </div>
            )}

            {calculation.isValid && calculation.isNegativeEdge && (
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-0.5">数学期望为负或无优势 (Edge ≤ 0)</div>
                  <p className="text-amber-200/80 leading-relaxed">
                    根据凯利公式，此时最优策略为 <span className="font-bold font-mono">f* = 0</span>（不建议开仓，否则长期复利将必然导致资本衰减）。
                  </p>
                </div>
              </div>
            )}

            {/* Fraction Kelly Selector (Full / Half / Quarter) */}
            {calculation.isValid && !calculation.isNegativeEdge && (
              <div className="bg-[#182335]/70 border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                <div className="text-xs text-gray-300 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>仓位执行模式：</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedFraction('full')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedFraction === 'full'
                        ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    全凯利 (100%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFraction('half')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedFraction === 'half'
                        ? 'bg-emerald-500 text-black font-bold shadow-md shadow-emerald-500/20'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    半凯利 (50% 推荐)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFraction('quarter')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedFraction === 'quarter'
                        ? 'bg-blue-500 text-white font-bold shadow-md shadow-blue-500/20'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    1/4 凯利 (稳健)
                  </button>
                </div>
              </div>
            )}

            {/* Core Output Cards: f* and Z */}
            {calculation.isValid && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Result Card: f* */}
                <div className="p-4 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-[#182335] to-yellow-500/5 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      最优仓位比 (f*)
                    </span>
                    <span className="text-[11px] font-mono text-gray-400">
                      公式: p/L - (1-p)/R
                    </span>
                  </div>
                  <div className="text-3xl font-extrabold font-mono text-amber-400 tracking-tight flex items-baseline gap-2">
                    {calculation.effectiveFPercent || calculation.fStarPercent}
                    {selectedFraction !== 'full' && (
                      <span className="text-xs text-gray-400 font-normal">
                        (全凯利 {calculation.fStarPercent})
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
                    <span className="text-gray-400">单笔建议下单金额：</span>
                    <span className="font-mono font-bold text-gray-100">
                      {calculation.positionAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                    </span>
                  </div>
                  {onApplyPositionSize && calculation.positionAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onApplyPositionSize(calculation.positionAmount);
                        onClose();
                      }}
                      className="mt-3 w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      一键应用到当前“下单数量”
                    </button>
                  )}
                </div>

                {/* Result Card: Z (Compounding Result) */}
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-[#182335] to-teal-500/5 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      最终复利资金 (Z)
                    </span>
                    <span className="text-[11px] font-mono text-gray-400">
                      经过 {calculation.n} 轮复利
                    </span>
                  </div>
                  <div className="text-3xl font-extrabold font-mono text-emerald-400 tracking-tight truncate">
                    {typeof calculation.Z === 'number' 
                      ? calculation.Z.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : calculation.Z} 
                    <span className="text-sm text-emerald-500/80 font-normal ml-1">USDT</span>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
                    <span className="text-gray-400">累计预期净收益：</span>
                    <span className={`font-mono font-bold ${calculation.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {calculation.netProfit >= 0 ? '+' : ''}
                      {typeof calculation.netProfit === 'number' 
                        ? calculation.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                        : calculation.netProfit} USDT ({calculation.roiPercent >= 0 ? '+' : ''}{calculation.roiPercent}%)
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-gray-400">单笔几何期望增长率：</span>
                    <span className="font-mono text-gray-200">
                      {calculation.expectedSingleReturn >= 0 ? '+' : ''}{calculation.expectedSingleReturn.toFixed(2)}% / 笔
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Growth Curve Chart */}
            {calculation.isValid && calculation.chartData.length > 1 && (
              <div className="p-4 rounded-xl border border-white/10 bg-[#0d131f] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                    复利资本增长模拟曲线 (0 ~ {calculation.n} 轮)
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono">
                    起点: {calculation.z} USDT → 终点: {typeof calculation.Z === 'number' ? calculation.Z.toFixed(0) : calculation.Z} USDT
                  </span>
                </div>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={calculation.chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="kellyGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                      <XAxis 
                        dataKey="round" 
                        stroke="#6b7280" 
                        fontSize={10} 
                        tickLine={false} 
                        unit="轮"
                      />
                      <YAxis 
                        stroke="#6b7280" 
                        fontSize={10} 
                        tickLine={false}
                        tickFormatter={(val) => val >= 10000 ? `${(val/1000).toFixed(0)}k` : val}
                      />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: '#111827', 
                          borderColor: '#374151', 
                          borderRadius: '0.5rem',
                          fontSize: '12px'
                        }}
                        formatter={(val: any) => [`${Number(val).toLocaleString()} USDT`, '账户总资本']}
                        labelFormatter={(label) => `第 ${label} 轮交易`}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="capital" 
                        stroke="#10B981" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#kellyGradient)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Explanation / Advice */}
            <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.02] text-xs text-gray-400 space-y-1.5 leading-relaxed">
              <div className="flex items-center gap-1.5 text-gray-300 font-medium">
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>凯利公式交易心得与风险控制：</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-gray-400 pl-1 text-[11px]">
                <li><strong className="text-gray-300">全凯利 (Full Kelly)</strong> 追求数学上理论最快的复利增长率，但波动与最大回撤极大。</li>
                <li><strong className="text-emerald-300">半凯利 (Half Kelly)</strong>：在实盘交易中被广泛推荐，能削减约 50% 的账户回撤深度，却保留全凯利 75% 的复合增长速度。</li>
                <li>当出现连续黑天鹅回撤时，可随时重新基于当前剩余本金计算新的下单仓位。</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-white/10 bg-[#0d131f] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-gray-300 hover:text-gray-100 hover:bg-white/10 transition-colors"
            >
              关闭
            </button>
            {onApplyPositionSize && calculation.isValid && calculation.positionAmount > 0 && (
              <button
                type="button"
                onClick={() => {
                  onApplyPositionSize(calculation.positionAmount);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                应用仓位 ({calculation.positionAmount.toFixed(2)} USDT)
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
