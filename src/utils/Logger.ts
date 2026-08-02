// Global structured logger for all modules
type LogEntry = { time: string; tag: string; text: string; data?: unknown };

class LoggerImpl {
  private entries: LogEntry[] = [];

  log(tag: string, text: string, data?: unknown): void {
    const entry: LogEntry = {
      time: new Date().toLocaleTimeString(),
      tag,
      text,
      data,
    };
    this.entries.push(entry);
    console.log(`[${entry.time}] [${tag}] ${text}`, data ?? '');
  }

  getAll(): LogEntry[] { return [...this.entries]; }

  getFormatted(): string {
    return this.entries.map(e =>
      `[${e.time}] [${e.tag}] ${e.text}${e.data !== undefined ? ` ${JSON.stringify(e.data).substring(0, 200)}` : ''}`
    ).join('\n');
  }

  clear(): void { this.entries = []; }
}

export const Logger = new LoggerImpl();
