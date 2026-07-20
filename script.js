const PARTICIPATION_PRICE = 5000;
const API_BASE = 'https://retraite-2026.onrender.com';

const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 60);
});

const navToggle = document.querySelector('.nav-toggle');
navToggle.addEventListener('click', () => {
  nav.classList.toggle('open');
});

document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => nav.classList.remove('open'));
});

const form = document.getElementById('inscription-form');
const steps = form.querySelectorAll('.form-step');
const stepIndicators = form.querySelectorAll('[data-step-indicator]');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnSubmit = document.getElementById('btn-submit');
const formNav = document.getElementById('form-nav');
const formPayment = document.getElementById('form-payment');
const partnerToggle = document.getElementById('partner-toggle');
const partnerAmounts = document.getElementById('partner-amounts');
const totalAmountEl = document.getElementById('total-amount');
const paymentTotalStep = document.getElementById('payment-total-step');
const captureInput = document.getElementById('capture');
const captureName = document.getElementById('capture-name');
const capturePreview = document.getElementById('capture-preview');
const captureImg = document.getElementById('capture-img');

let currentStep = 1;

function formatRubles(amount) {
  return amount.toLocaleString('fr-FR') + ' ₽';
}

function getPartnerAmount() {
  if (!partnerToggle || !partnerToggle.checked) return 0;
  const selected = form.querySelector('input[name="partner-amount"]:checked');
  return selected ? parseInt(selected.value, 10) : 0;
}

function getTotal() {
  return PARTICIPATION_PRICE + getPartnerAmount();
}

function updateTotal() {
  const total = getTotal();
  const formatted = formatRubles(total);
  totalAmountEl.textContent = formatted;
  if (paymentTotalStep) paymentTotalStep.textContent = formatted;
}

if (partnerToggle) {
  partnerToggle.addEventListener('change', () => {
    if (partnerAmounts) partnerAmounts.hidden = !partnerToggle.checked;
    if (!partnerToggle.checked) {
      form.querySelectorAll('input[name="partner-amount"]').forEach(r => r.checked = false);
    }
    updateTotal();
  });
}

if (partnerToggle) {
  form.querySelectorAll('input[name="partner-amount"]').forEach(radio => {
    radio.addEventListener('change', updateTotal);
  });
}

captureInput.addEventListener('change', () => {
  const file = captureInput.files[0];

  if (!file) {
    captureName.textContent = 'Aucun fichier choisi';
    capturePreview.hidden = true;
    return;
  }

  captureName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    captureImg.src = e.target.result;
    capturePreview.hidden = false;
  };
  reader.readAsDataURL(file);
});

function validateStep(step) {
  const stepEl = form.querySelector(`[data-step="${step}"]`);
  if (!stepEl) return true;

  const requiredFields = stepEl.querySelectorAll('input[required], textarea[required], select[required]');
  for (const field of requiredFields) {
    if (field.type === 'file') {
      if (!field.files || !field.files[0]) {
        return true;
      }
    }
  }

  if (step === 2 && partnerToggle && partnerToggle.checked && !form.querySelector('input[name="partner-amount"]:checked')) {
    return true;
  }

  return true;
}

function goToStep(step) {
  currentStep = step;

  steps.forEach(s => s.classList.toggle('active', parseInt(s.dataset.step) === step));

  stepIndicators.forEach(ind => {
    const n = parseInt(ind.dataset.stepIndicator);
    ind.classList.toggle('active', n === step);
    ind.classList.toggle('done', n < step);
  });

  btnPrev.hidden = step === 1;
  btnNext.hidden = step === 4;
  btnSubmit.hidden = step !== 4;

  if (step === 4) updateTotal();
}

btnNext.addEventListener('click', () => {
  if (!validateStep(currentStep)) return;
  if (currentStep < 4) goToStep(currentStep + 1);
});

btnPrev.addEventListener('click', () => {
  if (currentStep > 1) goToStep(currentStep - 1);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateStep(4)) return;

  const total = getTotal();
  const partnerAmount = getPartnerAmount();
  const file = captureInput.files[0];

  if (!file) {
    alert('Veuillez ajouter la capture de paiement.');
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Envoi en cours...';

  const formData = new FormData();
  formData.append('prenom', document.getElementById('prenom').value);
  formData.append('nom', document.getElementById('nom').value);
  formData.append('email', document.getElementById('email').value);
  formData.append('telephone', document.getElementById('telephone').value);
  formData.append('remarques', document.getElementById('remarques').value);
  formData.append('partenaire', partnerToggle ? partnerToggle.checked : false);
  formData.append('montantPartenaire', partnerAmount);
  formData.append('total', total);
  formData.append('attentes', document.getElementById('attentes').value);
  formData.append('capture', file);

  try {
    const res = await fetch(`${API_BASE}/api/inscriptions`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');

    steps.forEach(s => s.classList.remove('active'));
    formNav.hidden = true;
    form.querySelector('.form-steps').hidden = true;
    formPayment.hidden = false;
    formPayment.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'envoi. Réessayez.');
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Envoyer';
  }
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll(
  '.pillar-card, .timeline-item, .faq-item'
).forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(el);
});

updateTotal();
