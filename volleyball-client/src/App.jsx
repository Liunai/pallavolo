
import React from 'react';
import VolleyballSignup from './components/VolleyballSignup.jsx';
import './App.css';

export default function App() {
  return (
    <div className="app-bg">
      <header style={{paddingTop: '2rem', paddingBottom: '1rem'}}>
        <h1 className="title">Allenamento Pallavolo</h1>
        <p className="subtitle">Iscriviti, porta amici e gestisci le riserve</p>
      </header>
      <main style={{display: 'flex', justifyContent: 'center'}}>
        <div style={{width: '100%', maxWidth: '900px'}}>
          <VolleyballSignup />
        </div>
      </main>
    </div>
  );
}
