// Заливка стеклянных кнопок растекается от точки, где курсор вошёл, и стекает туда, где вышел
function setFillOrigin(e) {
  const button = e.target.closest('.btn');
  if (!button || button.contains(e.relatedTarget)) return;
  const rect = button.getBoundingClientRect();
  button.style.setProperty('--fill-x', `${e.clientX - rect.left}px`);
  button.style.setProperty('--fill-y', `${e.clientY - rect.top}px`);
}

document.addEventListener('pointerover', setFillOrigin);
document.addEventListener('pointerout', setFillOrigin);
