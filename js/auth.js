function login() {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value.trim();

  if (!u || !p) {
    alert("Please enter username and password");
    return;
  }

  fetch("https://script.google.com/macros/s/AKfycbyVFubNl6Ak38pQ9Q3YSdcNkwb6q01d2WcQJyFPQv1XDE0yqh3RqXEQ-meL20mvsq7Mog/exec", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      action: "login",
      username: u,
      password: p
    })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      alert(data.message || "Invalid login");
      return;
    }

    // save logged-in user
    localStorage.setItem("currentUser", JSON.stringify(data.user));

    // role based redirect
    switch (data.user.role.toLowerCase()) {
      case "admin":
        location.href = "admin.html";
        break;

      case "operator":
        location.href = "operator.html";
        break;

      case "parent":
        location.href = "parent.html";
        break;

      default:
        alert("Role not allowed");
    }
  })
  .catch(err => {
    console.error(err);
    alert("Server error");
  });
}
