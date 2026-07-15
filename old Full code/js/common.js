const user = JSON.parse(localStorage.getItem('currentUser'));
const users = JSON.parse(localStorage.getItem('users')) || [];
const students = JSON.parse(localStorage.getItem('students')) || [];
const settings = JSON.parse(localStorage.getItem('settings'));


companyName.innerText = settings.companyName;
if (settings.companyLogo) companyLogo.src = settings.companyLogo;


if (user.role === 'admin') {
profileImg.src = users.find(u=>u.username===user.username)?.image || 'https://via.placeholder.com/40';
editBtn.classList.remove('d-none');
}
if (user.role === 'operator') {
profileImg.src = users.find(u=>u.username===user.username)?.image || 'https://via.placeholder.com/40';
}
if (user.role === 'parent') {
profileImg.src = students.find(s=>s.parent===user.username)?.image || 'https://via.placeholder.com/40';
}


function editHeader(){
const name = prompt('Company Name', settings.companyName);
const file = document.createElement('input');
file.type='file';
file.onchange=()=>{
const r=new FileReader();
r.onload=()=>{
settings.companyName=name;
settings.companyLogo=r.result;
localStorage.setItem('settings',JSON.stringify(settings));
location.reload();
}
r.readAsDataURL(file.files[0]);
}
file.click();
}