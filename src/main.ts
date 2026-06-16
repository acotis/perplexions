import './style.css';
import { loadWords } from './words';
import { loadLevel } from './level';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

ctx.fillStyle = '#fff';
ctx.fillRect(0, 0, canvas.width, canvas.height);

ctx.fillStyle = '#000';
ctx.font = 'bold 32px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('Perplexions', canvas.width / 2, canvas.height / 2);

Promise.all([loadWords(), loadLevel(new Date())]).then(([words, tiles]) => {
  console.log(`Loaded ${words.size} words`);
  console.log('Tiles:', tiles);
});
