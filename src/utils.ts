import { FESTIVAL_DB } from './constants';
import { Festival } from './types';

export const todayStr = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const getDaysUntil = (dateStr: string): number => {
  return Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / 86400000);
};

export const getUpcoming = (): Festival | null => {
  const festivals = Object.values(FESTIVAL_DB)
    .flat()
    .filter(f => getDaysUntil(f.date) >= 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return festivals.length > 0 ? festivals[0] : null;
};

export const getTodayFest = (): Festival | null => {
  const today = todayStr();
  const festivals = Object.values(FESTIVAL_DB).flat();
  return festivals.find(f => f.date === today) || null;
};

export const getGreeting = (): string => {
  const now = new Date();
  const hours = now.getHours();
  if (hours < 12) return '🌅 Subha Prabhat';
  if (hours < 17) return '☀️ Shubh Dopahar';
  return '🌙 Shubh Sandhya';
};

export const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const formatShortDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};
