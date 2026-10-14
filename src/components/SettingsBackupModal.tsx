import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Upload, 
  Copy, 
  Check, 
  FileJson, 
  Sliders, 
  Database, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  X, 
  Clock, 
  Layers, 
  Activity, 
  RefreshCw,
  HardDrive
} from 'lucide-react';

interface SettingsBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: () => void;
  addLog?: (msg: string, type?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'TRADE') => void;
}

export const SettingsBackupModal: React.FC<SettingsBackupModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
  addLog
}) => {
  const [activeTab, setActiveTab] = useState<'EXPORT' | 'IMPORT'>('EXPORT');
  const [exportData, setExportData] = useState<any | null>(null);
  const [isLoadingExport, setIsLoadingExport] = useState(false);
  const [copied, setCopied] = useState(false);

  // Import state
  const [importJsonText, setImportJsonText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [parsedImportData, setParsedImportData] = useState<any | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessResult, setImportSuccessResult] = useState<string | null>(null);
  const [includeApiKeys, setIncludeApiKeys] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch export preview when opening modal or switching to export tab
  useEffect(() => {
    if (!isOpen) {
      setImportSuccessResult(null);
      return;
    }
    if (activeTab === 'EXPORT') {
      fetchExportPreview();
    }
  }, [isOpen, activeTab]);

  const fetchExportPreview = async () => {
    setIsLoadingExport(true);
    try {
      const res = await fetch('/api/settings/export');
      if (res.ok) {
        const data = await res.json();
        setExportData(data);
      }
    } catch (err) {
      console.error('Failed to load settings export data:', err);
    } finally {
      setIsLoadingExport(false);
    }
  };

  const handleDownloadExportFile = () => {
    if (!exportData) return;
    try {
      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const filename = `trading_settings_backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addLog?.(`[系统备份] 💾 已将全量设置参数成功导出并下载为文件: ${filename}`, 'SUCCESS');
    } catch (e: any) {
      console.error('Failed to download export file:', e);
    }
  };

  const handleCopyExportJson = () => {
    if (!exportData) return;
    try {
      const jsonStr = JSON.stringify(exportData, null, 2);
      navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addLog?.('[系统备份] 📋 已将全量设置参数 JSON 复制到剪贴板', 'SUCCESS');
    } catch (e) {
      console.error('Failed to copy export json:', e);
    }
  };

  // Handle file upload for import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportError(null);
    setImportSuccessResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        setImportJsonText(content);
        validateAndParseJson(content);
      } catch (err: any) {
        setImportError(`解析文件失败: ${err.message || '文件非有效 JSON'}`);
        setParsedImportData(null);
      }
    };
    reader.onerror = () => {
      setImportError('读取文件异常，请重新选择');
    };
    reader.readAsText(file);
  };

  const validateAndParseJson = (text: string) => {
    if (!text.trim()) {
      setParsedImportData(null);
      setImportError(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('配置根对象必须是 JSON 对象');
      }
      const settingsMap = parsed.systemSettings || parsed.settings || parsed;
      if (!settingsMap || typeof settingsMap !== 'object') {
        throw new Error('未能识别出有效的设置项目数据');
      }
      setParsedImportData(parsed);
      setImportError(null);
    } catch (err: any) {
      setImportError(`JSON 格式校验失败: ${err.message || '语法错误'}`);
      setParsedImportData(null);
    }
  };

  const handleImportSubmit = async () => {
    if (!parsedImportData) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const payload = { ...parsedImportData };
      if (!includeApiKeys && payload.apiAccounts) {
        delete payload.apiAccounts;
      }

      const res = await fetch('/api/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error || '导入请求处理失败');
      }

      setImportSuccessResult(`成功导入 ${resData.importedSettingsCount ?? '全部'} 项参数！配置已永久固化至本地 SQLite 数据库并立即全局生效。`);
      addLog?.(`[系统导入] ✅ 成功恢复导入所有设置参数并存入本地数据库 (包含4H监控、筛选设置、下单设置、15M监控及风控配置)！`, 'SUCCESS');
      
      onImportSuccess?.();
    } catch (err: any) {
      setImportError(err.message || '导入配置时发生未知网络错误');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  const sys = exportData?.systemSettings || {};
  const fs4h = sys.monitoring4h_filter_settings;
  const os4h = sys.monitoring4h_order_settings;
  const isAuto4h = sys.monitoring4h_auto_trading;
  const cfg4h = sys.monitoring_config_4h;
  const cfg15m = sys.monitoring_config_15m;
  const riskConfigs = sys.accountPositionRiskConfigs || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-3xl bg-[#141416] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                系统设置参数 备份与导入导出
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-normal">
                  SQLite 本地数据库全量支持
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                支持将全套筛选设置、下单设置、自动交易开关、风控策略、15M/4H配置、终端参数及API凭据一键完整导出与导入
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-white/5 bg-black/20">
          <button
            onClick={() => { setActiveTab('EXPORT'); setImportSuccessResult(null); }}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'EXPORT'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Download size={16} />
            <span>导出设置参数 (备份)</span>
          </button>
          <button
            onClick={() => { setActiveTab('IMPORT'); setImportSuccessResult(null); }}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'IMPORT'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Upload size={16} />
            <span>导入设置参数 (恢复)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {activeTab === 'EXPORT' ? (
            <div className="space-y-5">
              {/* Export Info Banner */}
              <div className="p-4 rounded-xl bg-cyan-500/[0.06] border border-cyan-500/20 flex items-start gap-3">
                <Sliders className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-300 leading-relaxed space-y-1">
                  <div className="font-bold text-white text-sm">全量系统参数备份说明</div>
                  <p>
                    点击下方按钮可将本地 SQLite 数据库中的全部参数打包为标准 JSON 配置文件。可用于跨设备同步、重装系统恢复、或分享标准化策略配置。
                  </p>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* 4H 监控与策略 */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="flex items-center gap-1.5 font-bold text-zinc-200">
                      <Clock size={14} className="text-cyan-400" />
                      4H 自动策略与监控
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isAuto4h ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {isAuto4h ? '自动: 开启' : '自动: 关闭'}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono space-y-0.5 pt-1">
                    <div>扫描时刻: {fs4h?.scanMoment ? `${fs4h.scanMoment.hour}h ${fs4h.scanMoment.minute}m ${fs4h.scanMoment.second}s` : '03:58:30'}</div>
                    <div>最大持仓: {os4h?.maxPositionCount?.value || '10'} 仓位</div>
                    <div>超时平仓: {os4h?.timeoutPriceClose?.hours || '24'}h / {os4h?.timeoutPriceClose?.multiplier || '1.5'}x</div>
                  </div>
                </div>

                {/* 15M 监控参数 */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="flex items-center gap-1.5 font-bold text-zinc-200">
                      <Activity size={14} className="text-amber-400" />
                      15M 量化监控助手
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      量K: {sys.monitor_15m_volume_k_count || 12}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono space-y-0.5 pt-1">
                    <div>涨幅计算: {sys.monitor_15m_gain_mode === 'high' ? '高涨幅模式' : '常规模式'}</div>
                    <div>排序方案: {sys.monitor_15m_sort_scheme === 'dynamic' ? '动态排序' : '固定排序'}</div>
                    <div>24H门槛: {(cfg15m?.minVolume24h || 15000000) / 10000}万 USDT</div>
                  </div>
                </div>

                {/* 仓单风控与终端 */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="flex items-center gap-1.5 font-bold text-zinc-200">
                      <ShieldCheck size={14} className="text-emerald-400" />
                      持仓多重风控策略
                    </span>
                    <span className="text-[11px] font-mono text-emerald-300">
                      已保存 {Object.keys(riskConfigs).length} 组
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono space-y-0.5 pt-1">
                    <div>条件D: 超时 1.5x 平仓 (默认生效)</div>
                    <div>API账号: {exportData?.apiAccounts?.length || 0} 个</div>
                    <div>入场核验: {sys.entryVerificationList?.length || 0} 个标的</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDownloadExportFile}
                  disabled={isLoadingExport || !exportData}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download size={16} />
                  <span>下载配置文件 (.json)</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyExportJson}
                  disabled={isLoadingExport || !exportData}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-sm flex items-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  <span>{copied ? '已复制到剪贴板！' : '复制 JSON 配置文本'}</span>
                </button>

                <button
                  type="button"
                  onClick={fetchExportPreview}
                  disabled={isLoadingExport}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
                  title="刷新最新参数"
                >
                  <RefreshCw size={15} className={isLoadingExport ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* JSON Raw Preview */}
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-mono flex items-center gap-1.5">
                    <FileJson size={14} className="text-cyan-400" />
                    导出的参数代码预览 (包含 {Object.keys(sys).length} 项系统配置)
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    导出时间: {exportData?.exportTime ? new Date(exportData.exportTime).toLocaleTimeString() : '--'}
                  </span>
                </div>
                <pre className="p-3.5 rounded-xl bg-black/60 border border-white/10 font-mono text-[11px] text-zinc-300 max-h-56 overflow-y-auto custom-scrollbar select-all">
                  {exportData ? JSON.stringify(exportData, null, 2) : '正在读取本地数据库设置...'}
                </pre>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Import Info Banner */}
              <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 flex items-start gap-3">
                <HardDrive className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-300 leading-relaxed space-y-1">
                  <div className="font-bold text-white text-sm">参数导入恢复说明</div>
                  <p>
                    上传或粘贴之前导出的 JSON 配置文件，系统将自动校验其完整性，并将所有设置项永久写入本地 SQLite 数据库，同时热加载至当前运行策略中。
                  </p>
                </div>
              </div>

              {/* File Upload Zone */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/15 hover:border-emerald-500/50 bg-white/[0.02] hover:bg-emerald-500/[0.03] rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group"
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".json,application/json" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                  <Upload size={22} />
                </div>
                <div className="font-bold text-sm text-white">
                  {importFileName ? `已选择文件: ${importFileName}` : '点击选择或拖拽 .json 备份文件到此处'}
                </div>
                <div className="text-xs text-zinc-500">
                  支持由本系统导出的完整配置文件
                </div>
              </div>

              {/* Paste Textarea Option */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-300 font-medium flex items-center justify-between">
                  <span>或直接在下方粘贴 JSON 格式的配置代码：</span>
                  {importJsonText && (
                    <button 
                      type="button" 
                      onClick={() => { setImportJsonText(''); setParsedImportData(null); setImportFileName(''); }}
                      className="text-[11px] text-zinc-500 hover:text-red-400"
                    >
                      清空文本
                    </button>
                  )}
                </label>
                <textarea
                  value={importJsonText}
                  onChange={(e) => {
                    setImportJsonText(e.target.value);
                    validateAndParseJson(e.target.value);
                  }}
                  placeholder='在此粘贴备份 JSON 代码，例如：{"version":"1.0","systemSettings":{...}}'
                  className="w-full h-36 bg-black/50 border border-white/15 rounded-xl p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 custom-scrollbar resize-none"
                />
              </div>

              {/* Safe Import Options */}
              {parsedImportData && (
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={includeApiKeys}
                      onChange={e => setIncludeApiKeys(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 bg-black border-white/20 accent-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs text-zinc-200 font-medium">
                      包含 API 账户凭据 (导入已保存的币安 API Key 与 Secret)
                    </span>
                  </label>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    检测到 {parsedImportData?.apiAccounts?.length || 0} 个账户
                  </span>
                </div>
              )}

              {/* Error Message */}
              {importError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2.5 text-xs text-red-300">
                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Success Message */}
              {importSuccessResult && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-300">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>{importSuccessResult}</span>
                </div>
              )}

              {/* Import Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={!parsedImportData || isImporting}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check size={16} />
                  <span>{isImporting ? '正在存入本地数据库并应用...' : '确认导入全部设置并立即生效'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-1.5 font-mono">
            <Database size={13} className="text-cyan-400" />
            <span>SQLite 数据库路径: trading.db (自动永久固化)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 font-medium transition-colors"
          >
            关闭窗口
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsBackupModal;
