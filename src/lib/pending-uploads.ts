/**
 * Files chosen on the Nearby page that should be shared through the server relay instead
 * (fallback when a direct connection is impossible). The room page picks them up once connected.
 */
const pending = new Map<string, File[]>();

export function queueRoomUploads(roomCode: string, files: File[]): void {
  pending.set(roomCode, [...(pending.get(roomCode) ?? []), ...files]);
}

export function takeRoomUploads(roomCode: string): File[] {
  const files = pending.get(roomCode) ?? [];
  pending.delete(roomCode);
  return files;
}
