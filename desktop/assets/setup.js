// First run: the hub's address. The app checks it, remembers it and opens the hub.
const form = document.getElementById('form');
const error = document.getElementById('error');
const go = document.getElementById('go');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  go.disabled = true;
  error.hidden = true;
  const message = await window.crewsteadDesktop.connect(document.getElementById('hub').value);
  if (message) {
    error.textContent = message;
    error.hidden = false;
    go.disabled = false;
  }
});
