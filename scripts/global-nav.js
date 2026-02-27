document.addEventListener("DOMContentLoaded", function() {
  const email = (localStorage.getItem('loggedInEmail') || '').trim();

  // If the user is not logged in, leave the UI alone
  if (!email) return;

  // Find ALL login links on the page (by ID or by href)
  const authLinks = document.querySelectorAll('a[href="/login.html"], a#authLink');
  
  authLinks.forEach(authLink => {
    // Prevent duplicating if the script somehow runs twice
    if (authLink.textContent === 'Log Out') return;

    // 1. Create 'My Properties' Link
    const dashLink = document.createElement('a');
    dashLink.className = authLink.className; // Inherit Tailwind classes
    dashLink.style.color = '#4DA6FF'; // Enforce exact Strip 1 brand color
    dashLink.textContent = 'My Properties';
    dashLink.href = '/welcome.html'; // Always route to lobby

    // 2. Insert smartly to preserve Flexbox gap/spacing
    const parentNode = authLink.parentNode;
    if (parentNode && parentNode.tagName.toLowerCase() === 'li') {
      // If inside a <ul><li> structure (like index.html), wrap it in its own <li>
      const newLi = document.createElement('li');
      newLi.appendChild(dashLink);
      parentNode.parentNode.insertBefore(newLi, parentNode);
    } else if (parentNode) {
      // If inside a standard flex <div> (like search.html), insert directly
      parentNode.insertBefore(dashLink, authLink);
    }

    // 3. Change Auth link to Log Out
    authLink.textContent = 'Log Out';
    authLink.href = '#';
    authLink.style.color = '#4DA6FF'; // Enforce brand color on Log Out
    authLink.onclick = function(e) {
      e.preventDefault();
      // Wipe session memory
      ['isLoggedIn','loggedInEmail','userRole','verificationCode','verifyTarget','nextAfterLogin','nextAfterVerify', 'lastListingId'].forEach(k => localStorage.removeItem(k));
      // Reload or redirect to home
      window.location.href = '/index.html';
    };
  });
});
