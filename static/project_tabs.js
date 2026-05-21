document.querySelectorAll('[data-project-tabs]').forEach(tabset => {
  const buttons = tabset.querySelectorAll('[data-project-tab]');
  const panels = tabset.querySelectorAll('[data-project-panel]');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const target = button.dataset.projectTab;

      buttons.forEach(item => {
        const isActive = item.dataset.projectTab === target;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', String(isActive));
      });

      panels.forEach(panel => {
        const isActive = panel.dataset.projectPanel === target;
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
      });
    });
  });
});
