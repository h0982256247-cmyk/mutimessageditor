import React, { useState, useMemo } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { RichMenu, ProjectStatus } from '../../../types';

interface ValidationError {
  menuName: string;
  field: string;
  message: string;
}

interface PublishLineStepProps {
  menus: RichMenu[];
  onReset: () => void;
  onStatusChange: (id: string, status: ProjectStatus, scheduledAt?: string) => void;
  onPublishComplete?: (results: { aliasId: string; richMenuId: string }[]) => void;
  onBack?: () => void;
  onSaveDraft: () => Promise<void>;
}

export const PublishLineStep: React.FC<PublishLineStepProps> = ({ menus, onReset, onStatusChange, onPublishComplete, onBack, onSaveDraft }) => {
  const [status, setStatus] = useState<'idle' | 'publishing' | 'scheduling' | 'success'>('idle');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  const mainMenu = menus.find(m => m.isMain);
  const totalHotspots = menus.reduce((acc, m) => acc + m.hotspots.length, 0);

  // Validation logic
  const validationErrors = useMemo<ValidationError[]>(() => {
    const errors: ValidationError[] = [];

    for (const menu of menus) {
      // Check for missing image
      if (!menu.imageData) {
        errors.push({
          menuName: menu.name || '未命名選單',
          field: '背景圖片',
          message: '尚未上傳背景圖片'
        });
      }

      // Check for missing barText
      if (!menu.barText || menu.barText.trim() === '') {
        errors.push({
          menuName: menu.name || '未命名選單',
          field: '選單列文字',
          message: '尚未設定選單列顯示文字'
        });
      }

      // Check hotspot actions
      for (const hotspot of menu.hotspots) {
        const hotspotIndex = menu.hotspots.indexOf(hotspot) + 1;

        if (hotspot.action.type === 'uri' && (!hotspot.action.data || hotspot.action.data.trim() === '')) {
          errors.push({
            menuName: menu.name || '未命名選單',
            field: `熱區 ${hotspotIndex}`,
            message: '開啟連結動作缺少網址'
          });
        }

        if (hotspot.action.type === 'message' && (!hotspot.action.data || hotspot.action.data.trim() === '')) {
          errors.push({
            menuName: menu.name || '未命名選單',
            field: `熱區 ${hotspotIndex}`,
            message: '傳送訊息動作缺少訊息內容'
          });
        }

        if (hotspot.action.type === 'postback' && (!hotspot.action.data || hotspot.action.data.trim() === '')) {
          errors.push({
            menuName: menu.name || '未命名選單',
            field: `熱區 ${hotspotIndex}`,
            message: '預填欄位動作缺少顯示文字'
          });
        }

        if (hotspot.action.type === 'switch' && !hotspot.action.data) {
          errors.push({
            menuName: menu.name || '未命名選單',
            field: `熱區 ${hotspotIndex}`,
            message: '切換選單動作尚未選擇目標選單'
          });
        }
      }
    }

    return errors;
  }, [menus]);

  const hasErrors = validationErrors.length > 0;

  const handlePublishNow = async () => {
    if (hasErrors) return;

    setStatus('publishing');

    try {
      // Auto-save draft before publishing
      await onSaveDraft();

      const { buildPublishRequest, validateImageFileSize } = await import('../../../utils/lineRichMenuBuilder');
      const { supabase } = await import('../../../supabaseClient');

      // Check image sizes first
      for (const menu of menus) {
        if (menu.imageData && !validateImageFileSize(menu.imageData)) {
          throw new Error(`選單「${menu.name}」的圖片檔案過大 (超過 1MB)，請壓縮後再試一次。`);
        }
      }

      // 改為逐一發送選單，避免 Payload 過大導致 413 或 Timeout
      // 第一個選單同時負責觸發清理舊選單 (cleanOldMenus: true)
      // 1. 先建立完整的 Publish Request 資料，確保所有選單之間的連結關係 (Switch Action) 正確解析
      // 如果直接分批傳 [menu] 進去，buildPublishRequest 會找不到目標選單而導致連結失效
      const fullPublishRequest = buildPublishRequest(menus);

      // 收集所有發布結果
      const allResults: { aliasId: string; richMenuId: string }[] = [];

      // 2. 改為逐一發送選單，避免 Payload 過大導致 413 或 Timeout
      // 第一個選單同時負責觸發清理舊選單 (cleanOldMenus: true)
      for (const [index, menuItem] of fullPublishRequest.menus.entries()) {
        const originalMenu = menus[index]; // 為了顯示名稱
        console.log(`Starting upload for menu ${index + 1}/${menus.length}: ${originalMenu.name}`);

        // 分批建立請求，每次只包含一個選單 payload
        const payload = {
          menus: [menuItem],
          cleanOldMenus: index === 0
        };

        // supabase.functions.invoke automatically includes auth token
        const response = await supabase.functions.invoke('publish-richmenu', {
          body: payload
        });

        if (response.error) {
          throw new Error(`選單 ${originalMenu.name} 發布失敗: ${response.error.message}`);
        }

        if (!response.data?.success) {
          throw new Error(`選單 ${originalMenu.name} 發布失敗: ${response.data?.error}`);
        }

        // 收集結果
        if (response.data.results) {
          allResults.push(...response.data.results);
        }
      }

      // 發布成功
      // onStatusChange 移至 onPublishComplete 統一處理


      // 更新前端狀態與資料庫
      if (onPublishComplete) {
        onPublishComplete(allResults);
      }

      setStatus('success');
    } catch (error: any) {
      console.error(error);
      alert(`發布失敗: ${error.message}`);
      setStatus('idle');
    }
  };

  const handleScheduleConfirm = async () => {
    if (!scheduledDate || !scheduledTime) {
      alert('請選取完整的排程日期與時間');
      return;
    }

    if (hasErrors) return;

    setStatus('publishing');

    try {
      // Auto-save draft before scheduling
      await onSaveDraft();

      // 注意: 排程功能需要額外的後端支援 (例如 cron job)
      // 這裡先直接發布,並記錄排程時間
      const { buildPublishRequest } = await import('../../../utils/lineRichMenuBuilder');
      const publishData = buildPublishRequest(menus);

      const { supabase } = await import('../../../supabaseClient');

      // supabase.functions.invoke automatically includes auth token
      const response = await supabase.functions.invoke('publish-richmenu', {
        body: publishData
      });

      if (response.error) {
        throw new Error(response.error.message || '發布失敗');
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || '發布失敗');
      }

      // 發布成功,記錄排程時間
      if (mainMenu) {
        onStatusChange(mainMenu.id, 'scheduled', `${scheduledDate} ${scheduledTime}`);
      }
      setStatus('success');
    } catch (error: any) {
      alert(`排程發布失敗: ${error.message}`);
      setStatus('idle');
    }
  };

  if (status === 'success') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-300">
        <Card className="w-full max-w-sm p-8 shadow-2xl text-center animate-in zoom-in duration-300">
          <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-success">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text mb-2">發布成功！</h2>
          <p className="text-secondary text-sm mb-8">您的圖文選單已成功發布至 LINE 官方帳號</p>
          <Button onClick={onReset} fullWidth className="py-4 shadow-lg shadow-primary/20">
            確認
          </Button>
        </Card>
      </div>
    );
  }

  if (status === 'scheduling') {
    return (
      <div className="flex items-center justify-center h-full p-6 animate-in zoom-in duration-300">
        <Card className="w-full max-w-md p-8 shadow-2xl relative">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div>
              <h2 className="text-xl font-bold">預約排程發布</h2>
              <p className="text-xs text-secondary mt-0.5">選取您希望選單正式上線的時間</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">日期</label>
              <input type="date" className="w-full p-3 bg-gray-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-secondary uppercase tracking-widest">時間</label>
              <input type="time" className="w-full p-3 bg-gray-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
          </div>

          {hasErrors && (
            <div className="mt-6 p-4 bg-error/5 border border-error/20 rounded-xl">
              <p className="text-error text-xs font-bold mb-2">⚠️ 請先修正以下問題：</p>
              <ul className="text-error/80 text-xs space-y-1">
                {validationErrors.slice(0, 3).map((err, i) => (
                  <li key={i}>• {err.menuName}：{err.message}</li>
                ))}
                {validationErrors.length > 3 && <li>...還有 {validationErrors.length - 3} 個問題</li>}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-8">
            <Button onClick={() => setStatus('idle')} variant="secondary">取消設定</Button>
            <Button onClick={handleScheduleConfirm} disabled={hasErrors}>確認排程</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full p-6">
      <Card className="w-full max-w-md overflow-hidden shadow-2xl relative">
        {/* 已移除卡片內的返回按鈕，導覽邏輯已整合至全域 Header */}

        <div className="p-8 pt-12 border-b border-border bg-gray-50/50">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-text">準備發布專案</h2>
              <p className="text-secondary text-sm mt-1">即將提交至 LINE 官方帳號</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
              <p className="text-[10px] text-secondary uppercase font-bold tracking-widest mb-1">層級數量</p>
              <p className="text-2xl font-bold">{menus.length} <span className="text-xs font-normal">個選單</span></p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
              <p className="text-[10px] text-secondary uppercase font-bold tracking-widest mb-1">總熱點</p>
              <p className="text-2xl font-bold">{totalHotspots} <span className="text-xs font-normal">個區域</span></p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {/* Validation Warnings */}
          {hasErrors && (
            <div className="p-4 bg-error/5 border border-error/20 rounded-xl animate-in fade-in duration-300">
              <div className="flex items-center gap-2 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-error">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-error text-sm font-bold">無法發布，請先修正以下問題：</p>
              </div>
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {validationErrors.map((err, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-error/80 bg-white/50 p-2 rounded-lg">
                    <span className="text-error/60">•</span>
                    <div>
                      <span className="font-semibold">{err.menuName}</span>
                      <span className="mx-1">›</span>
                      <span>{err.field}：{err.message}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-4">
            <Button
              onClick={handlePublishNow}
              disabled={status === 'publishing' || hasErrors}
              fullWidth
              className={`py-4 shadow-lg shadow-primary/20 ${status === 'publishing' ? 'animate-pulse' : ''} ${hasErrors ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {status === 'publishing' ? '正提交至 LINE...' : '現在立即發布'}
            </Button>
            <Button onClick={() => setStatus('scheduling')} variant="ghost" className="text-primary font-bold">我要預約排程發布</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};