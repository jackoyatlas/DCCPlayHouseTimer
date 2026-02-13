import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBu_BviaVj6-zt8AvNlD4iQHom_TDsQ1Iw",
  authDomain: "dcc-pos.firebaseapp.com",
  projectId: "dcc-pos",
  storageBucket: "dcc-pos.firebasestorage.app",
  messagingSenderId: "141578621014",
  appId: "1:141578621014:web:17406fdb5689e80685ebf7"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const db = getFirestore(app);