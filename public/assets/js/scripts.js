// Wait for the DOM to be fully loaded before executing
document.addEventListener('DOMContentLoaded', () => {
  // Select the header element
  const header = document.querySelector('header');
  if (!header) return; // Exit if no header is found

  // Select the navigation toggle button and navigation menu
  const toggle = header.querySelector('.nav-toggle');
  const nav = header.querySelector('nav');

  // Ensure nav has an ID for ARIA attributes
  if (nav && !nav.id) {
    nav.id = 'site-nav'; // Assign a default ID if none exists
  }
  // Set ARIA attributes for accessibility
  if (toggle && nav) {
    toggle.setAttribute('aria-controls', nav.id); // Link toggle to nav
    toggle.setAttribute('aria-expanded', 'false'); // Initial state: collapsed
  }

  // Function to adjust body padding based on header height
  function adjustBodyPadding() {
    const gap = 12; // Additional space below header (in pixels)
    const headerHeight = header.offsetHeight || 96; // Use actual height or fallback (96px)
    document.body.style.paddingTop = (headerHeight + gap) + 'px'; // Prevent content overlap with fixed header
  }

  // Function to show the navigation menu (mobile)
  function showNav() {
    if (!nav || !toggle) return;
    // Set display to block to ensure visibility before applying transitions
    nav.style.display = 'block';
    // Use requestAnimationFrame for smooth class addition
    requestAnimationFrame(() => {
      nav.classList.add('open'); // Add 'open' class for CSS transitions
      nav.setAttribute('aria-hidden', 'false'); // Make nav accessible
      toggle.setAttribute('aria-expanded', 'true'); // Indicate expanded state
    });
  }

  // Function to hide the navigation menu (mobile)
  function hideNav() {
    if (!nav || !toggle) return;
    nav.classList.remove('open'); // Remove 'open' class for CSS transitions
    nav.setAttribute('aria-hidden', 'true'); // Hide nav from screen readers
    toggle.setAttribute('aria-expanded', 'false'); // Indicate collapsed state
    // Hide nav after transition (260ms matches CSS transition duration)
    setTimeout(() => {
      if (!nav.classList.contains('open')) {
        nav.style.display = ''; // Clear inline display to defer to CSS
      }
    }, 260);
  }

  // Initialize navigation state based on viewport size
  function initNavState() {
    if (!nav) return;
    if (window.innerWidth <= 768) { // Mobile view (matches CSS media query)
      // Hide nav by default unless explicitly open
      if (!nav.classList.contains('open')) {
        nav.style.display = 'none';
        nav.setAttribute('aria-hidden', 'true');
      }
    } else { // Desktop view
      nav.style.display = ''; // Defer to CSS (likely flex or block)
      nav.classList.remove('open'); // Remove mobile-specific class
      nav.setAttribute('aria-hidden', 'false'); // Ensure accessible
      if (toggle) toggle.setAttribute('aria-expanded', 'false'); // Collapsed state
    }
  }

  // Set up event listeners for navigation toggle
  if (toggle && nav) {
    // Toggle navigation on button click
    toggle.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      if (nav.classList.contains('open')) hideNav(); else showNav();
    });

    // Close nav when clicking any link in mobile view
    nav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        if (window.innerWidth <= 768) hideNav();
      });
    });

    // Close nav when clicking outside the header
    document.addEventListener('click', (e) => {
      if (!header.contains(e.target) && nav.classList.contains('open')) {
        hideNav();
      }
    });

    // Close nav with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        hideNav();
      }
    });
  }

  // Handle window resizing
  window.addEventListener('resize', () => {
    initNavState(); // Reset nav state based on viewport
    if (nav && toggle && window.innerWidth > 768) {
      hideNav(); // Ensure nav is closed on desktop
    }
    adjustBodyPadding(); // Recalculate body padding
  });

  // Initial setup on page load
  initNavState();
  adjustBodyPadding();

  // Re-run adjustments after all resources (e.g., images) load
  window.addEventListener('load', () => {
    initNavState();
    adjustBodyPadding();
  });

  // Observe header size changes for dynamic padding adjustments
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(adjustBodyPadding);
    ro.observe(header); // Watch header for size changes
  }
});