
import React, { useState, useCallback, useEffect } from 'react';
import { AppStep, RichMenu, Folder, ProjectStatus, Project } from './types';
import { ConnectLineStep } from './routes/editor/steps/ConnectLineStep';
import { DraftListStep } from './routes/editor/steps/DraftListStep';
import { UploadMenuImage } from './routes/editor/steps/UploadMenuImage';
import { EditorPage } from './routes/editor/EditorPage';
import { PreviewLineStep } from './routes/editor/steps/PreviewLineStep';
import { PublishLineStep } from './routes/editor/steps/PublishLineStep';
import { Button } from './components/common/Button';
import { supabase } from './supabaseClient';

function App() {
  const [step, setStep] = useState<AppStep>(AppStep.CONNECT);
  const [menus, setMenus] = useState<RichMenu[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const [drafts, setDrafts] = useState<Project[]>([
    {
      id: '1',
      name: '夏季促銷活動選單',
      status: 'published',
      folderId: 'f1',
      updatedAt: new Date().toISOString(),
      menus: [{
        id: 'm1',
        name: '主選單',
        barText: '查看更多優惠',
        isMain: true,
        imageData: null,
        hotspots: []
      }]
    },
    {
      id: '2',
      name: '客戶服務導覽',
      status: 'scheduled',
      scheduledAt: '2024-05-20 10:00',
      folderId: null,
      updatedAt: new Date().toISOString(),
      menus: [{
        id: 'm2',
        name: '主選單',
        barText: '打開選單',
        isMain: true,
        imageData: null,
        hotspots: []
      }]
    },
  ]);

  const [folders, setFolders] = useState<Folder[]>([
    { id: 'f1', name: '2024 活動專案' },
    { id: 'f2', name: '品牌形象' },
  ]);

  useEffect(() => {
    if (showSaveSuccess) {
      const timer = setTimeout(() => setShowSaveSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSaveSuccess]);

  const handleAddFolder = () => {
    const newFolder = { id: crypto.randomUUID(), name: '新資料夾' };
    setFolders([...folders, newFolder]);
  };

  const handleRenameFolder = (id: string, newName: string) => {
    setFolders(folders.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const handleDeleteFolder = (id: string) => {
    setFolders(folders.filter(f => f.id !== id));
    setDrafts(drafts.map(d => d.folderId === id ? { ...d, folderId: null } : d));
  };

  const handleMoveToFolder = (draftId: string, folderId: string | null) => {
    setDrafts(drafts.map(d => d.id === draftId ? { ...d, folderId } : d));
  };

  const handleConnectComplete = () => setStep(AppStep.DRAFT_LIST);
  const handleCreateNewDraft = () => setStep(AppStep.UPLOAD);

  const handleSelectDraft = (id: string) => {
    const project = drafts.find(d => d.id === id);
    if (project) {
      setSelectedProjectId(project.id);
      setMenus(project.menus);
      // Find main menu or first menu
      const initialMenuId = project.menus.find(m => m.isMain)?.id || project.menus[0]?.id || '';
      setSelectedMenuId(initialMenuId);
      setStep(AppStep.EDITOR);
    }
  };

  const handleDeleteDraft = (id: string) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  const handleImageUploaded = (base64: string | null) => {
    const projectId = crypto.randomUUID();
    const mainMenuId = crypto.randomUUID();

    const mainMenu: RichMenu = {
      id: mainMenuId,
      name: '主選單',
      barText: '選單',
      isMain: true,
      imageData: base64,
      hotspots: []
    };

    // Create new project immediately
    const newProject: Project = {
      id: projectId,
      name: '未命名專案',
      status: 'draft',
      folderId: null,
      menus: [mainMenu],
      updatedAt: new Date().toISOString()
    };

    setDrafts(prev => [newProject, ...prev]);
    setSelectedProjectId(projectId);
    setMenus([mainMenu]);
    setSelectedMenuId(mainMenuId);
    setStep(AppStep.EDITOR);
  };

  const handleSaveDraft = useCallback(() => {
    if (!selectedProjectId) return;

    setDrafts(prev => prev.map(p => {
      if (p.id === selectedProjectId) {
        // Update project with current menus state
        // Also update project name from main menu name if desirable, or keep separate
        const mainMenu = menus.find(m => m.isMain);
        return {
          ...p,
          menus: [...menus],
          name: mainMenu ? mainMenu.name : p.name, // Sync project name with main menu name
          updatedAt: new Date().toISOString()
        };
      }
      return p;
    }));
    setShowSaveSuccess(true);
  }, [menus, selectedProjectId]);

  const handleUpdateDraftStatus = (id: string, status: ProjectStatus, scheduledAt?: string) => {
    // Note: id here passed from PublishLineStep is likely menuId if we didn't update it,
    // but we should check where it comes from.
    // PublishLineStep passes mainMenu.id usually.
    // However, we want to update the PROJECT status.

    // Quick fix: Since we know the selectedProjectId, we can use that if id matches menu id
    // OR filter drafts.

    setDrafts(prev => prev.map(d => {
      // If the ID matches the project ID directly OR if the project contains the menu ID
      const isMatch = d.id === id || d.menus.some(m => m.id === id);

      if (isMatch) {
        return { ...d, status, scheduledAt };
      }
      return d;
    }));
    setStep(AppStep.DRAFT_LIST);
  };

  const handlePublishReset = () => {
    setMenus([]);
    setSelectedMenuId('');
    setSelectedHotspotId(null);
    setStep(AppStep.DRAFT_LIST);
  };

  const handleGoBack = () => {
    switch (step) {
      case AppStep.DRAFT_LIST: setStep(AppStep.CONNECT); break;
      case AppStep.UPLOAD: setStep(AppStep.DRAFT_LIST); break;
      case AppStep.EDITOR: setStep(AppStep.DRAFT_LIST); break;
      case AppStep.PREVIEW: setStep(AppStep.EDITOR); break;
      case AppStep.PUBLISH: setStep(AppStep.EDITOR); break;
      default: break;
    }
  };

  const handleLogout = () => {
    if (confirm('確定要登出系統嗎？')) {
      supabase.auth.signOut().finally(() => {
        setMenus([]);
        setSelectedMenuId('');
        setStep(AppStep.CONNECT);
      });
    }
  };

  const renderTopBar = () => (
    <header className="h-16 bg-white/80 backdrop-blur border-b border-border flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        {/* 在草稿頁面隱藏返回按鈕 */}
        {step !== AppStep.CONNECT && step !== AppStep.DRAFT_LIST && (
          <button
            onClick={handleGoBack}
            className="p-2 hover:bg-gray-100 rounded-full text-secondary transition-all active:scale-90"
            title="返回上一頁"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">L</div>
          <span className="font-bold text-text tracking-tight text-lg uppercase">Line <span className="text-primary">Studio</span></span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* 專案列表頁面顯示登出按鈕 */}
        {step === AppStep.DRAFT_LIST && (
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="text-secondary hover:text-error hover:bg-error/5 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            登出系統
          </Button>
        )}

        {step === AppStep.EDITOR && (
          <>
            <Button variant="ghost" onClick={handleSaveDraft} className="hover:bg-gray-100 text-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
              儲存草稿
            </Button>
            <Button variant="ghost" onClick={() => setStep(AppStep.PREVIEW)} className="hover:bg-gray-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              預覽測試
            </Button>
            <Button variant="primary" onClick={() => setStep(AppStep.PUBLISH)} className="px-8 shadow-lg shadow-primary/20">
              完成發布
            </Button>
          </>
        )}
      </div>
    </header>
  );

  return (
    <div className="h-screen flex flex-col bg-background font-sans text-text overflow-hidden relative">
      {renderTopBar()}
      {showSaveSuccess && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top duration-500">
          <div className="bg-white/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-success/20 px-6 py-3 rounded-full flex items-center gap-3">
            <div className="w-6 h-6 bg-success rounded-full flex items-center justify-center text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <span className="font-bold text-text text-sm">草稿儲存成功</span>
          </div>
        </div>
      )}
      <main className="flex-1 overflow-hidden relative">
        {step === AppStep.CONNECT && <ConnectLineStep onComplete={handleConnectComplete} />}
        {step === AppStep.DRAFT_LIST && (
          <DraftListStep
            drafts={drafts}
            folders={folders}
            onSelectDraft={handleSelectDraft}
            onDeleteDraft={handleDeleteDraft}
            onCreateNew={handleCreateNewDraft}
            onAddFolder={handleAddFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveToFolder={handleMoveToFolder}
          />
        )}
        {step === AppStep.UPLOAD && <UploadMenuImage onImageSelected={handleImageUploaded} onBack={handleGoBack} />}
        {step === AppStep.EDITOR && (
          <EditorPage
            menus={menus}
            setMenus={setMenus}
            selectedMenuId={selectedMenuId}
            selectedHotspotId={selectedHotspotId}
            setSelectedMenuId={setSelectedMenuId}
            setSelectedHotspotId={setSelectedHotspotId}
            onSaveDraft={handleSaveDraft}
          />
        )}
        {step === AppStep.PREVIEW && <PreviewLineStep menus={menus} onClose={() => setStep(AppStep.EDITOR)} />}
        {step === AppStep.PUBLISH && (
          <PublishLineStep
            menus={menus}
            onReset={handlePublishReset}
            onStatusChange={handleUpdateDraftStatus}
            onBack={handleGoBack}
          />
        )}
      </main>
    </div>
  );
}

export default App;
