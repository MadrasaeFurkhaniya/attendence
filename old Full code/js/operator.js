const students = JSON.parse(localStorage.getItem('students')) || [];
const list = document.getElementById('list');

list.innerHTML = students
  .filter(s => s.status === 'active')
  .map(s =>
    `<div class="form-check">
       <input class="form-check-input" type="checkbox" id="${s.id}">
       <label class="form-check-label" for="${s.id}">
         ${s.name}
       </label>
     </div>`
  ).join('');

function save() {
  const date = new Date().toISOString().slice(0, 10);
  let a = JSON.parse(localStorage.getItem('attendance')) || [];

  students
    .filter(s => s.status === 'active')
    .forEach(s => {
      a.push({
        studentId: s.id,
        date: date,
        present: document.getElementById(s.id).checked
      });
    });

  localStorage.setItem('attendance', JSON.stringify(a));
  alert('Attendance Saved');
}