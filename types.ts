export type ActionType = 'switch' | 'message' | 'uri' | 'none';

export interface Action {
  type: ActionType;
  label?: string; 
  data: string; 
}

export interface Hotspot {
  id: string;
  x: number; 
  y: number; 
  width: number;
  height: number;
  action: Action;
}

export type ProjectStatus = 'draft' | 'scheduled' | 'published';

export interface RichMenu {
  id: string;
  name: string;
  barText: string; 
  isMain: boolean;
  imageData: string | null; 
  hotspots: Hotspot[];
  status?: ProjectStatus;
  scheduledAt?: string;
  folderId?: string | null;
}

export enum AppStep {
  CONNECT = 'CONNECT',
  DRAFT_LIST = 'DRAFT_LIST',
  UPLOAD = 'UPLOAD',
  EDITOR = 'EDITOR',
  PREVIEW = 'PREVIEW',
  PUBLISH = 'PUBLISH'
}

export interface Folder {
  id: string;
  name: string;
}