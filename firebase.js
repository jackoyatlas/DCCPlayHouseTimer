import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDSqhZyTKeOuNmu3DH7-dgv05JpqkifVS4",
  authDomain: "playhgousetimer.firebaseapp.com",
  projectId: "playhgousetimer",
  storageBucket: "playhgousetimer.firebasestorage.app",
  messagingSenderId: "887165264923",
  appId: "1:887165264923:web:2fb7f546bb0cd640ff44be"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const db = getFirestore(app);
