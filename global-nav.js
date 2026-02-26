document.addEventListener("DOMContentLoaded", function() {
  const email = (localStorage.getItem('loggedInEmail') || '').trim();
  const role = (localStorage.getItem('userRole') || '').trim().toLowerCase();
  const lastListingId = (localStorage.getItem('lastListingId') || '').trim();

  // If the user is not logged in, leave the UI alone
  if (!email) return;

  // Find ALL login links on the page (by ID or by href)
  const authLinks = document.querySelectorAll('a[href="/login.html"], a#authLink');
  
  authLinks.forEach(authLink => {
    // Prevent duplicating if the script somehow runs twice
    if (authLink.textContent === 'Log Out') return;

    // 1. Create Dashboard Link
    const dashLink = document.createElement('a');
    dashLink.className = authLink.className; // Inherit the exact same Tailwind classes
    dashLink.textContent = 'My Dashboard';
    dashLink.style.marginRight = '15px';
    
    // Route based on role
    if (role === 'agent' || role === 'broker') {
      dashLink.href = lastListingId ? `/agent-detail.html?id=${lastListingId}` : `/welcome.html`;
    } else {
      dashLink.href = lastListingId ? `/seller-detail.html?id=${lastListingId}` : `/welcome.html`;
    }

    // Insert Dashboard link right before the Auth link
    if (authLink.parentNode) {
      authLink.parentNode.insertBefore(dashLink, authLink);
    }

    // 2. Change Auth link to Log Out
    authLink.textContent = 'Log Out';
    authLink.href = '#';
    authLink.onclick = function(e) {
      e.preventDefault();
      // Wipe session memory
      ['isLoggedIn','loggedInEmail','userRole','verificationCode','verifyTarget','nextAfterLogin','nextAfterVerify'].forEach(k => localStorage.removeItem(k));
      // Reload or redirect to home
      window.location.href = '/index.html';
    };
  });
});
