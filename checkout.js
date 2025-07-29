// checkout.js
document.getElementById('payButton').addEventListener('click', function() {
  fetch('/create-checkout-session', {
    method: 'POST',
  })
  .then(response => response.json())
  .then(session => {
    return Stripe('YOUR_PUBLISHABLE_KEY').redirectToCheckout({ sessionId: session.id });
  })
  .then(result => {
    if (result.error) alert(result.error.message);
  })
  .catch(error => console.error('Error:', error));
});
