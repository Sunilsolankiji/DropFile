export function generateAccessCode(): string {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const DEVICE_NAME_ADJECTIVES = [
  'Tez', 'Toofani', 'Bijli', 'Shaandaar', 'Mast', 'Zabardast', 'Jhakaas',
  'Bindaas', 'Rangeela', 'Dhinchak', 'Jugaadu', 'Phataka', 'Chulbul', 'Rocket',
];

const DEVICE_NAME_NOUNS = [
  'Cheetah', 'Chetak', 'Sher', 'Baaz', 'Mor', 'Hathi', 'Nilgai', 'Tendua',
  'Garuda', 'Nandi', 'Cobra', 'Magar', 'Kabootar', 'Ghoda',
];

// Build a friendly, creative Indian-flavoured device name (e.g. "Toofani Cheetah").
export function generateDeviceName(): string {
  const adjective = DEVICE_NAME_ADJECTIVES[Math.floor(Math.random() * DEVICE_NAME_ADJECTIVES.length)];
  const noun = DEVICE_NAME_NOUNS[Math.floor(Math.random() * DEVICE_NAME_NOUNS.length)];
  return `${adjective} ${noun}`;
}

export function formatFileSize(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
