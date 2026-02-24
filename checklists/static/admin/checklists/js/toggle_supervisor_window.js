// Toggle supervisor fields based on requires_supervisor checkbox
document.addEventListener('DOMContentLoaded', function() {
    const requiresSupervisorCheckbox = document.querySelector('#id_requires_supervisor');
    const supervisorWindowRow = document.querySelector('.field-supervisor_validity_window_hours');
    const supervisorTeamRow = document.querySelector('.field-default_supervisor_team');

    if (!requiresSupervisorCheckbox) return;

    function toggleSupervisorFields() {
        const show = requiresSupervisorCheckbox.checked;
        if (supervisorWindowRow) {
            supervisorWindowRow.style.display = show ? '' : 'none';
        }
        if (supervisorTeamRow) {
            supervisorTeamRow.style.display = show ? '' : 'none';
        }
    }

    // Initial state
    toggleSupervisorFields();

    // Listen for changes
    requiresSupervisorCheckbox.addEventListener('change', toggleSupervisorFields);
});
