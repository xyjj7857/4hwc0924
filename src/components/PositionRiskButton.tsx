import React, { useState, useEffect } from 'react';
import { Swords, Clock, Flame, ShieldAlert } from 'lucide-react';
import { Position } from '../types';
import { PositionRiskConfig, getRiskButtonDisplay, RiskButtonDisplay } from '../types/positionRisk';

interface PositionRiskButtonProps {
  position: Position;
  config?: PositionRiskConfig;
  onClick: () => void;
}

export const PositionRiskButton: React.FC<PositionRiskButtonProps> = ({
  position,
  config,
  onClick
}) => {
  const displayType: RiskButtonDisplay = getRiskButtonDisplay(config);

  // 实时倒计时（仅在时间风控生效时）
  const [remainingMinutesText, setRemainingMinutesText] = useState<string>('');

  useEffect(() => {
    if (displayType !== '时间风控' || !config?.timeControl?.enabled || !config.timeControl.activatedAt) {
      setRemainingMinutesText('');
      return;
    }

    const updateRemaining = () => {
      const activatedAt = config.timeControl.activatedAt!;
      const totalMs = (Number(config.timeControl.maxHoldMinutes) || 240) * 60 * 1000;
      const elapsedMs = Date.now() - activatedAt;
      const leftMs = Math.max(0, totalMs - elapsedMs);
      
      if (leftMs <= 0) {
        setRemainingMinutesText('超时');
        return;
      }
      const totalSeconds = Math.floor(leftMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      if (minutes >= 60) {
        const hours = (minutes / 60).toFixed(1);
        setRemainingMinutesText(`${hours}h`);
      } else if (minutes >= 1) {
        setRemainingMinutesText(`${minutes}m${seconds < 10 ? '0' : ''}${seconds}s`);
      } else {
        setRemainingMinutesText(`${seconds}s`);
      }
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [displayType, config]);

  // 根据优先级规则展示不同样式
  if (displayType === '条件风控') {
    return (
      <button
        type="button"
        id={`btn-risk-${position.id}`}
        onClick={onClick}
        title="当前持仓已启用专属：条件风控（点击调整）"
        className="w-[210px] h-[47px] rounded-md text-[16.5px] font-bold border transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm bg-purple-950/40 border-purple-500/60 text-purple-300 hover:bg-purple-900/40 hover:text-purple-100 hover:border-purple-400 shrink-0"
      >
        <Flame size={18} className="text-purple-400 shrink-0" />
        <span>条件风控</span>
      </button>
    );
  }

  if (displayType === '时间风控') {
    const fallbackText = config?.timeControl?.maxHoldMinutes ? `${config.timeControl.maxHoldMinutes}m` : '0s';
    const timeText = remainingMinutesText || fallbackText;

    return (
      <button
        type="button"
        id={`btn-risk-${position.id}`}
        onClick={onClick}
        title={`当前持仓已启用专属：时间风控（最大持仓 ${config?.timeControl.maxHoldMinutes} 分钟，点击调整）`}
        className="w-[210px] h-[47px] rounded-md text-[16.5px] font-bold border transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm bg-amber-950/40 border-amber-500/60 text-amber-300 hover:bg-amber-900/40 hover:text-amber-100 hover:border-amber-400 shrink-0"
      >
        <Clock size={18} className="text-amber-400 shrink-0" />
        <span className="text-[16.5px] font-mono font-bold text-amber-200 shrink-0">
          {timeText}
        </span>
      </button>
    );
  }

  // 默认展示：死斗
  return (
    <button
      type="button"
      id={`btn-risk-${position.id}`}
      onClick={onClick}
      title="当前持仓未配置时间/条件风控，默认处于：死斗模式（点击打开专属风控设置）"
      className="w-[210px] h-[47px] rounded-md text-[16.5px] font-bold border transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm bg-gradient-to-r from-red-950/40 to-zinc-900 border-red-600/50 text-red-300 hover:border-red-500 hover:text-red-100 hover:from-red-900/40 shrink-0"
    >
      <Swords size={18} className="text-red-400 shrink-0" />
      <span>死斗</span>
    </button>
  );
};
