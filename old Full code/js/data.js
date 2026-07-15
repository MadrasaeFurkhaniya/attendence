if (!localStorage.getItem('users')) {
localStorage.setItem('users', JSON.stringify([
{id:1, role:'admin', username:'admin', password:'admin123'}
]));
}


if (!localStorage.getItem('students')) localStorage.setItem('students','[]');
if (!localStorage.getItem('attendance')) localStorage.setItem('attendance','[]');