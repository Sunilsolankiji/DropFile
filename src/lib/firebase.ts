import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

// Storage key for custom Firebase config
const STORAGE_KEY = 'dropfile_firebase_config';

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Get stored config from localStorage
function getStoredConfig(): FirebaseConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const config = JSON.parse(stored) as FirebaseConfig;
      if (config.apiKey && config.projectId && config.storageBucket) {
        return config;
      }
    }
  } catch (e) {
    console.error('Error reading Firebase config from localStorage:', e);
  }
  return null;
}

// Get config from environment variables
function getEnvConfig(): FirebaseConfig {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
  };
}

// Get the active Firebase config (stored takes priority over env)
function getFirebaseConfig(): FirebaseConfig {
  const storedConfig = getStoredConfig();
  if (storedConfig) {
    console.log('Using custom Firebase config from settings');
    return storedConfig;
  }
  console.log('Using Firebase config from environment variables');
  return getEnvConfig();
}

// Check if Firebase is properly configured
export function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig();
  return !!(
    config.apiKey &&
    config.apiKey !== 'your_api_key_here' &&
    config.apiKey !== 'YOUR_API_KEY_HERE' &&
    config.projectId &&
    config.storageBucket
  );
}

// Get the active config
const firebaseConfig = getFirebaseConfig();

// Initialize Firebase
let app: FirebaseApp;
let db: Firestore;
let storage: FirebaseStorage;

try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
  storage = getStorage(app);
} catch (error) {
  console.error('Error initializing Firebase:', error);
  // Create a dummy app for when Firebase is not configured
  app = {} as FirebaseApp;
  db = {} as Firestore;
  storage = {} as FirebaseStorage;
}

export { app, db, storage };
