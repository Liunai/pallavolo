import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, Clock, Calendar, Award, BarChart3 } from 'lucide-react';
import { auth, db, provider } from '../lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  orderBy,
  getDocs,
  increment,
} from 'firebase/firestore';

const MAX_PARTICIPANTS = 14;

export default function VolleyballSignup() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  const [participants, setParticipants] = useState([]);
  const [reserves, setReserves] = useState([]);
  const [friendsCount, setFriendsCount] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [userStats, setUserStats] = useState(null);

  const currentSessionRef = useMemo(() => doc(db, 'state', 'currentSession'), []);

  // Listen to auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setIsLoggedIn(true);
        await setDoc(
          doc(db, 'users', user.uid),
          {
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastLogin: serverTimestamp(),
          },
          { merge: true }
        );
        loadUserStats(user.uid);
      } else {
        setCurrentUser(null);
        setIsLoggedIn(false);
        setShowStats(false);
        setUserStats(null);
      }
    });
    return () => unsub();
  }, []);

  // Ensure current session exists and subscribe to realtime updates
  useEffect(() => {
    let unsub;
    (async () => {
      const snap = await getDoc(currentSessionRef);
      if (!snap.exists()) {
        await setDoc(currentSessionRef, {
          participants: [],
          reserves: [],
          lastUpdated: serverTimestamp(),
        });
      }
      unsub = onSnapshot(currentSessionRef, (docSnap) => {
        const data = docSnap.data();
        setParticipants(Array.isArray(data?.participants) ? data.participants : []);
        setReserves(Array.isArray(data?.reserves) ? data.reserves : []);
      });
    })();
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [currentSessionRef]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, provider);
      const user = res.user;
      await setDoc(
        doc(db, 'users', user.uid),
        {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          lastLogin: serverTimestamp(),
        },
        { merge: true }
      );
      setCurrentUser(user);
      setIsLoggedIn(true);
      loadUserStats(user.uid);
    } catch (e) {
      alert('Errore durante il login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsLoggedIn(false);
    setCurrentUser(null);
    setShowStats(false);
    setUserStats(null);
  };

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

  const isUserSignedUp = () => {
    return (
      participants.some((p) => p.uid === currentUser?.uid) ||
      reserves.some((r) => r.uid === currentUser?.uid)
    );
  };

  const getTotalCount = () => {
    let total = participants.length;
    for (const p of participants) total += (p.friends?.length || 0);
    return total;
  };

  const getReservesTotalCount = () => {
    let total = reserves.length;
    for (const r of reserves) total += (r.friends?.length || 0);
    return total;
  };

  const handleSignup = async (asReserve = false) => {
    if (!isLoggedIn || !currentUser) return;

    const friendsList = [];
    for (let i = 0; i < friendsCount; i++) {
      friendsList.push(`Amico ${i + 1} di ${currentUser.displayName}`);
    }

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(currentSessionRef);
        const data = snap.data() || { participants: [], reserves: [] };
        const alreadyParticipant = data.participants?.some((p) => p.uid === currentUser.uid);
        const alreadyReserve = data.reserves?.some((r) => r.uid === currentUser.uid);
        if (alreadyParticipant || alreadyReserve) {
          throw new Error('Sei già iscritto!');
        }

        const newEntry = {
          uid: currentUser.uid,
          name: currentUser.displayName,
          photoURL: currentUser.photoURL,
          friends: friendsList,
          timestamp: new Date().toLocaleString('it-IT'),
        };

        const updated = { ...data };
        updated.participants = Array.isArray(updated.participants) ? updated.participants : [];
        updated.reserves = Array.isArray(updated.reserves) ? updated.reserves : [];

        if (asReserve) {
          updated.reserves = [...updated.reserves, newEntry];
        } else {
          if (updated.participants.length < MAX_PARTICIPANTS) {
            updated.participants = [...updated.participants, newEntry];
          } else {
            updated.reserves = [...updated.reserves, newEntry];
          }
        }

        transaction.set(currentSessionRef, {
          participants: updated.participants,
          reserves: updated.reserves,
          lastUpdated: serverTimestamp(),
        });
      });

      // Increment stats on user document for role and friends
      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          stats: {
            asParticipant: asReserve ? increment(0) : increment(1),
            asReserve: asReserve ? increment(1) : increment(0),
            friendsBrought: increment(friendsCount || 0),
            totalSessions: increment(0), // updated only at session end
          },
        },
        { merge: true }
      );

      setFriendsCount(0);
      await loadUserStats(currentUser.uid);

      if (!asReserve && participants.length >= MAX_PARTICIPANTS) {
        alert('Lista partecipanti piena! Sei stato aggiunto alle riserve.');
      }
    } catch (e) {
      alert(e.message || 'Errore durante l\'iscrizione');
    }
  };

  const handleUnsubscribe = async () => {
    if (!isLoggedIn || !currentUser) return;

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(currentSessionRef);
        const data = snap.data() || { participants: [], reserves: [] };
        const participantIndex = data.participants.findIndex((p) => p.uid === currentUser.uid);
        const reserveIndex = data.reserves.findIndex((r) => r.uid === currentUser.uid);

        if (participantIndex === -1 && reserveIndex === -1) {
          throw new Error('Non sei iscritto a questo allenamento.');
        }

        const newParticipants = [...data.participants];
        let newReserves = [...data.reserves];

        if (participantIndex !== -1) {
          newParticipants.splice(participantIndex, 1);
          if (newReserves.length > 0) {
            const firstReserve = newReserves[0];
            newReserves = newReserves.slice(1);
            newParticipants.push(firstReserve);
            // We cannot easily alert from inside transaction; handled outside via flag
          }
        } else if (reserveIndex !== -1) {
          newReserves = newReserves.filter((r) => r.uid !== currentUser.uid);
        }

        transaction.set(currentSessionRef, {
          participants: newParticipants,
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
        });
      });
    } catch (e) {
      alert(e.message || 'Errore durante la disiscrizione');
    }
  };

  const handleEndSession = async () => {
    try {
      const snap = await getDoc(currentSessionRef);
      const data = snap.data() || { participants: [], reserves: [] };
      if (!data.participants || data.participants.length === 0) {
        alert('Non ci sono partecipanti da salvare!');
        return;
      }

      const sessionRecord = {
        date: serverTimestamp(),
        participants: data.participants,
        reserves: data.reserves || [],
        participantUids: (data.participants || []).map((p) => p.uid),
        reserveUids: (data.reserves || []).map((r) => r.uid),
      };

      const newSessionRef = await addDoc(collection(db, 'sessions'), sessionRecord);

      // Increment totalSessions for each participant
      const updates = (data.participants || []).map((p) =>
        updateDoc(doc(db, 'users', p.uid), {
          'stats.totalSessions': increment(1),
        })
      );
      await Promise.allSettled(updates);

      // Clear current session
      await setDoc(currentSessionRef, {
        participants: [],
        reserves: [],
        lastUpdated: serverTimestamp(),
        lastSessionId: newSessionRef.id,
      }, { merge: true });

      alert('Sessione salvata! Le statistiche sono state aggiornate.');
      if (currentUser) await loadUserStats(currentUser.uid);
    } catch (e) {
      alert('Errore durante la chiusura della sessione');
    }
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
                <h1 className="text-3xl font-bold text-gray-100">Allenamento Pallavolo</h1>
                <p className="text-gray-400">Sistema di gestione iscrizioni</p>
              </div>
            </div>
            {isLoggedIn && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowStats(!showStats)}
                  className="px-4 py-2 bg-indigo-600 text-gray-100 rounded-lg hover:bg-indigo-700 transition border border-indigo-500 flex items-center gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  Statistiche
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-gray-700 text-gray-100 rounded-lg hover:bg-gray-600 transition border border-gray-600"
                >
                  Esci
                </button>
              </div>
            )}
          </div>

          {!isLoggedIn ? (
            <div className="space-y-4 text-center py-8">
              <p className="text-gray-300 mb-6">Accedi con Google per iscriverti agli allenamenti</p>
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="inline-flex items-center gap-3 px-8 py-4 bg-white text-gray-800 rounded-lg hover:bg-gray-100 transition font-medium shadow-lg disabled:opacity-50"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {loading ? 'Accesso in corso...' : 'Accedi con Google'}
              </button>
              <p className="text-xs text-gray-500 mt-4">* Login con Firebase/Google OAuth</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-indigo-900 rounded-lg p-4 border border-indigo-700 flex items-center gap-4">
                <img
                  src={currentUser.photoURL || ''}
                  alt={currentUser.displayName || ''}
                  className="w-12 h-12 rounded-full border-2 border-indigo-500"
                />
                <div className="flex-1">
                  <p className="text-lg font-medium text-indigo-100">
                    Benvenuto, <span className="font-bold">{currentUser.displayName}</span>!
                  </p>
                  <p className="text-sm text-indigo-300">{currentUser.email}</p>
                </div>
              </div>

              {showStats && userStats && (
                <div className="bg-gray-700 rounded-lg p-6 border border-gray-600">
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
                </div>
              )}

              {!isUserSignedUp() && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Numero di amici da portare (max 3)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="3"
                      value={friendsCount}
                      onChange={(e) =>
                        setFriendsCount(Math.min(3, Math.max(0, parseInt(e.target.value) || 0)))
                      }
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-100"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleSignup(false)}
                      className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center justify-center gap-2"
                    >
                      <UserPlus className="w-5 h-5" />
                      Iscriviti come Partecipante
                    </button>
                    <button
                      onClick={() => handleSignup(true)}
                      className="flex-1 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-medium flex items-center justify-center gap-2"
                    >
                      <Clock className="w-5 h-5" />
                      Iscriviti come Riserva
                    </button>
                  </div>
                </div>
              )}

              {isUserSignedUp() && (
                <button
                  onClick={handleUnsubscribe}
                  className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
                >
                  Disiscriviti
                </button>
              )}

              {(participants.length > 0 || reserves.length > 0) && (
                <button
                  onClick={handleEndSession}
                  className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium flex items-center justify-center gap-2"
                >
                  <Calendar className="w-5 h-5" />
                  Concludi sessione e salva statistiche
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-100">Partecipanti</h2>
              <span className="bg-green-900 text-green-200 px-3 py-1 rounded-full font-semibold text-sm border border-green-700">
                {getTotalCount()} / {MAX_PARTICIPANTS}
              </span>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {participants.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nessun partecipante</p>
              ) : (
                participants.map((participant, index) => (
                  <div key={participant.uid + '_' + index} className="bg-green-900 rounded-lg p-3 border border-green-700">
                    <div className="flex items-center gap-3">
                      <img
                        src={participant.photoURL}
                        alt={participant.name}
                        className="w-10 h-10 rounded-full border-2 border-green-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-100">{participant.name}</span>
                          <span className="text-xs text-gray-400">{participant.timestamp}</span>
                        </div>
                        {participant.friends?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {participant.friends.map((friend, fIndex) => (
                              <div key={fIndex} className="text-sm text-gray-300 flex items-center gap-2">
                                <span className="text-green-400">↳</span>
                                {friend}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-100">Riserve</h2>
              <span className="bg-amber-900 text-amber-200 px-3 py-1 rounded-full font-semibold text-sm border border-amber-700">
                {getReservesTotalCount()}
              </span>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {reserves.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nessuna riserva</p>
              ) : (
                reserves.map((reserve, index) => (
                  <div key={reserve.uid + '_' + index} className="bg-amber-900 rounded-lg p-3 border border-amber-700">
                    <div className="flex items-center gap-3">
                      <img
                        src={reserve.photoURL}
                        alt={reserve.name}
                        className="w-10 h-10 rounded-full border-2 border-amber-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-100">
                            {index + 1}. {reserve.name}
                          </span>
                          <span className="text-xs text-gray-400">{reserve.timestamp}</span>
                        </div>
                        {reserve.friends?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {reserve.friends.map((friend, fIndex) => (
                              <div key={fIndex} className="text-sm text-gray-300 flex items-center gap-2">
                                <span className="text-amber-400">↳</span>
                                {friend}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
