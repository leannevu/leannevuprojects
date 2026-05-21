const runBtn = document.getElementById('runBtn');
const defaultRunBtnText = runBtn.textContent;
const colors = {
  'KNN Regression': '#2f6f73',
  'Smoothing Spline': '#7a3f78',
  'Random Forest': '#b8742a',
  'Boosting': '#3d4f8f',
  'True Function': '#111111'
};

document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => activateTab(button.dataset.tab));
});
runBtn.addEventListener('click', runPipeline);
window.addEventListener('DOMContentLoaded', loadLatestRun);

function activateTab(tabId){
  document.querySelectorAll('.tab-button').forEach(button => {
    const isActive = button.dataset.tab === tabId;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isActive = panel.id === tabId;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
}

async function loadLatestRun(){
  drawChartMessage('predictionChart', 'Loading latest saved run');
  drawChartMessage('biasChart', 'Loading latest saved run');
  drawChartMessage('varianceChart', 'Loading latest saved run');
  drawChartMessage('mseChart', 'Loading latest saved run');

  try{
    const res = await fetch('/model-behavior/api/latest-run');
    const data = await res.json();
    if(!res.ok || data.error) throw new Error(data.error || 'No saved run found');
    renderAll(data);
  }catch(err){
    drawChartMessage('predictionChart', 'Run the pipeline to generate charts');
    drawChartMessage('biasChart', 'Run the pipeline to generate charts');
    drawChartMessage('varianceChart', 'Run the pipeline to generate charts');
    drawChartMessage('mseChart', 'Run the pipeline to generate charts');
  }
}

function configFromInputs(){
  return {
    design: document.getElementById('design').value,
    n_points: Number(document.getElementById('nPoints').value),
    noise: Number(document.getElementById('noise').value),
    n_runs: Number(document.getElementById('nRuns').value),
    test_size: 0.25,
    seed: 42
  };
}

async function runPipeline(){
  runBtn.disabled = true;
  runBtn.textContent = 'Running Pipeline';
  try{
    const res = await fetch('/model-behavior/api/run-pipeline', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(configFromInputs())
    });
    const data = await res.json();
    if(data.error) throw new Error(data.error);
    renderAll(data);
    runBtn.textContent = `Complete: ${data.run_id}`;
  }catch(err){
    runBtn.textContent = 'Pipeline Error';
    alert(err.message);
  }finally{
    runBtn.disabled = false;
    setTimeout(() => {
      runBtn.textContent = defaultRunBtnText;
    }, 2400);
  }
}

function renderAll(data){
  const trainRows = Math.round(data.config.n_points * (1-data.config.test_size));
  const testRows = Math.round(data.config.n_points * data.config.test_size);
  document.getElementById('trainCount').textContent = data.train_preview?.length ? `${trainRows} approx. rows` : 'Latest saved run';
  document.getElementById('testCount').textContent = data.test_preview?.length ? `${testRows} approx. rows` : 'Latest saved run';
  renderTable('trainTable', data.train_preview);
  renderTable('testTable', data.test_preview);
  renderTable('summaryTable', data.summary);
  renderLineChart('predictionChart', data.curves, 'mean_prediction', true);
  renderLineChart('biasChart', data.curves, 'bias_squared', false);
  renderLineChart('varianceChart', data.curves, 'variance', false);
  renderLineChart('mseChart', data.curves, 'mse_curve', false);
}

function renderTable(id, rows){
  const table = document.getElementById(id);
  if(!rows || rows.length === 0){
    table.innerHTML = '<tbody><tr><td>No preview rows stored for this run.</td></tr></tbody>';
    return;
  }
  const headers = Object.keys(rows[0]);
  table.innerHTML = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${formatVal(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function formatVal(v){
  if(typeof v === 'number') return Number(v).toFixed(4);
  return v;
}

function renderLineChart(svgId, rows, metric, includeTrue){
  const svg = document.getElementById(svgId);
  svg.innerHTML = '';
  const W = 900, H = 360, pad = {l:55, r:25, t:25, b:45};
  const chartRows = normalizeRows(rows, metric, includeTrue);
  if(chartRows.length === 0){
    drawChartMessage(svgId, 'No chart data returned for this metric');
    return;
  }

  const models = [...new Set(chartRows.map(r => r.model_name))];
  const xs = chartRows.map(r => r.x);
  let ys = chartRows.map(r => r[metric]);
  if(includeTrue) ys = ys.concat(chartRows.map(r => r.true_function).filter(Number.isFinite));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  if(!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX || !Number.isFinite(minY) || !Number.isFinite(maxY)){
    drawChartMessage(svgId, 'Chart data is incomplete');
    return;
  }
  const yPad = (maxY-minY || 1)*0.12;
  const sx = x => pad.l + ((x-minX)/(maxX-minX))*(W-pad.l-pad.r);
  const sy = y => H-pad.b - ((y-(minY-yPad))/((maxY+yPad)-(minY-yPad)))*(H-pad.t-pad.b);

  for(let i=0;i<5;i++){
    const y = pad.t + i*(H-pad.t-pad.b)/4;
    line(svg, pad.l, y, W-pad.r, y, 'grid');
  }
  line(svg, pad.l, pad.t, pad.l, H-pad.b, 'axis');
  line(svg, pad.l, H-pad.b, W-pad.r, H-pad.b, 'axis');

  if(includeTrue){
    const firstModel = models[0];
    const trueRows = chartRows.filter(r => r.model_name === firstModel);
    path(svg, trueRows.map(r => [sx(r.x), sy(r.true_function)]), 'true-line');
  }

  models.forEach(model => {
    const modelRows = chartRows.filter(r => r.model_name === model);
    path(svg, modelRows.map(r => [sx(r.x), sy(r[metric])]), 'series', colors[model]);
  });
  renderLegend(svg, models, includeTrue, W);
}

function normalizeRows(rows, metric, includeTrue){
  if(!Array.isArray(rows)) return [];
  return rows.map(row => ({
    ...row,
    x: Number(row.x),
    [metric]: Number(row[metric]),
    true_function: Number(row.true_function)
  })).filter(row => (
    Number.isFinite(row.x) &&
    Number.isFinite(row[metric]) &&
    (!includeTrue || Number.isFinite(row.true_function)) &&
    row.model_name
  )).sort((a, b) => a.model_name.localeCompare(b.model_name) || a.x - b.x);
}

function drawChartMessage(svgId, message){
  const svg = document.getElementById(svgId);
  svg.innerHTML = '';
  const text = document.createElementNS('http://www.w3.org/2000/svg','text');
  text.setAttribute('x', '50%');
  text.setAttribute('y', '50%');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'chart-message');
  text.textContent = message;
  svg.appendChild(text);
}

function line(svg, x1, y1, x2, y2, cls){
  const el = document.createElementNS('http://www.w3.org/2000/svg','line');
  el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2); el.setAttribute('y2', y2); el.setAttribute('class', cls); svg.appendChild(el);
}

function path(svg, pts, cls, stroke=null){
  if(pts.length === 0) return;
  const el = document.createElementNS('http://www.w3.org/2000/svg','path');
  el.setAttribute('d', pts.map((p,i)=>`${i===0?'M':'L'} ${p[0]} ${p[1]}`).join(' '));
  el.setAttribute('class', cls);
  if(stroke) el.setAttribute('stroke', stroke);
  svg.appendChild(el);
}

function renderLegend(svg, models, includeTrue, W){
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('class','legend');
  let items = includeTrue ? ['True Function', ...models] : models;
  items.forEach((name, i) => {
    const x = 60 + (i%3)*250, y = 330 + Math.floor(i/3)*18;
    const l = document.createElementNS('http://www.w3.org/2000/svg','line');
    l.setAttribute('x1', x); l.setAttribute('y1', y); l.setAttribute('x2', x+28); l.setAttribute('y2', y);
    l.setAttribute('stroke', colors[name] || '#333'); l.setAttribute('stroke-width', '3');
    if(name === 'True Function') l.setAttribute('stroke-dasharray','5 5');
    const t = document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x', x+36); t.setAttribute('y', y+4); t.textContent = name;
    g.appendChild(l); g.appendChild(t);
  });
  svg.appendChild(g);
}
