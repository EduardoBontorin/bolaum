// =============================================================================
// js/firebase.js — Firebase SDK initialization + Firestore re-exports
// =============================================================================
//
// SETUP INSTRUCTIONS:
// -------------------
// 1. Go to https://console.firebase.google.com → create project "bolao-copa-2026"
// 2. Disable Google Analytics → "Create project"
// 3. Left menu: Build → Firestore Database → "Create database"
//    - Choose production mode
//    - Region: southamerica-east1
// 4. In Rules tab, replace content with:
//      rules_version = '2';
//      service cloud.firestore {
//        match /databases/{database}/documents {
//          match /{document=**} {
//            allow read, write: if true;
//          }
//        }
//      }
//    Click "Publish".
// 5. Project settings (gear icon) → General → "Your apps" → click </> (Web)
//    - App nickname: bolao-copa-2026-web (no Firebase Hosting)
//    - Copy the firebaseConfig object shown
// 6. Replace each "SUBSTITUA..." value below with your actual config values.
// =============================================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc,
  getDocs, collection, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "SUBSTITUA_PELA_SUA_API_KEY",
  authDomain:        "SUBSTITUA.firebaseapp.com",
  projectId:         "SUBSTITUA_PELO_SEU_PROJECT_ID",
  storageBucket:     "SUBSTITUA.firebasestorage.app",
  messagingSenderId: "SUBSTITUA_PELO_SENDER_ID",
  appId:             "SUBSTITUA_PELO_APP_ID"
};

initializeApp(firebaseConfig);
export const db = getFirestore();
export { doc, getDoc, setDoc, getDocs, collection, deleteDoc };
