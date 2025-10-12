import React, { useState, useEffect } from 'react';
import { Users, Award } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, query, collection, where, orderBy, getDocs } from 'firebase/firestore';

export default function HomePage({ hasActiveSession, onEnterSession, isAdmin, onCreateSession }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [userStats, setUserStats] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setIsLoggedIn(true);
        await loadUserStats(user.uid);
      } else {
        setCurrentUser(null);
        setIsLoggedIn(false);
        setShowStats(false);
        setUserStats(null);
      }
    });
    return () => unsub();
  }, []);

  const loadUserStats = async (uid) => {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const user = userSnap.exists() ? userSnap.data() : {};

    // Load sessions where user participated
    const q = query(
      collection(db, 'sessions'),
      where('participantUids', 'array-contains', uid),
      orderBy('date', 'desc')
    );
    const sessionsSnap = await getDocs(q);
    const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    setUserStats({
      totalSessions: user?.stats?.totalSessions || 0,
      asParticipant: user?.stats?.asParticipant || 0,
      asReserve: user?.stats?.asReserve || 0,
      friendsBrought: user?.stats?.friendsBrought || 0,
      sessionsHistory: sessions,
    });
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsLoggedIn(false);
    setCurrentUser(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-gray-800 rounded-xl shadow-2xl p-8 mb-6 border border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-3 rounded-lg">
                <Users className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-100">Iscrizioni pallavolo</h1>
                <div className="mt-2 text-lg text-indigo-300 font-semibold">Nessuna partita attiva</div>
              </div>
            </div>
            {/* Icona utente sempre visibile */}
            {isLoggedIn && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowStats(!showStats)}
                  className="p-2 bg-gray-700 rounded-full border border-gray-600 hover:bg-gray-600 transition"
                  title="Area personale"
                >
                  <img
                    src={currentUser.photoURL || ''}
                    alt={currentUser.displayName || ''}
                    className="w-10 h-10 rounded-full border-2 border-indigo-500"
                  />
                </button>
                {/* Area personale con statistiche e logout */}
                {showStats && userStats && (
                  <div className="absolute right-0 mt-2 w-80 bg-gray-800 rounded-lg shadow-lg border border-gray-700 z-10 p-6">
                    <h3 className="text-xl font-bold text-gray-100 mb-4 flex items-center gap-2">
                      <Award className="w-6 h-6 text-yellow-500" />
                      Le tue statistiche
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
                        <div className="text-3xl font-bold text-indigo-400">{userStats.totalSessions || 0}</div>
                        <div className="text-sm text-gray-400">Sessioni totali</div>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
                        <div className="text-3xl font-bold text-green-400">{userStats.asParticipant || 0}</div>
                        <div className="text-sm text-gray-400">Come partecipante</div>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
                        <div className="text-3xl font-bold text-amber-400">{userStats.asReserve || 0}</div>
                        <div className="text-sm text-gray-400">Come riserva</div>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
                        <div className="text-3xl font-bold text-purple-400">{userStats.friendsBrought || 0}</div>
                        <div className="text-sm text-gray-400">Amici portati</div>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="mt-6 w-full px-4 py-2 bg-gray-700 text-gray-100 rounded-lg hover:bg-gray-600 transition border border-gray-600"
                    >
                      Esci
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Content area with consistent layout */}
        <div className="flex flex-col items-center justify-center">
          <div className="bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-700 w-full max-w-md text-center">
            {hasActiveSession ? (
              <button
                onClick={onEnterSession}
                className="px-8 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium mb-4"
              >
                Vai alla partita attiva
              </button>
            ) : (
              <div className="text-lg text-yellow-200 mb-6">Nessuna partita attiva, attendere che venga creata</div>
            )}
            {isAdmin && (
              <button
                onClick={onCreateSession}
                className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
              >
                Crea nuova partita
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
