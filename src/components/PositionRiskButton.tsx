import React, { useState, useEffect } from 'react';
import { Swords, Clock, Flame, ShieldAlert, Target } from 'lucide-react';
import { Position, OpenOrder } from '../types';
import { PositionRiskConfig, getRiskButtonDisplay, RiskButtonDisplay, detectPositionTpSl } from '../types/positionRisk';

interface PositionRiskButtonProps {
  position: Position;
  config?: PositionRiskConfig;
  openOrders?: OpenOrder[];
  formatPrice?: (symbol: string, price: number) => string;
  onClick: () => void;
}

export const PositionRiskButton: React.FC<PositionRiskButtonProps> = ({
  position,
  config,
  openOrders = [],
  formatPrice,
  onClick
}) => {
  // 检测该币对是否有对应的止盈单或止损单
  const { hasTp, hasSl, tpPrice, slPrice } = detectPositionTpSl(position, openOrders, config);
  const displayType: RiskButtonDisplay = getRiskButtonDisplay(config, openOrders, position);

  // 格式化价格辅助函数
  const formatPriceVal = (price?: number): string => {
    if (!price || price <= 0) return '';
    if (formatPrice) return formatPrice(position.symbol, price);
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  // 实时倒计时（在时间风控开启且已激活时持续计算）
  const [remainingMinutesText, setRemainingMinutesText] = useState<string>('');

  useEffect(() => {
    if (!config?.timeControl?.enabled || !config.timeControl.activatedAt) {
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
  }, [config?.timeControl?.enabled, config?.timeControl?.activatedAt, config?.timeControl?.maxHoldMinutes]);

  // 1. 若同时存在止盈与止损挂单，则同时展示止盈与止损
  if (hasTp && hasSl) {
    const tpPriceText = formatPriceVal(tpPrice);
    const slPriceText = formatPriceVal(slPrice);

    return (
      <button
        type="button"
        id={`btn-risk-${position.id}`}
        onClick={onClick}
        title={`【已生效: 止盈 + 止损】\n🎯 止盈: ${tpPriceText || '已挂单'}\n🛡️ 止损: ${slPriceText || '已挂单'}${remainingMinutesText ? `\n⏱️ 时间风控剩余: ${remainingMinutesText}` : ''}\n点击打开专属风控面板调整`}
        className="w-[210px] h-[47px] rounded-md border border-[#2e2e34] bg-[#141416] hover:border-zinc-500 transition-all flex items-center justify-between p-1 gap-1.5 active:scale-95 shadow-sm relative group cursor-pointer shrink-0"
      >
        {/* 左侧：止盈 */}
        <div className="flex-1 h-full rounded flex flex-col items-center justify-center bg-emerald-950/40 border border-emerald-500/40 group-hover:border-emerald-400/70 transition-colors px-1">
          <div className="flex items-center gap-1 text-emerald-400 font-bold text-[13px] leading-tight">
            <Target size={12} className="shrink-0" />
            <span>止盈</span>
          </div>
          {tpPriceText ? (
            <div className="text-[11.5px] font-mono font-bold text-emerald-200 truncate max-w-[84px]">
              {tpPriceText}
            </div>
          ) : (
            <div className="text-[10px] text-emerald-400/80 font-mono">已挂单</div>
          )}
        </div>

        {/* 中间分隔线 */}
        <div className="h-5 w-[1px] bg-zinc-700/60 shrink-0" />

        {/* 右侧：止损 */}
        <div className="flex-1 h-full rounded flex flex-col items-center justify-center bg-rose-950/40 border border-rose-500/40 group-hover:border-rose-400/70 transition-colors px-1">
          <div className="flex items-center gap-1 text-rose-400 font-bold text-[13px] leading-tight">
            <ShieldAlert size={12} className="shrink-0" />
            <span>止损</span>
          </div>
          {slPriceText ? (
            <div className="text-[11.5px] font-mono font-bold text-rose-200 truncate max-w-[84px]">
              {slPriceText}
            </div>
          ) : (
            <div className="text-[10px] text-rose-400/80 font-mono">已挂单</div>
          )}
        </div>

        {/* 若时间风控倒计时也处于开启状态，右上角徽章提示 */}
        {remainingMinutesText && (
          <span 
            className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 bg-amber-500 text-black text-[9px] font-mono font-bold rounded-full shadow-md border border-amber-300"
            title={`时间风控剩余: ${remainingMinutesText}`}
          >
            ⏱️{remainingMinutesText}
          </span>
        )}
      </button>
    );
  }

  // 2. 若该币对仅有对应的止盈单，则展示止盈
  if (hasTp) {
    const tpPriceText = formatPriceVal(tpPrice);

    return (
      <button
        type="button"
        id={`btn-risk-${position.id}`}
        onClick={onClick}
        title={`【已生效: 止盈挂单】\n🎯 止盈价: ${tpPriceText || '已挂单'}${remainingMinutesText ? `\n⏱️ 时间风控剩余: ${remainingMinutesText}` : ''}\n点击打开专属风控面板调整`}
        className="w-[210px] h-[47px] rounded-md border border-emerald-500/60 bg-emerald-950/40 hover:bg-emerald-900/40 hover:border-emerald-400 text-emerald-300 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm relative group cursor-pointer shrink-0"
      >
        <Target size={18} className="text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-[16.5px] font-bold text-emerald-300">止盈</span>
          {tpPriceText && (
            <span className="text-[13.5px] font-mono font-bold text-emerald-200">
              ({tpPriceText})
            </span>
          )}
        </div>
        {remainingMinutesText && (
          <span 
            className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 bg-amber-500 text-black text-[9px] font-mono font-bold rounded-full shadow-md border border-amber-300"
            title={`时间风控剩余: ${remainingMinutesText}`}
          >
            ⏱️{remainingMinutesText}
          </span>
        )}
      </button>
    );
  }

  // 3. 若该币对仅有止损，则展示止损
  if (hasSl) {
    const slPriceText = formatPriceVal(slPrice);

    return (
      <button
        type="button"
        id={`btn-risk-${position.id}`}
        onClick={onClick}
        title={`【已生效: 止损挂单】\n🛡️ 止损价: ${slPriceText || '已挂单'}${remainingMinutesText ? `\n⏱️ 时间风控剩余: ${remainingMinutesText}` : ''}\n点击打开专属风控面板调整`}
        className="w-[210px] h-[47px] rounded-md border border-rose-500/60 bg-rose-950/40 hover:bg-rose-900/40 hover:border-rose-400 text-rose-300 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm relative group cursor-pointer shrink-0"
      >
        <ShieldAlert size={18} className="text-rose-400 shrink-0 group-hover:scale-110 transition-transform" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-[16.5px] font-bold text-rose-300">止损</span>
          {slPriceText && (
            <span className="text-[13.5px] font-mono font-bold text-rose-200">
              ({slPriceText})
            </span>
          )}
        </div>
        {remainingMinutesText && (
          <span 
            className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 bg-amber-500 text-black text-[9px] font-mono font-bold rounded-full shadow-md border border-amber-300"
            title={`时间风控剩余: ${remainingMinutesText}`}
          >
            ⏱️{remainingMinutesText}
          </span>
        )}
      </button>
    );
  }

  // 4. 两者均无：其他核心逻辑保持不变 (条件风控 > 时间风控 > 死斗)
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
      title="当前持仓未配置止盈止损或时间/条件风控，默认处于：死斗模式（点击打开专属风控设置）"
      className="w-[210px] h-[47px] rounded-md text-[16.5px] font-bold border transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm bg-gradient-to-r from-red-950/40 to-zinc-900 border-red-600/50 text-red-300 hover:border-red-500 hover:text-red-100 hover:from-red-900/40 shrink-0"
    >
      <Swords size={18} className="text-red-400 shrink-0" />
      <span>死斗</span>
    </button>
  );
};
