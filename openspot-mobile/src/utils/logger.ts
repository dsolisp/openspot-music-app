import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_STORAGE_KEY = 'aura_debug_logs_v1';
const MAX_LOGS = 100;

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: string;
}

export class Logger {
  static async log(message: string, level: LogEntry['level'] = 'info', context?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    console.log(`[${level.toUpperCase()}] ${context ? `[${context}] ` : ''}${message}`);

    try {
      const stored = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      const logs: LogEntry[] = stored ? JSON.parse(stored) : [];
      logs.unshift(entry);
      
      // Keep only last MAX_LOGS
      const trimmed = logs.slice(0, MAX_LOGS);
      await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('Failed to save log to storage', e);
    }
  }

  static async getLogs(): Promise<LogEntry[]> {
    try {
      const stored = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static async clearLogs() {
    await AsyncStorage.removeItem(LOG_STORAGE_KEY);
  }
}
