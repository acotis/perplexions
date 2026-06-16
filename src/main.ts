import './style.css';
import { loadWords } from './words';

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

loadWords().then(words => {
  console.log(`Loaded ${words.size} words`);
});
