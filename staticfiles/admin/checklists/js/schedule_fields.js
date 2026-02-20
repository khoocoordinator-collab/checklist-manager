document.addEventListener('DOMContentLoaded', function() {
    const frequencySelect = document.querySelector('#id_frequency');
    const dayOfWeekRow = document.querySelector('.field-day_of_week');
    const dayOfMonthRow = document.querySelector('.field-day_of_month');

    if (!frequencySelect || !dayOfWeekRow || !dayOfMonthRow) return;

    function updateFields() {
        const frequency = frequencySelect.value;

        if (frequency === 'daily') {
            dayOfWeekRow.style.display = 'none';
            dayOfMonthRow.style.display = 'none';
        } else if (frequency === 'weekly' || frequency === 'bi_weekly') {
            dayOfWeekRow.style.display = '';
            dayOfMonthRow.style.display = 'none';
        } else if (frequency === 'monthly') {
            dayOfWeekRow.style.display = 'none';
            dayOfMonthRow.style.display = '';
        } else {
            dayOfWeekRow.style.display = '';
            dayOfMonthRow.style.display = '';
        }
    }

    updateFields();
    frequencySelect.addEventListener('change', updateFields);
});
