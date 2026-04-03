import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Your web app's Firebase configuration
// Replace with actual config from Firebase console
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSy_MOCK_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "seo-growth-engine.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "seo-growth-engine",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "seo-growth-engine.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
