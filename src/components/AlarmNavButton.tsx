import React from 'react';
import { Bell, Power } from 'lucide-react';
import { AlarmSettings } from '../types';

interface AlarmNavButtonProps {
  settings: AlarmSettings;
  onOpenModal: () => void;
  onToggleGlobal: () => void;
}

export const AlarmNavButton: React.FC<AlarmNavButtonProps> = ({
  settings,
  onOpenModal,
  onToggleGlobal,
}) => {
  const activeAlarms = settings.alarms.filter(a => a.enabled);
  const activeCount = activeAlarms.length;

  // Calculate next alarm time
  const nextAlarmStr = (() => {
    if (!settings.enabled || activeAlarms.length === 0) return null;
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    // Sort active alarms by minutes
    const sorted = [...activeAlarms].sort((a, b) => {
      const [ha, ma] = a.time.split(':').map(Number);
      const [hb, mb] = b.time.split(':').map(Number);
      return (ha * 60 + ma) - (hb * 60 + mb);
    });

    // Find first alarm today after now
    const upcoming = sorted.find(a => {
      const [h, m] = a.time.split(':').map(Number);
      return (h * 60 + m) > currentMins;
    });

    if (upcoming) {
      return upcoming.time;
    }
    // Otherwise it's the first alarm tomorrow
    return sorted[0].time;
  })();

  return (
    <div 
      id="navbar-alarm-widget"
      className={`flex items-center rounded-xl border transition-all text-center relative overflow-hidden h-[50px] group select-none ${
        settings.enabled
          ? 'bg-amber-500/15 border-amber-500/35 shadow-lg shadow-amber-500/15 ring-1 ring-amber-500/20'
          : 'bg-[#141416] border-[#232326] hover:border-zinc-700'
      }`}
    >
      {/* Active pulse bar on left */}
      {settings.enabled && (
        <div className="absolute top-0 left-0 w-1 h-full bg-amber-400 opacity-60 animate-pulse" />
      )}

      {/* Main Button Area -> Opens Custom Alarm Sub-interface */}
      <button
        type="button"
        onClick={onOpenModal}
        className="flex items-center gap-2.5 px-3 h-full cursor-pointer hover:bg-white/5 transition-colors text-left"
        title="点击进入自定义闹钟设置子界面（支持多时刻设定）"
      >
        <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
          settings.enabled 
            ? 'bg-amber-500/20 text-amber-400' 
            : 'bg-zinc-800/60 text-zinc-500 group-hover:text-zinc-400'
        }`}>
          <Bell size={18} className={settings.enabled ? "animate-pulse fill-amber-400/20 text-amber-400" : "text-zinc-500"} />
        </div>

        <div className="flex flex-col justify-center min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <h3 className={`font-bold text-[16px] leading-none transition-colors ${
              settings.enabled ? 'text-amber-400' : 'text-zinc-400 group-hover:text-zinc-200'
            }`}>
              闹钟
            </h3>
            {settings.enabled && activeCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-zinc-950 text-[10px] font-mono font-black rounded-full leading-none shadow-sm">
                {activeCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-zinc-400 leading-tight mt-1 whitespace-nowrap">
            {settings.enabled 
              ? (nextAlarmStr ? `下个: ${nextAlarmStr}` : '已开启')
              : '已关闭'
            }
          </span>
        </div>
      </button>

      {/* Vertical Divider */}
      <div className={`w-[1px] h-6 ${settings.enabled ? 'bg-amber-500/30' : 'bg-zinc-800'}`} />

      {/* One-Click On/Off Toggle Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleGlobal();
        }}
        className={`px-2.5 h-full flex items-center justify-center font-bold transition-all cursor-pointer ${
          settings.enabled
            ? 'hover:bg-amber-500/20 active:scale-95'
            : 'hover:bg-white/5 active:scale-95'
        }`}
        title={settings.enabled ? "点击一键关闭闹钟 (已开启)" : "点击一键开启闹钟 (已关闭)"}
      >
        <div className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-mono font-bold transition-all ${
          settings.enabled
            ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-sm shadow-amber-500/30'
            : 'bg-[#1c1c1f] text-zinc-500 border-zinc-700/60 hover:text-zinc-300'
        }`}>
          <Power size={11} className={settings.enabled ? 'text-zinc-950' : 'text-zinc-500'} />
          <span>{settings.enabled ? '开' : '关'}</span>
        </div>
      </button>
    </div>
  );
};
