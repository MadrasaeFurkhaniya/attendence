let students = JSON.parse(localStorage.getItem('students')) || [];
let users = JSON.parse(localStorage.getItem('users')) || [];

const filter = document.getElementById('filter');
const list = document.getElementById('list');
const cred = document.getElementById('cred');

const sname = document.getElementById('sname');
const pname = document.getElementById('pname');
const img = document.getElementById('img');
const role = document.getElementById('role');

const ruser = document.getElementById('ruser');
const rpass = document.getElementById('rpass');

// Clear search/filter on load
filter.value = 'all';

render();

function addStudent(){
const reader = new FileReader();
reader.onload = () => {
const uname = genUsername(sname.value,pname.value);
const pass = genPass();


students.push({
id:Date.now(),
name:sname.value,
parent:uname,
image:reader.result,
status:'active'
});


users.push({username:uname,password:pass,role:role.value,image:reader.result});


localStorage.setItem('students',JSON.stringify(students));
localStorage.setItem('users',JSON.stringify(users));


cred.classList.remove('d-none');
cred.innerHTML = `Username: <b>${uname}</b><br>Password: <b>${pass}</b>`;
render();
};
reader.readAsDataURL(img.files[0]);
}


function setStatus(id,status){
students.find(s=>s.id===id).status=status;
localStorage.setItem('students',JSON.stringify(students));
render();
}


function render(){
const f = filter.value;
list.innerHTML = students.filter(s=>f==='all'||s.status===f)
.map(s=>`
<tr>
<td><img src="${s.image}" width="40" class="rounded-circle"></td>
<td>${s.name}</td>
<td>${s.parent}</td>
<td>${s.status}</td>
<td>
<button class="btn btn-sm btn-warning" onclick="setStatus(${s.id},'suspended')">Suspend</button>
<button class="btn btn-sm btn-success" onclick="setStatus(${s.id},'active')">Activate</button>
<button class="btn btn-sm btn-danger" onclick="setStatus(${s.id},'deleted')">Delete</button>
</td>
</tr>`).join('');
}


function resetPass(){
const u = users.find(x=>x.username===ruser.value);
if(!u) return alert('User not found');
u.password = rpass.value;
localStorage.setItem('users',JSON.stringify(users));
alert('Password reset');
}


render();