import type { ReportFormatter, ScanResult } from '../types.js';

export const jsonFormatter: ReportFormatter = {
  format(result: ScanResult): string {
    // Deterministic JSON: sorted keys ensure identical output across runs
    return JSON.stringify(
      {
        version: result.metadata.toolVersion,
        file: result.file,
        ranges: result.ranges,
        summary: result.summary,
        metadata: result.metadata,
      },
      null,
      2,
    );
  },
};
