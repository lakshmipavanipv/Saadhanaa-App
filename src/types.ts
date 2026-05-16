export interface Deity {
  id: string;
  name: string;
  icon: string;
  mantra: string;
  prayerAlarm: string;
  alarmOn: boolean;
  totalMalas: number;
  targetMalas?: number;
  malaMaterial?: string;     // e.g. "Rudraksha", "Yellow Citrine", "Turmeric"
  malaColor?: string;        // primary bead color (hex)
  malaHighlight?: string;    // highlight / specular color
}

export interface UserProfile {
  name: string;
  email?: string;
  phone?: string;
  createdAt: string;
  onboarded: boolean;
}

export interface Festival {
  id: string;
  name: string;
  date: string;
  region: 'Hindu' | 'Sikh' | 'Muslim' | 'Christian';
  wish: string;
  wishSub: string;
  checklist: ChecklistItem[];
}

export interface ChecklistItem {
  id: number;
  text: string;
  tag: string;
}

export interface HistoryEntry {
  id: string;
  date: string;
  deity: string;
  deityId: string;
  malas: number;
  japas: number;
}

export interface JapaSession {
  deity: string;
  deityId: string;
  malas: number;
  japas: number;
  date: string;
}
