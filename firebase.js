import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCa4TGFuTu8u1HV06DDwfjtq35zWkGPDwM",
    authDomain: "playhousetimer.firebaseapp.com",
    projectId: "playhousetimer",
    storageBucket: "playhousetimer.firebasestorage.app",
    messagingSenderId: "850267989143",
    appId: "1:850267989143:web:be3a03a2af6d1d0e66f5d2"
  };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);