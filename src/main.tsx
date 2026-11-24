import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { createGame } from './ui/composition';
import { GameContext } from './ui/hooks/game';
import './ui/styles/tokens.css';
import './ui/styles/app.css';

// Created once, outside React, so StrictMode double-mounting can't duplicate the engine.
const game = createGame();

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <GameContext.Provider value={game}>
      <App />
    </GameContext.Provider>
  </StrictMode>,
);
