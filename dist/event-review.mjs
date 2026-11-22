const pageSize = 20;
const previousFilters = new WeakMap();

function eventName(type) {
  return type.charAt(0).toUpperCase() + type.slice(1).replaceAll('-', ' ');
}

export function openEventReview({ run, model, modal, replay, timeLabel }) {
  const all = run.eventLog;
  const filters = previousFilters.get(run) ?? { station: '', kind: '', job: '', page: 0 };
  previousFilters.set(run, filters);
  const stations = new Map(model.nodes.map(node => [node.id, node.name]));
  const products = new Map(run.productMetrics.map(product => [product.id, product.name]));
  modal('Event review', `<section class="event-review">
    <p class="event-context"></p>
    <div class="event-filters">
      <label>Station<select name="station"><option value="">All stations</option></select></label>
      <label>Event<select name="kind"><option value="">All events</option></select></label>
      <label>Job number<input type="search" name="job" inputmode="numeric" placeholder="Any job" autocomplete="off"></label>
    </div>
    <div class="event-nav"><span class="event-count" role="status"></span><button type="button" data-clear>Clear filters</button></div>
    <ol class="event-rows" aria-label="Recorded events"></ol>
    <div class="event-pagination"><button data-prev>Previous</button><span></span><button data-next>Next</button></div>
  </section>`);
  const panel = document.querySelector('#dialogbody .event-review');
  const find = selector => panel.querySelector(selector);
  const list = find('.event-rows');
  find('.event-context').textContent = 'Seed ' + run.config.seed + ' · Full shift, including warm-up' +
    (run.eventLogTruncated ? ' · Recording limit reached (' + all.length.toLocaleString() + ' events)' : '');
  const stationInput = find('[name="station"]');
  const kindInput = find('[name="kind"]');
  const jobInput = find('[name="job"]');
  for (const [id, name] of stations) stationInput.add(new Option(name, id));
  for (const kind of [...new Set(all.map(event => event.type))].sort()) {
    kindInput.add(new Option(eventName(kind), kind));
  }
  function syncInputs() {
    stationInput.value = filters.station;
    kindInput.value = filters.kind;
    jobInput.value = filters.job;
  }
  let matches = [];
  function drawPage() {
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    filters.page = Math.min(filters.page, pages - 1);
    const start = filters.page * pageSize;
    const visible = matches.slice(start, start + pageSize);
    list.replaceChildren();
    for (const event of visible) {
      const item = document.createElement('li');
      const action = document.createElement('button');
      const stamp = document.createElement('span');
      const detail = document.createElement('span');
      const name = document.createElement('strong');
      const context = document.createElement('small');
      const verb = document.createElement('span');
      stamp.className = 'event-time';
      stamp.textContent = timeLabel(event.time);
      stamp.title = event.time + ' s';
      name.textContent = eventName(event.type);
      context.textContent = [stations.get(event.stationId), products.get(event.productId),
        event.jobId != null && 'Job ' + event.jobId].filter(Boolean).join(' · ');
      detail.append(name, context);
      verb.className = 'event-action';
      verb.textContent = 'Replay';
      action.append(stamp, detail, verb);
      action.onclick = () => replay(event);
      item.append(action);
      list.append(item);
    }
    list.scrollTop = 0;
    find('.event-count').textContent = matches.length
      ? (start + 1).toLocaleString() + '–' + (start + visible.length).toLocaleString() + ' of ' + matches.length.toLocaleString() + ' events'
      : 'No matching events';
    find('[data-clear]').disabled = !(filters.station || filters.kind || filters.job);
    find('[data-prev]').disabled = filters.page === 0;
    find('[data-next]').disabled = filters.page + 1 >= pages;
    find('.event-pagination span').textContent = 'Page ' + (filters.page + 1) + ' of ' + pages;
    find('.event-pagination').hidden = !matches.length;
  }
  function filterEvents() {
    const job = filters.job.trim();
    matches = all.filter(event => (!filters.station || event.stationId === filters.station) &&
      (!filters.kind || event.type === filters.kind) && (!job || (event.jobId != null && String(event.jobId) === job)));
    drawPage();
  }
  panel.querySelector('.event-filters').oninput = () => {
    Object.assign(filters, { station: stationInput.value, kind: kindInput.value, job: jobInput.value, page: 0 });
    filterEvents();
  };
  find('[data-clear]').onclick = () => {
    Object.assign(filters, { station: '', kind: '', job: '', page: 0 });
    syncInputs();
    filterEvents();
    stationInput.focus();
  };
  find('[data-prev]').onclick = () => { filters.page--; drawPage(); };
  find('[data-next]').onclick = () => { filters.page++; drawPage(); };
  syncInputs();
  filterEvents();
}
