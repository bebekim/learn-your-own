export interface FindingBoundaryPort {
  /** Return only after retaining all matching action snapshots; isolate individual capture failures. */
  captureAll(): readonly string[];
  status(id: string): { hasAfter: boolean; hasMeasurement: boolean };
  measure(id: string): { id: string };
  assess(evidenceRef: string): void;
  report(error: unknown): void;
}

export function completeFindingBoundary(port: FindingBoundaryPort): void {
  const captured = port.captureAll();
  let measured = false;
  for (const id of captured) {
    try {
      const status = port.status(id);
      if (!status.hasAfter) continue;
      if (!status.hasMeasurement) {
        // ponytail: one bounded evaluation per live boundary; later hooks drain retained pending work.
        if (measured) continue;
        measured = true;
      }
      const evidence = port.measure(id);
      port.assess(evidence.id);
    } catch (error) { port.report(error); }
  }
}
