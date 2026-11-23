// ANCI - Firebase configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAm9Fwjzv-iicP796Yb5v-8359HyfzM5U8",
  authDomain: "anci-webapp01.firebaseapp.com",
  projectId: "anci-webapp01",
  storageBucket: "anci-webapp01.firebasestorage.app",
  messagingSenderId: "299839845334",
  appId: "1:299839845334:web:707dfb1b348e1553fdaa77",
  measurementId: "G-GVBRTGL8SR"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// Second app instance: lets the admin create student logins without being logged out
export const auth2 = getAuth(initializeApp(firebaseConfig, "second"));
