// metrics.ts - Basic metrics for monitoring
export class Metrics {
  private static counters = new Map<string, number>();
  private static gauges = new Map<string, number>();

  static incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }

  static setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.gauges.set(key, value);
  }

  static getMetrics(): string {
    let output = '';

    // Add counters
    for (const [key, value] of this.counters) {
      const [name, labelsStr] = key.split(':');
      const labels = JSON.parse(labelsStr);
      const labelsStrFormatted = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      output += `# HELP ${name} Total number of ${name}\n`;
      output += `# TYPE ${name} counter\n`;
      output += `${name}{${labelsStrFormatted}} ${value}\n\n`;
    }

    // Add gauges
    for (const [key, value] of this.gauges) {
      const [name, labelsStr] = key.split(':');
      const labels = JSON.parse(labelsStr);
      const labelsStrFormatted = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      output += `# HELP ${name} Current value of ${name}\n`;
      output += `# TYPE ${name} gauge\n`;
      output += `${name}{${labelsStrFormatted}} ${value}\n\n`;
    }

    return output;
  }
}
