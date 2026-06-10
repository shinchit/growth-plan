export interface Habits {
  logical: boolean;
  critical: boolean;
  reading: boolean;
  ai: boolean;
  blog: boolean;
  weekly_reflection: boolean;
}

export interface CheckinRecord {
  userId: string;
  date: string; // YYYY-MM-DD
  habits: Habits;
  today_done: string;
  tomorrow_tasks: string;
  blog_count: number;
  insights: string;
  mood: string;
  obstacles: string;
  updated_at: string;
}

export interface SettingsRecord {
  userId: string;
  date: 'settings';
  reminder_enabled: boolean;
  reminder_email: string;
}

export interface SummaryResponse {
  streak: number;
  this_week_rate: number;
  this_month_blog_count: number;
  this_month_checkin_days: number;
  today_habits_done: boolean;
}
