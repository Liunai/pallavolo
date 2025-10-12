
import React from 'react';
import VolleyballSignup from './components/VolleyballSignup.jsx';
import './App.css';

export default function App() {
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
