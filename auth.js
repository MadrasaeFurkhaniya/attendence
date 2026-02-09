function login() {
const u = username.value;
const p = password.value;


const users = JSON.parse(localStorage.getItem('users'));
const user = users.find(x => x.username === u && x.password === p);


if (!user) return alert('Invalid Login');


localStorage.setItem('currentUser', JSON.stringify(user));


if (user.role === 'admin') location.href = 'admin.html';
if (user.role === 'operator') location.href = 'operator.html';
if (user.role === 'parent') location.href = 'parent.html';
}