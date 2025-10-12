import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, Clock, Calendar, Award, ChevronLeft, Home, History, UserCheck, Settings } from 'lucide-react';
import { auth, db, provider } from '../lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
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
  MATCH_HISTORY: 'match_history',
  USERS_LIST: 'users_list'
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
  
  // States for user name customization
  const [customDisplayName, setCustomDisplayName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempDisplayName, setTempDisplayName] = useState("");
  
  // States for viewing other users' stats
  const [showUserStatsModal, setShowUserStatsModal] = useState(false);
  const [selectedUserStats, setSelectedUserStats] = useState(null);
  
  // States for user roles and management
  const [userRole, setUserRole] = useState('user'); // user, admin, super-admin
  const [allUsers, setAllUsers] = useState([]);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);

  // New state management for unified component
  const [currentView, setCurrentView] = useState(VIEW_STATES.NO_MATCHES);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchHistory, setMatchHistory] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]); // Lista di tutte le partite attive

  const currentSessionRef = useMemo(() => doc(db, 'state', 'currentSession'), []);
  
  // Role-based permissions
  const SUPER_ADMIN_EMAIL = 'tidolamiamail@gmail.com';
  const isSuperAdmin = currentUser?.email === SUPER_ADMIN_EMAIL;
  const isAdmin = userRole === 'admin' || isSuperAdmin;
  const isUser = userRole === 'user';

  // Listen to auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setIsLoggedIn(true);
        
        // Load or create user document
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        let userData = {};
        if (userDoc.exists()) {
          userData = userDoc.data();
          setCustomDisplayName(userData.customDisplayName || user.displayName);
          // Set role based on existing data or super admin check
          if (user.email === SUPER_ADMIN_EMAIL) {
            setUserRole('super-admin');
          } else {
            setUserRole(userData.role || 'user');
          }
        } else {
          setCustomDisplayName(user.displayName);
          // Set initial role
          const initialRole = user.email === SUPER_ADMIN_EMAIL ? 'super-admin' : 'user';
          setUserRole(initialRole);
        }
        
        await setDoc(
          userDocRef,
          {
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastLogin: serverTimestamp(),
            role: userRole || (user.email === SUPER_ADMIN_EMAIL ? 'super-admin' : 'user'),
          },
          { merge: true }
        );
        loadUserStats(user.uid);
      } else {
        setCurrentUser(null);
        setIsLoggedIn(false);
        setShowStats(false);
        setUserStats(null);
        setCustomDisplayName("");
        setIsEditingName(false);
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
        // NON creare automaticamente una partita, solo il documento vuoto
        await setDoc(currentSessionRef, {
          participants: [],
          reserves: [],
          lastUpdated: serverTimestamp(),
          // date: getNextTuesday(), // RIMOSSO: Non creare partita automaticamente
        });
      }
      
      unsub = onSnapshot(currentSessionRef, (docSnap) => {
        const data = docSnap.data();
        setParticipants(Array.isArray(data?.participants) ? data.participants : []);
        setReserves(Array.isArray(data?.reserves) ? data.reserves : []);
        setSessionDate(data?.date || null);
        
        // NON cambiare automaticamente la vista - lasciamo che l'utente controlli la navigazione
        // Aggiorna solo i dati senza interferire con currentView
        // if (currentView !== VIEW_STATES.MATCH_HISTORY && 
        //     currentView !== VIEW_STATES.MATCH_DETAIL && 
        //     currentView !== VIEW_STATES.USERS_LIST) {
        //   if (data?.date) {
        //     setCurrentView(VIEW_STATES.MATCH_LIST);
        //     setSelectedMatch(data);
        //   } else {
        //     setCurrentView(VIEW_STATES.NO_MATCHES);
        //   }
        // }
      });
    })();
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [currentSessionRef]); // RIMOSSA dipendenza da currentView

  // Load active matches from activeMatches collection
  useEffect(() => {
    const loadActiveMatches = async () => {
      try {
        const q = query(
          collection(db, 'activeMatches'),
          orderBy('date', 'asc')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const matches = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setActiveMatches(matches);
          
          // Update view based on active matches, but preserve MATCH_DETAIL view
          if (currentView === VIEW_STATES.NO_MATCHES && matches.length > 0) {
            setCurrentView(VIEW_STATES.MATCH_LIST);
          } else if (currentView === VIEW_STATES.MATCH_LIST && matches.length === 0) {
            setCurrentView(VIEW_STATES.NO_MATCHES);
          }
          // Non cambiare vista se siamo in MATCH_DETAIL per mantenere la vista dopo iscrizione/disiscrizione
        });
        
        return unsubscribe;
      } catch (error) {
        console.error('Error loading active matches:', error);
        setActiveMatches([]);
      }
    };

    const unsubscribe = loadActiveMatches();
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe.then(unsub => unsub());
      }
    };
  }, []); // Rimossa dipendenza currentView che causava loop infinito

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showStats && !event.target.closest('.user-dropdown')) {
        setShowStats(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStats]);

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

  // Crea nuova partita (aggiunge alla collezione activeMatches)
  const handleNewSession = async () => {
    if (!isAdmin || isCreatingMatch) return;
    
    setIsCreatingMatch(true);
    try {
      // Converti la data da stringa a Date object per il confronto
      const newDate = new Date(nextSessionDate);
      
      // Controlla se esiste già una partita nello stesso giorno e ora
      const q = query(
        collection(db, 'activeMatches'),
        orderBy('date', 'asc')
      );
      const existingMatches = await getDocs(q);
      
      // Controlla manualmente le date per evitare problemi di formato
      const hasConflict = existingMatches.docs.some(doc => {
        const existingDate = new Date(doc.data().date);
        return existingDate.getTime() === newDate.getTime();
      });
      
      if (hasConflict) {
        alert('Esiste già una partita per questo giorno e orario!');
        return;
      }

      // Crea nuova partita nella collezione activeMatches
      const newMatchRef = await addDoc(collection(db, 'activeMatches'), {
        participants: [],
        reserves: [],
        date: nextSessionDate,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        createdBy: currentUser.uid,
        status: 'active'
      });

      console.log('Partita creata con ID:', newMatchRef.id);
    } catch (error) {
      console.error('Errore nella creazione della partita:', error);
      alert('Errore nella creazione della partita');
    } finally {
      setIsCreatingMatch(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, provider);
      const user = res.user;
      
      // Leggi prima il documento esistente per preservare customDisplayName
      const userDocRef = doc(db, 'users', user.uid);
      const existingDoc = await getDoc(userDocRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : {};
      
      await setDoc(
        userDocRef,
        {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          lastLogin: serverTimestamp(),
          // Preserva customDisplayName e role se esistono già
          ...(existingData.customDisplayName && { customDisplayName: existingData.customDisplayName }),
          ...(existingData.role && { role: existingData.role })
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

  // Functions for custom display name
  const handleEditName = () => {
    setTempDisplayName(customDisplayName);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!currentUser || !tempDisplayName.trim()) return;
    
    try {
      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          customDisplayName: tempDisplayName.trim(),
        },
        { merge: true }
      );
      setCustomDisplayName(tempDisplayName.trim());
      setIsEditingName(false);
    } catch (error) {
      console.error('Errore nel salvataggio del nome:', error);
      alert('Errore nel salvataggio del nome');
    }
  };

  const handleCancelEditName = () => {
    setTempDisplayName("");
    setIsEditingName(false);
  };

  // Function to load another user's stats
  const loadOtherUserStats = async (uid, displayName) => {
    try {
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

      setSelectedUserStats({
        uid,
        displayName: user.customDisplayName || displayName,
        totalSessions: user?.stats?.totalSessions || 0,
        asParticipant: user?.stats?.asParticipant || 0,
        asReserve: user?.stats?.asReserve || 0,
        friendsBrought: user?.stats?.friendsBrought || 0,
        sessionsHistory: sessions,
      });
      setShowUserStatsModal(true);
    } catch (error) {
      console.error('Errore nel caricamento delle statistiche:', error);
      alert('Errore nel caricamento delle statistiche');
    }
  };

  // Admin function to recalculate all user statistics from actual database data
  const handleRecalculateAllStats = async () => {
    if (!isSuperAdmin) return;
    
    const confirmed = confirm('Sei sicuro di voler ricalcolare tutte le statistiche di tutti gli utenti basandosi sui dati reali del database? Questa operazione potrebbe richiedere alcuni minuti.');
    if (!confirmed) return;

    try {
      // Get all sessions from database
      const sessionsQuery = query(collection(db, 'sessions'), orderBy('date', 'desc'));
      const sessionsSnap = await getDocs(sessionsQuery);
      
      // Get all users
      const usersQuery = query(collection(db, 'users'));
      const usersSnap = await getDocs(usersQuery);
      
      // Initialize stats object for all users
      const userStats = {};
      usersSnap.docs.forEach(doc => {
        userStats[doc.id] = {
          totalSessions: 0,
          asParticipant: 0,
          asReserve: 0,
          friendsBrought: 0,
        };
      });
      
      // Calculate stats from actual sessions
      sessionsSnap.docs.forEach(sessionDoc => {
        const session = sessionDoc.data();
        
        // Count participants
        (session.participants || []).forEach(participant => {
          if (userStats[participant.uid]) {
            userStats[participant.uid].totalSessions += 1;
            userStats[participant.uid].asParticipant += 1;
            userStats[participant.uid].friendsBrought += (participant.friends?.length || 0);
          }
        });
        
        // Count reserves
        (session.reserves || []).forEach(reserve => {
          if (userStats[reserve.uid]) {
            userStats[reserve.uid].asReserve += 1;
            userStats[reserve.uid].friendsBrought += (reserve.friends?.length || 0);
          }
        });
      });
      
      // Update all user stats in database
      const updatePromises = Object.entries(userStats).map(([uid, stats]) =>
        setDoc(
          doc(db, 'users', uid),
          { stats },
          { merge: true }
        )
      );
      
      await Promise.all(updatePromises);
      
      alert(`Statistiche ricalcolate con successo per ${Object.keys(userStats).length} utenti!`);
      
      // Refresh current user stats if needed
      if (currentUser) {
        loadUserStats(currentUser.uid);
      }
      
    } catch (error) {
      console.error('Errore nel ricalcolo delle statistiche:', error);
      alert('Errore nel ricalcolo delle statistiche');
    }
  };

  // Admin function to reset user statistics
  const handleResetUserStats = async (uid) => {
    if (!isAdmin) return;
    
    const confirmed = confirm('Sei sicuro di voler resettare tutte le statistiche di questo utente?');
    if (!confirmed) return;

    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          stats: {
            totalSessions: 0,
            asParticipant: 0,
            asReserve: 0,
            friendsBrought: 0,
          },
        },
        { merge: true }
      );
      alert('Statistiche resettate con successo');
      // Se stiamo visualizzando le stats di questo utente, aggiorniamole
      if (selectedUserStats && selectedUserStats.uid === uid) {
        setSelectedUserStats({
          ...selectedUserStats,
          totalSessions: 0,
          asParticipant: 0,
          asReserve: 0,
          friendsBrought: 0,
        });
      }
      // Se l'utente sta resettando le proprie stats, aggiorniamo anche quelle
      if (currentUser && currentUser.uid === uid) {
        loadUserStats(uid);
      }
    } catch (error) {
      console.error('Errore nel reset delle statistiche:', error);
      alert('Errore nel reset delle statistiche');
    }
  };

  // Admin function to delete session from history
  const handleDeleteSession = async (sessionId) => {
    if (!isAdmin) return;
    
    const confirmed = confirm('Sei sicuro di voler eliminare questa sessione dalle statistiche?');
    if (!confirmed) return;

    try {
      await runTransaction(db, async (transaction) => {
        const sessionRef = doc(db, 'sessions', sessionId);
        const sessionSnap = await transaction.get(sessionRef);
        
        if (!sessionSnap.exists()) {
          throw new Error('Sessione non trovata');
        }
        
        const sessionData = sessionSnap.data();
        
        // Aggiorna le statistiche di tutti gli utenti che parteciparono
        const userUpdates = [
          ...(sessionData.participantUids || []).map(uid => ({
            uid,
            participant: true
          })),
          ...(sessionData.reserveUids || []).map(uid => ({
            uid,
            participant: false
          }))
        ];

        for (const update of userUpdates) {
          const userRef = doc(db, 'users', update.uid);
          const userSnap = await transaction.get(userRef);
          
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const currentStats = userData.stats || {};
            
            transaction.update(userRef, {
              stats: {
                ...currentStats,
                totalSessions: Math.max(0, (currentStats.totalSessions || 1) - 1),
                asParticipant: update.participant ? 
                  Math.max(0, (currentStats.asParticipant || 1) - 1) : 
                  (currentStats.asParticipant || 0),
                asReserve: !update.participant ? 
                  Math.max(0, (currentStats.asReserve || 1) - 1) : 
                  (currentStats.asReserve || 0),
              }
            });
          }
        }

        // Elimina la sessione
        transaction.delete(sessionRef);
      });

      alert('Sessione eliminata con successo');
      
      // Ricarica la cronologia e le statistiche
      loadMatchHistory();
      if (currentUser) {
        loadUserStats(currentUser.uid);
      }
    } catch (error) {
      console.error('Errore nell\'eliminazione della sessione:', error);
      alert('Errore nell\'eliminazione della sessione');
    }
  };

  // Admin function to delete active match
  const handleDeleteActiveMatch = async (matchId) => {
    if (!isAdmin) return;
    
    const confirmed = confirm('Sei sicuro di voler eliminare questa partita attiva? Tutti i partecipanti iscritti verranno rimossi.');
    if (!confirmed) return;

    try {
      const matchRef = doc(db, 'activeMatches', matchId);
      await deleteDoc(matchRef);
      
      alert('Partita eliminata con successo');
      
      // La lista delle partite attive si aggiornerà automaticamente tramite l'unsubscribe
    } catch (error) {
      console.error('Errore nell\'eliminazione della partita:', error);
      alert('Errore nell\'eliminazione della partita');
    }
  };

  const handleCloseMatch = async (match) => {
    if (!isAdmin) return;
    
    const confirmed = confirm('Sei sicuro di voler chiudere questa partita? Verrà salvata nello storico e rimossa dalle partite attive.');
    if (!confirmed) return;

    try {
      const participants = match.participants || [];
      const reserves = match.reserves || [];
      
      // Se ci sono partecipanti, salva la sessione
      if (participants.length > 0) {
        const sessionRecord = {
          date: new Date(match.date),
          participants: participants,
          reserves: reserves,
          participantUids: participants.map((p) => p.uid),
          reserveUids: reserves.map((r) => r.uid),
        };

        await addDoc(collection(db, 'sessions'), sessionRecord);

        // Aggiorna le statistiche dei partecipanti
        const participantUpdates = participants.map((p) =>
          updateDoc(doc(db, 'users', p.uid), {
            'stats.totalSessions': increment(1),
            'stats.asParticipant': increment(1),
            'stats.friendsBrought': increment(p.friends?.length || 0),
          })
        );
        
        // Aggiorna le statistiche delle riserve
        const reserveUpdates = reserves.map((r) =>
          updateDoc(doc(db, 'users', r.uid), {
            'stats.asReserve': increment(1),
            'stats.friendsBrought': increment(r.friends?.length || 0),
          })
        );
        
        await Promise.allSettled([...participantUpdates, ...reserveUpdates]);
      }

      // Rimuovi la partita dalle partite attive
      await deleteDoc(doc(db, 'activeMatches', match.id));
      
      alert(participants.length > 0 ? 'Partita chiusa e salvata nello storico!' : 'Partita chiusa!');
      
    } catch (error) {
      console.error('Errore nella chiusura della partita:', error);
      alert('Errore nella chiusura della partita');
    }
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

  // Function to load all users (accessible to all logged users)
  const loadAllUsers = async () => {
    if (!isLoggedIn) return;
    
    try {
      const q = query(
        collection(db, 'users'),
        orderBy('lastLogin', 'desc')
      );
      const usersSnap = await getDocs(q);
      const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllUsers(users);
    } catch (error) {
      console.error('Error loading users:', error);
      setAllUsers([]);
    }
  };

  // Function to change user role (admin only)
  const handleChangeUserRole = async (userId, newRole) => {
    if (!isAdmin || userId === currentUser?.uid) return;
    
    // Prevent changing super admin role
    const targetUser = allUsers.find(u => u.id === userId);
    if (targetUser?.email === SUPER_ADMIN_EMAIL) {
      alert('Non puoi modificare il ruolo del super admin');
      return;
    }
    
    try {
      await setDoc(
        doc(db, 'users', userId),
        { role: newRole },
        { merge: true }
      );
      
      // Update local state
      setAllUsers(users => users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));
      
      alert(`Ruolo utente aggiornato a: ${newRole}`);
    } catch (error) {
      console.error('Error updating user role:', error);
      alert('Errore nell\'aggiornamento del ruolo');
    }
  };

  // Function to mark session as ignored in statistics
  const handleIgnoreSession = async (sessionId) => {
    if (!isAdmin) return;
    
    const confirmed = confirm('Sei sicuro di voler ignorare questa sessione dalle statistiche?');
    if (!confirmed) return;

    try {
      await setDoc(
        doc(db, 'sessions', sessionId),
        { ignoredFromStats: true },
        { merge: true }
      );
      
      alert('Sessione ignorata dalle statistiche');
      loadMatchHistory();
    } catch (error) {
      console.error('Errore nell\'ignorare la sessione:', error);
      alert('Errore nell\'ignorare la sessione');
    }
  };

  const isUserSignedUp = () => {
    if (!selectedMatch) return false;
    return (
      selectedMatch.participants?.some((p) => p.uid === currentUser?.uid) ||
      selectedMatch.reserves?.some((r) => r.uid === currentUser?.uid)
    );
  };

  const isUserParticipant = () => {
    if (!selectedMatch) return false;
    return selectedMatch.participants?.some((p) => p.uid === currentUser?.uid);
  };

  const isUserReserve = () => {
    if (!selectedMatch) return false;
    return selectedMatch.reserves?.some((r) => r.uid === currentUser?.uid);
  };

  // Non permettere iscrizione se non esiste una partita selezionata
  // Distingue tra partite attive (si può iscrivere) e storiche (solo visualizzazione)
  const canSignup = !!selectedMatch && activeMatches.some(match => match.id === selectedMatch.id);
  const isHistoricalMatch = !!selectedMatch && !activeMatches.some(match => match.id === selectedMatch.id);

  const getTotalCount = () => {
    if (!selectedMatch) return 0;
    let total = selectedMatch.participants?.length || 0;
    for (const p of (selectedMatch.participants || [])) total += (p.friends?.length || 0);
    return total;
  };

  const getReservesTotalCount = () => {
    if (!selectedMatch) return 0;
    let total = selectedMatch.reserves?.length || 0;
    for (const r of (selectedMatch.reserves || [])) total += (r.friends?.length || 0);
    return total;
  };

  const handleSignup = async (asReserve = false) => {
    if (!isLoggedIn || !currentUser || !selectedMatch) return;

    try {
      const matchRef = doc(db, 'activeMatches', selectedMatch.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        const data = snap.data() || { participants: [], reserves: [] };
        const alreadyParticipant = data.participants?.some((p) => p.uid === currentUser.uid);
        const alreadyReserve = data.reserves?.some((r) => r.uid === currentUser.uid);
        
        // Se già iscritto come riserva, blocca completamente
        if (alreadyReserve) {
          throw new Error('Sei già iscritto come riserva!');
        }
        
        // Se già partecipante, permetti solo aggiunta di amici
        if (alreadyParticipant) {
          if (friends.length === 0) {
            throw new Error('Sei già iscritto come partecipante!');
          }
          
          // Calcola se c'è spazio per i nuovi amici
          let currentTotal = data.participants.length;
          for (const p of data.participants) {
            currentTotal += (p.friends?.length || 0);
          }
          
          const newTotal = currentTotal + friends.length;
          if (newTotal > MAX_PARTICIPANTS) {
            throw new Error(`Non ci sono abbastanza posti per tutti i +1, rimuoverne qualcuno e riprovare (posti disponibili: ${MAX_PARTICIPANTS - currentTotal})`);
          }
          
          // Aggiorna l'iscrizione esistente con i nuovi amici
          const updated = { ...data };
          updated.participants = updated.participants.map(p => 
            p.uid === currentUser.uid 
              ? { ...p, friends: [...(p.friends || []), ...friends], timestamp: new Date().toLocaleString('it-IT') }
              : p
          );
          
          transaction.update(matchRef, {
            participants: updated.participants,
            lastUpdated: serverTimestamp(),
          });
          
          setFriends([]);
          await loadUserStats(currentUser.uid);
          alert(`${friends.length} amici aggiunti con successo!`);
          return;
        }

        const newEntry = {
          uid: currentUser.uid,
          name: customDisplayName || currentUser.displayName,
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
          // Calcola il totale attuale di partecipanti + amici
          let currentTotal = updated.participants.length;
          for (const p of updated.participants) {
            currentTotal += (p.friends?.length || 0);
          }
          
          // Calcola il totale che avremmo aggiungendo questo nuovo partecipante
          const newTotal = currentTotal + 1 + (friends.length || 0);
          
          if (newTotal <= MAX_PARTICIPANTS) {
            updated.participants = [...updated.participants, newEntry];
          } else {
            // Blocca l'iscrizione con messaggio di errore invece di mettere in riserva
            const availableSpots = MAX_PARTICIPANTS - currentTotal;
            throw new Error(`Non ci sono abbastanza posti per tutti i +1, rimuoverne qualcuno e riprovare (posti disponibili: ${availableSpots})`);
          }
        }

        transaction.update(matchRef, {
          participants: updated.participants,
          reserves: updated.reserves,
          lastUpdated: serverTimestamp(),
        });
      });

      setFriends([]);
      await loadUserStats(currentUser.uid);

      // Controlla se è stato aggiunto alle riserve invece che ai partecipanti
      const totalAfterSignup = getTotalCount();
      if (!asReserve && totalAfterSignup > MAX_PARTICIPANTS) {
        alert(`Lista partecipanti piena (${MAX_PARTICIPANTS} posti)! Sei stato aggiunto alle riserve.`);
      }
    } catch (e) {
      alert(e.message || 'Errore durante l\'iscrizione');
    }
  };

  const handleUnsubscribe = async () => {
    if (!isLoggedIn || !currentUser || !selectedMatch) return;

    try {
      const matchRef = doc(db, 'activeMatches', selectedMatch.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        const data = snap.data() || { participants: [], reserves: [] };
        const participantIndex = data.participants?.findIndex((p) => p.uid === currentUser.uid);
        const reserveIndex = data.reserves?.findIndex((r) => r.uid === currentUser.uid);

        if ((participantIndex === undefined || participantIndex === -1) && 
            (reserveIndex === undefined || reserveIndex === -1)) {
          throw new Error('Non sei iscritto a questa partita.');
        }

        const newParticipants = [...(data.participants || [])];
        let newReserves = [...(data.reserves || [])];

        if (participantIndex !== undefined && participantIndex !== -1) {
          newParticipants.splice(participantIndex, 1);
          // Se rimuovo un partecipante e ci sono riserve, promuovo la prima riserva
          if (newReserves.length > 0) {
            const firstReserve = newReserves[0];
            newReserves = newReserves.slice(1);
            newParticipants.push(firstReserve);
          }
        } else if (reserveIndex !== undefined && reserveIndex !== -1) {
          newReserves = newReserves.filter((r) => r.uid !== currentUser.uid);
        }

        transaction.update(matchRef, {
          participants: newParticipants,
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
        });
      });
    } catch (e) {
      alert(e.message || 'Errore durante la disiscrizione');
    }
  };

  // Admin functions to remove users/friends
  const handleAdminRemoveUser = async (userUid, isReserve = false) => {
    if (!isAdmin || !selectedMatch) return;
    
    try {
      const matchRef = doc(db, 'activeMatches', selectedMatch.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        const data = snap.data() || { participants: [], reserves: [] };
        
        let newParticipants = [...(data.participants || [])];
        let newReserves = [...(data.reserves || [])];
        
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
        
        transaction.update(matchRef, {
          participants: newParticipants,
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
        });
      });
    } catch (e) {
      alert(e.message || 'Errore durante la rimozione');
    }
  };

  const handleAdminRemoveFriend = async (userUid, friendIndex, isReserve = false) => {
    if (!isAdmin || !selectedMatch) return;
    
    try {
      const matchRef = doc(db, 'activeMatches', selectedMatch.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        const data = snap.data() || { participants: [], reserves: [] };
        
        let newParticipants = [...(data.participants || [])];
        let newReserves = [...(data.reserves || [])];
        
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
        
        transaction.update(matchRef, {
          participants: newParticipants,
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
        });
      });
    } catch (e) {
      alert(e.message || 'Errore durante la rimozione dell\'amico');
    }
  };

  const handleEndMatch = async () => {
    try {
      // Leggi i dati dalla partita attiva selezionata, non dalla currentSession
      if (!selectedMatch) {
        alert('Nessuna partita selezionata');
        return;
      }
      
      const matchRef = doc(db, 'activeMatches', selectedMatch.id);
      const snap = await getDoc(matchRef);
      const data = snap.data() || { participants: [], reserves: [] };
      
      // Se non ci sono partecipanti, chiedi conferma per eliminare la partita
      if (!data.participants || data.participants.length === 0) {
        const confirmed = confirm('Non ci sono partecipanti in questa partita. Vuoi eliminarla?');
        if (!confirmed) return;
        
        // Elimina la partita dalla collezione activeMatches
        await deleteDoc(matchRef);
        alert('Partita eliminata con successo');
        setCurrentView(VIEW_STATES.MATCH_LIST);
        return;
      }

      const sessionRecord = {
        date: new Date(data.date), // Usa la data originale della partita
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

      // Elimina la partita dalla collezione activeMatches
      await deleteDoc(matchRef);

      alert('Partita completata! Le statistiche sono state aggiornate.');
      if (currentUser) await loadUserStats(currentUser.uid);
      setCurrentView(VIEW_STATES.MATCH_LIST);
    } catch (error) {
      console.error('Errore durante la chiusura della partita:', error);
      alert('Errore durante la chiusura della partita');
    }
  };

  // Promuovi riserva a partecipante (solo admin)
  const handlePromoteReserve = async (reserveUid) => {
    if (!isAdmin || !selectedMatch) return;
    
    try {
      const matchRef = doc(db, 'activeMatches', selectedMatch.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        const data = snap.data() || { participants: [], reserves: [] };
        
        // Trova la riserva da promuovere
        const reserveIndex = data.reserves?.findIndex((r) => r.uid === reserveUid);
        if (reserveIndex === -1) {
          throw new Error('Riserva non trovata');
        }
        
        const reserveToPromote = data.reserves[reserveIndex];
        
        // Calcola se c'è spazio nei partecipanti
        let currentTotal = data.participants?.length || 0;
        for (const p of (data.participants || [])) {
          currentTotal += (p.friends?.length || 0);
        }
        const newTotal = currentTotal + 1 + (reserveToPromote.friends?.length || 0);
        
        if (newTotal > MAX_PARTICIPANTS) {
          throw new Error(`Non c'è abbastanza spazio. Servono ${newTotal - currentTotal} posti ma ne rimangono solo ${MAX_PARTICIPANTS - currentTotal}.`);
        }
        
        // Rimuovi dalle riserve e aggiungi ai partecipanti
        const newReserves = [...(data.reserves || [])];
        newReserves.splice(reserveIndex, 1);
        
        const newParticipants = [...(data.participants || []), reserveToPromote];
        
        transaction.update(matchRef, {
          participants: newParticipants,
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
        });
      });
      
      alert('Riserva promossa a partecipante con successo!');
    } catch (error) {
      console.error('Errore nella promozione:', error);
      alert(error.message || 'Errore nella promozione della riserva');
    }
  };

  // Render header (consistent across all views)
  const renderHeader = () => (
    <div className="bg-gray-800 rounded-xl shadow-2xl p-4 md:p-6 mb-6 border border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
          <div className="bg-indigo-600 p-2 md:p-3 rounded-lg flex-shrink-0">
            <div className="w-6 h-6 md:w-8 md:h-8 text-white text-lg md:text-2xl flex items-center justify-center">🏐</div>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-3xl font-bold text-gray-100 truncate">
              {currentView === VIEW_STATES.MATCH_HISTORY ? 'Storico Partite' : 
               currentView === VIEW_STATES.USERS_LIST ? 'Lista Utenti' : 
               'Pallavolo - 7 fighters'}
            </h1>
            {/* Subtitle visible only for logged users */}
            {isLoggedIn && (currentView === VIEW_STATES.MATCH_DETAIL && sessionDate ? (
              <div className="mt-1 md:mt-2 flex items-center gap-3 flex-wrap">
                <div className="text-sm md:text-lg text-indigo-300 font-semibold">
                  Partita del {new Date(sessionDate).toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short' })}
                </div>
                {/* Tag stato partita */}
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  selectedMatch && activeMatches.some(match => match.id === selectedMatch.id)
                    ? 'bg-green-600 text-green-100' 
                    : 'bg-gray-600 text-gray-100'
                }`}>
                  {selectedMatch && activeMatches.some(match => match.id === selectedMatch.id) ? 'Aperta' : 'Giocata'}
                </span>
              </div>
            ) : currentView === VIEW_STATES.MATCH_HISTORY ? (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Partite già giocate</div>
            ) : currentView === VIEW_STATES.USERS_LIST ? (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Gestisci ruoli e utenti</div>
            ) : currentView === VIEW_STATES.MATCH_LIST && sessionDate ? (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Seleziona una partita per iscriverti</div>
            ) : (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Nessuna partita attiva</div>
            ))}
          </div>
        </div>
        
        {/* User icon and name always visible when logged */}
        {isLoggedIn && (
          <div className="relative flex items-center gap-2 md:gap-3 user-dropdown flex-shrink-0">
            <span className="hidden md:block text-gray-100 font-medium truncate max-w-32">{customDisplayName || currentUser?.displayName}</span>
            <button
              onClick={() => setShowStats(!showStats)}
              className="p-1 md:p-2 bg-gray-700 rounded-full border border-gray-600 hover:bg-gray-600 transition flex-shrink-0"
              title="Area personale"
            >
              <img
                src={currentUser.photoURL || ''}
                alt={currentUser.displayName || ''}
                className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 object-cover ${
                  isAdmin ? 'border-blue-500 shadow-lg shadow-blue-500/30' : 'border-indigo-500'
                }`}
              />
            </button>
            {showStats && userStats && (
              <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-10 p-4 md:p-6 max-w-[90vw]">
                <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-500" />
                  Le tue statistiche
                </h3>
                
                {/* Nome utente personalizzabile */}
                <div className="mb-4 p-3 bg-gray-700/30 rounded-lg border border-gray-600/50">
                  <div className="text-xs text-gray-400 mb-1">Nome visualizzato</div>
                  {isEditingName ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={tempDisplayName}
                        onChange={(e) => setTempDisplayName(e.target.value)}
                        className="w-full px-2 py-1 bg-gray-600 text-gray-100 rounded border border-gray-500 text-sm"
                        placeholder="Inserisci il tuo nome"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveName}
                          className="flex-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition"
                        >
                          Salva
                        </button>
                        <button
                          onClick={handleCancelEditName}
                          className="flex-1 px-2 py-1 bg-gray-600 text-gray-100 rounded text-xs hover:bg-gray-700 transition"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-100 font-medium">{customDisplayName}</span>
                      <button
                        onClick={handleEditName}
                        className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 transition"
                      >
                        Modifica
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 md:gap-3">
                  <div className="bg-gray-700/50 rounded-lg p-2 md:p-3 border border-gray-600/50">
                    <div className="text-lg md:text-xl font-bold text-indigo-400">{userStats.totalSessions || 0}</div>
                    <div className="text-xs text-gray-400">Partite totali</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50">
                    <div className="text-xl font-bold text-purple-400">{userStats.friendsBrought || 0}</div>
                    <div className="text-xs text-gray-400">Amici portati</div>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="mt-4 w-full px-4 py-2 bg-gray-700 text-gray-100 rounded-lg hover:bg-gray-600 transition border border-gray-600 text-sm"
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
        
        {/* Se l'utente non è loggato, mostra il pulsante di login */}
        {!isLoggedIn && (
          <div className="mb-6">
            <p className="text-gray-400 text-sm mb-4">Effettua il login per partecipare alle partite</p>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Accesso...
                </>
              ) : (
                <>
                  <Users className="w-5 h-5" />
                  Accedi con Google
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Render match list view 
  const renderMatchListView = () => (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-4 md:p-6 border border-gray-700">
        <h2 className="text-xl md:text-2xl font-bold text-gray-100 mb-4">Partite Attive</h2>
        
        {activeMatches.length > 0 ? (
          <div className="space-y-3 md:space-y-4">
            {activeMatches.map((match) => (
              <div 
                key={match.id}
                className="bg-gray-700 rounded-lg p-3 md:p-4 border border-gray-600 hover:border-indigo-500 transition group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div 
                    onClick={() => {
                      setSelectedMatch(match);
                      setCurrentView(VIEW_STATES.MATCH_DETAIL);
                    }}
                    className="flex-1 cursor-pointer"
                  >
                    <h3 className="text-base md:text-lg font-semibold text-gray-100 group-hover:text-indigo-300">
                      Partita di Pallavolo
                    </h3>
                    <p className="text-sm md:text-base text-gray-400 mt-1">
                      {new Date(match.date).toLocaleString('it-IT', { 
                        dateStyle: 'short', 
                        timeStyle: 'short' 
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4 justify-between md:justify-end">
                    <div className="text-center">
                      <div className="text-lg md:text-2xl font-bold text-green-400">
                        {(match.participants?.length || 0) + (match.participants?.reduce((acc, p) => acc + (p.friends?.length || 0), 0) || 0)}
                      </div>
                      <div className="text-xs text-gray-400">Partecipanti</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg md:text-2xl font-bold text-amber-400">
                        {(match.reserves?.length || 0) + (match.reserves?.reduce((acc, r) => acc + (r.friends?.length || 0), 0) || 0)}
                      </div>
                      <div className="text-xs text-gray-400">Riserve</div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Funzione per chiudere la partita (marcarla come giocata)
                            handleCloseMatch(match);
                          }}
                          className="p-1 md:p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded-lg transition"
                          title="Chiudi partita (marca come giocata)"
                        >
                          <Calendar className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteActiveMatch(match.id);
                          }}
                          className="p-1 md:p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition"
                          title="Elimina partita"
                        >
                          <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {isAdmin && (
              <div className="border-t border-gray-600 pt-4 space-y-4">
                <h3 className="text-lg font-semibold text-gray-100">Controlli Admin</h3>
                <div className="flex items-center gap-3">
                  <label htmlFor="nextSessionDate" className="text-sm text-gray-300 font-medium">Data prossima partita:</label>
                  <input
                    id="nextSessionDate"
                    type="datetime-local"
                    value={nextSessionDate}
                    onChange={e => setNextSessionDate(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-gray-700 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleNewSession}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
                  >
                    Crea
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-4">Nessuna partita attiva al momento</p>
            {isAdmin && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 justify-center">
                  <label htmlFor="nextSessionDate" className="text-sm text-gray-300 font-medium">Data partita:</label>
                  <input
                    id="nextSessionDate"
                    type="datetime-local"
                    value={nextSessionDate}
                    onChange={e => setNextSessionDate(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-gray-700 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleNewSession}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm"
                  >
                    Crea
                  </button>
                </div>
              </div>
            )}
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
        {/* Header per partite storiche */}
        {isHistoricalMatch && (
          <div className="bg-gray-700 border border-gray-600 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-gray-300 font-medium">Partita Storica - Solo Visualizzazione</span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Questa partita è stata completata e non è più possibile iscriversi o modificare i partecipanti.
            </p>
          </div>
        )}
        
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
                  <div className="text-xs text-gray-400 mb-2">* Puoi aggiungere fino a <span className="font-bold text-indigo-300">{isAdmin ? 'illimitati' : '3'} amici</span> per sessione</div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={friendInput || ''}
                      onChange={e => setFriendInput(e.target.value)}
                      className="px-4 py-2 rounded-lg bg-gray-700 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-indigo-500"
                      placeholder="Nome amico"
                      disabled={!isAdmin && friends.length >= 3}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (friendInput && (isAdmin || friends.length < 3)) {
                          setFriends([...friends, friendInput]);
                          setFriendInput('');
                        }
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
                      disabled={!friendInput || (!isAdmin && friends.length >= 3)}
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
            
            {/* Sezione per aggiungere amici se già partecipante */}
            {isUserParticipant() && (
              <div className="space-y-4">
                <div className="p-3 bg-green-900/20 border border-green-600 rounded-lg">
                  <p className="text-green-300 text-sm font-medium">
                    ✅ Sei già iscritto come partecipante
                  </p>
                  <p className="text-green-200 text-xs mt-1">
                    Puoi comunque aggiungere amici alla tua iscrizione
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="text-xs text-gray-400 mb-2">* Puoi aggiungere fino a <span className="font-bold text-indigo-300">{isAdmin ? 'illimitati' : '3'} amici</span> per sessione</div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={friendInput || ''}
                      onChange={e => setFriendInput(e.target.value)}
                      className="px-4 py-2 rounded-lg bg-gray-700 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-indigo-500"
                      placeholder="Nome amico"
                      disabled={!isAdmin && friends.length >= 3}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (friendInput && (isAdmin || friends.length < 3)) {
                          setFriends([...friends, friendInput]);
                          setFriendInput('');
                        }
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
                      disabled={!friendInput || (!isAdmin && friends.length >= 3)}
                    >
                      Aggiungi amico
                    </button>
                  </div>
                  {friends.length > 0 && (
                    <div className="mt-2">
                      <div className="text-sm text-gray-300 mb-2">Amici da aggiungere:</div>
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
                      <button
                        onClick={() => handleSignup(false)}
                        className="w-full mt-3 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                      >
                        Aggiungi {friends.length} amici alla mia iscrizione
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {isUserReserve() && (
              <div className="p-3 bg-amber-900/20 border border-amber-600 rounded-lg">
                <p className="text-amber-300 text-sm font-medium">
                  ⏳ Sei iscritto come riserva
                </p>
                <p className="text-amber-200 text-xs mt-1">
                  Non puoi aggiungere amici finché sei in lista riserve
                </p>
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
          </>
        )}
        
        {/* Liste partecipanti/riserve - sempre visibili */}
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-100">Partecipanti</h2>
              <span className="bg-green-900 text-green-200 px-3 py-1 rounded-full font-semibold text-sm border border-green-700">
                {getTotalCount()} / {MAX_PARTICIPANTS}
              </span>
            </div>
            <div className="space-y-3">
              {!selectedMatch || !selectedMatch.participants || selectedMatch.participants.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nessun partecipante</p>
              ) : (
                selectedMatch.participants.map((participant, index) => (
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
                            <button
                              onClick={() => loadOtherUserStats(participant.uid, participant.name)}
                              className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-900/30 hover:bg-blue-900/50 transition"
                              title="Visualizza statistiche"
                            >
                              📊
                            </button>
                            {isAdmin && !isHistoricalMatch && (
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
                                {isAdmin && !isHistoricalMatch && (
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
          
          {/* Sezione Riserve - nascosta per partite storiche */}
          {!isHistoricalMatch && (
            <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-100">Riserve</h2>
                <span className="bg-amber-900 text-amber-200 px-3 py-1 rounded-full font-semibold text-sm border border-amber-700">
                  {getReservesTotalCount()}
                </span>
              </div>
              <div className="space-y-3">
                {!selectedMatch || !selectedMatch.reserves || selectedMatch.reserves.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Nessuna riserva</p>
                ) : (
                  selectedMatch.reserves.map((reserve, index) => (
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
                              <button
                                onClick={() => loadOtherUserStats(reserve.uid, reserve.name)}
                                className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-900/30 hover:bg-blue-900/50 transition"
                                title="Visualizza statistiche"
                              >
                                📊
                              </button>
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => handlePromoteReserve(reserve.uid)}
                                    className="text-green-400 hover:text-green-300 text-xs px-2 py-1 rounded bg-green-900/30 hover:bg-green-900/50 transition"
                                    title="Promuovi a partecipante"
                                  >
                                    ⬆️
                                  </button>
                                  <button
                                    onClick={() => handleAdminRemoveUser(reserve.uid, true)}
                                    className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 transition"
                                    title="Rimuovi utente"
                                  >
                                    ✕
                                  </button>
                                </>
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
          )}
        </div>
      </div>
    );
  };

  // Render match history view
  // Riapri partita (solo admin)
  const handleReopenMatch = async (session) => {
    if (!isAdmin) return;
    
    const confirmed = confirm('Sei sicuro di voler riaprire questa partita? Verrà aggiunta alle partite attive e le statistiche verranno aggiornate.');
    if (!confirmed) return;

    try {
      // Crea nuova partita attiva usando i dati della sessione storica
      await addDoc(collection(db, 'activeMatches'), {
        participants: session.participants || [],
        reserves: session.reserves || [],
        date: session.date.toDate ? session.date.toDate().toISOString() : new Date().toISOString(),
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        createdBy: currentUser.uid,
        status: 'active',
        reopenedFrom: session.id
      });

      // Decrementa le statistiche dei partecipanti (poiché la partita non è più "completata")
      const participants = session.participants || [];
      const reserves = session.reserves || [];
      
      const participantUpdates = participants.map((p) =>
        updateDoc(doc(db, 'users', p.uid), {
          'stats.totalSessions': increment(-1),
          'stats.asParticipant': increment(-1),
          'stats.friendsBrought': increment(-(p.friends?.length || 0)),
        })
      );
      
      const reserveUpdates = reserves.map((r) =>
        updateDoc(doc(db, 'users', r.uid), {
          'stats.asReserve': increment(-1),
          'stats.friendsBrought': increment(-(r.friends?.length || 0)),
        })
      );
      
      await Promise.allSettled([...participantUpdates, ...reserveUpdates]);

      // Rimuovi la sessione dallo storico
      await deleteDoc(doc(db, 'sessions', session.id));
      
      alert('Partita riaperta con successo! Statistiche aggiornate.');
      await loadMatchHistory();
    } catch (error) {
      console.error('Errore nella riapertura della partita:', error);
      alert('Errore nella riapertura della partita');
    }
  };

  const renderMatchHistoryView = () => (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-4 md:p-6 border border-gray-700">
        <h2 className="text-xl md:text-2xl font-bold text-gray-100 mb-4">Storico Partite</h2>
        
        {matchHistory.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">Nessuna partita nel database</p>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-4">
            {matchHistory.map((session, index) => (
              <div 
                key={session.id}
                className="bg-gray-700 rounded-lg p-3 md:p-4 border border-gray-600 hover:border-indigo-500 transition group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div 
                    onClick={() => {
                      setSelectedMatch({
                        ...session,
                        id: session.id,
                        date: session.date.toDate ? session.date.toDate().toISOString() : new Date().toISOString()
                      });
                      setCurrentView(VIEW_STATES.MATCH_DETAIL);
                    }}
                    className="flex-1 cursor-pointer"
                  >
                    <h3 className="text-base md:text-lg font-semibold text-gray-100 group-hover:text-indigo-300">
                      {session.date?.toDate ? session.date.toDate().toLocaleDateString('it-IT', { 
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      }) : 'Partita'}
                    </h3>
                    <p className="text-sm md:text-base text-gray-400 mt-1">
                      {session.date?.toDate ? session.date.toDate().toLocaleString('it-IT', { 
                        dateStyle: 'short', 
                        timeStyle: 'short' 
                      }) : 'Data non disponibile'}
                    </p>
                    {session.ignoredFromStats && (
                      <span className="inline-block mt-1 text-xs bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded">
                        Ignorata dalle statistiche
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 md:gap-4 justify-between md:justify-end">
                    <div className="text-center">
                      <div className="text-lg md:text-2xl font-bold text-green-400">
                        {(session.participants?.length || 0) + (session.participants?.reduce((acc, p) => acc + (p.friends?.length || 0), 0) || 0)}
                      </div>
                      <div className="text-xs text-gray-400">Partecipanti</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg md:text-2xl font-bold text-amber-400">
                        {(session.reserves?.length || 0) + (session.reserves?.reduce((acc, r) => acc + (r.friends?.length || 0), 0) || 0)}
                      </div>
                      <div className="text-xs text-gray-400">Riserve</div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReopenMatch(session);
                          }}
                          className="p-1 md:p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded-lg transition"
                          title="Riapri partita"
                        >
                          <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleIgnoreSession(session.id);
                          }}
                          className={`p-1 md:p-2 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20 rounded-lg transition ${
                            session.ignoredFromStats ? 'bg-yellow-900/50' : ''
                          }`}
                          title={session.ignoredFromStats ? "Riattiva nelle statistiche" : "Ignora dalle statistiche"}
                        >
                          {session.ignoredFromStats ? '👁️' : '🙈'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(session.id);
                          }}
                          className="p-1 md:p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition"
                          title="Elimina partita"
                        >
                          <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Render users list view (accessible to all logged users)
  // Rimuovi utente completamente (solo admin)
  const handleDeleteUser = async (userId, userName) => {
    if (!isAdmin) return;
    
    const confirmed = confirm(`Sei sicuro di voler eliminare completamente l'utente "${userName}"? Questa azione non può essere annullata.`);
    if (!confirmed) return;

    try {
      // Rimuovi l'utente dalla collezione users
      await deleteDoc(doc(db, 'users', userId));
      
      // Ricarica la lista utenti
      await loadAllUsers();
      
      alert('Utente eliminato con successo');
    } catch (error) {
      console.error('Errore nell\'eliminazione utente:', error);
      alert('Errore nell\'eliminazione utente');
    }
  };

  const renderUsersListView = () => {
    return (
      <div className="space-y-6">
        {allUsers.length === 0 ? (
          <div className="bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-700 text-center">
            <p className="text-gray-400">Nessun utente registrato</p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl shadow-2xl p-4 md:p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl md:text-2xl font-bold text-gray-100">Lista Utenti</h2>
              {isSuperAdmin && (
                <button
                  onClick={handleRecalculateAllStats}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm flex items-center gap-2"
                  title="Ricalcola tutte le statistiche basandosi sui dati reali"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Ricalcola Stats
                </button>
              )}
            </div>
            
            <div className="space-y-3 md:space-y-4">
              {allUsers.map((user) => (
                <div key={user.id} className="bg-gray-700 rounded-lg p-3 md:p-4 border border-gray-600">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
                      <img
                        src={user.photoURL || ''}
                        alt={user.displayName || ''}
                        className={`w-10 h-10 md:w-12 md:h-12 rounded-full border-2 flex-shrink-0 object-cover ${
                          user.email === SUPER_ADMIN_EMAIL || user.role === 'admin' 
                            ? 'border-blue-500 shadow-lg shadow-blue-500/30' 
                            : 'border-indigo-500'
                        }`}
                      />
                      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 min-w-0 flex-1">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-100 truncate">
                            {user.customDisplayName || user.displayName}
                          </div>
                        </div>
                        
                        {/* User statistics - inline for desktop, below for mobile */}
                        <div className="flex gap-2 md:gap-3 text-xs">
                          <div className="text-center">
                            <div className="font-bold text-indigo-400">{user.stats?.totalSessions || 0}</div>
                            <div className="text-gray-400">Partite</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-green-400">{user.stats?.asParticipant || 0}</div>
                            <div className="text-gray-400">Part</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-purple-400">{user.stats?.friendsBrought || 0}</div>
                            <div className="text-gray-400">Amici</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                      {/* Role badge - show to all admins, but hide super admin role */}
                      {isAdmin && (
                        <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium ${
                          user.email === SUPER_ADMIN_EMAIL ? 'bg-blue-900 text-blue-200' :
                          user.role === 'admin' ? 'bg-blue-900 text-blue-200' :
                          'bg-gray-600 text-gray-200'
                        }`}>
                          {user.email === SUPER_ADMIN_EMAIL ? 'Admin' : 
                           user.role === 'admin' ? 'Admin' : 'Utente'}
                        </span>
                      )}
                      
                      {/* Role change buttons - admins can promote to admin, only super-admin can demote admins */}
                      {isAdmin && user.email !== SUPER_ADMIN_EMAIL && user.id !== currentUser?.uid && (
                        <div className="flex gap-1 md:gap-2">
                          {user.role !== 'admin' && (
                            <button
                              onClick={() => handleChangeUserRole(user.id, 'admin')}
                              className="px-2 md:px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition"
                            >
                              Rendi Admin
                            </button>
                          )}
                          {user.role === 'admin' && isSuperAdmin && (
                            <button
                              onClick={() => handleChangeUserRole(user.id, 'user')}
                              className="px-2 md:px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 transition"
                            >
                              Rendi Utente
                            </button>
                          )}
                        </div>
                      )}
                      
                      {/* Stats button - available to all admins */}
                      <button
                        onClick={() => loadOtherUserStats(user.id, user.displayName)}
                        className="px-2 md:px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 transition"
                      >
                        📊 Stats
                      </button>
                      
                      {/* Delete button - only for admins and not for super-admin or current user */}
                      {isAdmin && user.email !== SUPER_ADMIN_EMAIL && user.id !== currentUser?.uid && (
                        <button
                          onClick={() => handleDeleteUser(user.id, user.customDisplayName || user.displayName)}
                          className="px-2 md:px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition"
                          title="Elimina utente"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render footer navigation (visible only for logged users)
  const renderFooter = () => {
    if (!isLoggedIn) return null;
    
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 p-2 md:p-4 z-40">
        <div className="max-w-6xl mx-auto flex justify-center">
          <div className="flex items-center gap-3 md:gap-6">
            {/* Home/Matches */}
            <button
              onClick={() => setCurrentView(activeMatches.length > 0 ? VIEW_STATES.MATCH_LIST : VIEW_STATES.NO_MATCHES)}
              className={`flex flex-col items-center gap-1 p-1 md:p-2 rounded-lg transition ${
                (currentView === VIEW_STATES.NO_MATCHES || currentView === VIEW_STATES.MATCH_LIST) 
                ? 'bg-indigo-600 text-white' 
                : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Partite"
            >
              <Home className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-xs">Partite</span>
            </button>
            
            {/* Current Match - solo se abbiamo una partita selezionata */}
            {selectedMatch && (
              <button
                onClick={() => setCurrentView(VIEW_STATES.MATCH_DETAIL)}
                className={`flex flex-col items-center gap-1 p-1 md:p-2 rounded-lg transition ${
                  currentView === VIEW_STATES.MATCH_DETAIL 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-gray-400 hover:text-gray-200'
                }`}
                title="Partita Corrente"
              >
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <span className="text-xs">Partita</span>
              </button>
            )}
            
            {/* History */}
            <button
              onClick={() => {
                loadMatchHistory();
                setCurrentView(VIEW_STATES.MATCH_HISTORY);
              }}
              className={`flex flex-col items-center gap-1 p-1 md:p-2 rounded-lg transition ${
                currentView === VIEW_STATES.MATCH_HISTORY 
                ? 'bg-indigo-600 text-white' 
                : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Storico"
            >
              <History className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-xs">Storico</span>
            </button>
            
            {/* Users - accessible to all logged users */}
            <button
              onClick={() => {
                loadAllUsers();
                setCurrentView(VIEW_STATES.USERS_LIST);
              }}
              className={`flex flex-col items-center gap-1 p-1 md:p-2 rounded-lg transition ${
                currentView === VIEW_STATES.USERS_LIST 
                ? 'bg-indigo-600 text-white' 
                : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Utenti"
            >
              <UserCheck className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-xs">Utenti</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Main render function
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-3 md:p-6 pb-24">
      <div className="max-w-6xl mx-auto">
        {renderHeader()}
        
        {/* Show only login for non-logged users */}
        {!isLoggedIn ? (
          <div className="flex flex-col items-center justify-center">
            <div className="bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-700 w-full max-w-md text-center">
              <div className="text-lg text-yellow-200 mb-6">Benvenuto! Effettua il login per accedere alle partite di pallavolo</div>
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Accesso...
                  </>
                ) : (
                  <>
                    <Users className="w-5 h-5" />
                    Accedi con Google
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-20"> {/* Extra margin for footer */}
            {currentView === VIEW_STATES.NO_MATCHES && renderNoMatchesView()}
            {currentView === VIEW_STATES.MATCH_LIST && renderMatchListView()}
            {currentView === VIEW_STATES.MATCH_DETAIL && renderMatchDetailView()}
            {currentView === VIEW_STATES.MATCH_HISTORY && renderMatchHistoryView()}
            {currentView === VIEW_STATES.USERS_LIST && renderUsersListView()}
          </div>
        )}
        
        {/* Footer navigation */}
        {renderFooter()}
        
        {/* Modal statistiche utente */}
        {showUserStatsModal && selectedUserStats && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-500" />
                  Statistiche di {selectedUserStats.displayName}
                </h3>
                <button
                  onClick={() => setShowUserStatsModal(false)}
                  className="text-gray-400 hover:text-gray-200 transition"
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50">
                  <div className="text-xl font-bold text-indigo-400">{selectedUserStats.totalSessions || 0}</div>
                  <div className="text-xs text-gray-400">Partite totali</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50">
                  <div className="text-xl font-bold text-purple-400">{selectedUserStats.friendsBrought || 0}</div>
                  <div className="text-xs text-gray-400">Amici portati</div>
                </div>
              </div>
              
              {isAdmin && (
                <button
                  onClick={() => handleResetUserStats(selectedUserStats.uid)}
                  className="mt-4 w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition border border-red-500 text-sm"
                >
                  🗑️ Reset statistiche utente
                </button>
              )}
              
              <button
                onClick={() => setShowUserStatsModal(false)}
                className="mt-2 w-full px-4 py-2 bg-gray-700 text-gray-100 rounded-lg hover:bg-gray-600 transition border border-gray-600 text-sm"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}