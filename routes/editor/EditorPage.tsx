
import React from 'react';
import { RichMenu, Hotspot } from '../../types';
import { LineMenuList } from '../../components/line/LineMenuList';
import { LineCanvas } from '../../components/line/LineCanvas';
import { LineInspector } from '../../components/line/LineInspector';
import { CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_HOTSPOT_SIZE } from '../../constants';

interface EditorPageProps {
  menus: RichMenu[];
  selectedMenuId: string;
  selectedHotspotId: string | null;
  setMenus: React.Dispatch<React.SetStateAction<RichMenu[]>>;
  setSelectedMenuId: (id: string) => void;
  setSelectedHotspotId: (id: string | null) => void;
  onSaveDraft: () => void;
}

export const EditorPage: React.FC<EditorPageProps> = ({
  menus,
  selectedMenuId,
  selectedHotspotId,
  setMenus,
  setSelectedMenuId,
  setSelectedHotspotId,
  onSaveDraft
}) => {
  const currentMenu = menus.find(m => m.id === selectedMenuId);
  if (!currentMenu) return null;

  const currentHotspot = currentMenu.hotspots.find(h => h.id === selectedHotspotId);

  // --- Handlers ---

  const handleAddSubMenu = () => {
    // 子選單上限：9（依需求）
    const subMenuCount = menus.filter(m => !m.isMain).length;
    if (subMenuCount >= 9) {
      alert('子選單最多 9 頁，已達上限');
      return;
    }

    // Add missing required property 'barText' to RichMenu
    const newMenu: RichMenu = {
      id: crypto.randomUUID(),
      name: `新子選單 ${subMenuCount + 1}`,
      barText: '選單',
      isMain: false,
      // 子選單不預設複製主頁圖片（避免使用者忘了換圖）
      imageData: null,
      hotspots: []
    };
    
    setMenus(prev => [...prev, newMenu]);
    setSelectedMenuId(newMenu.id);
  };

  const handleDeleteSubMenu = (id: string) => {
    setMenus(prev => prev.filter(m => m.id !== id));
    if (selectedMenuId === id) {
      setSelectedMenuId(menus.find(m => m.isMain)?.id || '');
    }
  };

  const handleUpdateMenu = (updates: Partial<RichMenu>) => {
    setMenus(prev => prev.map(m => {
        if (m.id === selectedMenuId) {
            return { ...m, ...updates };
        }
        return m;
    }));
  };

  const handleUpdateHotspot = (hotspot: Hotspot) => {
    setMenus(prev => prev.map(m => {
      if (m.id === selectedMenuId) {
        return {
          ...m,
          hotspots: m.hotspots.map(h => h.id === hotspot.id ? hotspot : h)
        };
      }
      return m;
    }));
  };

  const handleAddHotspot = (hotspot: Hotspot) => {
     setMenus(prev => prev.map(m => {
      if (m.id === selectedMenuId) {
        return { ...m, hotspots: [...m.hotspots, hotspot] };
      }
      return m;
    }));
  };

  const createNewHotspot = () => {
    const width = DEFAULT_HOTSPOT_SIZE.width;
    const height = DEFAULT_HOTSPOT_SIZE.height;
    const x = Math.round((CANVAS_WIDTH - width) / 2);
    const y = Math.round((CANVAS_HEIGHT - height) / 2);

    const newHotspot: Hotspot = {
      id: crypto.randomUUID(),
      x,
      y,
      width,
      height,
      action: { type: 'message', data: '' }
    };

    handleAddHotspot(newHotspot);
    setSelectedHotspotId(newHotspot.id);
  };

  const handleDeleteHotspot = (id: string) => {
    setMenus(prev => prev.map(m => {
      if (m.id === selectedMenuId) {
        return { ...m, hotspots: m.hotspots.filter(h => h.id !== id) };
      }
      return m;
    }));
    setSelectedHotspotId(null);
  };

  const handleUpdateInspector = (updates: Partial<Hotspot>) => {
    if (!currentHotspot) return;
    handleUpdateHotspot({ ...currentHotspot, ...updates });
  };

  return (
    <div className="flex h-full border-t border-border">
      {/* Left Sidebar: Menus */}
      <div className="w-64 h-full bg-[#F5F5F7] flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <LineMenuList
          menus={menus}
          selectedMenuId={selectedMenuId}
          onSelectMenu={(id) => {
            setSelectedMenuId(id);
            setSelectedHotspotId(null);
          }}
          onAddSubMenu={handleAddSubMenu}
          onDeleteSubMenu={handleDeleteSubMenu}
        />
      </div>

      {/* Center: Canvas */}
      <div className="flex-1 h-full relative z-0">
        <LineCanvas
          menu={currentMenu}
          selectedHotspotId={selectedHotspotId}
          onSelectHotspot={setSelectedHotspotId}
          onUpdateHotspot={handleUpdateHotspot}
          onAddHotspot={handleAddHotspot}
        />
      </div>

      {/* Right Sidebar: Inspector */}
      <div className="w-80 h-full bg-white border-l border-border flex-shrink-0 z-10 shadow-[-4px_0_24px_rgba(0,0,0,0.02)]">
        <LineInspector
          hotspot={currentHotspot}
          selectedMenu={currentMenu}
          allMenus={menus}
          onUpdate={handleUpdateInspector}
          onUpdateMenu={handleUpdateMenu}
          onDelete={handleDeleteHotspot}
          onAdd={createNewHotspot}
          onSave={onSaveDraft}
          onDeselectHotspot={() => setSelectedHotspotId(null)}
        />
      </div>
    </div>
  );
};