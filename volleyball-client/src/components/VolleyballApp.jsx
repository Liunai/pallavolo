import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Users, UserPlus, Clock, Calendar, ChevronLeft, Home, History, UserCheck, Settings, Plus, Sun, Moon } from 'lucide-react';
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
  limit,
  Timestamp,
} from 'firebase/firestore';

const MAX_PARTICIPANTS = 14;

// View states
const VIEW_STATES = {
  NO_MATCHES: 'no_matches',
  MATCH_LIST: 'match_list', 
  MATCH_DETAIL: 'match_detail',
  MATCH_HISTORY: 'match_history',
  USERS_LIST: 'users_list',
  FORMATION_PROPOSAL: 'formation_proposal',
  FORMATION_RESULT: 'formation_result',
  ADD_SET: 'add_set',
  SET_DETAIL: 'set_detail',
  COPPA_PASTE: 'coppa_paste'
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
  // Ref per tracciare se l'utente sta interagendo con la lista amici
  const friendsRef = useRef([]);

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);
  const [showStats, setShowStats] = useState(false);
  const [userStats, setUserStats] = useState(null);
  
  // States for user name customization
  const [customDisplayName, setCustomDisplayName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempDisplayName, setTempDisplayName] = useState("");
  
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // States for viewing other users' stats
  const [showUserStatsModal, setShowUserStatsModal] = useState(false);
  const [selectedUserStats, setSelectedUserStats] = useState(null);
  
  // States for user roles and management
  const [userRole, setUserRole] = useState('user'); // user, admin, super-admin
  const [allUsers, setAllUsers] = useState([]);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);

  // New state management for unified component
  const [currentView, setCurrentViewState] = useState(VIEW_STATES.NO_MATCHES);
  
  // Wrapper per tracciare i cambi di vista
  const setCurrentView = (newView) => {
    console.log('🔄 Cambio vista da', currentView, 'a', newView);
    console.trace('Stack trace per il cambio vista:');
    setCurrentViewState(newView);
  };
  
  // Funzione per mostrare toast non bloccante
  const showToastMessage = (message) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000); // Nasconde dopo 3 secondi
  };
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchHistory, setMatchHistory] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]); // Lista di tutte le partite attive
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Flag per il primo caricamento

  // Formation proposal states
  const [formationProposals, setFormationProposals] = useState([]);
  const [currentFormation, setCurrentFormation] = useState({
    team1: Array(6).fill(null), // 6 posizioni: 1,2,3,4,5,6
    team2: Array(6).fill(null),
    reserveTeam1: null, // riserva squadra A
    reserveTeam2: null  // riserva squadra B
  });
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [draggedPlayer, setDraggedPlayer] = useState(null);
  const [calculatedFormations, setCalculatedFormations] = useState(null);

  // Set tracking states
  const [matchSets, setMatchSets] = useState([]);
  const [currentSet, setCurrentSet] = useState({
    team1: Array(6).fill(null),
    team2: Array(6).fill(null), 
    reserveTeam1: null,
    reserveTeam2: null,
    teamAScore: 0,
    teamBScore: 0
  });
  const [selectedSet, setSelectedSet] = useState(null);
  const [filterPlayer, setFilterPlayer] = useState('');
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [expandedSetId, setExpandedSetId] = useState(null);
  const [userFilter, setUserFilter] = useState(''); // Filtro per ricerca utente nello storico partite

  const currentSessionRef = useMemo(() => doc(db, 'state', 'currentSession'), []);
  
  // Role-based permissions
  const SUPER_ADMIN_EMAIL = 'tidolamiamail@gmail.com';
  const isSuperAdmin = currentUser?.email === SUPER_ADMIN_EMAIL;
  const isAdmin = userRole === 'admin' || isSuperAdmin;
  const isCapitana = userRole === 'capitana' || isSuperAdmin;

  // Coppa Paste states
  const [coppaPasteUsers, setCoppaPasteUsers] = useState([]);
  const [coppaPasteNewUser, setCoppaPasteNewUser] = useState('');
  const [showCoppaPasteReport, setShowCoppaPasteReport] = useState(false);
  const [showUserHistory, setShowUserHistory] = useState(false);
  const [selectedUserHistory, setSelectedUserHistory] = useState(null);
  
  // Toast notifications
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
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

  // Load theme preference from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('volleyball-theme');
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
    }
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('volleyball-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

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
        const unsubscribe = onSnapshot(q, async (snapshot) => {
          const matches = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
            const matchData = docSnapshot.data();
            
            // Carica i partecipanti dalla sottocollezione se non sono nel documento principale
            let participants = matchData.participants || [];
            if (participants.length === 0) {
              try {
                const participantsQuery = query(collection(db, 'activeMatches', docSnapshot.id, 'participants'));
                const participantsSnapshot = await getDocs(participantsQuery);
                participants = participantsSnapshot.docs.map(doc => ({
                  uid: doc.id,
                  ...doc.data()
                }));
              } catch (error) {
                console.error('Error loading participants for match:', docSnapshot.id, error);
              }
            }
            
            return {
              id: docSnapshot.id,
              ...matchData,
              participants
            };
          }));
          
          // Aggiorna i dati delle partite attive
          setActiveMatches(matches);
          
          // Solo al primo caricamento REALE dell'app, imposta la vista appropriata
          // Ma NON durante gli aggiornamenti successivi causati da interazioni utente
          if (isInitialLoad && currentView === VIEW_STATES.NO_MATCHES) {
            console.log('🔄 PRIMO CARICAMENTO: isInitialLoad=true, matches.length=', matches.length, 'currentView=', currentView);
            if (matches.length > 0) {
              console.log('📋 Cambiando vista a MATCH_LIST per primo caricamento');
              setCurrentView(VIEW_STATES.MATCH_LIST);
            } else {
              console.log('❌ Rimanendo in NO_MATCHES per primo caricamento');
              // currentView è già NO_MATCHES, non serve cambiare
            }
            console.log('🏁 Disabling isInitialLoad dopo primo caricamento');
            setIsInitialLoad(false);
          } else {
            console.log('🔄 onSnapshot aggiornamento: isInitialLoad=', isInitialLoad, 'matches.length=', matches.length, 'currentView=', currentView);
            // Imposta isInitialLoad=false alla prima esecuzione per evitare interferenze future
            if (isInitialLoad) {
              console.log('🏁 Disabling isInitialLoad to prevent future automatic navigation');
              setIsInitialLoad(false);
            }
          }
          // Per i caricamenti successivi, non cambiare la vista per evitare che 
          // aggiornamenti realtime (es. iscrizioni) forzino la navigazione
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

  // Sincronizza selectedMatch con i dati aggiornati delle activeMatches
  useEffect(() => {
    if (selectedMatch && activeMatches.length > 0) {
      const updatedMatch = activeMatches.find(match => match.id === selectedMatch.id);
      if (updatedMatch) {
        setSelectedMatch(updatedMatch);
      }
    }
  }, [activeMatches, selectedMatch?.id]);

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

  // Theme toggle function
  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
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

      // Load sessions where user participated (excluding ignored sessions)
      const q = query(
        collection(db, 'sessions'),
        where('participantUids', 'array-contains', uid),
        orderBy('date', 'desc')
      );
      const sessionsSnap = await getDocs(q);
      const allSessions = sessionsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(session => !session.ignoredFromStats); // Filtra sessioni ignorate
      
      // Filtra solo le sessioni già giocate (nel passato)
      const now = new Date();
      const playedSessions = allSessions.filter(session => {
        const sessionDate = session.date?.toDate ? session.date.toDate() : new Date(session.date);
        return sessionDate < now; // Solo sessioni nel passato
      });

      setSelectedUserStats({
        uid,
        displayName: user.customDisplayName || displayName,
        totalSessions: playedSessions.length, // Usa solo sessioni già giocate
        asParticipant: user?.stats?.asParticipant || 0,
        asReserve: user?.stats?.asReserve || 0,
        // friendsBrought rimosso
        sessionsHistory: playedSessions, // Usa solo sessioni già giocate
      });
      setShowUserStatsModal(true);
    } catch (error) {
      console.error('Errore nel caricamento delle statistiche:', error);
      alert('Errore nel caricamento delle statistiche');
    }
  };

  // Formation management functions
  const initializeFormationProposal = () => {
    if (!selectedMatch || !selectedMatch.participants) return;
    
    // Metti tutti i partecipanti nella lista disponibili
    const players = selectedMatch.participants.map(p => ({
      uid: p.uid,
      name: p.name, // Solo il nome scelto per il sito
      friends: p.friends || []
    }));
    
    // Aggiungi anche gli amici
    const allPlayers = [];
    players.forEach(player => {
      allPlayers.push(player);
      if (player.friends && player.friends.length > 0) {
        player.friends.forEach(friend => {
          allPlayers.push({
            uid: `friend_${player.uid}_${friend}`,
            name: friend,
            isFriend: true,
            parentUid: player.uid
          });
        });
      }
    });
    
    setAvailablePlayers(allPlayers);
    setCurrentFormation({
      team1: Array(6).fill(null),
      team2: Array(6).fill(null), 
      reserveTeam1: null,
      reserveTeam2: null
    });
    
    // Imposta le dimensioni dei campi in base alla larghezza dello schermo
    adjustFormationLayout();
  };
  
  // Funzione per adattare il layout in base alle dimensioni dello schermo
  const adjustFormationLayout = () => {
    // Questa funzione verrà chiamata quando si inizializza la formazione
    // e anche quando cambia la dimensione della finestra
    const isMobile = window.innerWidth < 768;
    
    // Aggiunge o rimuove una classe a body per gestire i media queries custom
    if (isMobile) {
      document.body.classList.add('is-mobile-view');
    } else {
      document.body.classList.remove('is-mobile-view');
    }
    
    // Aggiunge uno stile inline per adattare il layout del campo
    const courtElements = document.querySelectorAll('.volleyball-court');
    courtElements.forEach(court => {
      if (isMobile) {
        court.style.maxWidth = '100%';
        court.style.height = 'auto';
        court.style.aspectRatio = '3/4';
      } else {
        court.style.maxWidth = '450px';
        court.style.height = '300px';
        court.style.aspectRatio = 'auto';
      }
    });
  };
  
  // Aggiungi un listener per ridimensionare i campi quando la finestra cambia dimensione
  useEffect(() => {
    window.addEventListener('resize', adjustFormationLayout);
    return () => {
      window.removeEventListener('resize', adjustFormationLayout);
    };
  }, []);

  const handleDragStart = (e, player) => {
    setDraggedPlayer(player);
    e.dataTransfer.effectAllowed = 'move';
    
    // Per rendere visibile il drag su mobile
    if (e.dataTransfer.setDragImage) {
      const dragIcon = document.createElement('div');
      dragIcon.innerHTML = `<div style="padding: 10px; background-color: rgba(79, 70, 229, 0.8); color: white; border-radius: 8px; font-size: 14px;">${player.name}</div>`;
      document.body.appendChild(dragIcon);
      e.dataTransfer.setDragImage(dragIcon, 0, 0);
      setTimeout(() => {
        document.body.removeChild(dragIcon);
      }, 0);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  // Aggiunge supporto per tocco su dispositivi mobili
  const handleTouchStart = (player) => {
    setDraggedPlayer(player);
    
    // Aggiungi feedback visivo per l'elemento che sta venendo trascinato
    const touchTargets = document.querySelectorAll('[data-team][data-position]');
    touchTargets.forEach(target => {
      target.classList.add('potential-drop-target');
    });
  };
  
  const handleTouchEnd = (e, team, position) => {
    e.preventDefault();
    if (!draggedPlayer) return;
    
    // Rimuovi il feedback visivo
    const touchTargets = document.querySelectorAll('.potential-drop-target');
    touchTargets.forEach(target => {
      target.classList.remove('potential-drop-target');
    });
    
    // Trova l'elemento HTML sotto il dito
    const touch = e.changedTouches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Cerca l'elemento più vicino con attributi data-team e data-position
    let targetElement = element;
    while (targetElement && (!targetElement.dataset?.team || !targetElement.dataset?.position)) {
      targetElement = targetElement.parentElement;
    }
    
    if (targetElement && targetElement.dataset.team && targetElement.dataset.position !== undefined) {
      // Feedback visivo per l'elemento target
      targetElement.classList.add('drop-highlight');
      setTimeout(() => {
        targetElement.classList.remove('drop-highlight');
      }, 300);
      
      // Gestisci le riserve in modo speciale
      if (targetElement.dataset.position === "reserve") {
        handleDrop({preventDefault: () => {}}, targetElement.dataset.team, null);
      } else {
        // Usa la funzione di drop esistente con i dati dell'elemento trovato
        handleDrop({preventDefault: () => {}}, targetElement.dataset.team, parseInt(targetElement.dataset.position));
      }
    } else {
      // Annulla il drag&drop se non è stato trovato un target valido
      setDraggedPlayer(null);
    }
  };

  const handleDrop = (e, team, position) => {
    e.preventDefault();
    if (!draggedPlayer) return;

    // Rimuovi il giocatore dalla posizione precedente
    const newFormation = { ...currentFormation };
    
    // Controlla se il giocatore era già posizionato da qualche parte
    Object.keys(newFormation).forEach(key => {
      if (key === 'reserveTeam1' || key === 'reserveTeam2') {
        if (newFormation[key]?.uid === draggedPlayer.uid) {
          newFormation[key] = null;
        }
      } else if (Array.isArray(newFormation[key])) {
        newFormation[key] = newFormation[key].map(player => 
          player?.uid === draggedPlayer.uid ? null : player
        );
      }
    });

    // Posiziona il giocatore nella nuova posizione
    if (team === 'reserveTeam1' || team === 'reserveTeam2') {
      newFormation[team] = draggedPlayer;
    } else {
      newFormation[team][position] = draggedPlayer;
    }

    setCurrentFormation(newFormation);
    setDraggedPlayer(null);
  };

  const handleReturnToAvailable = (player) => {
    // Rimuovi il giocatore dalla formazione e rimettilo tra i disponibili
    const newFormation = { ...currentFormation };
    
    Object.keys(newFormation).forEach(key => {
      if (key === 'reserveTeam1' || key === 'reserveTeam2') {
        if (newFormation[key]?.uid === player.uid) {
          newFormation[key] = null;
        }
      } else if (Array.isArray(newFormation[key])) {
        newFormation[key] = newFormation[key].map(p => 
          p?.uid === player.uid ? null : p
        );
      }
    });

    setCurrentFormation(newFormation);
  };

  // Funzioni per i set - IDENTICHE alle formazioni ma operano su currentSet
  const handleDropForSet = (e, team, position) => {
    e.preventDefault();
    if (!draggedPlayer) return;

    // Rimuovi il giocatore dalla posizione precedente
    const newSet = { ...currentSet };
    
    // Controlla se il giocatore era già posizionato da qualche parte
    Object.keys(newSet).forEach(key => {
      if (key === 'reserveTeam1' || key === 'reserveTeam2') {
        if (newSet[key]?.uid === draggedPlayer.uid) {
          newSet[key] = null;
        }
      } else if (Array.isArray(newSet[key])) {
        newSet[key] = newSet[key].map(player => 
          player?.uid === draggedPlayer.uid ? null : player
        );
      }
    });

    // Posiziona il giocatore nella nuova posizione
    if (team === 'reserveTeam1' || team === 'reserveTeam2') {
      newSet[team] = draggedPlayer;
    } else {
      newSet[team][position] = draggedPlayer;
    }

    setCurrentSet(newSet);
    setDraggedPlayer(null);
  };

  const handleReturnToAvailableForSet = (player) => {
    // Rimuovi il giocatore dal set e rimettilo tra i disponibili
    const newSet = { ...currentSet };
    
    Object.keys(newSet).forEach(key => {
      if (key === 'reserveTeam1' || key === 'reserveTeam2') {
        if (newSet[key]?.uid === player.uid) {
          newSet[key] = null;
        }
      } else if (Array.isArray(newSet[key])) {
        newSet[key] = newSet[key].map(p => 
          p?.uid === player.uid ? null : p
        );
      }
    });

    setCurrentSet(newSet);
  };

  const submitFormationProposal = async () => {
    if (!currentUser || !selectedMatch) return;
    
    try {
      // Valida che ci siano almeno 12 giocatori posizionati
      const placedPlayers = [
        ...currentFormation.team1.filter(p => p !== null),
        ...currentFormation.team2.filter(p => p !== null)
      ];
      
      if (placedPlayers.length < 12) {
        alert('Devi posizionare almeno 12 giocatori nelle due squadre!');
        return;
      }

      // Converto la formazione nel formato atteso dal database mantenendo la compatibilità
      const formationForDB = {
        team1: currentFormation.team1,
        team2: currentFormation.team2,
        reserveTeam1: currentFormation.reserveTeam1,
        reserveTeam2: currentFormation.reserveTeam2
      };

      const proposal = {
        matchId: selectedMatch.id,
        userId: currentUser.uid,
        userName: customDisplayName || currentUser.displayName,
        formation: formationForDB,
        submittedAt: serverTimestamp()
      };

      await setDoc(
        doc(db, 'formationProposals', `${selectedMatch.id}_${currentUser.uid}`),
        proposal
      );

      alert('Formazione proposta salvata con successo!');
    } catch (error) {
      console.error('Errore nel salvataggio della formazione:', error);
      alert('Errore nel salvataggio della formazione');
    }
  };

  const loadFormationProposals = async (matchId) => {
    try {
      const q = query(
        collection(db, 'formationProposals'),
        where('matchId', '==', matchId)
      );
      const snapshot = await getDocs(q);
      const proposals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFormationProposals(proposals);
      return proposals;
    } catch (error) {
      console.error('Errore nel caricamento delle formazioni:', error);
      return [];
    }
  };

  // Set Management Functions
  const initializeSetCreation = async () => {
    if (!selectedMatch) return;
    
    // Se non abbiamo i partecipanti, li carichiamo dal database
    let participants = selectedMatch.participants || [];
    
    if (!participants || participants.length === 0) {
      try {
        const matchDoc = await getDoc(doc(db, 'activeMatches', selectedMatch.id));
        if (matchDoc.exists()) {
          const matchData = matchDoc.data();
          participants = matchData.participants || [];
        }
      } catch (error) {
        console.error('Error loading match participants:', error);
        return;
      }
    }
    
    if (participants.length === 0) {
      console.error('No participants found for this match');
      return;
    }
    
    // Metti tutti i partecipanti nella lista disponibili (stesso codice delle formazioni)
    const players = participants.map(p => ({
      uid: p.uid,
      name: p.name, // Solo il nome scelto per il sito
      friends: p.friends || []
    }));
    
    // Aggiungi anche gli amici
    const allPlayers = [];
    players.forEach(player => {
      allPlayers.push(player);
      if (player.friends && player.friends.length > 0) {
        player.friends.forEach(friend => {
          allPlayers.push({
            uid: `friend_${player.uid}_${friend}`,
            name: friend,
            isFriend: true,
            parentUid: player.uid,
            parentName: player.name
          });
        });
      }
    });
    
    setAvailablePlayers(allPlayers);
    
    // Inizializza il nuovo set
    let newSet = {
      team1: Array(6).fill(null),
      team2: Array(6).fill(null), 
      reserveTeam1: null,
      reserveTeam2: null,
      setNumber: (matchSets.length || 0) + 1,
      teamAScore: 0,
      teamBScore: 0
    };
    
    // Se esiste un set precedente, usa la sua formazione come base
    if (matchSets.length > 0) {
      const lastSet = matchSets[matchSets.length - 1];
      
      // Funzione helper per trovare il giocatore corrispondente nella lista disponibile
      const findPlayerInAvailable = (originalPlayer) => {
        if (!originalPlayer) return null;
        return allPlayers.find(p => p.uid === originalPlayer.uid || p.name === originalPlayer.name);
      };
      
      // Copia la formazione dell'ultimo set se i giocatori sono ancora disponibili
      if (lastSet.teamA) {
        newSet.team1 = lastSet.teamA.map(player => findPlayerInAvailable(player));
      }
      if (lastSet.teamB) {
        newSet.team2 = lastSet.teamB.map(player => findPlayerInAvailable(player));
      }
      if (lastSet.reserveTeamA) {
        newSet.reserveTeam1 = findPlayerInAvailable(lastSet.reserveTeamA);
      }
      if (lastSet.reserveTeamB) {
        newSet.reserveTeam2 = findPlayerInAvailable(lastSet.reserveTeamB);
      }
    }
    
    setCurrentSet(newSet);
    setCurrentView(VIEW_STATES.ADD_SET);
  };

  const submitSet = async () => {
    if (!currentUser || !selectedMatch) return;
    
    try {
      // Valida che ci siano almeno 12 giocatori posizionati
      const placedPlayers = [
        ...currentSet.team1.filter(p => p !== null),
        ...currentSet.team2.filter(p => p !== null)
      ];
      
      if (placedPlayers.length < 12) {
        alert('Devi posizionare almeno 12 giocatori nelle due squadre!');
        return;
      }

      if (currentSet.teamAScore === 0 && currentSet.teamBScore === 0) {
        alert('Inserisci il punteggio del set!');
        return;
      }

      const setData = {
        matchId: selectedMatch.id,
        teamA: currentSet.team1.filter(p => p),
        teamB: currentSet.team2.filter(p => p),
        reserveTeamA: currentSet.reserveTeam1,
        reserveTeamB: currentSet.reserveTeam2,
        teamAScore: currentSet.teamAScore,
        teamBScore: currentSet.teamBScore,
        createdBy: currentUser.uid,
        createdByName: currentUser.displayName || currentUser.email,
        createdAt: serverTimestamp(),
        setNumber: currentSet.setNumber,
        participantUids: [
          ...currentSet.team1.filter(p => p && !p.uid.startsWith('friend_')).map(p => p.uid),
          ...currentSet.team2.filter(p => p && !p.uid.startsWith('friend_')).map(p => p.uid),
          ...(currentSet.reserveTeam1 && !currentSet.reserveTeam1.uid.startsWith('friend_') ? [currentSet.reserveTeam1.uid] : []),
          ...(currentSet.reserveTeam2 && !currentSet.reserveTeam2.uid.startsWith('friend_') ? [currentSet.reserveTeam2.uid] : [])
        ]
      };

      await addDoc(collection(db, 'matchSets'), setData);
      
      // Aggiorna le statistiche dei giocatori
      await updatePlayerSetStats(setData);
      
      alert('Set salvato con successo!');
      
      // Ricarica i set della partita
      await loadMatchSets(selectedMatch.id);
      
      // Torna alla vista della partita
      setCurrentView(VIEW_STATES.MATCH_DETAIL);
    } catch (error) {
      console.error('Errore nel salvataggio del set:', error);
      alert('Errore nel salvataggio del set');
    }
  };

  const updatePlayerSetStats = async (setData) => {
    const team1Players = setData.teamA.filter(p => p !== null && !p.uid.startsWith('friend_'));
    const team2Players = setData.teamB.filter(p => p !== null && !p.uid.startsWith('friend_'));
    const winningTeam = setData.teamAScore > setData.teamBScore ? 'teamA' : 'teamB';
    const pointDifference = Math.abs(setData.teamAScore - setData.teamBScore);

    // Aggiorna statistiche team1
    const team1Updates = team1Players.map(async (player) => {
      const isWinner = winningTeam === 'teamA';
      await updateDoc(doc(db, 'users', player.uid), {
        'stats.setsPlayed': increment(1),
        'stats.setsWon': increment(isWinner ? 1 : 0),
        'stats.setsLost': increment(isWinner ? 0 : 1),
        'stats.pointDifference': increment(isWinner ? pointDifference : -pointDifference)
      });
    });

    // Aggiorna statistiche team2
    const team2Updates = team2Players.map(async (player) => {
      const isWinner = winningTeam === 'teamB';
      await updateDoc(doc(db, 'users', player.uid), {
        'stats.setsPlayed': increment(1),
        'stats.setsWon': increment(isWinner ? 1 : 0),
        'stats.setsLost': increment(isWinner ? 0 : 1),
        'stats.pointDifference': increment(isWinner ? pointDifference : -pointDifference)
      });
    });

    await Promise.allSettled([...team1Updates, ...team2Updates]);
  };

  const loadMatchSets = async (matchId) => {
    try {
      const q = query(
        collection(db, 'matchSets'),
        where('matchId', '==', matchId),
        orderBy('setNumber', 'asc')
      );
      const snapshot = await getDocs(q);
      const sets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMatchSets(sets);
      return sets;
    } catch (error) {
      console.error('Errore nel caricamento dei set:', error);
      return [];
    }
  };

  const deleteSet = async (setId) => {
    if (!isAdmin && !isSuperAdmin) {
      alert('Solo gli admin possono cancellare i set');
      return;
    }

    if (!confirm('Sei sicuro di voler cancellare questo set?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'matchSets', setId));
      // Ricarica i set della partita
      if (selectedMatch) {
        await loadMatchSets(selectedMatch.id);
      }
      alert('Set cancellato con successo');
    } catch (error) {
      console.error('Errore nella cancellazione del set:', error);
      alert('Errore nella cancellazione del set');
    }
  };

  const calculateOptimalFormations = (proposals) => {
    if (proposals.length < 3) return null;
    
    // Raccoglie tutti i giocatori unici dalle proposte
    const allPlayers = new Set();
    proposals.forEach(proposal => {
      const formation = proposal.formation;
      formation.team1.forEach(player => player && allPlayers.add(player.uid));
      formation.team2.forEach(player => player && allPlayers.add(player.uid));
      if (formation.reserve) allPlayers.add(formation.reserve.uid);
      if (formation.reserveTeam1) allPlayers.add(formation.reserveTeam1.uid);
      if (formation.reserveTeam2) allPlayers.add(formation.reserveTeam2.uid);
    });
    
    const playersArray = Array.from(allPlayers);
    
    // Calcola le preferenze di posizione per ogni giocatore
    const positionPreferences = {};
    playersArray.forEach(playerUid => {
      positionPreferences[playerUid] = {
        team1: Array(6).fill(0),
        team2: Array(6).fill(0),
        reserve: 0,
        name: ''
      };
    });
    
    // Analizza tutte le proposte per calcolare le preferenze
    proposals.forEach(proposal => {
      const formation = proposal.formation;
      
      // Team 1
      formation.team1.forEach((player, position) => {
        if (player) {
          positionPreferences[player.uid].team1[position]++;
          if (!positionPreferences[player.uid].name) {
            positionPreferences[player.uid].name = player.name;
          }
        }
      });
      
      // Team 2
      formation.team2.forEach((player, position) => {
        if (player) {
          positionPreferences[player.uid].team2[position]++;
          if (!positionPreferences[player.uid].name) {
            positionPreferences[player.uid].name = player.name;
          }
        }
      });
      
      // Riserva (supporto per entrambi i formati)
      if (formation.reserve) {
        positionPreferences[formation.reserve.uid].reserve++;
        if (!positionPreferences[formation.reserve.uid].name) {
          positionPreferences[formation.reserve.uid].name = formation.reserve.name;
        }
      }
      if (formation.reserveTeam1) {
        positionPreferences[formation.reserveTeam1.uid].reserve++;
        if (!positionPreferences[formation.reserveTeam1.uid].name) {
          positionPreferences[formation.reserveTeam1.uid].name = formation.reserveTeam1.name;
        }
      }
      if (formation.reserveTeam2) {
        positionPreferences[formation.reserveTeam2.uid].reserve++;
        if (!positionPreferences[formation.reserveTeam2.uid].name) {
          positionPreferences[formation.reserveTeam2.uid].name = formation.reserveTeam2.name;
        }
      }
    });
    
    // Analizza le co-occorrenze (giocatori che spesso giocano insieme)
    const coOccurrences = {};
    playersArray.forEach(p1 => {
      coOccurrences[p1] = {};
      playersArray.forEach(p2 => {
        if (p1 !== p2) {
          coOccurrences[p1][p2] = { sameTeam: 0, oppositeTeam: 0 };
        }
      });
    });
    
    proposals.forEach(proposal => {
      const formation = proposal.formation;
      const team1Players = formation.team1.filter(p => p).map(p => p.uid);
      const team2Players = formation.team2.filter(p => p).map(p => p.uid);
      
      // Co-occorrenze stesso team
      team1Players.forEach(p1 => {
        team1Players.forEach(p2 => {
          if (p1 !== p2) {
            coOccurrences[p1][p2].sameTeam++;
          }
        });
      });
      
      team2Players.forEach(p1 => {
        team2Players.forEach(p2 => {
          if (p1 !== p2) {
            coOccurrences[p1][p2].sameTeam++;
          }
        });
      });
      
      // Co-occorrenze team opposti
      team1Players.forEach(p1 => {
        team2Players.forEach(p2 => {
          coOccurrences[p1][p2].oppositeTeam++;
          coOccurrences[p2][p1].oppositeTeam++;
        });
      });
    });
    
    // Algoritmo di assegnazione ottimale
    const assignedPlayers = new Set();
    const finalFormation = {
      team1: Array(6).fill(null),
      team2: Array(6).fill(null),
      reserveTeam1: null,
      reserveTeam2: null
    };
    
    // Prima assegna le riserve (due riserve, una per squadra)
    let bestReserveTeam1 = null;
    let maxReserveScoreTeam1 = 0;
    let bestReserveTeam2 = null;
    let maxReserveScoreTeam2 = 0;
    
    playersArray.forEach(playerUid => {
      const reserveScore = positionPreferences[playerUid].reserve;
      if (reserveScore > maxReserveScoreTeam1) {
        maxReserveScoreTeam2 = maxReserveScoreTeam1;
        bestReserveTeam2 = bestReserveTeam1;
        maxReserveScoreTeam1 = reserveScore;
        bestReserveTeam1 = playerUid;
      } else if (reserveScore > maxReserveScoreTeam2) {
        maxReserveScoreTeam2 = reserveScore;
        bestReserveTeam2 = playerUid;
      }
    });
    
    if (bestReserveTeam1 && maxReserveScoreTeam1 > 0) {
      finalFormation.reserveTeam1 = {
        uid: bestReserveTeam1,
        name: positionPreferences[bestReserveTeam1].name
      };
      assignedPlayers.add(bestReserveTeam1);
    }
    
    if (bestReserveTeam2 && maxReserveScoreTeam2 > 0) {
      finalFormation.reserveTeam2 = {
        uid: bestReserveTeam2,
        name: positionPreferences[bestReserveTeam2].name
      };
      assignedPlayers.add(bestReserveTeam2);
    }
    
    // Assegna le posizioni per ciascun team
    ['team1', 'team2'].forEach(teamKey => {
      for (let position = 0; position < 6; position++) {
        let bestPlayer = null;
        let maxScore = 0;
        
        playersArray.forEach(playerUid => {
          if (assignedPlayers.has(playerUid)) return;
          
          let score = positionPreferences[playerUid][teamKey][position];
          
          // Bonus per co-occorrenze con giocatori già nel team
          const currentTeamPlayers = finalFormation[teamKey]
            .filter(p => p !== null)
            .map(p => p.uid);
          
          currentTeamPlayers.forEach(teammateUid => {
            score += coOccurrences[playerUid][teammateUid].sameTeam * 0.5;
          });
          
          // Penalità per opposizioni con giocatori nell'altro team
          const otherTeamKey = teamKey === 'team1' ? 'team2' : 'team1';
          const otherTeamPlayers = finalFormation[otherTeamKey]
            .filter(p => p !== null)
            .map(p => p.uid);
          
          otherTeamPlayers.forEach(opponentUid => {
            score -= coOccurrences[playerUid][opponentUid].sameTeam * 0.3;
          });
          
          if (score > maxScore) {
            maxScore = score;
            bestPlayer = playerUid;
          }
        });
        
        if (bestPlayer) {
          finalFormation[teamKey][position] = {
            uid: bestPlayer,
            name: positionPreferences[bestPlayer].name
          };
          assignedPlayers.add(bestPlayer);
        }
      }
    });
    
    return {
      ...finalFormation,
      proposalCount: proposals.length,
      confidence: calculateConfidence(proposals, finalFormation)
    };
  };
  
  const calculateConfidence = (proposals, finalFormation) => {
    // Calcola quanto questa formazione è "sicura" basandosi sul consenso
    let totalMatches = 0;
    let totalPossible = 0;
    
    proposals.forEach(proposal => {
      const formation = proposal.formation;
      
      // Controlla matches team1
      formation.team1.forEach((player, pos) => {
        totalPossible++;
        if (player && finalFormation.team1[pos] && 
            player.uid === finalFormation.team1[pos].uid) {
          totalMatches++;
        }
      });
      
      // Controlla matches team2
      formation.team2.forEach((player, pos) => {
        totalPossible++;
        if (player && finalFormation.team2[pos] && 
            player.uid === finalFormation.team2[pos].uid) {
          totalMatches++;
        }
      });
      
      // Controlla riserve (supporto per entrambi i formati)
      if (formation.reserve && finalFormation.reserveTeam1) {
        totalPossible++;
        if (formation.reserve.uid === finalFormation.reserveTeam1.uid ||
            formation.reserve.uid === finalFormation.reserveTeam2?.uid) {
          totalMatches++;
        }
      }
      if (formation.reserveTeam1) {
        totalPossible++;
        if (finalFormation.reserveTeam1 && 
            formation.reserveTeam1.uid === finalFormation.reserveTeam1.uid) {
          totalMatches++;
        }
      }
      if (formation.reserveTeam2) {
        totalPossible++;
        if (finalFormation.reserveTeam2 && 
            formation.reserveTeam2.uid === finalFormation.reserveTeam2.uid) {
          totalMatches++;
        }
      }
    });
    
    return totalPossible > 0 ? (totalMatches / totalPossible) * 100 : 0;
  };

  // Effetto per inizializzare le formazioni quando si entra nella view
  React.useEffect(() => {
    if (currentView === VIEW_STATES.FORMATION_PROPOSAL && selectedMatch) {
      initializeFormationProposal();
    }
    if ((currentView === VIEW_STATES.FORMATION_RESULT || currentView === VIEW_STATES.FORMATION_PROPOSAL) && selectedMatch) {
      loadFormationProposals(selectedMatch.id).then(proposals => {
        if (proposals.length >= 3) {
          setCalculatedFormations(calculateOptimalFormations(proposals));
        }
      });
    }
  }, [currentView, selectedMatch]);

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
      
      // Calculate stats from actual sessions (excluding ignored ones)
      sessionsSnap.docs.forEach(sessionDoc => {
        const session = sessionDoc.data();
        
        // Skip ignored sessions
        if (session.ignoredFromStats) {
          return;
        }
        
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
      console.log('Rimuovendo partita con ID:', match.id);
      await deleteDoc(doc(db, 'activeMatches', match.id));
      console.log('Partita rimossa con successo dal database');
      
      // Forza refresh delle liste per sicurezza
      await loadMatchHistory();
      
      // Aggiorna le statistiche dell'utente corrente se era partecipante nella partita chiusa
      if (currentUser && (participants.some(p => p.uid === currentUser.uid) || reserves.some(r => r.uid === currentUser.uid))) {
        await loadUserStats(currentUser.uid);
      }
      
      // Se stavi visualizzando questa partita, torna alla home
      if (selectedMatch && selectedMatch.id === match.id) {
        setSelectedMatch(null);
        setCurrentView(VIEW_STATES.HOME);
      }
      
      alert(participants.length > 0 ? 'Partita chiusa e salvata nello storico!' : 'Partita chiusa!');
      
    } catch (error) {
      console.error('Errore nella chiusura della partita:', error);
      alert('Errore nella chiusura della partita');
    }
  };

  const loadUserStats = async (uid) => {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const user = userSnap.exists() ? userSnap.data() : {};

    // Load sessions where user participated (excluding ignored sessions)
    const q = query(
      collection(db, 'sessions'),
      where('participantUids', 'array-contains', uid),
      orderBy('date', 'desc')
    );
    const sessionsSnap = await getDocs(q);
    const allSessions = sessionsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter(session => !session.ignoredFromStats); // Filtra sessioni ignorate
    
    // Filtra solo le sessioni già giocate (nel passato)
    const now = new Date();
    const playedSessions = allSessions.filter(session => {
      const sessionDate = session.date?.toDate ? session.date.toDate() : new Date(session.date);
      return sessionDate < now; // Solo sessioni nel passato
    });

    // Load sets where user participated (from non-ignored sessions only)
    const setsQuery = query(
      collection(db, 'matchSets'),
      where('participantUids', 'array-contains', uid),
      orderBy('createdAt', 'desc')
    );
    const setsSnap = await getDocs(setsQuery);
    const userSets = setsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    // Filter out sets from ignored sessions
    const validSets = [];
    for (const set of userSets) {
      // Verifica se il set appartiene a una sessione ignorata
      if (set.matchId) {
        const sessionSnap = await getDoc(doc(db, 'sessions', set.matchId));
        if (sessionSnap.exists() && !sessionSnap.data().ignoredFromStats) {
          validSets.push(set);
        }
      } else {
        // Se non ha matchId, probabilmente è un set di una partita attiva, quindi valido
        validSets.push(set);
      }
    }

    // Calculate set statistics (using only valid sets from non-ignored sessions)
    let setsWon = 0;
    let setsLost = 0;
    let totalPointsFor = 0;
    let totalPointsAgainst = 0;

    validSets.forEach(set => {
      const userTeam = set.teamA.some(p => p.uid === uid) ? 'A' : 'B';
      const userScore = userTeam === 'A' ? set.teamAScore : set.teamBScore;
      const opponentScore = userTeam === 'A' ? set.teamBScore : set.teamAScore;
      
      totalPointsFor += userScore;
      totalPointsAgainst += opponentScore;
      
      if (userScore > opponentScore) {
        setsWon++;
      } else if (userScore < opponentScore) {
        setsLost++;
      }
    });

    setUserStats({
      totalSessions: playedSessions.length, // Usa solo sessioni già giocate
      asParticipant: user?.stats?.asParticipant || 0,
      asReserve: user?.stats?.asReserve || 0,
      friendsBrought: user?.stats?.friendsBrought || 0,
      setsPlayed: validSets.length,
      setsWon: setsWon,
      setsLost: setsLost,
      pointsFor: totalPointsFor,
      pointsAgainst: totalPointsAgainst,
      pointDifference: totalPointsFor - totalPointsAgainst,
      sessionsHistory: playedSessions, // Usa solo sessioni già giocate
    });
  };

  const loadMatchHistory = async () => {
    try {
      const q = query(
        collection(db, 'sessions'),
        orderBy('date', 'desc')
      );
      const sessionsSnap = await getDocs(q);
      const sessions = await Promise.all(sessionsSnap.docs.map(async (docSnapshot) => {
        const sessionId = docSnapshot.id;
        const sessionData = docSnapshot.data();
        
        // Carica i partecipanti dalla sottocollezione se non sono nel documento principale
        let participants = sessionData.participants || [];
        if (participants.length === 0) {
          try {
            const participantsQuery = query(collection(db, 'sessions', docSnapshot.id, 'participants'));
            const participantsSnapshot = await getDocs(participantsQuery);
            participants = participantsSnapshot.docs.map(doc => ({
              uid: doc.id,
              ...doc.data()
            }));
          } catch (error) {
            console.error('Error loading participants for session:', docSnapshot.id, error);
          }
        }
        
        // Carica il numero di set per questa partita
        let setCount = 0;
        try {
          const setsQuery = query(
            collection(db, 'matchSets'),
            where('matchId', '==', sessionId)
          );
          const setsSnapshot = await getDocs(setsQuery);
          setCount = setsSnapshot.size;
        } catch (error) {
          console.error('Error loading sets count for session:', sessionId, error);
        }
        
        return {
          id: sessionId,
          ...sessionData,
          participants,
          setCount
        };
      }));
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

  // Coppa Paste Management Functions
  const loadCoppaPasteData = async () => {
    try {
      // Carica tutti gli utenti del sito (senza orderBy multipli per evitare problemi con campi null)
      const usersQuery = query(collection(db, 'users'));
      const usersSnapshot = await getDocs(usersQuery);
      const allSiteUsers = usersSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      })).sort((a, b) => {
        // Ordina per customDisplayName se disponibile, altrimenti per displayName
        const nameA = a.customDisplayName || a.displayName || 'Utente sconosciuto';
        const nameB = b.customDisplayName || b.displayName || 'Utente sconosciuto';
        return nameA.localeCompare(nameB);
      });

      // Carica i dati esistenti della coppa paste
      const coppaPasteQuery = query(collection(db, 'coppaPaste'));
      const coppaPasteSnapshot = await getDocs(coppaPasteQuery);
      const existingCoppaPasteData = {};
      coppaPasteSnapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        // Use explicit userId when present, otherwise fallback to the document id
        const key = data.userId || docSnap.id;
        existingCoppaPasteData[key] = { id: docSnap.id, ...data };
        console.log('Dati coppa paste caricati per utente:', key, data);
        if (data.storicoAmmonizioni) {
          console.log('Storico trovato per', key, ':', data.storicoAmmonizioni);
        }
      });

      // Sincronizza: crea dati coppa paste per utenti che non li hanno ancora
      const lastMatchDate = await getLastMatchDate();
      const promises = [];
      
      allSiteUsers.forEach(user => {
        if (!existingCoppaPasteData[user.id]) {
          // Crea nuovo record coppa paste per questo utente
          const userData = {
            userId: user.id,
            name: user.customDisplayName || user.displayName || 'Utente sconosciuto',
            ammonizioni: [null, null, null],
            debitoEspiato: null,
            coppaPaste: 0,
            createdAt: serverTimestamp(),
            autoCreated: true // flag per distinguere utenti auto-creati da quelli aggiunti manualmente
          };
          promises.push(addDoc(collection(db, 'coppaPaste'), userData));
        }
      });

      // Attendi che tutti i nuovi record siano creati
      if (promises.length > 0) {
        await Promise.all(promises);
      }

      // Ricarica tutti i dati aggiornati e sincronizzali con gli utenti del sito
      const updatedCoppaPasteQuery = query(collection(db, 'coppaPaste'));
      const updatedCoppaPasteSnapshot = await getDocs(updatedCoppaPasteQuery);
      const coppaPasteUsers = [];
      
      updatedCoppaPasteSnapshot.docs.forEach(doc => {
        const coppaPasteData = { id: doc.id, ...doc.data() };
        
        // Trova l'utente corrispondente dal sito
        const siteUser = allSiteUsers.find(u => u.id === coppaPasteData.userId);
        if (siteUser) {
          // Aggiorna il nome se è cambiato
          const currentName = siteUser.customDisplayName || siteUser.displayName || 'Utente sconosciuto';
          if (coppaPasteData.name !== currentName) {
            // Aggiorna il nome nel database
            updateDoc(doc(db, 'coppaPaste', coppaPasteData.id), { name: currentName });
            coppaPasteData.name = currentName;
          }
          
          coppaPasteUsers.push({
            ...coppaPasteData,
            userExists: true,
            siteUserData: siteUser
          });
        } else {
          // Utente coppa paste senza corrispondente utente del sito (probabilmente eliminato)
          coppaPasteUsers.push({
            ...coppaPasteData,
            userExists: false
          });
        }
      });

      // Ordina per nome
      coppaPasteUsers.sort((a, b) => a.name.localeCompare(b.name));
      setCoppaPasteUsers(coppaPasteUsers);
      
    } catch (error) {
      console.error('Error loading coppa paste data:', error);
      alert('Errore nel caricamento dei dati Coppa Paste');
    }
  };

  const getLastMatchDate = async () => {
    try {
      const q = query(collection(db, 'sessions'), orderBy('date', 'desc'), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const lastSession = snapshot.docs[0].data();
        return lastSession.date?.toDate ? lastSession.date.toDate() : new Date();
      }
    } catch (error) {
      console.error('Error getting last match date:', error);
    }
    return new Date();
  };



  const addAmmonizione = async (userId, ammonitionIndex) => {
    try {
      const lastMatchDate = await getLastMatchDate();
      const userRef = doc(db, 'coppaPaste', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) return;
      
      const userData = userSnap.data();
      const newAmmonizioni = [...userData.ammonizioni];
      newAmmonizioni[ammonitionIndex] = lastMatchDate.toISOString().split('T')[0]; // formato YYYY-MM-DD
      
      // Non incrementiamo più la coppa paste qui - solo al momento dell'espiazione
      await updateDoc(userRef, {
        ammonizioni: newAmmonizioni
      });
      
      await loadCoppaPasteData();
    } catch (error) {
      console.error('Error adding ammonizione:', error);
      alert('Errore nell\'aggiunta dell\'ammonizione');
    }
  };

  const updateAmmonizione = async (userId, ammonitionIndex, newDate) => {
    try {
      const userRef = doc(db, 'coppaPaste', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) return;
      
      const userData = userSnap.data();
      const newAmmonizioni = [...userData.ammonizioni];
      newAmmonizioni[ammonitionIndex] = newDate;
      
      await updateDoc(userRef, {
        ammonizioni: newAmmonizioni
      });
      
      await loadCoppaPasteData();
    } catch (error) {
      console.error('Error updating ammonizione:', error);
      alert('Errore nell\'aggiornamento dell\'ammonizione');
    }
  };

  const setDebitoEspiato = async (userId) => {
    try {
      const lastMatchDate = await getLastMatchDate();
      const userRef = doc(db, 'coppaPaste', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) return;
      
      const userData = userSnap.data();
      const currentAmmonizioni = userData.ammonizioni || [null, null, null];
      
      // Controlla se ha 3 ammonizioni per assegnare il punto coppa
      const ammCount = currentAmmonizioni.filter(a => a !== null).length;
      let newCoppaPaste = userData.coppaPaste || 0;
      if (ammCount === 3) {
        newCoppaPaste += 1;
      }
      
      // Salva lo storico delle ammonizioni prima di resettarle
      const storico = userData.storicoAmmonizioni || [];
      const nuovoCiclo = {
        amm1: currentAmmonizioni[0],
        amm2: currentAmmonizioni[1], 
        amm3: currentAmmonizioni[2],
        espiazione: lastMatchDate.toISOString().split('T')[0],
        dataCreazione: serverTimestamp()
      };
      storico.push(nuovoCiclo);
      
      await updateDoc(userRef, {
        debitoEspiato: lastMatchDate.toISOString().split('T')[0],
        ammonizioni: [null, null, null], // resetta tutte le ammonizioni
        coppaPaste: newCoppaPaste,
        storicoAmmonizioni: storico
      });
      
      await loadCoppaPasteData();
    } catch (error) {
      console.error('Error setting debito espiato:', error);
      alert('Errore nell\'impostazione del debito espiato');
    }
  };

  const removeAmmonizione = async (userId, ammonitionIndex) => {
    if (!confirm('Sei sicuro di voler rimuovere questa ammonizione?')) return;
    
    try {
      const userRef = doc(db, 'coppaPaste', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) return;
      
      const userData = userSnap.data();
      const newAmmonizioni = [...userData.ammonizioni];
      newAmmonizioni[ammonitionIndex] = null;
      
      await updateDoc(userRef, {
        ammonizioni: newAmmonizioni
      });
      
      await loadCoppaPasteData();
    } catch (error) {
      console.error('Error removing ammonizione:', error);
      alert('Errore nella rimozione dell\'ammonizione');
    }
  };

  const updateDebitoEspiato = async (userId, newDate) => {
    try {
      const userRef = doc(db, 'coppaPaste', userId);
      
      await updateDoc(userRef, {
        debitoEspiato: newDate
      });
      
      await loadCoppaPasteData();
    } catch (error) {
      console.error('Error updating debito espiato:', error);
      alert('Errore nell\'aggiornamento del debito espiato');
    }
  };

  const removeDebitoEspiato = async (userId) => {
    if (!confirm('Sei sicuro di voler rimuovere l\'espiazione del debito?')) return;
    
    try {
      const userRef = doc(db, 'coppaPaste', userId);
      
      await updateDoc(userRef, {
        debitoEspiato: null
      });
      
      await loadCoppaPasteData();
    } catch (error) {
      console.error('Error removing debito espiato:', error);
      alert('Errore nella rimozione dell\'espiazione del debito');
    }
  };

  const showUserAmmonitionHistory = async (userId, userName) => {
    console.log('Cercando storico per:', userId, userName);
    try {
      const userRef = doc(db, 'coppaPaste', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('Dati utente trovati:', userData);
        console.log('Storico ammonizioni:', userData.storicoAmmonizioni);
        setSelectedUserHistory({
          userId: userId,
          userName: userName,
          storico: userData.storicoAmmonizioni || []
        });
        setShowUserHistory(true);
      } else {
        console.log('Nessun dato trovato per questo utente');
        setSelectedUserHistory({
          userId: userId,
          userName: userName,
          storico: []
        });
        setShowUserHistory(true);
      }
    } catch (error) {
      console.error('Errore nel recupero dello storico:', error);
    }
  };

  // Funzione per creare dati di storico di test (solo per debug)
  const createTestStorico = async (userId) => {
    try {
      const userRef = doc(db, 'coppaPaste', userId);
      
      // Prima verifica se il documento esiste
      const userDoc = await getDoc(userRef);
      
      const now = new Date();
      const testStorico = [
        {
          ciclo: 1,
          amm1: Timestamp.fromDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)), // 30 giorni fa
          amm2: Timestamp.fromDate(new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)), // 20 giorni fa
          amm3: Timestamp.fromDate(new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)), // 10 giorni fa
          espiazione: Timestamp.fromDate(new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)), // 5 giorni fa
          dataCreazione: Timestamp.fromDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
        },
        {
          ciclo: 2,
          amm1: Timestamp.fromDate(new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)), // 4 giorni fa
          amm2: Timestamp.fromDate(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)), // 2 giorni fa
          amm3: null,
          espiazione: null,
          dataCreazione: Timestamp.fromDate(new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000))
        }
      ];
      
      if (userDoc.exists()) {
        // Se il documento esiste, aggiorna solo il campo storico
        await updateDoc(userRef, {
          storicoAmmonizioni: testStorico
        });
        console.log('Storico di test aggiunto a documento esistente per utente:', userId);
      } else {
        // Se il documento non esiste, crealo con dati base
        const userData = allUsers.find(u => u.id === userId) || {};
        await setDoc(userRef, {
          userId: userId,
          name: userData.customDisplayName || userData.displayName || 'Utente Test',
          ammonizioni: [null, null, null],
          coppaPaste: 0,
          debitoEspiato: null,
          storicoAmmonizioni: testStorico,
          dataCreazione: serverTimestamp()
        });
        console.log('Nuovo documento creato con storico di test per utente:', userId);
      }
      
      // Ricarica i dati
      await showUserAmmonitionHistory(userId, selectedUserHistory.userName);
    } catch (error) {
      console.error('Errore nella creazione dello storico di test:', error);
    }
  };

  const updateCoppaPaste = async (userId, newValue) => {
    try {
      const userRef = doc(db, 'coppaPaste', userId);
      await updateDoc(userRef, {
        coppaPaste: parseFloat(newValue) || 0
      });
      await loadCoppaPasteData();
    } catch (error) {
      console.error('Error updating coppa paste:', error);
      alert('Errore nell\'aggiornamento della coppa paste');
    }
  };

  const deleteCoppaPasteUser = async (userId, userName) => {
    if (!confirm(`Sei sicuro di voler eliminare ${userName} dalla Coppa Paste?`)) return;
    
    try {
      await deleteDoc(doc(db, 'coppaPaste', userId));
      await loadCoppaPasteData();
      alert('Utente eliminato dalla Coppa Paste');
    } catch (error) {
      console.error('Error deleting coppa paste user:', error);
      alert('Errore nell\'eliminazione dell\'utente');
    }
  };

  const addUserToCoppaPaste = async () => {
    if (!coppaPasteNewUser.trim()) return;
    
    const userName = coppaPasteNewUser.trim();
    
    try {
      // Generate a unique ID for manual users
      const manualUserId = `manual_${Date.now()}_${userName.replace(/\s+/g, '_').toLowerCase()}`;
      
      // Check if user already exists
      const existingUser = coppaPasteUsers.find(user => 
        user.name.toLowerCase() === userName.toLowerCase()
      );
      
      if (existingUser) {
        alert('Un utente con questo nome è già presente nella Coppa Paste');
        return;
      }
      
      const userRef = doc(db, 'coppaPaste', manualUserId);
      await setDoc(userRef, {
        userId: manualUserId,
        name: userName,
        ammonizioni: [null, null, null],
        coppaPaste: 0,
        debitoEspiato: null,
        userExists: false, // This is a manual entry
        createdAt: serverTimestamp()
      });
      
      setCoppaPasteNewUser('');
      await loadCoppaPasteData();
      alert(`Utente ${userName} aggiunto alla Coppa Paste`);
    } catch (error) {
      console.error('Error adding user to coppa paste:', error);
      alert('Errore nell\'aggiunta dell\'utente');
    }
  };

  const generateCoppaPasteReport = () => {
    const currentDate = new Date().toLocaleDateString('it-IT');

    // Ordinamento complesso: punti coppa paste (desc) → numero ammonizioni (desc) → data espiazione più vecchia (asc)
    const sortedUsers = [...coppaPasteUsers].sort((a, b) => {
      const coppaPasteA = a.coppaPaste || 0;
      const coppaPasteB = b.coppaPaste || 0;
      
      // 1. Prima priorità: punti coppa paste (decrescente - chi ha più punti in cima)
      if (coppaPasteB !== coppaPasteA) {
        return coppaPasteB - coppaPasteA;
      }
      
      // 2. Seconda priorità: numero di ammonizioni (decrescente - chi ha più ammonizioni in cima)
      const ammA = (a.ammonizioni || []).filter(amm => amm !== null).length;
      const ammB = (b.ammonizioni || []).filter(amm => amm !== null).length;
      if (ammB !== ammA) {
        return ammB - ammA;
      }
      
      // 3. Terza priorità: data espiazione più vecchia (crescente - chi ha espiato prima in cima)
      const espiatoA = a.debitoEspiato;
      const espiatoB = b.debitoEspiato;
      
      // Se entrambi hanno espiato, ordina per data (più vecchia prima)
      if (espiatoA && espiatoB) {
        return new Date(espiatoA) - new Date(espiatoB);
      }
      
      // Se solo uno ha espiato, quello va prima
      if (espiatoA && !espiatoB) return -1;
      if (!espiatoA && espiatoB) return 1;
      
      // 4. Ultima priorità: nome alfabetico
      return a.name.localeCompare(b.name);
    });

    const reportLines = [
      `🧁 COPPA PASTE - ${currentDate}`,
      ``,
      ``
    ];

    sortedUsers.forEach((user, index) => {
      const ammonizioni = user.ammonizioni || [null, null, null];
      const coppaPaste = user.coppaPaste || 0;
      const espiato = user.debitoEspiato;
      
      // Formato data semplice
      const fmtDate = (d) => {
        if (!d) return null;
        try {
          return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch (e) {
          return String(d);
        }
      };

      // Nome utente
      reportLines.push(`${index + 1}. ${user.name || 'Utente'}`);
      
      // Punti coppa
      if (coppaPaste > 0) {
        reportLines.push(`   💰 Coppa Paste: ${coppaPaste} punti`);
      }
      
      // Ammonizioni (solo quelle presenti)
      const ammPresenti = ammonizioni.filter(a => a !== null);
      if (ammPresenti.length > 0) {
        const ammDates = ammPresenti.map(a => fmtDate(a)).join(', ');
        reportLines.push(`   ⚠️ Ammonizioni (${ammPresenti.length}): ${ammDates}`);
      }
      
      // Debito espiato
      if (espiato) {
        reportLines.push(`   ✅ Debito espiato: ${fmtDate(espiato)}`);
      }
      
      // Se non ha niente, mostra OK
      if (coppaPaste === 0 && ammPresenti.length === 0 && !espiato) {
        reportLines.push(`   🟢 Situazione regolare`);
      }
      
      reportLines.push(``); // Riga vuota tra utenti
    });

    reportLines.push(`Generato: ${new Date().toLocaleString('it-IT')}`);

    return reportLines.join('\n');
  };

  const shareOnWhatsApp = () => {
    const reportText = generateCoppaPasteReport();
    const encodedText = encodeURIComponent(reportText);
    const whatsappUrl = `https://wa.me/?text=${encodedText}`;
    
    // Tenta di aprire WhatsApp
    if (navigator.share && /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      // Su dispositivi mobile, usa l'API di condivisione nativa se disponibile
      navigator.share({
        title: 'Report Coppa Paste',
        text: reportText
      }).catch((error) => {
        // Fallback a WhatsApp Web
        window.open(whatsappUrl, '_blank');
      });
    } else {
      // Su desktop, apri WhatsApp Web
      window.open(whatsappUrl, '_blank');
    }
  };

  // Function to mark session as ignored in statistics
  const handleIgnoreSession = async (sessionId) => {
    if (!isAdmin) return;
    
    try {
      // Get current session data
      const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
      if (!sessionSnap.exists()) {
        alert('Sessione non trovata');
        return;
      }
      
      const sessionData = sessionSnap.data();
      const isCurrentlyIgnored = sessionData.ignoredFromStats;
      const actionText = isCurrentlyIgnored ? 'riattivare' : 'ignorare';
      
      const confirmed = confirm(`Sei sicuro di voler ${actionText} questa sessione dalle statistiche?`);
      if (!confirmed) return;

      // Update session ignore status
      await setDoc(
        doc(db, 'sessions', sessionId),
        { ignoredFromStats: !isCurrentlyIgnored },
        { merge: true }
      );
      
      // Adjust user statistics based on action
      const multiplier = isCurrentlyIgnored ? 1 : -1; // +1 to add back, -1 to remove
      
      // Update participant statistics
      const participantUpdates = (sessionData.participants || []).map((p) =>
        updateDoc(doc(db, 'users', p.uid), {
          'stats.totalSessions': increment(multiplier),
          'stats.asParticipant': increment(multiplier),
          'stats.friendsBrought': increment(multiplier * (p.friends?.length || 0)),
        })
      );
      
      // Update reserve statistics
      const reserveUpdates = (sessionData.reserves || []).map((r) =>
        updateDoc(doc(db, 'users', r.uid), {
          'stats.asReserve': increment(multiplier),
          'stats.friendsBrought': increment(multiplier * (r.friends?.length || 0)),
        })
      );
      
      await Promise.allSettled([...participantUpdates, ...reserveUpdates]);
      
      alert(`Sessione ${isCurrentlyIgnored ? 'riattivata nelle' : 'ignorata dalle'} statistiche`);
      loadMatchHistory();
    } catch (error) {
      console.error('Errore nella gestione della sessione:', error);
      alert('Errore nella gestione della sessione');
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
    const result = selectedMatch.participants?.some((p) => p.uid === currentUser?.uid);
    console.log('🔍 isUserParticipant check:', result, 'currentUser.uid:', currentUser?.uid, 'participants:', selectedMatch.participants?.map(p => p.uid));
    return result;
  };

  const isUserReserve = () => {
    if (!selectedMatch) return false;
    const result = selectedMatch.reserves?.some((r) => r.uid === currentUser?.uid);
    console.log('🔍 isUserReserve check:', result, 'currentUser.uid:', currentUser?.uid, 'reserves:', selectedMatch.reserves?.map(r => r.uid));
    return result;
  };

  // Controlla se l'utente ha amici nella partita
  const getUserFriendsInMatch = () => {
    if (!selectedMatch || !currentUser) return [];
    return selectedMatch.reserves?.filter(r => r.isFriend && r.friendOf === currentUser.uid) || [];
  };

  const hasUserFriendsInMatch = () => {
    return getUserFriendsInMatch().length > 0;
  };

  // Non permettere iscrizione se non esiste una partita selezionata
  // Distingue tra partite attive (si può iscrivere) e storiche (solo visualizzazione)
  const canSignup = !!selectedMatch && activeMatches.some(match => match.id === selectedMatch.id);
  const isHistoricalMatch = !!selectedMatch && !activeMatches.some(match => match.id === selectedMatch.id);

  const getTotalCount = () => {
    if (!selectedMatch) return 0;
    let total = selectedMatch.participants?.length || 0;
    // Non più necessario contare friends separatamente - ora sono entry separate nelle riserve
    return total;
  };

  // Conta solo utenti registrati (senza amici)
  const getRegisteredUsersCount = () => {
    if (!selectedMatch) return 0;
    return selectedMatch.participants?.filter(p => !p.isFriend).length || 0;
  };

  // Conta solo amici dei partecipanti (ora non dovrebbero essercene nei partecipanti)
  const getFriendsCount = () => {
    if (!selectedMatch) return 0;
    return selectedMatch.participants?.filter(p => p.isFriend).length || 0;
  };

  // Conta solo utenti registrati nelle riserve (senza amici)
  const getRegisteredReservesCount = () => {
    if (!selectedMatch) return 0;
    return selectedMatch.reserves?.filter(r => !r.isFriend).length || 0;
  };

  // Conta solo amici delle riserve
  const getReservesFriendsCount = () => {
    if (!selectedMatch) return 0;
    return selectedMatch.reserves?.filter(r => r.isFriend).length || 0;
  };

  const getReservesTotalCount = () => {
    if (!selectedMatch) return 0;
    // Ora tutte le riserve sono entry separate (utenti + amici)
    return selectedMatch.reserves?.length || 0;
  };

  const handleSignup = async (asReserve = false, onlyFriends = false) => {
    if (!isLoggedIn || !currentUser || !selectedMatch) return;

    try {
      const matchRef = doc(db, 'activeMatches', selectedMatch.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        const data = snap.data() || { participants: [], reserves: [] };
        const alreadyParticipant = data.participants?.some((p) => p.uid === currentUser.uid);
        const alreadyReserve = data.reserves?.some((r) => r.uid === currentUser.uid);
        
        // Se ci sono amici da aggiungere, gestiscili sempre
        if (friends.length > 0) {
          const updated = { ...data };
          const friendEntries = friends.map(friendName => ({
            uid: `friend_${Date.now()}_${Math.random()}`, // UID temporaneo unico
            name: friendName,
            photoURL: null,
            isFriend: true,
            friendOf: currentUser.uid,
            friendOfName: customDisplayName || currentUser.displayName,
            timestamp: new Date().toLocaleString('it-IT'),
          }));
          
          updated.reserves = [...(updated.reserves || []), ...friendEntries];
          
          // Se l'utente vuole aggiungere SOLO amici (senza iscriversi)
          if (onlyFriends) {
            transaction.update(matchRef, {
              reserves: updated.reserves,
              lastUpdated: serverTimestamp(),
            });
            
            setFriends([]);
            await loadUserStats(currentUser.uid);
            showToastMessage(`${friends.length} amici aggiunti alle riserve con successo!`);
            return;
          }
          
          // Se l'utente è già iscritto ma vuole aggiungere amici
          if (alreadyParticipant || alreadyReserve) {
            transaction.update(matchRef, {
              reserves: updated.reserves,
              lastUpdated: serverTimestamp(),
            });
            
            setFriends([]);
            await loadUserStats(currentUser.uid);
            showToastMessage(`${friends.length} amici aggiunti alle riserve con successo!`);
            return;
          }
          
          // Se l'utente non è iscritto, continua con l'iscrizione + amici
          data.reserves = updated.reserves;
        }
        
        // Se onlyFriends è true ma non ci sono amici, errore
        if (onlyFriends && friends.length === 0) {
          throw new Error('Nessun amico da aggiungere!');
        }
        
        // Controlli per l'iscrizione dell'utente (solo se non è modalità onlyFriends)
        if (!onlyFriends) {
          if (alreadyReserve && friends.length === 0) {
            throw new Error('Sei già iscritto come riserva!');
          }
          
          if (alreadyParticipant && friends.length === 0) {
            throw new Error('Sei già iscritto come partecipante!');
          }
        }

        const newEntry = {
          uid: currentUser.uid,
          name: customDisplayName || currentUser.displayName,
          photoURL: currentUser.photoURL,
          timestamp: new Date().toLocaleString('it-IT'),
        };

        const updated = { ...data };
        updated.participants = Array.isArray(updated.participants) ? updated.participants : [];
        updated.reserves = Array.isArray(updated.reserves) ? updated.reserves : [];

        if (asReserve) {
          updated.reserves = [...updated.reserves, newEntry];
        } else {
          // Calcola il totale attuale di SOLO utenti registrati (non amici)
          let currentRegisteredUsers = updated.participants.length;
          
          // Il limite di 14 si applica solo agli utenti registrati
          if (currentRegisteredUsers >= MAX_PARTICIPANTS) {
            // Se la lista degli utenti registrati è piena, va in riserva automaticamente
            updated.reserves = [...updated.reserves, newEntry];
            asReserve = true; // Flag per notifica
          } else {
            // C'è spazio per l'utente registrato, lo aggiungiamo ai partecipanti
            updated.participants = [...updated.participants, newEntry];
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

      // I dati della partita si aggiorneranno automaticamente tramite onSnapshot,
      // non è necessario ricaricarli manualmente qui

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
          // Se rimuovo un partecipante e ci sono riserve NON-amici, promuovo la prima riserva
          const nonFriendReserves = newReserves.filter(r => !r.isFriend);
          if (nonFriendReserves.length > 0) {
            const firstReserve = nonFriendReserves[0];
            newReserves = newReserves.filter(r => r.uid !== firstReserve.uid);
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
      // Aggiorna le statistiche dell'utente che si è disiscritto
      if (currentUser) await loadUserStats(currentUser.uid);
    } catch (e) {
      alert(e.message || 'Errore durante la disiscrizione');
    }
  };

  // Rimuovi un singolo amico dalla partita
  const handleRemoveSingleFriend = async (friendUid, friendName) => {
    if (!isLoggedIn || !currentUser || !selectedMatch) return;

    const confirmed = confirm(`Vuoi rimuovere ${friendName} da questa partita?`);
    if (!confirmed) return;

    try {
      const matchRef = doc(db, 'activeMatches', selectedMatch.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        const data = snap.data() || { participants: [], reserves: [] };
        
        // Rimuovi solo l'amico specifico
        const newReserves = data.reserves?.filter(r => r.uid !== friendUid) || [];

        transaction.update(matchRef, {
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
        });
      });
      
      showToastMessage(`${friendName} rimosso con successo!`);
      await loadUserStats(currentUser.uid);
    } catch (e) {
      console.error('Errore durante la rimozione dell\'amico:', e);
      showToastMessage('Errore durante la rimozione dell\'amico');
    }
  };

  // Rimuovi tutti i tuoi amici dalla partita
  const handleRemoveMyFriends = async () => {
    if (!isLoggedIn || !currentUser || !selectedMatch) return;
    
    const myFriends = selectedMatch.reserves?.filter(r => r.isFriend && r.friendOf === currentUser.uid) || [];
    if (myFriends.length === 0) {
      showToastMessage('Non hai amici da rimuovere in questa partita.');
      return;
    }

    const confirmed = confirm(`Vuoi rimuovere tutti i tuoi ${myFriends.length} amici da questa partita?`);
    if (!confirmed) return;

    try {
      const matchRef = doc(db, 'activeMatches', selectedMatch.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        const data = snap.data() || { participants: [], reserves: [] };
        
        // Rimuovi solo gli amici associati a questo utente
        const newReserves = data.reserves?.filter(r => !(r.isFriend && r.friendOf === currentUser.uid)) || [];

        transaction.update(matchRef, {
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
        });
      });
      
      showToastMessage(`${myFriends.length} amici rimossi con successo!`);
      await loadUserStats(currentUser.uid);
    } catch (e) {
      console.error('Errore durante la rimozione degli amici:', e);
      showToastMessage('Errore durante la rimozione degli amici');
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
      
      // Aggiorna le statistiche se l'utente corrente è stato rimosso
      if (currentUser && currentUser.uid === userUid) {
        await loadUserStats(currentUser.uid);
      }
    } catch (e) {
      alert(e.message || 'Errore durante la rimozione');
    }
  };

  const handleAdminRemoveFriend = async (userUid, friendIndex, isReserve = false) => {
    console.log('handleAdminRemoveFriend chiamata con:', { userUid, friendIndex, isReserve, isAdmin, selectedMatch: selectedMatch?.id });
    
    if (!isAdmin || !selectedMatch) {
      console.log('Operazione bloccata:', { isAdmin, hasSelectedMatch: !!selectedMatch });
      return;
    }
    
    try {
      console.log('Inizio rimozione amico...');
      const matchRef = doc(db, 'activeMatches', selectedMatch.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(matchRef);
        const data = snap.data() || { participants: [], reserves: [] };
        
        console.log('Dati match caricati:', data);
        
        let newParticipants = [...(data.participants || [])];
        let newReserves = [...(data.reserves || [])];
        
        if (isReserve) {
          const userIndex = newReserves.findIndex((r) => r.uid === userUid);
          console.log('Indice utente nelle riserve:', userIndex);
          if (userIndex !== -1 && newReserves[userIndex].friends) {
            console.log('Amici prima della rimozione:', newReserves[userIndex].friends);
            newReserves[userIndex] = {
              ...newReserves[userIndex],
              friends: newReserves[userIndex].friends.filter((_, idx) => idx !== friendIndex)
            };
            console.log('Amici dopo la rimozione:', newReserves[userIndex].friends);
          }
        } else {
          const userIndex = newParticipants.findIndex((p) => p.uid === userUid);
          console.log('Indice utente nei partecipanti:', userIndex);
          if (userIndex !== -1 && newParticipants[userIndex].friends) {
            console.log('Amici prima della rimozione:', newParticipants[userIndex].friends);
            newParticipants[userIndex] = {
              ...newParticipants[userIndex],
              friends: newParticipants[userIndex].friends.filter((_, idx) => idx !== friendIndex)
            };
            console.log('Amici dopo la rimozione:', newParticipants[userIndex].friends);
          }
        }
        
        transaction.update(matchRef, {
          participants: newParticipants,
          reserves: newReserves,
          lastUpdated: serverTimestamp(),
        });
      });
      
      console.log('Rimozione amico completata con successo');
      
      // Aggiorna le statistiche se è stato rimosso un amico dell'utente corrente
      if (currentUser && currentUser.uid === userUid) {
        await loadUserStats(currentUser.uid);
      }
    } catch (e) {
      console.error('Errore durante la rimozione dell\'amico:', e);
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
        
        // Calcola se c'è spazio nei partecipanti (conta solo utenti registrati)
        let currentRegisteredUsers = data.participants?.length || 0;
        
        if (currentRegisteredUsers >= MAX_PARTICIPANTS) {
          throw new Error(`Lista partecipanti piena (${MAX_PARTICIPANTS} utenti registrati). Non è possibile promuovere la riserva.`);
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
      
      // Aggiorna le statistiche dell'utente promosso
      if (currentUser && currentUser.uid === reserveUid) {
        await loadUserStats(currentUser.uid);
      }
      
      alert('Riserva promossa a partecipante con successo!');
    } catch (error) {
      console.error('Errore nella promozione:', error);
      alert(error.message || 'Errore nella promozione della riserva');
    }
  };

  // Render header (consistent across all views)
  const renderHeader = () => (
    <div className={`rounded-xl shadow-xl p-3 md:p-4 mb-4 border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0">
            <div className="text-2xl md:text-3xl">🏐</div>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={`text-lg md:text-2xl font-bold truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {currentView === VIEW_STATES.MATCH_HISTORY ? 'Storico Partite' : 
               currentView === VIEW_STATES.USERS_LIST ? 'Lista Utenti' : 
               currentView === VIEW_STATES.COPPA_PASTE ? 'Coppa Paste' :
               currentView === VIEW_STATES.FORMATION_PROPOSAL ? 'Proponi Formazione' :
               currentView === VIEW_STATES.FORMATION_RESULT ? 'Formazioni Proposte' :
               currentView === VIEW_STATES.ADD_SET ? 'Aggiungi Set' :
               currentView === VIEW_STATES.SET_DETAIL ? 'Lista Set' :
               'Pallavolo - 7 fighters'}
            </h1>
            {/* Subtitle visible only for logged users */}
            {isLoggedIn && (currentView === VIEW_STATES.MATCH_DETAIL && selectedMatch ? (
              <div className="mt-1 md:mt-2 flex items-center gap-3 flex-wrap">
                <div className="text-sm md:text-lg text-indigo-300 font-semibold">
                  Partita del {new Date(selectedMatch.date).toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short' })}
                </div>
                {/* Tag stato partita */}
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  selectedMatch && activeMatches.some(match => match.id === selectedMatch.id)
                    ? 'bg-green-600 text-green-100' 
                    : 'bg-gray-600 text-gray-100'
                }`}>
                  {selectedMatch && activeMatches.some(match => match.id === selectedMatch.id) ? 'Aperta' : 'Giocata'}
                </span>
                {/* Riepilogo partecipanti separato */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-green-700 text-green-100 px-2 py-1 rounded">
                    {getRegisteredUsersCount()} partecipanti
                  </span>
                  {getFriendsCount() > 0 && (
                    <span className="bg-blue-700 text-blue-100 px-2 py-1 rounded">
                      {getFriendsCount()} amici
                    </span>
                  )}
                  {getRegisteredReservesCount() > 0 && (
                    <span className="bg-amber-700 text-amber-100 px-2 py-1 rounded">
                      {getRegisteredReservesCount()} riserve
                    </span>
                  )}
                  {getReservesFriendsCount() > 0 && (
                    <span className="bg-purple-700 text-purple-100 px-2 py-1 rounded">
                      {getReservesFriendsCount()} amici riserve
                    </span>
                  )}
                </div>
              </div>
            ) : currentView === VIEW_STATES.MATCH_HISTORY ? (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Partite già giocate</div>
            ) : currentView === VIEW_STATES.USERS_LIST ? (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Gestisci ruoli e utenti</div>
            ) : currentView === VIEW_STATES.FORMATION_PROPOSAL ? (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Crea la tua formazione ideale</div>
            ) : currentView === VIEW_STATES.FORMATION_RESULT ? (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Visualizza le formazioni calcolate</div>
            ) : currentView === VIEW_STATES.ADD_SET ? (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Registra un nuovo set giocato</div>
            ) : currentView === VIEW_STATES.SET_DETAIL ? (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Set registrati per questa partita</div>
            ) : currentView === VIEW_STATES.MATCH_LIST && sessionDate ? (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Seleziona una partita per iscriverti</div>
            ) : (
              <div className="mt-1 md:mt-2 text-sm md:text-lg text-indigo-300 font-semibold">Nessuna partita attiva</div>
            ))}
          </div>
        </div>
        
        {/* User icon and name always visible when logged */}
        {isLoggedIn && (
          <div className="relative flex items-center gap-2 user-dropdown flex-shrink-0">
            <span className={`hidden md:block font-medium truncate max-w-32 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {customDisplayName || currentUser?.displayName}
            </span>
            <button
              onClick={() => setShowStats(!showStats)}
              className={`p-1 rounded-full border transition-all duration-200 flex-shrink-0 transform hover:scale-105 ${
                isDarkMode 
                ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-indigo-400' 
                : 'bg-gray-100 border-gray-300 hover:bg-gray-200 hover:border-indigo-400'
              }`}
              title="Area personale"
            >
              <img
                src={currentUser.photoURL || ''}
                alt={currentUser.displayName || ''}
                className={`w-7 h-7 md:w-8 md:h-8 rounded-full border-2 object-cover transition-all duration-200 ${
                  isAdmin ? 'border-blue-500 shadow-lg shadow-blue-500/30' : 'border-indigo-500'
                }`}
              />
            </button>
            {showStats && userStats && (
              <div className={`absolute right-0 top-full mt-2 w-80 md:w-96 rounded-lg shadow-xl border z-10 p-4 md:p-6 max-w-[90vw] animate-in slide-in-from-top-2 duration-200 ${
                isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}>
                <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>

                </h3>
                
                {/* Nome utente personalizzabile */}
                <div className={`mb-4 p-3 rounded-lg border ${
                  isDarkMode ? 'bg-gray-700/30 border-gray-600/50' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Nome visualizzato</div>
                  {isEditingName ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={tempDisplayName}
                        onChange={(e) => setTempDisplayName(e.target.value)}
                        className={`w-full px-2 py-1 rounded border text-sm ${
                          isDarkMode 
                          ? 'bg-gray-600 text-gray-100 border-gray-500' 
                          : 'bg-white text-gray-900 border-gray-300'
                        }`}
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
                <div className="grid grid-cols-1 gap-2 md:gap-3">
                  <div className="bg-gray-700/50 rounded-lg p-2 md:p-3 border border-gray-600/50">
                    <div className="text-lg md:text-xl font-bold text-indigo-400">{userStats.totalSessions || 0}</div>
                    <div className="text-xs text-gray-400">Partite giocate</div>
                  </div>
                </div>
                
                {/* Statistiche Set */}
                <div className="grid grid-cols-2 gap-2 md:gap-3 mt-3">
                  <div className="bg-gray-700/50 rounded-lg p-2 md:p-3 border border-gray-600/50">
                    <div className="text-lg md:text-xl font-bold text-green-400">{userStats.setsPlayed || 0}</div>
                    <div className="text-xs text-gray-400">Set giocati</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-2 md:p-3 border border-gray-600/50">
                    <div className="text-lg md:text-xl font-bold text-green-400">{userStats.setsWon || 0}</div>
                    <div className="text-xs text-gray-400">Set vinti</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:gap-3 mt-2">
                  <div className="bg-gray-700/50 rounded-lg p-2 md:p-3 border border-gray-600/50">
                    <div className="text-lg md:text-xl font-bold text-yellow-400">
                      {userStats.setsPlayed > 0 ? Math.round((userStats.setsWon / userStats.setsPlayed) * 100) : 0}%
                    </div>
                    <div className="text-xs text-gray-400">% Vittorie</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-2 md:p-3 border border-gray-600/50">
                    <div className={`text-lg md:text-xl font-bold ${(userStats.pointDifference || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(userStats.pointDifference || 0) >= 0 ? '+' : ''}{userStats.pointDifference || 0}
                    </div>
                    <div className="text-xs text-gray-400">Diff. punti</div>
                  </div>
                </div>
                
                {/* Theme toggle button */}
                <div className="mt-4 p-3 bg-gray-700/30 rounded-lg border border-gray-600/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isDarkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-yellow-500" />}
                      <span className="text-sm text-gray-100">Tema {isDarkMode ? 'Scuro' : 'Chiaro'}</span>
                    </div>
                    <button
                      onClick={toggleTheme}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isDarkMode ? 'bg-indigo-600' : 'bg-gray-400'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isDarkMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
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
      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 md:p-8 border border-gray-700 w-full max-w-lg text-center">
        <div className="mb-6">
          <div className="text-6xl mb-4">🏐</div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-100 mb-2">Nessuna partita attiva</h2>
          <p className="text-gray-400">Al momento non ci sono partite programmate</p>
        </div>
        
        {/* Se l'utente è admin, mostra il pulsante per creare partita */}
        {isLoggedIn && isAdmin && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Crea una nuova partita</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Data e ora della partita
              </label>
              <input
                type="datetime-local"
                value={nextSessionDate}
                onChange={(e) => setNextSessionDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleNewSession}
              disabled={isCreatingMatch}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isCreatingMatch ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Crea Partita
                </>
              )}
            </button>
          </div>
        )}
        
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
        
        {/* Se l'utente è loggato ma non è admin, mostra messaggio informativo */}
        {isLoggedIn && !isAdmin && (
          <div className="text-gray-400 text-sm">
            <p>Le partite vengono create dagli amministratori.</p>
            <p>Sarai notificato quando sarà disponibile una nuova partita!</p>
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
                    onClick={async () => {
                      setSelectedMatch(match);
                      setCurrentView(VIEW_STATES.MATCH_DETAIL);
                      // Carica i set per questa partita
                      await loadMatchSets(match.id);
                    }}
                    className="flex-1 cursor-pointer"
                  >
                    <h3 className="text-base md:text-lg font-semibold text-gray-100 group-hover:text-indigo-300">
                      {new Date(match.date).toLocaleString('it-IT', { 
                        dateStyle: 'short', 
                        timeStyle: 'short' 
                      })}
                    </h3>
                    <p className="text-sm md:text-base text-gray-400 mt-1">
                      Partita di Pallavolo
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
        {/* Header rimosso per partite storiche */}
        
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
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={() => handleSignup(false, true)}
                          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                        >
                          Aggiungi solo {friends.length} amici
                        </button>
                      </div>
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
              <div className="space-y-4">
                <div className="p-3 bg-amber-900/20 border border-amber-600 rounded-lg">
                  <p className="text-amber-300 text-sm font-medium">
                    ⏳ Sei iscritto come riserva
                  </p>
                  <p className="text-amber-200 text-xs mt-1">
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

            {/* Pulsanti gestione set rimossi da qui - ora sono nelle partite storiche */}
            
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
        
        {/* Gestione amici già presenti nella partita */}
        {canSignup && hasUserFriendsInMatch() && (
          <div className="p-4 bg-blue-900/20 border border-blue-600 rounded-lg">
            <p className="text-blue-300 text-sm font-medium mb-3">
              👥 I tuoi amici in questa partita ({getUserFriendsInMatch().length})
            </p>
            <div className="space-y-2">
              {getUserFriendsInMatch().map((friend) => (
                <div key={friend.uid} className="flex items-center justify-between bg-blue-800/30 p-3 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-blue-100 font-medium">{friend.name}</span>
                    <span className="text-blue-300 text-xs">
                      (aggiunto {friend.timestamp})
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveSingleFriend(friend.uid, friend.name)}
                    className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition font-medium text-sm"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
              <div className="pt-2 border-t border-blue-600/30">
                <button
                  onClick={handleRemoveMyFriends}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium text-sm"
                >
                  Rimuovi tutti i {getUserFriendsInMatch().length} amici
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Liste partecipanti/set - sempre visibili */}
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-100">Partecipanti</h2>
              <div className="flex flex-col items-end gap-1">
                <span className="bg-green-900 text-green-200 px-3 py-1 rounded-full font-semibold text-sm border border-green-700">
                  {getRegisteredUsersCount()} / {MAX_PARTICIPANTS}
                </span>
                {getFriendsCount() > 0 && (
                  <span className="bg-blue-900 text-blue-200 px-2 py-0.5 rounded-full text-xs border border-blue-700">
                    +{getFriendsCount()} amici
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-3">
              {!selectedMatch || !selectedMatch.participants || selectedMatch.participants.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nessun partecipante</p>
              ) : (
                selectedMatch.participants.map((participant, index) => (
                  <div key={participant.uid + '_' + index} className="bg-green-900 rounded-lg p-3 border border-green-700">
                    <div className="flex items-center gap-3">
                      {participant.photoURL ? (
                        <img
                          src={participant.photoURL}
                          alt={participant.name}
                          className="w-10 h-10 rounded-full border-2 border-green-500"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className={`w-10 h-10 rounded-full border-2 border-green-500 bg-green-700 flex items-center justify-center text-white font-bold ${participant.photoURL ? 'hidden' : 'flex'}`}
                      >
                        👤
                      </div>
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
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          

          
          {/* Sezione dinamica: Riserve per partite aperte, Set per partite giocate */}
          <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-100">
                {isHistoricalMatch ? 'Set' : 'Riserve'}
              </h2>
              {isHistoricalMatch ? (
                <span className="bg-purple-900 text-purple-200 px-3 py-1 rounded-full font-semibold text-sm border border-purple-700">
                  {matchSets.length}
                </span>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <span className="bg-amber-900 text-amber-200 px-3 py-1 rounded-full font-semibold text-sm border border-amber-700">
                    {getRegisteredReservesCount()}
                  </span>
                  {getReservesFriendsCount() > 0 && (
                    <span className="bg-blue-900 text-blue-200 px-2 py-0.5 rounded-full text-xs border border-blue-700">
                      +{getReservesFriendsCount()} amici
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3">
              {isHistoricalMatch ? (
                matchSets.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Nessun set</p>
                ) : (
                matchSets.map((set) => (
                  <div key={set.id} className="bg-purple-900 rounded-lg p-3 border border-purple-700">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-100">Set {set.setNumber}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpandedSetId(expandedSetId === set.id ? null : set.id)}
                              className="text-purple-400 hover:text-purple-300 text-xs px-2 py-1 rounded bg-purple-800/50 hover:bg-purple-800 transition"
                              title={expandedSetId === set.id ? "Nascondi squadre" : "Mostra squadre"}
                            >
                              {expandedSetId === set.id ? '▼' : '▶'}
                            </button>
                            {(isAdmin || isSuperAdmin) && (
                              <button
                                onClick={() => deleteSet(set.id)}
                                className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 transition"
                                title="Cancella set"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-gray-300">
                          <span className="font-semibold">Squadra A: {set.teamAScore}</span> - <span className="font-semibold">Squadra B: {set.teamBScore}</span>
                        </div>
                        
                        {/* Squadre espanse */}
                        {expandedSetId === set.id && (
                          <div className="mt-3 pt-3 border-t border-purple-700">
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <div className="font-semibold text-purple-300 mb-2">Squadra A</div>
                                <div className="space-y-1">
                                  {set.teamA && set.teamA.length > 0 ? (
                                    set.teamA.map((player, idx) => 
                                      player ? (
                                        <div key={idx} className="flex items-center gap-2">
                                          <span className="text-purple-400 w-4">{idx + 1}.</span>
                                          <span className="text-gray-300">{player.name}</span>
                                        </div>
                                      ) : null
                                    )
                                  ) : (
                                    <div className="text-gray-500 italic">Nessun giocatore</div>
                                  )}
                                  {set.reserveTeamA && (
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-purple-800">
                                      <span className="text-purple-400 w-4">R.</span>
                                      <span className="text-purple-300">{set.reserveTeamA.name}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold text-purple-300 mb-2">Squadra B</div>
                                <div className="space-y-1">
                                  {set.teamB && set.teamB.length > 0 ? (
                                    set.teamB.map((player, idx) => 
                                      player ? (
                                        <div key={idx} className="flex items-center gap-2">
                                          <span className="text-purple-400 w-4">{idx + 1}.</span>
                                          <span className="text-gray-300">{player.name}</span>
                                        </div>
                                      ) : null
                                    )
                                  ) : (
                                    <div className="text-gray-500 italic">Nessun giocatore</div>
                                  )}
                                  {set.reserveTeamB && (
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-purple-800">
                                      <span className="text-purple-400 w-4">R.</span>
                                      <span className="text-purple-300">{set.reserveTeamB.name}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
                )
              ) : (
                !selectedMatch || !selectedMatch.reserves || selectedMatch.reserves.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Nessuna riserva</p>
                ) : (
                  selectedMatch.reserves.map((reserve, index) => (
                    <div key={reserve.uid + '_' + index} className={`rounded-lg p-3 border ${
                      reserve.isFriend 
                        ? 'bg-blue-900 border-blue-700' 
                        : 'bg-amber-900 border-amber-700'
                    }`}>
                      <div className="flex items-center gap-3">
                        {reserve.photoURL ? (
                          <img
                            src={reserve.photoURL}
                            alt={reserve.name}
                            className={`w-10 h-10 rounded-full border-2 ${
                              reserve.isFriend ? 'border-blue-500' : 'border-amber-500'
                            }`}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div 
                          className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-white font-bold ${
                            reserve.photoURL ? 'hidden' : 'flex'
                          } ${
                            reserve.isFriend 
                              ? 'border-blue-500 bg-blue-700' 
                              : 'border-amber-500 bg-amber-700'
                          }`}
                        >
                          {reserve.isFriend ? '👥' : '👤'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-100">
                                {index + 1}. {reserve.name}
                              </span>
                              {reserve.isFriend && (
                                <span className="text-xs text-gray-400 ml-2">
                                  (Amico di {reserve.friendOfName})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{reserve.timestamp}</span>
                              {!reserve.isFriend && (
                                <button
                                  onClick={() => loadOtherUserStats(reserve.uid, reserve.name)}
                                  className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-900/30 hover:bg-blue-900/50 transition"
                                  title="Visualizza statistiche"
                                >
                                  📊
                                </button>
                              )}
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => handleAdminRemoveUser(reserve.uid, true)}
                                    className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 transition"
                                    title={reserve.isFriend ? "Rimuovi amico" : "Rimuovi utente"}
                                  >
                                    ✕
                                  </button>
                                  {!reserve.isFriend && (
                                    <button
                                      onClick={() => handlePromoteReserve(reserve.uid)}
                                      className="text-green-400 hover:text-green-600 text-xs px-2 py-1 rounded bg-green-900/30 hover:bg-green-900/50 transition"
                                      title="Promuovi a partecipante"
                                    >
                                      ↑
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
            
            {/* Pulsante Aggiungi Set - solo per partite storiche */}
            {isHistoricalMatch && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={async () => await initializeSetCreation()}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium flex items-center justify-center gap-2"
                >
                  <span role="img" aria-label="set">🎯</span>
                  Aggiungi Set {matchSets.length + 1}
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Sezione per partite storiche con formazioni e gestione set */}
        {isHistoricalMatch && selectedMatch && currentUser && (
          <div className="space-y-6">
            {/* Pulsante Formazioni Beta (solo per ex-partecipanti) */}
            {selectedMatch.participants && 
             selectedMatch.participants.some(p => p.uid === currentUser.uid) && (
              <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setCurrentView(VIEW_STATES.FORMATION_PROPOSAL);
                    }}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Proponi Formazione
                    <span className="ml-2 px-2 py-1 bg-orange-500 text-white text-xs rounded-full">Beta</span>
                  </button>
                  {formationProposals.length >= 3 && (
                    <button
                      onClick={() => {
                        setCurrentView(VIEW_STATES.FORMATION_RESULT);
                      }}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Vedi Formazioni ({formationProposals.length})
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
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
      
      // Aggiorna le statistiche dell'utente corrente se era partecipante nella partita riaperta
      if (currentUser && (participants.some(p => p.uid === currentUser.uid) || reserves.some(r => r.uid === currentUser.uid))) {
        await loadUserStats(currentUser.uid);
      }
      
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
        
        {/* Filtro ricerca utente */}
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder="Filtra per nome utente..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            {userFilter && (
              <button
                onClick={() => setUserFilter('')}
                className="px-3 py-2 bg-gray-600 text-gray-300 rounded-lg hover:bg-gray-500 transition text-sm"
                title="Pulisci filtro"
              >
                ✕
              </button>
            )}
          </div>
          {userFilter && (
            <p className="text-sm text-gray-400 mt-2">
              Mostrando partite con utenti che contengono "{userFilter}"
            </p>
          )}
        </div>
        
        {matchHistory.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">Nessuna partita nel database</p>
          </div>
        ) : (
          (() => {
            const filteredMatches = matchHistory.filter(session => {
              if (!userFilter) return true;
              
              // Cerca nel nome degli utenti partecipanti
              const participantsMatch = session.participants?.some(participant =>
                participant.name?.toLowerCase().includes(userFilter.toLowerCase())
              ) || false;
              
              // Cerca nel nome delle riserve
              const reservesMatch = session.reserves?.some(reserve =>
                reserve.name?.toLowerCase().includes(userFilter.toLowerCase())
              ) || false;
              
              // Cerca negli amici dei partecipanti
              const friendsMatch = session.participants?.some(participant =>
                participant.friends?.some(friend =>
                  friend.toLowerCase().includes(userFilter.toLowerCase())
                )
              ) || false;
              
              // Cerca negli amici delle riserve
              const reserveFriendsMatch = session.reserves?.some(reserve =>
                reserve.friends?.some(friend =>
                  friend.toLowerCase().includes(userFilter.toLowerCase())
                )
              ) || false;
              
              return participantsMatch || reservesMatch || friendsMatch || reserveFriendsMatch;
            });

            return filteredMatches.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400">
                  {userFilter 
                    ? `Nessuna partita trovata per "${userFilter}"`
                    : "Nessuna partita nel database"
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {filteredMatches.map((session, index) => (
              <div 
                key={session.id}
                className="bg-gray-700 rounded-lg p-3 md:p-4 border border-gray-600 hover:border-indigo-500 transition group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div 
                    onClick={async () => {
                      const matchData = {
                        ...session,
                        id: session.id,
                        date: session.date.toDate ? session.date.toDate().toISOString() : new Date().toISOString()
                      };
                      setSelectedMatch(matchData);
                      setCurrentView(VIEW_STATES.MATCH_DETAIL);
                      // Carica i set per questa partita
                      await loadMatchSets(matchData.id);
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
                      <div className="text-lg md:text-2xl font-bold text-purple-400">
                        {session.setCount || 0}
                      </div>
                      <div className="text-xs text-gray-400">Set</div>
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
            );
          })()
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
    // Ordina gli utenti alfabeticamente per nome (customDisplayName o displayName)
    const sortedUsers = [...allUsers].sort((a, b) => {
      const nameA = (a.customDisplayName || a.displayName || '').toLowerCase();
      const nameB = (b.customDisplayName || b.displayName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return (
      <div className="space-y-6">
        {sortedUsers.length === 0 ? (
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
            
            <div className="space-y-2">
              {sortedUsers.map((user) => (
                <div key={user.id} className="bg-gray-700 rounded-lg p-3 border border-gray-600">
                  <div className="flex items-center justify-between gap-3">
                    {/* User info - Left side */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <img
                        src={user.photoURL || ''}
                        alt={user.displayName || ''}
                        className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 flex-shrink-0 object-cover ${
                          user.email === SUPER_ADMIN_EMAIL || user.role === 'admin' 
                            ? 'border-blue-500 shadow-sm shadow-blue-500/30' 
                            : 'border-indigo-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-100 truncate text-sm md:text-base">
                            {user.customDisplayName || user.displayName}
                          </div>
                          
                          {/* Role badge - compact */}
                          {isAdmin && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                              user.email === SUPER_ADMIN_EMAIL ? 'bg-blue-900 text-blue-200' :
                              user.role === 'admin' ? 'bg-blue-900 text-blue-200' :
                              user.role === 'capitana' ? 'bg-purple-900 text-purple-200' :
                              'bg-gray-600 text-gray-200'
                            }`}>
                              {user.email === SUPER_ADMIN_EMAIL ? 'ADM' : 
                               user.role === 'admin' ? 'ADM' : 
                               user.role === 'capitana' ? 'CAP' : 'USR'}
                            </span>
                          )}
                          
                          {/* Stats inline */}
                          <div className="text-xs text-indigo-400 font-medium flex-shrink-0">
                            {user.stats?.totalSessions || 0} partite
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Action buttons - Right side */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Role change buttons - compact */}
                      {isAdmin && user.email !== SUPER_ADMIN_EMAIL && user.id !== currentUser?.uid && (
                        <>
                          {user.role === 'user' && (
                            <>
                              <button
                                onClick={() => handleChangeUserRole(user.id, 'admin')}
                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition"
                                title="Promuovi ad Admin"
                              >
                                ADM
                              </button>
                              {isSuperAdmin && (
                                <button
                                  onClick={() => handleChangeUserRole(user.id, 'capitana')}
                                  className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition"
                                  title="Promuovi a Capitana"
                                >
                                  CAP
                                </button>
                              )}
                            </>
                          )}
                          {(user.role === 'admin' || user.role === 'capitana') && isSuperAdmin && (
                            <button
                              onClick={() => handleChangeUserRole(user.id, 'user')}
                              className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 transition"
                              title="Riduci a Utente"
                            >
                              USR
                            </button>
                          )}
                        </>
                      )}
                      
                      {/* Stats button */}
                      <button
                        onClick={() => loadOtherUserStats(user.id, user.displayName)}
                        className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 transition"
                        title="Visualizza statistiche"
                      >
                        📊
                      </button>
                      
                      {/* Storico ammonizioni button */}
                      {(isAdmin || isCapitana) && (
                        <button
                          onClick={() => showUserAmmonitionHistory(user.id, user.customDisplayName || user.displayName)}
                          className="px-2 py-1 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700 transition"
                          title="Storico ammonizioni"
                        >
                          🧁
                        </button>
                      )}
                      
                      {/* Delete button */}
                      {isAdmin && user.email !== SUPER_ADMIN_EMAIL && user.id !== currentUser?.uid && (
                        <button
                          onClick={() => handleDeleteUser(user.id, user.customDisplayName || user.displayName)}
                          className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition"
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

  // Render Coppa Paste view
  const renderCoppaPasteView = () => {
    const canAddAmmonizione = (ammonizioni, index) => {
      if (index === 0) return ammonizioni[0] === null;
      if (index === 1) return ammonizioni[0] !== null && ammonizioni[1] === null;
      if (index === 2) return ammonizioni[0] !== null && ammonizioni[1] !== null && ammonizioni[2] === null;
      return false;
    };

    const hasThreeAmmonizioni = (ammonizioni) => {
      return ammonizioni[0] !== null && ammonizioni[1] !== null && ammonizioni[2] !== null;
    };

    const canStartNewCycle = (ammonizioni) => {
      return hasThreeAmmonizioni(ammonizioni);
    };

    return (
      <div className="space-y-6">
        <div className="bg-gray-800 rounded-xl shadow-2xl p-4 md:p-6 border border-gray-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-100 mb-2">Coppa Paste</h2>
              <p className="text-gray-400 text-sm">Tutti gli utenti registrati vengono automaticamente inclusi. Puoi anche aggiungere utenti manualmente per nome.</p>
            </div>
            <div className="mt-4 md:mt-0">
              <button
                onClick={() => setShowCoppaPasteReport(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
              >
                📊 Genera Report
              </button>
            </div>
          </div>
          
          {/* Add user form */}
          <div className="mb-6 p-4 bg-gray-700 rounded-lg border border-gray-600">
            <h3 className="text-lg font-semibold text-gray-100 mb-3">Aggiungi Utente per Nome</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={coppaPasteNewUser}
                onChange={(e) => setCoppaPasteNewUser(e.target.value)}
                placeholder="Nome dell'utente"
                className="flex-1 px-4 py-2 bg-gray-600 text-gray-100 border border-gray-500 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                onClick={addUserToCoppaPaste}
                disabled={!coppaPasteNewUser.trim()}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition"
              >
                Aggiungi
              </button>
            </div>
          </div>
          
          {/* Users list */}
          <div className="space-y-2">
            {coppaPasteUsers.map((user) => (
              <div key={user.id} className="bg-gray-700 rounded-lg p-3 border border-gray-600">
                
                {/* Layout compatto in una singola riga */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                  
                  {/* Nome utente */}
                  <div className="lg:col-span-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-100 text-sm truncate">
                        {user.name}
                      </h3>
                      {!user.userExists && (
                        <span className="text-xs bg-red-900 text-red-200 px-1 py-0.5 rounded">
                          Eliminato
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ammonizioni compatte */}
                  <div className="lg:col-span-6">
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 1, 2].map((index) => (
                        <div key={index} className="text-center">
                          <div className="text-xs text-gray-400 mb-1">#{index + 1}</div>
                          <div className={`p-2 rounded border min-h-[50px] flex flex-col justify-center items-center ${
                            hasThreeAmmonizioni(user.ammonizioni) && index === 2 
                              ? 'bg-red-900/30 border-red-500' 
                              : 'bg-gray-600/30 border-gray-500'
                          }`}>
                            {user.ammonizioni[index] ? (
                              <>
                                <input
                                  type="date"
                                  value={user.ammonizioni[index]}
                                  onChange={(e) => updateAmmonizione(user.id, index, e.target.value)}
                                  className="w-full text-xs bg-transparent border-none text-center text-gray-100 focus:outline-none mb-1"
                                />
                                <button
                                  onClick={() => removeAmmonizione(user.id, index)}
                                  className="text-red-400 hover:text-red-300 text-xs"
                                  title="Rimuovi ammonizione"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-gray-500">—</span>
                            )}
                          </div>
                          
                          {/* Pulsante aggiungi ammonizione */}
                          {(canAddAmmonizione(user.ammonizioni, index) || (canStartNewCycle(user.ammonizioni) && index === 0)) && (
                            <button
                              onClick={() => addAmmonizione(user.id, index)}
                              className="mt-1 px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition"
                            >
                              {canStartNewCycle(user.ammonizioni) && index === 0 ? 'Nuovo' : '+'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Debito Espiato compatto */}
                  <div className="lg:col-span-2">
                    <div className="text-xs text-gray-400 mb-1 text-center">Debito Espiato</div>
                    {user.debitoEspiato ? (
                      <div className="space-y-1">
                        <input
                          type="date"
                          value={user.debitoEspiato}
                          onChange={(e) => updateDebitoEspiato(user.id, e.target.value)}
                          className="w-full text-xs bg-gray-600 text-green-400 border border-gray-500 rounded text-center focus:ring-1 focus:ring-green-500"
                        />
                        <button
                          onClick={() => removeDebitoEspiato(user.id)}
                          className="w-full text-xs text-red-400 hover:text-red-300"
                          title="Rimuovi espiazione"
                        >
                          ✕ Rimuovi
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDebitoEspiato(user.id)}
                        className="w-full px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition"
                      >
                        Segna Espiato
                      </button>
                    )}
                  </div>

                  {/* Coppa Paste compatto */}
                  <div className="lg:col-span-1">
                    <div className="text-xs text-gray-400 mb-1 text-center">Coppa</div>
                    <input
                      type="number"
                      step="0.5"
                      value={user.coppaPaste || 0}
                      onChange={(e) => updateCoppaPaste(user.id, e.target.value)}
                      className="w-full h-8 text-sm font-semibold bg-gray-600 text-gray-100 border border-gray-500 rounded text-center focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Elimina utente */}
                  <div className="lg:col-span-1">
                    <div className="text-xs text-gray-400 mb-1 text-center">Elimina utente</div>
                    <button
                      onClick={() => deleteCoppaPasteUser(user.id, user.name)}
                      className="w-full px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition"
                      title="Elimina utente"
                    >
                      🗑️
                    </button>
                  </div>

                </div>
              </div>
            ))}

            {coppaPasteUsers.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                Nessun utente nella Coppa Paste
              </div>
            )}
          </div>
        </div>

        {/* Report Modal */}
        {showCoppaPasteReport && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-gray-600">
              <div className="flex items-center justify-between p-4 border-b border-gray-600">
                <h3 className="text-lg font-bold text-gray-100">📊 Report Coppa Paste</h3>
                <button
                  onClick={() => setShowCoppaPasteReport(false)}
                  className="text-gray-400 hover:text-gray-200 text-xl"
                >
                  ✕
                </button>
              </div>
              
              <div className="p-4 overflow-y-auto max-h-[60vh]">
                <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap bg-gray-900 p-4 rounded-lg border border-gray-600">
                  {generateCoppaPasteReport()}
                </pre>
              </div>
              
              <div className="flex gap-3 p-4 border-t border-gray-600">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generateCoppaPasteReport());
                    alert('Report copiato negli appunti!');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                >
                  📋 Copia Testo
                </button>
                <button
                  onClick={() => {
                    shareOnWhatsApp();
                    setShowCoppaPasteReport(false);
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  📱 Condividi su WhatsApp
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render formation proposal view
  const renderFormationProposalView = () => {
    const positionLabels = {
      0: "P1",
      1: "P2",
      2: "P3",
      3: "P4",
      4: "P5",
      5: "P6"
    };

    const renderPlayer = (player, onClick = null, posLabel = null) => (
      <div
        key={player?.uid || 'empty'}
        className={`h-12 sm:h-16 w-20 sm:w-24 rounded-lg border-2 border-dashed border-gray-400 flex items-center justify-center text-center text-[10px] sm:text-xs transition-all duration-200 ${
          player 
            ? 'bg-indigo-600 text-white border-solid border-indigo-500 cursor-pointer hover:bg-indigo-700' 
            : 'bg-gray-700/30 text-gray-400'
        }`}
        draggable={!!player}
        onDragStart={(e) => player && handleDragStart(e, player)}
        onTouchStart={() => player && handleTouchStart(player)}
        onDragOver={handleDragOver}
        onDrop={(e) => !player && handleDrop(e, 'available', null)}
        onClick={() => player && onClick && onClick(player)}
      >
        {player ? (
          <div className="p-1">
            <div className="font-medium truncate max-w-full">{player.name}</div>
            {player.isFriend && <div className="text-[8px] sm:text-xs opacity-75">Amico</div>}
          </div>
        ) : (
          <div className="text-gray-500">{posLabel || "Vuoto"}</div>
        )}
      </div>
    );

    const renderTeam = (teamKey, teamName) => (
      <div className="bg-gray-800 rounded-xl p-3 sm:p-6 border border-gray-700 volleyball-court">
        <h3 className="text-base sm:text-lg font-bold text-gray-100 mb-2 sm:mb-4 text-center">{teamName}</h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {/* Rete (rappresentata come linea) */}
          <div className="col-span-3 h-1 bg-gray-400 mb-2"></div>
          
          {/* Prima fila */}
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, teamKey, 3)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 3)}
            data-team={teamKey}
            data-position={3}
          >
            {renderPlayer(currentFormation[teamKey][3], handleReturnToAvailable, positionLabels[3])}
          </div>
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, teamKey, 2)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 2)}
            data-team={teamKey}
            data-position={2}
          >
            {renderPlayer(currentFormation[teamKey][2], handleReturnToAvailable, positionLabels[2])}
          </div>
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, teamKey, 1)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 1)}
            data-team={teamKey}
            data-position={1}
          >
            {renderPlayer(currentFormation[teamKey][1], handleReturnToAvailable, positionLabels[1])}
          </div>

          {/* Seconda fila */}
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, teamKey, 4)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 4)}
            data-team={teamKey}
            data-position={4}
          >
            {renderPlayer(currentFormation[teamKey][4], handleReturnToAvailable, positionLabels[4])}
          </div>
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, teamKey, 5)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 5)}
            data-team={teamKey}
            data-position={5}
          >
            {renderPlayer(currentFormation[teamKey][5], handleReturnToAvailable, positionLabels[5])}
          </div>
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, teamKey, 0)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 0)}
            data-team={teamKey}
            data-position={0}
          >
            {renderPlayer(currentFormation[teamKey][0], handleReturnToAvailable, positionLabels[0])}
          </div>
        </div>
      </div>
    );

    return (
      <div className="space-y-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-gray-100 mb-4">Proponi la tua formazione</h2>
          <p className="text-gray-400 mb-4">
            Trascina i giocatori dalle posizioni disponibili al campo per creare la tua formazione ideale.
            Servono 6 giocatori per squadra (12 totali).
          </p>
          
          {/* Giocatori disponibili */}
          <div className="mb-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-100 mb-2 sm:mb-3">Giocatori disponibili</h3>
            <input
              type="text"
              value={filterPlayer}
              onChange={(e) => setFilterPlayer(e.target.value)}
              placeholder="Filtra giocatori..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg mb-3 text-sm text-gray-100"
            />
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {availablePlayers
                .filter(player => {
                  // Mostra solo i giocatori non ancora posizionati e che corrispondono al filtro
                  const isInFormation = 
                    currentFormation.team1.some(p => p?.uid === player.uid) ||
                    currentFormation.team2.some(p => p?.uid === player.uid) ||
                    currentFormation.reserveTeam1?.uid === player.uid ||
                    currentFormation.reserveTeam2?.uid === player.uid;
                  
                  const matchesFilter = !filterPlayer || 
                    player.name.toLowerCase().includes(filterPlayer.toLowerCase());
                    
                  return !isInFormation && matchesFilter;
                })
                .map(player => renderPlayer(player))
              }
            </div>
          </div>
        </div>

        {/* Campo di gioco con riserve integrate */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            {renderTeam('team1', 'Squadra A')}
            {/* Riserva Squadra A */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-bold text-gray-100 mb-4 text-center">Squadra A</h3>
              <div className="flex justify-center">
                <div 
                  className="flex flex-col items-center gap-2"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'reserveTeam1', null)}
                  onTouchEnd={(e) => handleTouchEnd(e, 'reserveTeam1', null)}
                  data-team="reserveTeam1"
                  data-position="reserve"
                >
                  {renderPlayer(currentFormation.reserveTeam1, handleReturnToAvailable, "Riserva")}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {renderTeam('team2', 'Squadra B')}
            {/* Riserva Squadra B */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-lg font-bold text-gray-100 mb-4 text-center">Squadra B</h3>
              <div className="flex justify-center">
                <div 
                  className="flex flex-col items-center gap-2"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'reserveTeam2', null)}
                  onTouchEnd={(e) => handleTouchEnd(e, 'reserveTeam2', null)}
                  data-team="reserveTeam2"
                  data-position="reserve"
                >
                  {renderPlayer(currentFormation.reserveTeam2, handleReturnToAvailable, "Riserva")}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pulsante submit */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setCurrentView(VIEW_STATES.MATCH_DETAIL)}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium"
          >
            Indietro
          </button>
          <button
            onClick={submitFormationProposal}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
          >
            Invia Formazione
          </button>
        </div>
      </div>
    );
  };

  // Render formation result view (when >= 3 proposals exist)
  const renderFormationResultView = () => {
    if (!calculatedFormations) {
      return (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-gray-100 mb-4">Formazioni Proposte</h2>
            <p className="text-gray-400">
              Servono almeno 3 proposte per calcolare le formazioni ottimali. 
              Attualmente ci sono {formationProposals.length} proposte.
            </p>
          </div>
        </div>
      );
    }

    const positionLabels = {
      0: "P1",
      1: "P2", 
      2: "P3",
      3: "P4",
      4: "P5",
      5: "P6"
    };

    const renderCalculatedPlayer = (player, posLabel = null) => (
      <div
        key={player?.uid || 'empty'}
        className={`h-16 w-24 rounded-lg border-2 flex items-center justify-center text-center text-xs transition-all duration-200 ${
          player 
            ? 'bg-green-600 text-white border-solid border-green-500' 
            : 'bg-gray-700/30 text-gray-400 border-dashed border-gray-400'
        }`}
      >
        {player ? (
          <div className="p-1">
            <div className="font-medium">{player.name}</div>
          </div>
        ) : (
          <div className="text-gray-500">{posLabel || "Vuoto"}</div>
        )}
      </div>
    );

    const renderCalculatedTeam = (teamKey, teamName) => (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-gray-100 mb-4 text-center">{teamName}</h3>
        <div className="grid grid-cols-3 gap-3">
          {/* Rete */}
          <div className="col-span-3 h-1 bg-gray-400 mb-2"></div>
          
          {/* Prima fila */}
          <div className="flex flex-col items-center gap-2">
            {renderCalculatedPlayer(calculatedFormations[teamKey][3], positionLabels[3])}
          </div>
          <div className="flex flex-col items-center gap-2">
            {renderCalculatedPlayer(calculatedFormations[teamKey][2], positionLabels[2])}
          </div>
          <div className="flex flex-col items-center gap-2">
            {renderCalculatedPlayer(calculatedFormations[teamKey][1], positionLabels[1])}
          </div>

          {/* Seconda fila */}
          <div className="flex flex-col items-center gap-2">
            {renderCalculatedPlayer(calculatedFormations[teamKey][4], positionLabels[4])}
          </div>
          <div className="flex flex-col items-center gap-2">
            {renderCalculatedPlayer(calculatedFormations[teamKey][5], positionLabels[5])}
          </div>
          <div className="flex flex-col items-center gap-2">
            {renderCalculatedPlayer(calculatedFormations[teamKey][0], positionLabels[0])}
          </div>
        </div>
      </div>
    );

    return (
      <div className="space-y-6">
        {/* Informazioni sulla formazione */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-gray-100 mb-4">Formazioni Calcolate</h2>
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-indigo-400">{calculatedFormations.proposalCount}</div>
              <div className="text-sm text-gray-400">Proposte analizzate</div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{Math.round(calculatedFormations.confidence)}%</div>
              <div className="text-sm text-gray-400">Consenso</div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">13</div>
              <div className="text-sm text-gray-400">Posizioni totali</div>
            </div>
          </div>
          <p className="text-gray-400">
            Questa formazione è stata calcolata analizzando {calculatedFormations.proposalCount} proposte diverse, 
            tenendo conto delle preferenze di posizione e delle combinazioni di giocatori più frequenti.
          </p>
          {calculatedFormations.confidence < 50 && (
            <div className="mt-3 p-3 bg-amber-900/20 border border-amber-600 rounded-lg">
              <p className="text-amber-300 text-sm">
                ⚠️ Il consenso è basso ({Math.round(calculatedFormations.confidence)}%). 
                Le opinioni sono molto diverse tra i partecipanti.
              </p>
            </div>
          )}
        </div>

        {/* Campo di gioco calcolato */}
        <div className="grid md:grid-cols-2 gap-6">
          {renderCalculatedTeam('team1', 'Squadra A')}
          {renderCalculatedTeam('team2', 'Squadra B')}
        </div>

        {/* Riserva calcolata */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-gray-100 mb-4 text-center">Riserva</h3>
          <div className="flex justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="text-xs text-gray-400">Giocatore di riserva</div>
              {renderCalculatedPlayer(calculatedFormations.reserve)}
            </div>
          </div>
        </div>

        {/* Pulsante per tornare alle proposte */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setCurrentView(VIEW_STATES.FORMATION_PROPOSAL)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
          >
            Modifica la tua proposta
          </button>
          <button
            onClick={() => setCurrentView(VIEW_STATES.MATCH_DETAIL)}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium"
          >
            Torna alla partita
          </button>
        </div>
      </div>
    );
  };

  // Render add set view
  const renderAddSetView = () => {
    const positionLabels = {
      0: "P1",
      1: "P2",
      2: "P3", 
      3: "P4",
      4: "P5",
      5: "P6"
    };

    // Render player for sets - IDENTICO alle formazioni
    const renderPlayer = (player, onClick = null, posLabel = null) => (
      <div
        key={player?.uid || 'empty'}
        className={`h-12 sm:h-16 w-20 sm:w-24 rounded-lg border-2 border-dashed border-gray-400 flex items-center justify-center text-center text-[10px] sm:text-xs transition-all duration-200 ${
          player 
            ? 'bg-indigo-600 text-white border-solid border-indigo-500 cursor-pointer hover:bg-indigo-700' 
            : 'bg-gray-700/30 text-gray-400'
        }`}
        draggable={!!player}
        onDragStart={(e) => player && handleDragStart(e, player)}
        onTouchStart={() => player && handleTouchStart(player)}
        onDragOver={handleDragOver}
        onDrop={(e) => !player && handleDropForSet(e, 'available', null)}
        onClick={() => player && onClick && onClick(player)}
      >
        {player ? (
          <div className="p-1">
            <div className="font-medium truncate max-w-full">{player.name}</div>
            {player.isFriend && <div className="text-[8px] sm:text-xs opacity-75">Amico</div>}
          </div>
        ) : (
          <div className="text-gray-500">{posLabel || "Vuoto"}</div>
        )}
      </div>
    );

    // Render formazione squadra per set - IDENTICO alle formazioni
    const renderTeamFormation = (teamKey, teamName) => (
      <div className="bg-gray-800 rounded-xl p-3 sm:p-6 border border-gray-700 volleyball-court">
        <h3 className="text-base sm:text-lg font-bold text-gray-100 mb-2 sm:mb-4 text-center">{teamName}</h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {/* Rete (rappresentata come linea) */}
          <div className="col-span-3 h-1 bg-gray-400 mb-2"></div>
          
          {/* Prima fila */}
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropForSet(e, teamKey, 3)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 3)}
            data-team={teamKey}
            data-position={3}
          >
            {renderPlayer(currentSet[teamKey][3], handleReturnToAvailableForSet, positionLabels[3])}
          </div>
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropForSet(e, teamKey, 2)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 2)}
            data-team={teamKey}
            data-position={2}
          >
            {renderPlayer(currentSet[teamKey][2], handleReturnToAvailableForSet, positionLabels[2])}
          </div>
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropForSet(e, teamKey, 1)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 1)}
            data-team={teamKey}
            data-position={1}
          >
            {renderPlayer(currentSet[teamKey][1], handleReturnToAvailableForSet, positionLabels[1])}
          </div>

          {/* Seconda fila */}
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropForSet(e, teamKey, 4)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 4)}
            data-team={teamKey}
            data-position={4}
          >
            {renderPlayer(currentSet[teamKey][4], handleReturnToAvailableForSet, positionLabels[4])}
          </div>
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropForSet(e, teamKey, 5)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 5)}
            data-team={teamKey}
            data-position={5}
          >
            {renderPlayer(currentSet[teamKey][5], handleReturnToAvailableForSet, positionLabels[5])}
          </div>
          <div 
            className="flex flex-col items-center gap-1 sm:gap-2"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropForSet(e, teamKey, 0)}
            onTouchEnd={(e) => handleTouchEnd(e, teamKey, 0)}
            data-team={teamKey}
            data-position={0}
          >
            {renderPlayer(currentSet[teamKey][0], handleReturnToAvailableForSet, positionLabels[0])}
          </div>
        </div>
      </div>
    );

    return (
      <div className="space-y-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-gray-100 mb-4">Aggiungi Nuovo Set</h2>
          
          {/* Informazioni del set */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm text-gray-300 mb-2">Numero Set</label>
              <input
                type="number"
                value={currentSet.setNumber || ''}
                readOnly
                className="w-full px-3 py-2 bg-gray-600 text-gray-300 border border-gray-500 rounded-lg cursor-not-allowed"
                title="Il numero del set viene assegnato automaticamente"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Punteggio Squadra A</label>
              <input
                type="number"
                min="0"
                value={currentSet.teamAScore || ''}
                onChange={(e) => setCurrentSet(prev => ({ ...prev, teamAScore: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 bg-gray-700 text-gray-100 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Punteggio Squadra B</label>
              <input
                type="number"
                min="0"
                value={currentSet.teamBScore || ''}
                onChange={(e) => setCurrentSet(prev => ({ ...prev, teamBScore: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 bg-gray-700 text-gray-100 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Formazioni con riserve integrate */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              {renderTeamFormation('team1', 'Squadra A')}
              {/* Riserva Squadra A */}
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-bold text-gray-100 mb-4 text-center">Squadra A</h3>
                <div className="flex justify-center">
                  <div 
                    className="flex flex-col items-center gap-2"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropForSet(e, 'reserveTeam1', 0)}
                    onTouchEnd={(e) => handleTouchEnd(e, 'reserveTeam1', null)}
                    data-team="reserveTeam1"
                    data-position="reserve"
                  >
                    {renderPlayer(currentSet.reserveTeam1, handleReturnToAvailableForSet, "Riserva")}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {renderTeamFormation('team2', 'Squadra B')}
              {/* Riserva Squadra B */}
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-bold text-gray-100 mb-4 text-center">Squadra B</h3>
                <div className="flex justify-center">
                  <div 
                    className="flex flex-col items-center gap-2"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropForSet(e, 'reserveTeam2', 0)}
                    onTouchEnd={(e) => handleTouchEnd(e, 'reserveTeam2', null)}
                    data-team="reserveTeam2"
                    data-position="reserve"
                  >
                    {renderPlayer(currentSet.reserveTeam2, handleReturnToAvailableForSet, "Riserva")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Giocatori disponibili - IDENTICO alle formazioni */}
          <div className="bg-gray-700 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-100 mb-3">Giocatori disponibili</h3>
            <div className="flex flex-wrap gap-3">
              {availablePlayers
                .filter(player => {
                  // Mostra solo i giocatori non ancora posizionati nel set
                  const isInSet = 
                    currentSet.team1.some(p => p?.uid === player.uid) ||
                    currentSet.team2.some(p => p?.uid === player.uid) ||
                    currentSet.reserveTeam1?.uid === player.uid ||
                    currentSet.reserveTeam2?.uid === player.uid;
                  return !isInSet;
                })
                .map(player => renderPlayer(player))
              }
            </div>
          </div>

          {/* Pulsanti di azione */}
          <div className="flex gap-3">
            <button
              onClick={submitSet}
              disabled={!currentSet.setNumber || !currentSet.teamAScore || !currentSet.teamBScore}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Salva Set
            </button>
            <button
              onClick={() => setCurrentView(VIEW_STATES.MATCH_DETAIL)}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium"
            >
              Annulla
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render set detail view
  const renderSetDetailView = () => {
    return (
      <div className="space-y-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-100">Lista Set</h2>
            
            {/* Filtro giocatore */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-300">Filtra per giocatore:</label>
              <select
                value={filterPlayer || ''}
                onChange={(e) => setFilterPlayer(e.target.value)}
                className="px-3 py-2 bg-gray-700 text-gray-100 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Tutti i giocatori</option>
                {selectedMatch?.participants?.map(participant => (
                  <option key={participant.uid} value={participant.uid}>
                    {participant.name}
                  </option>
                )) || []}
              </select>
            </div>
          </div>

          {/* Lista set */}
          {matchSets.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">Nessun set registrato per questa partita</p>
              <button
                onClick={() => setCurrentView(VIEW_STATES.ADD_SET)}
                className="mt-4 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
              >
                Aggiungi primo set
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {matchSets
                .filter(set => !filterPlayer || 
                  set.teamA.some(p => p.uid === filterPlayer) || 
                  set.teamB.some(p => p.uid === filterPlayer) ||
                  (set.reserve && set.reserve.uid === filterPlayer)
                )
                .map((set, index) => (
                  <div key={set.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-100">
                        Set {set.setNumber}
                      </h3>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-100">
                          {set.teamAScore} - {set.teamBScore}
                        </div>
                        <div className="text-sm text-gray-400">
                          {new Date(set.createdAt?.toDate ? set.createdAt.toDate() : set.createdAt).toLocaleString('it-IT')}
                        </div>
                      </div>
                    </div>

                    {/* Formazioni del set */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div>
                          <h4 className="text-md font-semibold text-gray-200 mb-2">Squadra A</h4>
                          <div className="space-y-1">
                            {set.teamA.map((player, idx) => (
                              <div key={idx} className="text-sm text-gray-300 flex items-center gap-2">
                                <span className="w-8 text-center">P{idx + 1}</span>
                                <span>{player.name}</span>
                                {player.uid.startsWith('friend_') && (
                                  <span className="text-xs text-gray-500">(Amico)</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        {set.reserveTeamA && (
                          <div className="pt-2 border-t border-gray-600">
                            <div className="text-sm text-gray-300">
                              <strong>Riserva A:</strong> {set.reserveTeamA.name}
                              {set.reserveTeamA.uid.startsWith('friend_') && (
                                <span className="text-xs text-gray-500 ml-1">(Amico)</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <h4 className="text-md font-semibold text-gray-200 mb-2">Squadra B</h4>
                          <div className="space-y-1">
                            {set.teamB.map((player, idx) => (
                              <div key={idx} className="text-sm text-gray-300 flex items-center gap-2">
                                <span className="w-8 text-center">P{idx + 1}</span>
                                <span>{player.name}</span>
                                {player.uid.startsWith('friend_') && (
                                  <span className="text-xs text-gray-500">(Amico)</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        {set.reserveTeamB && (
                          <div className="pt-2 border-t border-gray-600">
                            <div className="text-sm text-gray-300">
                              <strong>Riserva B:</strong> {set.reserveTeamB.name}
                              {set.reserveTeamB.uid.startsWith('friend_') && (
                                <span className="text-xs text-gray-500 ml-1">(Amico)</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Retrocompatibilità per la vecchia riserva unica */}
                    {set.reserve && !set.reserveTeamA && !set.reserveTeamB && (
                      <div className="mt-3 pt-3 border-t border-gray-600">
                        <div className="text-sm text-gray-300">
                          <strong>Riserva:</strong> {set.reserve.name}
                          {set.reserve.uid.startsWith('friend_') && (
                            <span className="text-xs text-gray-500 ml-1">(Amico)</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Pulsanti di azione */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setCurrentView(VIEW_STATES.ADD_SET)}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
            >
              Aggiungi Set
            </button>
            <button
              onClick={() => setCurrentView(VIEW_STATES.MATCH_DETAIL)}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium"
            >
              Torna alla partita
            </button>
          </div>
        </div>
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
            
            {/* Coppa Paste - accessible only to super admin and capitana */}
            {(isSuperAdmin || isCapitana) && (
              <button
                onClick={() => {
                  loadCoppaPasteData();
                  setCurrentView(VIEW_STATES.COPPA_PASTE);
                }}
                className={`flex flex-col items-center gap-1 p-1 md:p-2 rounded-lg transition ${
                  currentView === VIEW_STATES.COPPA_PASTE 
                  ? 'bg-red-600 text-white' 
                  : 'text-gray-400 hover:text-gray-200'
                }`}
                title="Coppa Paste"
              >
                <div className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center text-lg">
                  🧁
                </div>
                <span className="text-xs">Coppa</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Main render function
  return (
    <div className={`min-h-screen p-3 md:p-6 pb-24 ${isDarkMode ? 'bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gradient-to-br from-blue-50 to-indigo-100'}`}>
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
            {currentView === VIEW_STATES.COPPA_PASTE && renderCoppaPasteView()}
            {currentView === VIEW_STATES.FORMATION_PROPOSAL && renderFormationProposalView()}
            {currentView === VIEW_STATES.ADD_SET && renderAddSetView()}
            {currentView === VIEW_STATES.SET_DETAIL && renderSetDetailView()}
            {currentView === VIEW_STATES.FORMATION_RESULT && renderFormationResultView()}
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

                  Statistiche di {selectedUserStats.displayName}
                </h3>
                <button
                  onClick={() => setShowUserStatsModal(false)}
                  className="text-gray-400 hover:text-gray-200 transition"
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50">
                  <div className="text-xl font-bold text-indigo-400">{selectedUserStats.totalSessions || 0}</div>
                  <div className="text-xs text-gray-400">Partite giocate</div>
                </div>
              </div>
              
              {/* Statistiche Set */}
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50">
                  <div className="text-xl font-bold text-green-400">{selectedUserStats.setsPlayed || 0}</div>
                  <div className="text-xs text-gray-400">Set giocati</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50">
                  <div className="text-xl font-bold text-green-400">{selectedUserStats.setsWon || 0}</div>
                  <div className="text-xs text-gray-400">Set vinti</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50">
                  <div className="text-xl font-bold text-yellow-400">
                    {selectedUserStats.setsPlayed > 0 ? Math.round((selectedUserStats.setsWon / selectedUserStats.setsPlayed) * 100) : 0}%
                  </div>
                  <div className="text-xs text-gray-400">% Vittorie</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50">
                  <div className={`text-xl font-bold ${(selectedUserStats.pointDifference || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(selectedUserStats.pointDifference || 0) >= 0 ? '+' : ''}{selectedUserStats.pointDifference || 0}
                  </div>
                  <div className="text-xs text-gray-400">Diff. punti</div>
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

        {/* Modal Storico Ammonizioni */}
        {showUserHistory && selectedUserHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-gray-700">
              <div className="p-6 border-b border-gray-700">
                <h3 className="text-xl font-bold text-gray-100">
                  📋 Storico Ammonizioni - {selectedUserHistory.userName}
                </h3>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[70vh]">
                {/* Debug: mostra sempre i dati attuali */}
                <div className="mb-4 p-3 bg-gray-700 rounded-lg border border-gray-600">
                  <h4 className="font-bold text-gray-100 mb-2">🔍 Debug - Dati Attuali Utente</h4>
                  <div className="text-xs text-gray-400">
                    <p>ID Utente: {selectedUserHistory.userId}</p>
                    <p>Storico Array Length: {selectedUserHistory.storico ? selectedUserHistory.storico.length : 'undefined'}</p>
                    <p>Storico Data: {JSON.stringify(selectedUserHistory.storico)}</p>
                  </div>
                </div>

                {selectedUserHistory.storico && selectedUserHistory.storico.length > 0 ? (
                  <div className="space-y-4">
                    {selectedUserHistory.storico.map((ciclo, index) => (
                      <div key={index} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-bold text-gray-100">Ciclo {ciclo.ciclo}</h4>
                          <span className="text-sm text-gray-400">
                            {ciclo.dataCreazione ? new Date(ciclo.dataCreazione.toDate()).toLocaleDateString('it-IT', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              year: 'numeric' 
                            }) : 'N/A'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                          {/* Prima ammonizione */}
                          <div className="bg-gray-600 rounded p-3">
                            <div className="text-sm font-medium text-gray-200">1ª Ammonizione</div>
                            <div className="text-xs text-gray-400">
                              {ciclo.amm1 ? new Date(ciclo.amm1.toDate()).toLocaleDateString('it-IT', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric' 
                              }) : '❌ Non presente'}
                            </div>
                          </div>
                          
                          {/* Seconda ammonizione */}
                          <div className="bg-gray-600 rounded p-3">
                            <div className="text-sm font-medium text-gray-200">2ª Ammonizione</div>
                            <div className="text-xs text-gray-400">
                              {ciclo.amm2 ? new Date(ciclo.amm2.toDate()).toLocaleDateString('it-IT', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric' 
                              }) : '❌ Non presente'}
                            </div>
                          </div>
                          
                          {/* Terza ammonizione */}
                          <div className="bg-gray-600 rounded p-3">
                            <div className="text-sm font-medium text-gray-200">3ª Ammonizione</div>
                            <div className="text-xs text-gray-400">
                              {ciclo.amm3 ? new Date(ciclo.amm3.toDate()).toLocaleDateString('it-IT', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric' 
                              }) : '❌ Non presente'}
                            </div>
                          </div>
                          
                          {/* Espiazione */}
                          <div className="bg-gray-600 rounded p-3">
                            <div className="text-sm font-medium text-gray-200">Debito Espiato</div>
                            <div className="text-xs text-gray-400">
                              {ciclo.espiazione ? new Date(ciclo.espiazione.toDate()).toLocaleDateString('it-IT', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric' 
                              }) : '❌ Non espiato'}
                            </div>
                          </div>
                        </div>
                        
                        {/* Status del ciclo */}
                        <div className="mt-3 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            ciclo.espiazione 
                              ? 'bg-green-900 text-green-200' 
                              : (ciclo.amm1 && ciclo.amm2 && ciclo.amm3) 
                                ? 'bg-red-900 text-red-200' 
                                : 'bg-yellow-900 text-yellow-200'
                          }`}>
                            {ciclo.espiazione 
                              ? '✅ Ciclo Completato' 
                              : (ciclo.amm1 && ciclo.amm2 && ciclo.amm3) 
                                ? '⚠️ In attesa espiazione' 
                                : '🔄 Ciclo in corso'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-400 text-lg">🧁</div>
                    <p className="text-gray-400 mt-2">Nessuno storico di ammonizioni disponibile</p>
                    <p className="text-gray-500 text-sm mt-1">
                      {selectedUserHistory.storico === undefined ? 
                        'Caricamento dati in corso...' : 
                        'Non ci sono ancora cicli di ammonizioni registrati per questo utente'}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="p-6 border-t border-gray-700">
                {/* Pulsante per creare dati di test (solo per debug) */}
                {isSuperAdmin && (
                  <button
                    onClick={() => createTestStorico(selectedUserHistory.userId)}
                    className="w-full mb-3 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition border border-yellow-500"
                  >
                    🧪 Crea Storico Test (Debug)
                  </button>
                )}
                
                <button
                  onClick={() => setShowUserHistory(false)}
                  className="w-full px-4 py-2 bg-gray-700 text-gray-100 rounded-lg hover:bg-gray-600 transition border border-gray-600"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 border border-green-500">
            <div className="flex items-center gap-2">
              <span className="text-green-200">✅</span>
              <span>{toastMessage}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}