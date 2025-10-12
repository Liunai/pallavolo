
// import React rimosso, già importato sotto
import VolleyballSignup from './components/VolleyballSignup.jsx';
import HomePage from './components/HomePage.jsx';
import './App.css';

import React, { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function App() {
  const [showSession, setShowSession] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // eslint-disable-line no-unused-vars

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsAdmin(user?.email === 'tidolamiamail@gmail.com');
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    async function checkSession() {
      const snap = await getDoc(doc(db, 'state', 'currentSession'));
      setHasActiveSession(!!snap.exists() && !!snap.data().date);
    }
    checkSession();
  }, [showSession]);

  if (!showSession) {
    return (
      <HomePage
        hasActiveSession={hasActiveSession}
        onEnterSession={() => setShowSession(true)}
        isAdmin={isAdmin}
        onCreateSession={() => setShowSession(true)}
      />
    );
  }
  return (
    <div className="app-bg">
      <main style={{display: 'flex', justifyContent: 'center'}}>
        <div style={{width: '100%', maxWidth: '900px'}}>
          <VolleyballSignup />
        </div>
      </main>
    </div>
  );
}
