// src/firebase.js
//
// Initializes the Firebase Web SDK for the React dashboard.
// This is a DIFFERENT credential from the backend's serviceAccountKey.json —
// this one is public-safe (it identifies your project, it doesn't grant
// admin access) and is meant to ship in client-side JS.
//
// Get these values from:
// Firebase Console > Project Settings (gear icon) > General tab >
// "Your apps" > select your Web app (or click </> to create one) >
// SDK setup and configuration > Config

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "REMOVED",
  authDomain: "traffic-overspeeding.firebaseapp.com",
  projectId: "traffic-overspeeding",
  storageBucket: "traffic-overspeeding.firebasestorage.app",
  messagingSenderId: "961627598535",
  appId: "1:961627598535:web:40a8968312ac108ce598e2",
  measurementId: "G-XQ0WVHYM3R",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);