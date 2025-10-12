import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, Clock, Calendar, Award, ChevronLeft } from 'lucide-react';
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

// View states
const VIEW_STATES = {
  NO_MATCHES: 'no_matches',
  MATCH_LIST: 'match_list', 
  MATCH_DETAIL: 'match_detail',
  MATCH_HISTORY: 'match_history'
};

export default function VolleyballApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  const [participants, setParticipants] = useState([]);
  const [reserves, setReserves] = useState([]);
  const [sessionDate, setSessionDate] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendInput, setFriendInput] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [userStats, setUserStats] = useState(null);

  // New state management for unified component
  const [currentView, setCurrentView] = useState(VIEW_STATES.NO_MATCHES);
  const [availableMatches, setAvailableMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchHistory, setMatchHistory] = useState([]);

  const currentSessionRef = useMemo(() => doc(db, 'state', 'currentSession'), []);
  const isAdmin = currentUser?.email === 'tidolamiamail@gmail.com';

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
          date: getNextTuesday(),
        });
      }
      
      unsub = onSnapshot(currentSessionRef, (docSnap) => {
        const data = docSnap.data();
        setParticipants(Array.isArray(data?.participants) ? data.participants : []);
        setReserves(Array.isArray(data?.reserves) ? data.reserves : []);
        setSessionDate(data?.date || null);
        
        // Determine current view based on data
        if (data?.date) {
          // Se c'è una partita attiva, mostra sempre la vista dettaglio
          setCurrentView(VIEW_STATES.MATCH_DETAIL);
          setSelectedMatch(data);
        } else {
          // Se non c'è partita, mostra la vista "nessuna partita"
          setCurrentView(VIEW_STATES.NO_MATCHES);
        }
      });
    })();
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [currentSessionRef, currentView]);

  // Funzione per calcolare la data del martedì successivo alle 20:30
  function getNextTuesday() {
    const today = new Date();
    const day = today.getDay();
    // 2 = martedì
    const daysUntilTuesday = (9 - day) % 7 || 7;
    const nextTuesday = new Date(today);
    nextTuesday.setDate(today.getDate() + daysUntilTuesday);
    nextTuesday.setHours(20, 30, 0, 0); // ore 20:30
    // Per input datetime-local serve formato YYYY-MM-DDTHH:MM
    const pad = (n) => n.toString().padStart(2, '0');
    return `${nextTuesday.getFullYear()}-${pad(nextTuesday.getMonth() + 1)}-${pad(nextTuesday.getDate())}T${pad(nextTuesday.getHours())}:${pad(nextTuesday.getMinutes())}`;
  }

  // Stato locale per la data della prossima partita
  const [nextSessionDate, setNextSessionDate] = useState(getNextTuesday());

  // Crea nuova partita (reset iscrizioni, data martedì successivo)
  const handleNewSession = async () => {
    if (!isAdmin) return;
    // Controlla se esiste già una partita lo stesso giorno
    const snap = await getDoc(currentSessionRef);
    const data = snap.exists() ? snap.data() : null;
    if (data && data.date) {
      const existingDate = new Date(data.date);
      const newDate = new Date(nextSessionDate);
      if (
        existingDate.getFullYear() === newDate.getFullYear() &&
        existingDate.getMonth() === newDate.getMonth() &&
        existingDate.getDate() === newDate.getDate()
      ) {
        alert('Esiste già una partita per questo giorno!');
        return;
      }
    }
    await setDoc(currentSessionRef, {
      participants: [],
      reserves: [],
      lastUpdated: serverTimestamp(),
      date: nextSessionDate,
    }, { merge: true });
    alert('Nuova partita creata!');
  };

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
      alert(`Errore durante il login: ${e.message || e}`);
      console.error('Login error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsLoggedIn(false);
    setCurrentUser(null);
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

  const loadMatchHistory = async () => {
    try {
      const q = query(
        collection(db, 'sessions'),
        orderBy('date', 'desc')
      );
      const sessionsSnap = await getDocs(q);
      const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMatchHistory(sessions);
    } catch (error) {
      console.error('Error loading match history:', error);
      setMatchHistory([]);
    }
  };

  const isUserSignedUp = () => {
    return (
      participants.some((p) => p.uid === currentUser?.uid) ||
      reserves.some((r) => r.uid === currentUser?.uid)
    );
  };

  // Non permettere iscrizione se non esiste una partita
  const canSignup = !!sessionDate;

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
          friends,
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
          date: data.date, // Preserva la data della partita!
        });
      });

      setFriends([]);
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
          }
        } else if (reserveIndex !== -1) {
          newReserves = newReserves.filter((r) => r.uid !== currentUser.uid);
        }

        transaction.set(currentSessionRef, {
          participants: newParticipants,
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
          date: data.date, // Preserva la data della partita!
        });
      });
    } catch (e) {
      alert(e.message || 'Errore durante la disiscrizione');
    }
  };

  // Admin functions to remove users/friends
  const handleAdminRemoveUser = async (userUid, isReserve = false) => {
    if (!isAdmin) return;
    
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(currentSessionRef);
        const data = snap.data() || { participants: [], reserves: [] };
        
        let newParticipants = [...data.participants];
        let newReserves = [...data.reserves];
        
        if (isReserve) {
          newReserves = newReserves.filter((r) => r.uid !== userUid);
        } else {
          newParticipants = newParticipants.filter((p) => p.uid !== userUid);
          // Se rimuovo un partecipante e ci sono riserve, promuovo la prima riserva
          if (newReserves.length > 0) {
            const firstReserve = newReserves[0];
            newReserves = newReserves.slice(1);
            newParticipants.push(firstReserve);
          }
        }
        
        transaction.set(currentSessionRef, {
          participants: newParticipants,
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
          date: data.date,
        });
      });
    } catch (e) {
      alert(e.message || 'Errore durante la rimozione');
    }
  };

  const handleAdminRemoveFriend = async (userUid, friendIndex, isReserve = false) => {
    if (!isAdmin) return;
    
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(currentSessionRef);
        const data = snap.data() || { participants: [], reserves: [] };
        
        let newParticipants = [...data.participants];
        let newReserves = [...data.reserves];
        
        if (isReserve) {
          const userIndex = newReserves.findIndex((r) => r.uid === userUid);
          if (userIndex !== -1 && newReserves[userIndex].friends) {
            newReserves[userIndex] = {
              ...newReserves[userIndex],
              friends: newReserves[userIndex].friends.filter((_, idx) => idx !== friendIndex)
            };
          }
        } else {
          const userIndex = newParticipants.findIndex((p) => p.uid === userUid);
          if (userIndex !== -1 && newParticipants[userIndex].friends) {
            newParticipants[userIndex] = {
              ...newParticipants[userIndex],
              friends: newParticipants[userIndex].friends.filter((_, idx) => idx !== friendIndex)
            };
          }
        }
        
        transaction.set(currentSessionRef, {
          participants: newParticipants,
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
          date: data.date,
        });
      });
    } catch (e) {
      alert(e.message || 'Errore durante la rimozione dell\'amico');
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

      // Increment totalSessions and other stats for each participant
      const participantUpdates = (data.participants || []).map((p) =>
        updateDoc(doc(db, 'users', p.uid), {
          'stats.totalSessions': increment(1),
          'stats.asParticipant': increment(1),
          'stats.friendsBrought': increment(p.friends?.length || 0),
        })
      );
      
      // Increment reserve stats for reserves
      const reserveUpdates = (data.reserves || []).map((r) =>
        updateDoc(doc(db, 'users', r.uid), {
          'stats.asReserve': increment(1),
          'stats.friendsBrought': increment(r.friends?.length || 0),
        })
      );
      
      await Promise.allSettled([...participantUpdates, ...reserveUpdates]);

      // Clear current session
      await setDoc(currentSessionRef, {
        participants: [],
        reserves: [],
        lastUpdated: serverTimestamp(),
        lastSessionId: newSessionRef.id,
      }, { merge: true });

      alert('Sessione salvata! Le statistiche sono state aggiornate.');
      if (currentUser) await loadUserStats(currentUser.uid);
    } catch {
      alert('Errore durante la chiusura della sessione');
    }
  };

  // Render header (consistent across all views)
  const renderHeader = () => (
    <div className="bg-gray-800 rounded-xl shadow-2xl p-8 mb-6 border border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-3 rounded-lg">
            <Users className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-100">
              {currentView === VIEW_STATES.MATCH_HISTORY ? 'Storico Partite' : 'Iscrizioni pallavolo'}
            </h1>
            {currentView === VIEW_STATES.MATCH_DETAIL && sessionDate ? (
              <div className="mt-2 text-lg text-indigo-300 font-semibold">
                Partita del {new Date(sessionDate).toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short' })}
              </div>
            ) : currentView === VIEW_STATES.MATCH_HISTORY ? (
              <div className="mt-2 text-lg text-indigo-300 font-semibold">Partite già giocate</div>
            ) : (
              <div className="mt-2 text-lg text-indigo-300 font-semibold">Nessuna partita attiva</div>
            )}
          </div>
        </div>
        {/* Navigation buttons */}
        <div className="flex items-center gap-2 mr-4">
          {currentView === VIEW_STATES.MATCH_DETAIL && (
            <button
              onClick={() => setCurrentView(VIEW_STATES.NO_MATCHES)}
              className="p-2 bg-gray-700 rounded-lg border border-gray-600 hover:bg-gray-600 transition"
              title="Torna indietro"
            >
              <ChevronLeft className="w-6 h-6 text-gray-300" />
            </button>
          )}
          {currentView === VIEW_STATES.MATCH_HISTORY && (
            <button
              onClick={() => setCurrentView(VIEW_STATES.NO_MATCHES)}
              className="p-2 bg-gray-700 rounded-lg border border-gray-600 hover:bg-gray-600 transition"
              title="Torna indietro"
            >
              <ChevronLeft className="w-6 h-6 text-gray-300" />
            </button>
          )}
          {(currentView === VIEW_STATES.NO_MATCHES || currentView === VIEW_STATES.MATCH_DETAIL) && (
            <button
              onClick={() => {
                loadMatchHistory();
                setCurrentView(VIEW_STATES.MATCH_HISTORY);
              }}
              className="p-2 bg-gray-700 rounded-lg border border-gray-600 hover:bg-gray-600 transition"
              title="Visualizza storico partite"
            >
              <Calendar className="w-6 h-6 text-gray-300" />
            </button>
          )}
        </div>
        {/* User icon always visible */}
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
  );

  // Render no matches view
  const renderNoMatchesView = () => (
    <div className="flex flex-col items-center justify-center">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-700 w-full max-w-md text-center">
        <div className="text-lg text-yellow-200 mb-6">Nessuna partita attiva, attendere che venga creata</div>
        {isAdmin && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <label htmlFor="nextSessionDate" className="text-sm text-gray-300 font-medium">Data prossima partita:</label>
              <input
                id="nextSessionDate"
                type="datetime-local"
                value={nextSessionDate}
                onChange={e => setNextSessionDate(e.target.value)}
                className="px-3 py-2 rounded-lg bg-gray-700 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleNewSession}
              className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
            >
              Crea nuova partita
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Render match detail view (current signup form)
  const renderMatchDetailView = () => {
    if (!isLoggedIn) {
      return (
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
      );
    }

    return (
      <div className="space-y-6">
        {/* Pulsanti iscrizione/disiscrizione */}
        {canSignup && (
          <>
            {!isUserSignedUp() && (
              <div className="space-y-4">
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
                <div className="space-y-4">
                  <div className="text-xs text-gray-400 mb-2">* Puoi aggiungere fino a <span className="font-bold text-indigo-300">3 amici</span> per sessione</div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={friendInput || ''}
                      onChange={e => setFriendInput(e.target.value)}
                      className="px-4 py-2 rounded-lg bg-gray-700 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-indigo-500"
                      placeholder="Nome amico"
                      disabled={friends.length >= 3}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (friendInput && friends.length < 3) {
                          setFriends([...friends, friendInput]);
                          setFriendInput('');
                        }
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
                      disabled={!friendInput || friends.length >= 3}
                    >
                      Aggiungi amico
                    </button>
                  </div>
                  {friends.length > 0 && (
                    <div className="mt-2">
                      <div className="text-sm text-gray-300 mb-2">Amici aggiunti:</div>
                      <ul className="space-y-2">
                        {friends.map((name, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <span className="bg-indigo-900 text-indigo-100 px-3 py-1 rounded-full">{name}</span>
                            <button
                              type="button"
                              onClick={() => setFriends(friends.filter((_, i) => i !== idx))}
                              className="text-red-400 hover:text-red-600 text-xs"
                            >
                              Rimuovi
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
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
            {/* Liste partecipanti/riserve */}
            <div className="grid md:grid-cols-2 gap-6 mt-8">
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
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">{participant.timestamp}</span>
                                {isAdmin && (
                                  <button
                                    onClick={() => handleAdminRemoveUser(participant.uid, false)}
                                    className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 transition"
                                    title="Rimuovi utente"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                            {participant.friends?.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {participant.friends.map((friend, fIndex) => (
                                  <div key={fIndex} className="text-sm text-gray-300 flex items-center gap-2 justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-green-400">+</span>
                                      {friend}
                                    </div>
                                    {isAdmin && (
                                      <button
                                        onClick={() => handleAdminRemoveFriend(participant.uid, fIndex, false)}
                                        className="text-red-400 hover:text-red-600 text-xs px-1 py-0.5 rounded bg-red-900/30 hover:bg-red-900/50 transition ml-2"
                                        title="Rimuovi amico"
                                      >
                                        ✕
                                      </button>
                                    )}
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
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">{reserve.timestamp}</span>
                                {isAdmin && (
                                  <button
                                    onClick={() => handleAdminRemoveUser(reserve.uid, true)}
                                    className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 transition"
                                    title="Rimuovi utente"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                            {reserve.friends?.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {reserve.friends.map((friend, fIndex) => (
                                  <div key={fIndex} className="text-sm text-gray-300 flex items-center gap-2 justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-amber-400">+</span>
                                      {friend}
                                    </div>
                                    {isAdmin && (
                                      <button
                                        onClick={() => handleAdminRemoveFriend(reserve.uid, fIndex, true)}
                                        className="text-red-400 hover:text-red-600 text-xs px-1 py-0.5 rounded bg-red-900/30 hover:bg-red-900/50 transition ml-2"
                                        title="Rimuovi amico"
                                      >
                                        ✕
                                      </button>
                                    )}
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
            {/* Area admin per super-admin */}
            {isAdmin && (
              <div className="space-y-4 mt-6">
                <div className="flex items-center gap-3 mb-2">
                  <label htmlFor="nextSessionDate" className="text-sm text-gray-300 font-medium">Data prossima partita:</label>
                  <input
                    id="nextSessionDate"
                    type="datetime-local"
                    value={nextSessionDate}
                    onChange={e => setNextSessionDate(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-gray-700 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleNewSession}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
                >
                  <Calendar className="w-5 h-5" />
                  Nuova partita
                </button>
                <button
                  onClick={handleEndSession}
                  className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
                >
                  Chiudi sessione
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Render match history view
  const renderMatchHistoryView = () => (
    <div className="space-y-6">
      {matchHistory.length === 0 ? (
        <div className="bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-700 text-center">
          <p className="text-gray-400">Nessuna partita nel database</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matchHistory.map((session, index) => (
            <div key={session.id} className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-100">
                  Partita #{matchHistory.length - index}
                </h3>
                <span className="text-sm text-gray-400">
                  {session.date?.toDate ? session.date.toDate().toLocaleString('it-IT') : 'Data non disponibile'}
                </span>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Partecipanti */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-lg font-semibold text-gray-100">Partecipanti</h4>
                    <span className="bg-green-900 text-green-200 px-2 py-1 rounded-full text-sm border border-green-700">
                      {session.participants?.length || 0}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {session.participants?.length > 0 ? (
                      session.participants.map((participant, pIndex) => (
                        <div key={pIndex} className="bg-green-900/50 rounded-lg p-3 border border-green-700">
                          <div className="font-medium text-gray-100">{participant.name}</div>
                          {participant.friends?.length > 0 && (
                            <div className="mt-1">
                              {participant.friends.map((friend, fIndex) => (
                                <div key={fIndex} className="text-sm text-gray-300 flex items-center gap-1">
                                  <span className="text-green-400">+</span>
                                  {friend}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-center py-2">Nessun partecipante</p>
                    )}
                  </div>
                </div>

                {/* Riserve */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-lg font-semibold text-gray-100">Riserve</h4>
                    <span className="bg-amber-900 text-amber-200 px-2 py-1 rounded-full text-sm border border-amber-700">
                      {session.reserves?.length || 0}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {session.reserves?.length > 0 ? (
                      session.reserves.map((reserve, rIndex) => (
                        <div key={rIndex} className="bg-amber-900/50 rounded-lg p-3 border border-amber-700">
                          <div className="font-medium text-gray-100">{reserve.name}</div>
                          {reserve.friends?.length > 0 && (
                            <div className="mt-1">
                              {reserve.friends.map((friend, fIndex) => (
                                <div key={fIndex} className="text-sm text-gray-300 flex items-center gap-1">
                                  <span className="text-amber-400">+</span>
                                  {friend}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-center py-2">Nessuna riserva</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Main render function
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-6">
      <div className="max-w-6xl mx-auto">
        {renderHeader()}
        
        {currentView === VIEW_STATES.NO_MATCHES && renderNoMatchesView()}
        {currentView === VIEW_STATES.MATCH_DETAIL && renderMatchDetailView()}
        {currentView === VIEW_STATES.MATCH_HISTORY && renderMatchHistoryView()}
      </div>
    </div>
  );
}