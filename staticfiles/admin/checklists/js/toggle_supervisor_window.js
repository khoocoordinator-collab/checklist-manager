// Toggle supervisor validity window field based on requires_supervisor checkbox
document.addEventListener('DOMContentLoaded', function() {
    const requiresSupervisorCheckbox = document.querySelector('#id_requires_supervisor');
    const supervisorWindowRow = document.querySelector('.field-supervisor_validity_window_hours');

    if (!requiresSupervisorCheckbox || !supervisorWindowRow) return;

    function toggleSupervisorWindow() {
        if (requiresSupervisorCheckbox.checked) {
            supervisorWindowRow.style.display = '';
            supervisorWindowRow.style.opacity = '1';
            supervisorWindowRow.querySelector('select').disabled = false;
        } else {
            supervisorWindowRow.style.display = 'none';
            // Or alternatively grey out:
            // supervisorWindowRow.style.opacity = '0.5';
            // supervisorWindowRow.querySelector('select').disabled = true;
        }
    }

    // Initial state
    toggleSupervisorWindow();

    // Listen for changes
    requiresSupervisorCheckbox.addEventListener('change', toggleSupervisorWindow);
});
