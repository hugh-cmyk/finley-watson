import './styles/main.css';
import { Game } from './game/Game';

// Boot. The Game injects its canvas into #game and runs its own loop.
const container = document.getElementById('game');
if (!container) {
  throw new Error('#game container not found');
}

new Game(container);
