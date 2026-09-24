import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  X, 
  Plus, 
  Trash2, 
  Search, 
  Check, 
  AlertTriangle,
  FileText,
  Sparkles
} from 'lucide-react';
import { parseVerificationInput, normalizeSingleKeyword } from '../utils/entryVerification';

interface EntryVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  verificationList: string[];
  onUpdateList: (newList: string[]) => void;
}

export const EntryVerificationModal: React.FC<EntryVerificationModalProps> = ({
  isOpen,
  onClose,
  verificationList,
  onUpdateList
}) => {
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // 过滤后的列表
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return verificationList;
    const q = searchQuery.trim().toUpperCase();
    return verificationList.filter(item => item.toUpperCase().includes(q));
  }, [verificationList, searchQuery]);

  // 添加标的
  const handleAdd = () => {
    if (!inputText.trim()) return;
    const itemsToAdd = parseVerificationInput(inputText);
    if (itemsToAdd.length === 0) return;

    const currentUpperSet = new Set(verificationList.map(s => s.toUpperCase()));
    const newItems: string[] = [];
    const duplicates: string[] = [];

    for (const item of itemsToAdd) {
      if (currentUpperSet.has(item.toUpperCase())) {
        duplicates.push(item);
      } else {
        newItems.push(item);
        currentUpperSet.add(item.toUpperCase());
      }
    }

    if (duplicates.length > 0 && newItems.length === 0) {
      setDuplicateWarning(`标的 [${duplicates.join(', ')}] 已存在于名单中，无需重复添加`);
      setTimeout(() => setDuplicateWarning(null), 3000);
      setInputText('');
      return;
    }

    const updated = [...newItems, ...verificationList];
    onUpdateList(updated);
    setInputText('');
    setDuplicateWarning(null);
  };

  // 删除单个标的
  const handleRemove = (symbolToRemove: string) => {
    const updated = verificationList.filter(s => s.toUpperCase() !== symbolToRemove.toUpperCase());
    onUpdateList(updated);
  };

  // 清空全部
  const handleClearAll = () => {
    if (window.confirm('确定要清空“入场验证名单”中的所有标的吗？此操作将立即生效。')) {
      onUpdateList([]);
    }
  };

  // 快速添加推荐样例
  const handleQuickAdd = (sample: string) => {
    const norm = normalizeSingleKeyword(sample);
    if (!norm) return;
    if (verificationList.some(s => s.toUpperCase() === norm)) {
      setDuplicateWarning(`[${norm}] 已在名单中`);
      setTimeout(() => setDuplicateWarning(null), 2500);
      return;
    }
    onUpdateList([norm, ...verificationList]);
  };

  // 复制当前完整名单为文本
  const handleCopyList = () => {
    if (verificationList.length === 0) return;
    navigator.clipboard.writeText(verificationList.join(', '));
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-xl bg-[#0f141c] border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* 头部 Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 bg-gradient-to-r from-amber-950/30 via-zinc-900/50 to-zinc-900/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-100">入场验证名单</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  {verificationList.length} 个标的
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                自定义风险币对黑名单，带入或匹配时实时触发“风险标的，请谨慎！”强浮动高亮提示
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容主体 Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* 输入新增区域 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Plus size={14} className="text-amber-400" />
                <span>新增风险标的</span>
                <span className="text-[11px] font-normal text-zinc-400">
                  (智能自适应大小写、空格及USDT后缀，支持逗号或换行批量输入)
                </span>
              </label>
              {verificationList.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyList}
                  className="text-[11px] text-zinc-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                >
                  {copiedNotification ? (
                    <>
                      <Check size={12} className="text-emerald-400" />
                      <span className="text-emerald-400">已复制名单</span>
                    </>
                  ) : (
                    <>
                      <FileText size={12} />
                      <span>复制名单</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                  placeholder="例如: siren, hbar, lunc (直接输入回车添加)"
                  className="w-full px-3.5 py-2.5 bg-zinc-900/90 border border-zinc-700/80 rounded-xl text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                />
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!inputText.trim()}
                className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-semibold text-sm rounded-xl transition-all shadow-md shadow-amber-950/30 flex items-center gap-1.5 shrink-0 active:scale-95"
              >
                <Plus size={16} />
                <span>添加到名单</span>
              </button>
            </div>

            {/* 重复提醒 */}
            <AnimatePresence>
              {duplicateWarning && (
                <motion.div 
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                >
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>{duplicateWarning}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 常用快速添加建议 */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                <Sparkles size={11} className="text-amber-400" />
                快捷样例:
              </span>
              {['siren', 'hbar', 'lunc', 'ftt'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleQuickAdd(tag)}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800/80 hover:bg-amber-500/20 text-zinc-400 hover:text-amber-300 border border-zinc-700/60 transition-all font-mono"
                  title={`点击快速加入 ${tag.toUpperCase()}`}
                >
                  +{tag}
                </button>
              ))}
            </div>
          </div>

          {/* 列表管理区域 */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-zinc-300">
                当前录入名单 ({verificationList.length})
              </div>
              {verificationList.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline transition-colors"
                >
                  <Trash2 size={12} />
                  <span>清空全部</span>
                </button>
              )}
            </div>

            {/* 搜索过滤框 */}
            {verificationList.length > 5 && (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索已录入标的..."
                  className="w-full pl-9 pr-3 py-1.5 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                />
              </div>
            )}

            {/* 标的标签展示网格 */}
            <div className="min-h-[140px] max-h-[260px] overflow-y-auto p-3 bg-zinc-950/50 border border-zinc-800/80 rounded-xl">
              {filteredList.length === 0 ? (
                <div className="h-28 flex flex-col items-center justify-center text-center text-zinc-400">
                  <ShieldAlert size={28} className="text-zinc-500 mb-1.5 opacity-60" />
                  <p className="text-xs">
                    {searchQuery ? '没有找到符合搜索条件的标的' : '名单为空，尚未录入任何风险标的'}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    在上方输入例如 “siren” 并添加后将永久生效
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence>
                    {filteredList.map((symbol) => (
                      <motion.div
                        key={symbol}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="group flex items-center gap-1.5 px-3 py-1.5 bg-red-950/30 hover:bg-red-900/40 border border-red-500/40 rounded-lg text-red-200 text-xs font-mono transition-all shadow-sm"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 group-hover:animate-ping" />
                        <span className="font-semibold tracking-wide">{symbol}</span>
                        <button
                          type="button"
                          onClick={() => handleRemove(symbol)}
                          className="ml-1 p-0.5 text-red-400/70 hover:text-red-200 hover:bg-red-500/30 rounded transition-colors"
                          title={`从名单移除 ${symbol}`}
                        >
                          <X size={13} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* 持久化提示 */}
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-300/80">
            <ShieldAlert size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold text-amber-300">永久存储保障：</span>
              已配置自动同步至系统 SQLite 数据库 [settings 表] 与浏览器持久缓存。无论刷新页面、重启服务均会永久保留。
            </div>
          </div>
        </div>

        {/* 底部 Footer */}
        <div className="px-6 py-3.5 bg-zinc-900/60 border-t border-zinc-800/80 flex items-center justify-between">
          <div className="text-[11px] text-zinc-500 font-mono">
            已开启大小写与空格模糊自适应
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-xl transition-colors"
          >
            完成并关闭
          </button>
        </div>
      </motion.div>
    </div>
  );
};
