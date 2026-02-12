import React, { useState, useMemo, useEffect } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { RichMenu, ProjectStatus } from '../../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../../constants';
import { getImageDimensions, validateImageDimensions, validateImageFileSize } from '../../../utils/lineRichMenuBuilder';

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

interface ImageCheckResult {
  menuId: string;
  menuName: string;
  status: 'checking' | 'pass' | 'fail' | 'no-image';
  width?: number;
  height?: number;
  fileSizeOk?: boolean;
  dimError?: string;
}

export const PublishLineStep: React.FC<PublishLineStepProps> = ({ menus, onReset, onStatusChange, onPublishComplete, onBack, onSaveDraft }) => {
  const [status, setStatus] = useState<'idle' | 'publishing' | 'scheduling' | 'success'>('idle');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [imageChecks, setImageChecks] = useState<ImageCheckResult[]>([]);

  const mainMenu = menus.find(m => m.isMain);
  const totalHotspots = menus.reduce((acc, m) => acc + m.hotspots.length, 0);

  // 圖片防呆檢查
  useEffect(() => {
    const runChecks = async () => {
      const results: ImageCheckResult[] = [];
      for (const menu of menus) {
        if (!menu.imageData) {
          results.push({ menuId: menu.id, menuName: menu.name || '未命名選單', status: 'no-image' });
          continue;
        }
        const result: ImageCheckResult = {
          menuId: menu.id,
          menuName: menu.name || '未命名選單',
          status: 'checking',
          fileSizeOk: validateImageFileSize(menu.imageData),
        };
        try {
          const { width, height } = await getImageDimensions(menu.imageData);
          result.width = width;
          result.height = height;
          const validation = validateImageDimensions(width, height);
          if (!validation.valid) {
            result.status = 'fail';
            result.dimError = validation.error;
          } else if (!result.fileSizeOk) {
            result.status = 'fail';
            result.dimError = '檔案超過 1MB';
          } else {
            result.status = 'pass';
          }
        } catch {
          result.status = 'fail';
          result.dimError = '無法讀取圖片';
        }
        results.push(result);
      }
      setImageChecks(results);
    };
    runChecks();
  }, [menus]);

  const hasImageErrors = imageChecks.some(c => c.status === 'fail');

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

        if (hotspot.action.type === 'postback') {
          if (!hotspot.action.data || hotspot.action.data.trim() === '') {
            errors.push({
              menuName: menu.name || '未命名選單',
              field: `熱區 ${hotspotIndex}`,
              message: '預填欄位動作缺少顯示文字'
            });
          }
          if (!hotspot.action.fillInText || hotspot.action.fillInText.trim() === '') {
            errors.push({
              menuName: menu.name || '未命名選單',
              field: `熱區 ${hotspotIndex}`,
              message: '預填欄位動作缺少預填內容'
            });
          }
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

  const hasErrors = validationErrors.length > 0 || hasImageErrors;

  const handlePublishNow = async () => {
    if (hasErrors) return;

    setStatus('publishing');

    try {
      // Auto-save draft before publishing
      await onSaveDraft();

      const { buildPublishRequest, validateImageFileSize, getImageDimensions, validateImageDimensions } = await import('../../../utils/lineRichMenuBuilder');
      const { supabase } = await import('../../../supabaseClient');

      // Check image dimensions and file sizes first
      for (const menu of menus) {
        if (menu.imageData) {
          // 驗證檔案大小
          if (!validateImageFileSize(menu.imageData)) {
            throw new Error(`選單「${menu.name}」的圖片檔案過大（超過 1MB），請壓縮後再試一次。`);
          }
          // 驗證像素尺寸
          try {
            const { width, height } = await getImageDimensions(menu.imageData);
            const validation = validateImageDimensions(width, height);
            if (!validation.valid) {
              throw new Error(
                `選單「${menu.name}」的圖片尺寸不符合 LINE 規範：${validation.error}\n` +
                `建議尺寸：2500×1686、2500×843、1200×810、1200×405、800×540、800×270`
              );
            }
          } catch (dimErr: any) {
            if (dimErr.message.includes('LINE 規範')) throw dimErr;
            throw new Error(`選單「${menu.name}」的圖片無法讀取尺寸，請確認檔案是否正確。`);
          }
        }
      }

      // 改為逐一發送選單，避免 Payload 過大導致 413 或 Timeout
      // 第一個選單同時負責觸發清理舊選單 (cleanOldMenus: true)
      // 1. 先建立完整的 Publish Request 資料，確保所有選單之間的連結關係 (Switch Action) 正確解析
      // 如果直接分批傳 [menu] 進去，buildPublishRequest 會找不到目標選單而導致連結失效
      const fullPublishRequest = buildPublishRequest(menus);

      // DEBUG: Inspect the payload for postback actions
      console.group('Publish Request Payload Debug');
      fullPublishRequest.menus.forEach((m, i) => {
        console.log(`Menu ${i}: ${m.menuData.name}`);
        m.menuData.areas.forEach((area: any, j: number) => {
          console.log(`  Area ${j} Action:`, area.action);
          if (area.action.type === 'postback') {
            console.log(`    > inputOption: ${area.action.inputOption}`);
            console.log(`    > fillInText: ${JSON.stringify(area.action.fillInText)}`);
          }
        });
      });
      console.groupEnd();

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
        {/* Header */}
        <div className="p-6 pb-5 border-b border-border bg-gradient-to-b from-gray-50 to-white">
          <h2 className="text-xl font-bold text-text">準備發布專案</h2>
          <p className="text-secondary text-xs mt-1">即將提交至 LINE 官方帳號</p>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white p-3 rounded-xl border border-border shadow-sm">
              <p className="text-[10px] text-secondary uppercase font-bold tracking-widest mb-0.5">層級數量</p>
              <p className="text-xl font-bold">{menus.length} <span className="text-xs font-normal text-secondary">個選單</span></p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-border shadow-sm">
              <p className="text-[10px] text-secondary uppercase font-bold tracking-widest mb-0.5">總熱點</p>
              <p className="text-xl font-bold">{totalHotspots} <span className="text-xs font-normal text-secondary">個區域</span></p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* 圖片防呆檢查 */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-border">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="text-xs font-bold text-gray-700">圖片檢查</span>
                {!hasImageErrors && imageChecks.length > 0 && imageChecks.every(c => c.status === 'pass') && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">全部通過</span>
                )}
                {hasImageErrors && (
                  <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">有異常</span>
                )}
              </div>
              <span className="text-[10px] text-gray-400 hidden sm:inline">寬 800~2500 · 高 ≥250 · 比例 ≥1.45 · ≤1MB</span>
            </div>
            <div className="divide-y divide-gray-100">
              {imageChecks.map((check) => (
                <div key={check.menuId} className="flex items-start gap-3 px-4 py-3">
                  {/* 狀態圖標 */}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${check.status === 'pass' ? 'bg-green-100' :
                      check.status === 'fail' ? 'bg-red-100' :
                        check.status === 'no-image' ? 'bg-yellow-100' :
                          'bg-gray-100'
                    }`}>
                    {check.status === 'checking' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-400 animate-spin"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
                    )}
                    {check.status === 'pass' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-green-600"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                    {check.status === 'fail' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-red-500"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    )}
                    {check.status === 'no-image' && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-yellow-600"><line x1="12" y1="8" x2="12" y2="13" /><circle cx="12" cy="17" r="0.5" /></svg>
                    )}
                  </div>
                  {/* 內容 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-800 truncate">{check.menuName}</span>
                      {check.status === 'pass' && (
                        <span className="text-[11px] font-mono text-green-600 flex-shrink-0">{check.width}×{check.height}</span>
                      )}
                    </div>
                    {check.status === 'fail' && (
                      <p className="text-[11px] text-red-500 mt-0.5">{check.dimError || '不符合規範'}</p>
                    )}
                    {check.status === 'no-image' && (
                      <p className="text-[11px] text-yellow-600 mt-0.5">尚未上傳背景圖片</p>
                    )}
                    {check.status === 'checking' && (
                      <p className="text-[11px] text-gray-400 mt-0.5">檢查中...</p>
                    )}
                  </div>
                </div>
              ))}
              {imageChecks.length === 0 && (
                <p className="text-gray-400 text-xs text-center py-4">載入中...</p>
              )}
            </div>
          </div>

          {/* Validation Warnings */}
          {validationErrors.length > 0 && (
            <div className="rounded-xl border border-red-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-200">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="text-xs font-bold text-red-700">尚需修正 {validationErrors.length} 項問題</span>
              </div>
              <div className="divide-y divide-red-100 max-h-36 overflow-y-auto">
                {validationErrors.map((err, i) => (
                  <div key={i} className="px-4 py-2.5 text-xs text-gray-600">
                    <span className="font-semibold text-gray-800">{err.menuName}</span>
                    <span className="mx-1 text-gray-300">›</span>
                    <span>{err.field}：{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-2">
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