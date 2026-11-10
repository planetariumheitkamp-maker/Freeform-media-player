export function createRecordingController(options: {
  getMainWindow: () => unknown;
  describeFile: (filePath: string) => unknown;
}): Record<string, (...args: any[]) => Promise<any>>;
