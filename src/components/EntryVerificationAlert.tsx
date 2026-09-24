import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Zap, X, ShieldAlert, Layers } from 'lucide-react';
import { Position } from '../types';

export interface VerificationAlertState {
  isRiskBlacklist: boolean;
  matchedKeyword?: string;
  hasPosition: boolean;
  position?: Position;
  symbol: string;
  timestamp: number;
}

interface EntryVerificationAlertProps {
  alertState: VerificationAlertState | null;
  onDismiss: () => void;
}

export const EntryVerificationAlert: React.FC<EntryVerificationAlertProps> = ({
  alertState,
  onDismiss
}) => {
  if (!alertState) return null;
  const { isRiskBlacklist, matchedKeyword, hasPosition, position, symbol } = alertState;

  if (!isRiskBlacklist && !hasPosition) return null;

  return (
    <AnimatePresence>
      <div className="space-y-2 mb-2">
        {/* 第2条规则：入场验证黑名单风险标的强浮动高亮 */}
        {isRiskBlacklist && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="relative overflow-hidden rounded-xl border border-red-500/70 bg-gradient-to-r from-red-950/90 via-red-900/60 to-zinc-950/80 p-3 shadow-lg shadow-red-500/20 backdrop-blur-sm"
          >
            {/* 顶部呼吸警示线 */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 via-amber-400 to-red-500 animate-pulse" />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-red-500/25 border border-red-500/50 flex items-center justify-center text-red-400 shrink-0 shadow-[0_0_10px_rgba(239,68,68,0.4)] animate-bounce">
                  <ShieldAlert size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-red-100 tracking-wider">
                      ⚠️ 风险标的，请谨慎！
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/30 text-red-200 border border-red-500/40 font-mono font-semibold">
                      命中名单: {matchedKeyword || symbol}
                    </span>
                  </div>
                  <p className="text-[11px] text-red-300/80 mt-0.5">
                    币对 <span className="font-mono font-bold text-red-200">{symbol}</span> 已被列入入场验证黑名单，请谨慎开仓！
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onDismiss}
                className="p-1 text-red-300/60 hover:text-red-100 hover:bg-red-500/20 rounded-md transition-colors"
                title="忽略提示"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}

        {/* 第3条规则：已入场持仓单的浮动高亮提示（截然不同的电光青/深海蓝视觉风格） */}
        {hasPosition && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="relative overflow-hidden rounded-xl border border-cyan-400/80 bg-gradient-to-r from-cyan-950/90 via-sky-900/60 to-zinc-950/80 p-3 shadow-lg shadow-cyan-500/20 backdrop-blur-sm"
          >
            {/* 顶部雷达扫描线 */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 animate-pulse" />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/25 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shrink-0 shadow-[0_0_10px_rgba(6,182,212,0.4)]">
                  <Zap size={16} className="text-cyan-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-cyan-100 tracking-wider">
                      ⚡ 已入场，注意重复下单！
                    </span>
                    {position && (
                      <span className={`px-1.5 py-0.5 text-[10px] rounded font-mono font-semibold border ${
                        position.side === 'BUY' 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}>
                        {position.side === 'BUY' ? '当前持多' : '当前持空'} {Math.abs(position.amount)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-cyan-300/80 mt-0.5">
                    检测到当前账户已有 <span className="font-mono font-bold text-cyan-100">{symbol}</span> 的持仓头寸，请避免误触重复开仓。
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onDismiss}
                className="p-1 text-cyan-300/60 hover:text-cyan-100 hover:bg-cyan-500/20 rounded-md transition-colors"
                title="忽略提示"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
};
