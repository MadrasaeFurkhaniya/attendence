const user = JSON.parse(localStorage.getItem('currentUser'));
const students = JSON.parse(localStorage.getItem('students')) || [];

const child = document.getElementById('child');

// safety check
if (!user || user.role !== 'parent') {
  alert('Unauthorized access');
  location.href = 'index.html';
}

const c = students.find(s => s.parent === user.username);

if (!c) {
  child.innerHTML = '<p>No student linked to this parent.</p>';
} else {
  child.innerHTML = `
    <h5>${c.name}</h5>
    <img src="${c.image}" class="img-thumbnail mb-2" width="120">
    <p><b>Status:</b> ${c.status}</p>
  `;
}