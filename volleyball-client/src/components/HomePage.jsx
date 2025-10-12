import React from 'react';

export default function HomePage({ hasActiveSession, onEnterSession, isAdmin, onCreateSession }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-6">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-8 border border-gray-700 w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-gray-100 mb-6">Pallavolo</h1>
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
  );
}
