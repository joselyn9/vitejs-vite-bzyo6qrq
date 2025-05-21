import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your Firebase configuration object from the Firebase Console
const firebaseConfig = {
  apiKey: 'AIzaSyBhXE9a-ZUZeM9P7AqVFQx0NCu9wNsQENQ',
  authDomain: 'incomeexpenseapp-1b143.firebaseapp.com',
  projectId: 'incomeexpenseapp-1b143',
  storageBucket: 'incomeexpenseapp-1b143.firebasestorage.app',
  messagingSenderId: '358266518387',
  appId: '1:358266518387:web:74fea641d315634928a306',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

export { db };
