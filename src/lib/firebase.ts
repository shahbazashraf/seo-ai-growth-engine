import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Firebase client config — safe to commit (public credentials).
// Access is controlled by Firebase Auth & Security Rules, not by keeping these secret.
// Project: seo-engine-b7ba3 (Firebase Console)
const firebaseConfig = {
  apiKey:            "AIzaSyDhD_0pfLmwJqU-RyoWevPL3qkdmu0LI4E",
  authDomain:        "seo-engine-b7ba3.firebaseapp.com",
  projectId:         "seo-engine-b7ba3",
  storageBucket:     "seo-engine-b7ba3.firebasestorage.app",
  messagingSenderId: "534668770237",
  appId:             "1:534668770237:web:48d6e9fddbf41c995130d4",
  measurementId:     "G-EB2PRVWDR0",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
