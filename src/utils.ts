import { PANCHANG_FESTIVALS, PanchangFestival } from './festivalsData';

const parseLocal = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const getDaysUntil = (dateStr: string): number => {
  const target = parseLocal(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

export const getUpcoming = (): PanchangFestival | null => {
  const festivals = PANCHANG_FESTIVALS
    .filter(f => getDaysUntil(f.date) >= 0)
    .sort((a, b) => parseLocal(a.date).getTime() - parseLocal(b.date).getTime());
  return festivals.length > 0 ? festivals[0] : null;
};

export const getTodayFest = (): PanchangFestival | null => {
  const today = todayStr();
  return PANCHANG_FESTIVALS.find(f => f.date === today) || null;
};

export const getGreeting = (): string => {
  const now = new Date();
  const hours = now.getHours();
  if (hours < 12) return '🌅 Subha Prabhat';
  if (hours < 17) return '☀️ Shubh Dopahar';
  return '🌙 Shubh Sandhya';
};

export const formatDate = (dateStr: string): string => {
  return parseLocal(dateStr).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const formatShortDate = (dateStr: string): string => {
  return parseLocal(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};
