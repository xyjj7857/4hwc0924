import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  BellRing, 
  X, 
  Plus, 
  Trash2, 
  Volume2, 
  VolumeX, 
  Play, 
  Check, 
  Clock, 
  Sparkles, 
  Power,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AlarmItem, AlarmSettings, AlarmSoundType } from '../types';
import { playAlarmSound } from '../utils/alarmAudio';

interface AlarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AlarmSettings;
  onUpdateSettings: (newSettings: AlarmSettings) => void;
  isMuted: boolean;
}

export const AlarmModal: React.FC<AlarmModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isMuted,
}) => {
  const [newTime, setNewTime] = useState('08:00');
  const [newLabel, setNewLabel] = useState('');
  const [selectedSound, setSelectedSound] = useState<AlarmSoundType>('chime');
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  // Live ticking clock for the header
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      setCurrentTimeStr(`${h}:${m}:${s}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!isOpen) return null;

  // Toggle master on/off
  const handleToggleGlobal = () => {
    onUpdateSettings({
      ...settings,
      enabled: !settings.enabled,
    });
  };

  // Toggle individual alarm
  const handleToggleAlarm = (id: string) => {
    const updated = settings.alarms.map(a => 
      a.id === id ? { ...a, enabled: !a.enabled } : a
    );
    onUpdateSettings({ ...settings, alarms: updated });
  };

  // Delete alarm
  const handleDeleteAlarm = (id: string) => {
    const updated = settings.alarms.filter(a => a.id !== id);
    onUpdateSettings({ ...settings, alarms: updated });
  };

  // Add new alarm
  const handleAddAlarm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTime) return;

    // Check if duplicate time already exists
    if (settings.alarms.some(a => a.time === newTime)) {
      alert(`已存在 ${newTime} 的闹钟时刻，无需重复添加！`);
      return;
    }

    const newAlarm: AlarmItem = {
      id: `alarm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      time: newTime,
      label: newLabel.trim() || '自定义闹钟',
      enabled: true,
      soundType: selectedSound,
    };

    const updated = [...settings.alarms, newAlarm].sort((a, b) => a.time.localeCompare(b.time));
    onUpdateSettings({ ...settings, alarms: updated });
    setNewLabel('');
  };

  // Preset quick adds
  const handleAddPreset = (presetTimes: string[], defaultLabel: string) => {
    const existingTimes = new Set(settings.alarms.map(a => a.time));
    const toAdd: AlarmItem[] = [];

    presetTimes.forEach((t, idx) => {
      if (!existingTimes.has(t)) {
        toAdd.push({
          id: `alarm_preset_${Date.now()}_${idx}`,
          time: t,
          label: defaultLabel,
          enabled: true,
          soundType: selectedSound,
        });
      }
    });

    if (toAdd.length === 0) {
      alert('该预设时刻已全部存在于闹钟列表中！');
      return;
    }

    const updated = [...settings.alarms, ...toAdd].sort((a, b) => a.time.localeCompare(b.time));
    onUpdateSettings({ ...settings, alarms: updated });
  };

  // Batch toggle
  const handleBatchToggle = (enable: boolean) => {
    const updated = settings.alarms.map(a => ({ ...a, enabled: enable }));
    onUpdateSettings({ ...settings, alarms: updated });
  };

  // Clear all
  const handleClearAll = () => {
    if (confirm('确认清空所有已设定的闹钟时刻吗？')) {
      onUpdateSettings({ ...settings, alarms: [] });
    }
  };

  // Calculate time remaining until next trigger for an alarm
  const getTimeRemainingStr = (alarmTime: string) => {
    const now = new Date();
    const [h, m] = alarmTime.split(':').map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);

    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    const diffMs = target.getTime() - now.getTime();
    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (hours === 0) {
      return `${mins} 分钟后响铃`;
    }
    return `${hours} 小时 ${mins} 分钟后`;
  };

  const activeCount = settings.alarms.filter(a => a.enabled).length;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      >
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          onClick={e => e.stopPropagation()}
          className="bg-[#141416] border border-[#26262b] rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl shadow-amber-500/10 overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#232326] flex items-center justify-between bg-[#19191c] shrink-0">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl transition-colors ${
                settings.enabled 
                  ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30' 
                  : 'bg-zinc-800/80 text-zinc-500'
              }`}>
                <Bell size={22} className={settings.enabled ? "animate-pulse" : ""} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-wide">自定义闹钟管理</h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    永久生效
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-400">
                  <span>支持同时设定多个时刻</span>
                  <span>•</span>
                  <span className="font-mono text-zinc-300 flex items-center gap-1">
                    <Clock size={12} className="text-amber-400" />
                    当前系统: {currentTimeStr}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Global master toggle */}
              <button
                type="button"
                onClick={handleToggleGlobal}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs transition-all border ${
                  settings.enabled
                    ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                }`}
                title="一键开启/关闭所有闹钟"
              >
                <Power size={14} />
                <span>{settings.enabled ? '闹钟总开关：开启' : '闹钟总开关：已关'}</span>
              </button>

              <button 
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="关闭窗口"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
            {/* Quick Add Presets Bar */}
            <div className="bg-[#1a1a1e] border border-[#28282e] rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-400" />
                  交易常用时刻快捷添加（一键设定多时刻）
                </span>
                <span className="text-[11px] text-zinc-500">点击即可一键加入下方列表</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleAddPreset(['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'], '4h换线提醒')}
                  className="px-2.5 py-2 rounded-lg bg-zinc-800/80 hover:bg-amber-500/20 hover:border-amber-500/40 border border-zinc-700/60 text-zinc-300 hover:text-amber-300 text-xs font-medium transition-all text-left group"
                >
                  <div className="font-bold group-hover:text-amber-400">4h换线时刻</div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">每4小时整点 (共6个)</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddPreset(['00:00', '08:00', '16:00'], '资金费率交割')}
                  className="px-2.5 py-2 rounded-lg bg-zinc-800/80 hover:bg-amber-500/20 hover:border-amber-500/40 border border-zinc-700/60 text-zinc-300 hover:text-amber-300 text-xs font-medium transition-all text-left group"
                >
                  <div className="font-bold group-hover:text-amber-400">资金费率时刻</div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">00/08/16点 (共3个)</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddPreset(['03:55', '07:55', '11:55', '15:55', '19:55', '23:55'], '换线前5分预警')}
                  className="px-2.5 py-2 rounded-lg bg-zinc-800/80 hover:bg-amber-500/20 hover:border-amber-500/40 border border-zinc-700/60 text-zinc-300 hover:text-amber-300 text-xs font-medium transition-all text-left group"
                >
                  <div className="font-bold group-hover:text-amber-400">换线前5分预警</div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">提前5分钟准备 (共6个)</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddPreset(['09:30', '21:30'], '亚美盘开盘时刻')}
                  className="px-2.5 py-2 rounded-lg bg-zinc-800/80 hover:bg-amber-500/20 hover:border-amber-500/40 border border-zinc-700/60 text-zinc-300 hover:text-amber-300 text-xs font-medium transition-all text-left group"
                >
                  <div className="font-bold group-hover:text-amber-400">亚美盘开盘时刻</div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">09:30 / 21:30 (共2个)</div>
                </button>
              </div>
            </div>

            {/* Add Custom Alarm Form */}
            <form onSubmit={handleAddAlarm} className="bg-[#18181b] border border-[#26262a] rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                <span>➕ 手动添加自定义时刻</span>
                <span className="text-[11px] text-zinc-500">设定后永久保存在本地系统</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <div className="sm:col-span-3">
                  <label className="text-[11px] text-zinc-400 block mb-1">响铃时间 (24小时制)</label>
                  <input 
                    type="time" 
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    required
                    className="w-full bg-[#121214] border border-[#2b2b30] rounded-lg px-3 py-2 text-white font-mono font-bold text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="text-[11px] text-zinc-400 block mb-1">备注标签 (可选)</label>
                  <input 
                    type="text" 
                    placeholder="如: 4h换线、挂单检查、早盘"
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    className="w-full bg-[#121214] border border-[#2b2b30] rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] text-zinc-400 block mb-1">铃声音效</label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedSound}
                      onChange={e => setSelectedSound(e.target.value as AlarmSoundType)}
                      className="w-full bg-[#121214] border border-[#2b2b30] rounded-lg px-2.5 py-2 text-zinc-300 text-xs focus:border-amber-500 focus:outline-none"
                    >
                      <option value="chime">清脆双音和弦</option>
                      <option value="radar">雷达脉冲节奏</option>
                      <option value="gentle">柔和晨钟</option>
                      <option value="tri-tone">警觉三连音</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => playAlarmSound(selectedSound, settings.volume, isMuted)}
                      className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 transition-colors shrink-0"
                      title="试听铃声"
                    >
                      <Play size={14} className="fill-amber-400" />
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2 pt-5">
                  <button
                    type="submit"
                    className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-amber-500/20 active:scale-95"
                  >
                    <Plus size={15} />
                    <span>添加时刻</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Configured Alarms List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">已设定的闹钟列表</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-zinc-800 text-zinc-300 font-mono">
                    共 {settings.alarms.length} 个 (开启 {activeCount} 个)
                  </span>
                </div>

                {settings.alarms.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleBatchToggle(true)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline"
                    >
                      全部开启
                    </button>
                    <span className="text-zinc-600">|</span>
                    <button
                      type="button"
                      onClick={() => handleBatchToggle(false)}
                      className="text-[11px] text-zinc-400 hover:text-zinc-300 hover:underline"
                    >
                      全部关闭
                    </button>
                    <span className="text-zinc-600">|</span>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-[11px] text-red-400 hover:text-red-300 hover:underline"
                    >
                      清空列表
                    </button>
                  </div>
                )}
              </div>

              {settings.alarms.length === 0 ? (
                <div className="border border-dashed border-[#2b2b30] rounded-xl p-8 text-center text-zinc-500 text-xs">
                  <Bell size={28} className="mx-auto mb-2 text-zinc-600 opacity-60" />
                  <p className="font-semibold text-zinc-400 mb-1">暂无设定的闹钟时刻</p>
                  <p>您可以在上方手动添加，或点击快捷添加按钮一键导入交易常用时刻</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                  {settings.alarms.map(alarm => {
                    const isAlarmActive = settings.enabled && alarm.enabled;
                    return (
                      <div
                        key={alarm.id}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                          isAlarmActive
                            ? 'bg-[#18181b] border-amber-500/30 shadow-sm shadow-amber-500/5'
                            : 'bg-[#151517] border-[#222226] opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Toggle Switch */}
                          <button
                            type="button"
                            onClick={() => handleToggleAlarm(alarm.id)}
                            className={`w-9 h-5 rounded-full transition-colors relative p-0.5 shrink-0 ${
                              alarm.enabled ? 'bg-amber-500' : 'bg-zinc-800'
                            }`}
                            title={alarm.enabled ? '点击关闭此时刻' : '点击开启此时刻'}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              alarm.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </button>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-lg font-extrabold text-white tracking-wider">
                                {alarm.time}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-medium">
                                {alarm.label}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                              {alarm.enabled ? getTimeRemainingStr(alarm.time) : '已停用'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => playAlarmSound(alarm.soundType || 'chime', settings.volume, isMuted)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors"
                            title="试听铃声"
                          >
                            <Play size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAlarm(alarm.id)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                            title="删除该闹钟"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sound & Volume Settings */}
            <div className="pt-3 border-t border-[#232326] flex items-center justify-between text-xs text-zinc-400">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Volume2 size={15} className="text-zinc-400" />
                  <span>闹钟音量:</span>
                  <input 
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.volume}
                    onChange={e => onUpdateSettings({ ...settings, volume: parseFloat(e.target.value) })}
                    className="w-24 accent-amber-500 cursor-pointer"
                  />
                  <span className="font-mono text-[11px] text-zinc-300 w-8">
                    {Math.round(settings.volume * 100)}%
                  </span>
                </div>
                {isMuted && (
                  <span className="text-red-400 text-[11px] flex items-center gap-1">
                    <VolumeX size={13} /> 当前全局处于静音状态
                  </span>
                )}
              </div>

              <div className="text-[11px] text-zinc-500">
                提示：闹钟触发时将自动播报声音并弹出醒目弹窗
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-[#232326] bg-[#18181b] flex items-center justify-between shrink-0">
            <div className="text-xs text-zinc-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>所有修改均已实时自动保存，重启后依然生效</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors"
            >
              完成并关闭
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// Ringing Notification Banner / Modal
interface AlarmRingingProps {
  ringingAlarm: AlarmItem | null;
  onDismiss: () => void;
  onSnooze: () => void;
}

export const AlarmRingingBanner: React.FC<AlarmRingingProps> = ({
  ringingAlarm,
  onDismiss,
  onSnooze,
}) => {
  if (!ringingAlarm) return null;

  return (
    <AnimatePresence>
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] max-w-lg w-full px-4 pointer-events-auto">
        <motion.div
          initial={{ y: -50, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -50, opacity: 0, scale: 0.9 }}
          className="bg-[#18181b]/95 border-2 border-amber-500 text-white rounded-2xl p-4 shadow-2xl shadow-amber-500/30 backdrop-blur-xl flex items-center justify-between gap-4 ring-4 ring-amber-500/20"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-amber-500 rounded-xl text-zinc-950 shadow-md animate-bounce shrink-0">
              <BellRing size={24} className="animate-spin-slow" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl font-black text-amber-400">
                  {ringingAlarm.time}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30">
                  闹钟时刻到达
                </span>
              </div>
              <p className="text-sm font-semibold text-zinc-200 truncate mt-0.5">
                {ringingAlarm.label || '定时闹钟提醒'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onSnooze}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-colors"
              title="稍后 5 分钟再次提醒"
            >
              稍后 5 分钟
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs transition-all shadow-md shadow-amber-500/20 active:scale-95"
            >
              我知道了 (关闭)
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
